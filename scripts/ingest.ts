// 將 data/articles.json 的 3,700+ 條法條向量化後寫入 Neon。
// 可中斷續跑：已存在的 (law_code, article_no, chunk_no) 會自動跳過。
// 執行：npm run ingest ；預估 10~20 分鐘，embedding 費用約新台幣 1~2 元。
import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';

const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';
const BATCH = 100;

type Row = {
  law_code: string; law_name: string; category: string; category_name: string;
  article_no: string; chunk_no: number; chapter_path: string; content: string;
};

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`Embedding 失敗 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

const CATEGORY_DESC: Record<string, string> = {
  民事權益: '民事財產與權利義務：契約、買賣、租賃、借貸、侵權行為、損害賠償、所有權、繼承、消費糾紛、退貨、定型化契約、公寓大廈住戶管理費與區分所有、個人資料隱私保護',
  程序救濟: '訴訟與行政救濟程序：如何起訴、民事訴訟、小額訴訟、支付命令、強制執行、假扣押、對政府處分不服、訴願、行政訴訟、行政程序、陳述意見、國家賠償',
  勞動職場: '勞工權益與職場：工資、加班費、工時、休假、特休、資遣、解僱、退休金、職業災害、勞動契約、就業歧視、性騷擾防治、育嬰留停',
  生活家事: '日常生活與家庭事件：交通違規、罰單、吊扣駕照、酒駕處罰、租屋押金、租賃契約、包租代管、離婚、扶養、監護、繼承家事程序',
};

async function main() {
  const db = neon(process.env.DATABASE_URL!);
  const rows: Row[] = JSON.parse(fs.readFileSync(path.join('data', 'articles.json'), 'utf-8'));
  console.log(`共 ${rows.length} 個檢索塊`);

  // 領域路由向量
  console.log('寫入領域描述向量…');
  const cats = Object.entries(CATEGORY_DESC);
  const catEmbs = await embedBatch(cats.map(([, d]) => d));
  for (let i = 0; i < cats.length; i++) {
    await db`INSERT INTO categories (category, description, embedding)
      VALUES (${cats[i][0]}, ${cats[i][1]}, ${JSON.stringify(catEmbs[i])}::vector)
      ON CONFLICT (category) DO UPDATE SET description = EXCLUDED.description, embedding = EXCLUDED.embedding`;
  }

  const existing = (await db`SELECT law_code, article_no, chunk_no FROM articles`) as Row[];
  const done = new Set(existing.map((r) => `${r.law_code}|${r.article_no}|${r.chunk_no}`));
  const todo = rows.filter((r) => !done.has(`${r.law_code}|${r.article_no}|${r.chunk_no}`));
  console.log(`已存在 ${done.size} 筆，待匯入 ${todo.length} 筆`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    // embedding 輸入帶上「法名｜編章節｜條號」路徑前綴，讓向量自帶體系脈絡
    const inputs = batch.map((r) => `${r.law_name}｜${r.chapter_path}｜${r.article_no}：${r.content}`);
    const embs = await embedBatch(inputs);
    for (let j = 0; j < batch.length; j++) {
      const r = batch[j];
      await db`INSERT INTO articles
        (law_code, law_name, category, category_name, article_no, chunk_no, chapter_path, content, embedding)
        VALUES (${r.law_code}, ${r.law_name}, ${r.category}, ${r.category_name}, ${r.article_no},
                ${r.chunk_no}, ${r.chapter_path}, ${r.content}, ${JSON.stringify(embs[j])}::vector)
        ON CONFLICT (law_code, article_no, chunk_no) DO NOTHING`;
    }
    console.log(`進度 ${Math.min(i + BATCH, todo.length)} / ${todo.length}`);
  }
  console.log('匯入完成。執行 npm run dev 啟動系統。');
}

main().catch((e) => { console.error(e); process.exit(1); });
