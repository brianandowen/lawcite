// 系統評估：計算「檢索命中率」與「拒答正確率」。
// 執行前先啟動 npm run dev，再開另一個終端機執行 npm run eval。
// 結果可直接放進報告書的「系統評估」章節。
import { config } from 'dotenv';
config({ path: '.env.local' });
import fs from 'node:fs';

type Q = { question: string; expect_law?: string; expect_article?: string; expect_refuse?: boolean };

async function main() {
  const qs: Q[] = JSON.parse(fs.readFileSync('scripts/eval-questions.json', 'utf-8'));
  const base = process.env.EVAL_BASE_URL || 'http://localhost:3000';
  let hit = 0, hitTotal = 0, refuseOk = 0, refuseTotal = 0;

  for (const q of qs) {
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q.question, evalMode: true }),
    });
    const text = await res.text();
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));
    const refused = lines.some((l) => l.type === 'refuse');
    const retrieval = lines.find((l) => l.type === 'retrieval');

    if (q.expect_refuse) {
      refuseTotal++;
      if (refused) refuseOk++;
      console.log(`${refused ? '✔' : '✘'} [拒答題] ${q.question}`);
    } else {
      hitTotal++;
      const got = (retrieval?.articles ?? []).some(
        (a: { law_name: string; article_no: string }) =>
          a.law_name === q.expect_law && (!q.expect_article || a.article_no === q.expect_article),
      );
      if (got) hit++;
      console.log(`${got ? '✔' : '✘'} ${q.question} → 期望 ${q.expect_law}${q.expect_article ?? ''}`);
    }
  }

  console.log('\n===== 評估結果 =====');
  console.log(`檢索命中率（top 8）：${hit}/${hitTotal} = ${((hit / hitTotal) * 100).toFixed(1)}%`);
  if (refuseTotal) console.log(`拒答正確率：${refuseOk}/${refuseTotal} = ${((refuseOk / refuseTotal) * 100).toFixed(1)}%`);
}

main().catch((e) => { console.error(e); process.exit(1); });
