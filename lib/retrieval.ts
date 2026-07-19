// 三段式檢索：① 條號直達（精確） ② 領域路由（縮小範圍） ③ 向量相似度（語意）
// 加上拒答門檻：最高相似度低於 REFUSE_THRESHOLD 即判定超出語料範圍。

import { sql } from './db';
import { embed, rewriteQuery, type RetrievedArticle } from './ai';

const LAW_ALIASES: Record<string, string> = {
  民法: '民法',
  民訴: '民事訴訟法', 民事訴訟法: '民事訴訟法',
  消保法: '消費者保護法', 消費者保護法: '消費者保護法',
  公寓大廈管理條例: '公寓大廈管理條例',
  個資法: '個人資料保護法', 個人資料保護法: '個人資料保護法',
  行政程序法: '行政程序法',
  訴願法: '訴願法',
  行政訴訟法: '行政訴訟法',
  強制執行法: '強制執行法',
  國賠法: '國家賠償法', 國家賠償法: '國家賠償法',
  勞基法: '勞動基準法', 勞動基準法: '勞動基準法',
  就業服務法: '就業服務法',
  性工法: '性別平等工作法', 性別平等工作法: '性別平等工作法', 性別工作平等法: '性別平等工作法',
  道交條例: '道路交通管理處罰條例', 道路交通管理處罰條例: '道路交通管理處罰條例',
  租賃住宅條例: '租賃住宅市場發展及管理條例', 租賃住宅市場發展及管理條例: '租賃住宅市場發展及管理條例',
  家事事件法: '家事事件法',
};

export type RetrievalResult = {
  articles: RetrievedArticle[];
  topScore: number;
  categories: string[];
  directHits: string[];
  refused: boolean;
  refusedReason?: 'criminal' | 'offtopic';
  condensed?: string;
  kwCount?: number;
};

// 第一層：明確刑事字眼直接攔（本系統明訂排除刑事法）
const CRIMINAL_RE = /(殺人|傷害罪|竊盜|強盜|搶奪|擄人|詐欺罪|侵占罪|背信罪|恐嚇|勒索|貪污|收賄|毒品|吸毒|販毒|性侵|強制猥褻|妨害性自主|縱火|偽造文書|判幾年|判多久|坐牢|關幾年|拘役|有期徒刑|無期徒刑|死刑|刑責|刑罰|刑事責任|構成要件.*罪|會不會被關)/;
export function detectCriminal(q: string) {
  return CRIMINAL_RE.test(q);
}

// ① 條號直達：解析「勞基法第24條」「民法第184條之1」這類字樣
export function parseDirectCitations(question: string) {
  const names = Object.keys(LAW_ALIASES).sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(`(${names})\\s*第\\s*(\\d+)\\s*條(?:之(\\d+))?`, 'g');
  const hits: { law_name: string; article_no: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(question)) !== null) {
    const law_name = LAW_ALIASES[m[1]];
    const article_no = m[3] ? `第${m[2]}條之${m[3]}` : `第${m[2]}條`;
    hits.push({ law_name, article_no });
  }
  return hits;
}

// ② 領域路由：問題向量與四類領域描述向量比相似度，取相近的 1~2 類
function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // OpenAI embedding 已正規化，內積即 cosine 相似度
}

async function routeCategories(qEmb: number[]): Promise<string[]> {
  const db = sql();
  const rows = (await db`SELECT category, embedding::text AS emb FROM categories`) as {
    category: string; emb: string;
  }[];
  if (rows.length === 0) return [];
  const scored = rows
    .map((r) => ({ category: r.category, score: dot(qEmb, JSON.parse(r.emb)) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0].score;
  return scored.filter((s) => s.score >= top - 0.05).slice(0, 2).map((s) => s.category);
}

// ③ 向量檢索 + 組裝
export async function retrieve(question: string): Promise<RetrievalResult> {
  const db = sql();
  // 向量下限只負責擋「非法律問題」的雜訊；法律問題再口語也遠高於此
  const threshold = Number(process.env.REFUSE_THRESHOLD ?? 0.15);

  if (detectCriminal(question)) {
    return { articles: [], topScore: 0, categories: [], directHits: [], refused: true, refusedReason: 'criminal' };
  }

  const direct = parseDirectCitations(question);

  // 查詢改寫：口語 → 法條語言（向量用）＋ 法律關鍵詞（精確比對用）
  // 條號直達的問題（如「民法第184條在講什麼」）不需改寫
  let searchText = question;
  let condensed: string | undefined;
  let keywords: string[] = [];
  if (direct.length === 0) {
    try {
      const rw = await rewriteQuery(question);
      if (rw.query && rw.query !== question) { searchText = rw.query; condensed = rw.query; }
      keywords = rw.keywords;
    } catch (e) { console.error('[rewrite]', e); }
  }

  const [qEmb] = await embed([searchText]);
  const qVec = JSON.stringify(qEmb);

  const categories = await routeCategories(qEmb);

  const vecRows = (await db`
    SELECT law_name, article_no, chapter_path, content,
           1 - (embedding <=> ${qVec}::vector) AS score
    FROM articles
    WHERE (${categories.length === 0} OR category_name = ANY(${categories}))
    ORDER BY embedding <=> ${qVec}::vector
    LIMIT 8`) as RetrievedArticle[];

  const topScore = vecRows.length ? Number(vecRows[0].score) : 0;

  // 關鍵詞混合檢索：法律詞彙對條文全文精確比對，補回向量漏掉的條文
  let kwRows: RetrievedArticle[] = [];
  if (keywords.length > 0) {
    const patterns = keywords
      .map((k) => k.replace(/[%_\\]/g, ''))
      .filter((k) => k.length >= 2)
      .map((k) => `%${k}%`);
    if (patterns.length > 0) {
      kwRows = (await db`
        SELECT law_name, article_no, chapter_path, content, NULL::float AS score
        FROM articles
        WHERE content ILIKE ANY(${patterns})
          AND (${categories.length === 0} OR category_name = ANY(${categories}))
        ORDER BY char_length(content) ASC
        LIMIT 5`) as RetrievedArticle[];
    }
  }

  let directRows: RetrievedArticle[] = [];
  for (const d of direct) {
    const r = (await db`
      SELECT law_name, article_no, chapter_path, content, 1.0 AS score
      FROM articles WHERE law_name = ${d.law_name} AND article_no = ${d.article_no}
      ORDER BY chunk_no LIMIT 3`) as RetrievedArticle[];
    directRows = directRows.concat(r);
  }

  // 合併：條號直達置頂 → 關鍵詞命中 → 向量結果；去重、總量上限 10
  const seen = new Set<string>();
  const merged: RetrievedArticle[] = [];
  for (const a of [...directRows, ...vecRows, ...kwRows]) {
    const key = `${a.law_name}|${a.article_no}|${a.content.slice(0, 30)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...a, score: a.score === null ? undefined : Number(a.score) });
    if (merged.length >= 12) break;
  }

  const refused = directRows.length === 0 && topScore < threshold;
  return {
    articles: merged, topScore, categories,
    directHits: direct.map((d) => d.law_name + d.article_no),
    refused, refusedReason: refused ? 'offtopic' : undefined, condensed,
    kwCount: kwRows.length,
  };
}
