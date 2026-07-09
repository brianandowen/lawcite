// 社會脈動：qa_logs 匿名聚合——民眾法律需求的即時樣貌
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function PulsePage() {
  const db = sql();
  let total = 0, today = 0, refuseRate = 0;
  let cats: { name: string; n: number }[] = [];
  let laws: { name: string; n: number }[] = [];
  let recent: { question: string; created_at: string }[] = [];
  try {
    const [t] = (await db`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE created_at >= current_date)::int AS today,
      coalesce(avg(CASE WHEN (result->>'refused')::boolean THEN 1.0 ELSE 0.0 END), 0) AS rr
      FROM qa_logs`) as { total: number; today: number; rr: string }[];
    total = t.total; today = t.today; refuseRate = Math.round(Number(t.rr) * 100);

    cats = (await db`SELECT c AS name, count(*)::int AS n
      FROM qa_logs, jsonb_array_elements_text(result->'categories') AS c
      GROUP BY c ORDER BY n DESC`) as typeof cats;

    laws = (await db`SELECT a->>'law_name' AS name, count(*)::int AS n
      FROM qa_logs, jsonb_array_elements(result->'articles') AS a
      WHERE result ? 'sentences'
      GROUP BY a->>'law_name' ORDER BY n DESC LIMIT 8`) as typeof laws;

    recent = (await db`SELECT question, created_at::text FROM qa_logs
      ORDER BY created_at DESC LIMIT 8`) as typeof recent;
  } catch {}

  const maxCat = Math.max(1, ...cats.map((c) => c.n));
  const maxLaw = Math.max(1, ...laws.map((l) => l.n));

  return (
    <main className="browse">
      <p className="section-eyebrow">PULSE</p>
      <h1 className="browse-title">社會脈動</h1>
      <p className="browse-sub">
        全站問答的匿名聚合統計——民眾正在關心哪些法律問題。本頁不含任何身分資訊。
      </p>

      <div className="pulse-stats">
        <div className="pulse-stat"><span className="stat-num">{total.toLocaleString()}</span><span className="stat-label">累計問答</span></div>
        <div className="pulse-stat"><span className="stat-num">{today}</span><span className="stat-label">今日問答</span></div>
        <div className="pulse-stat"><span className="stat-num">{refuseRate}%</span><span className="stat-label">超範圍拒答率</span></div>
      </div>

      <div className="pulse-grid">
        <section>
          <h2 className="pulse-h">領域分布</h2>
          {cats.map((c) => (
            <div className="bar-row" key={c.name}>
              <span className="bar-label">{c.name}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${(c.n / maxCat) * 100}%` }} /></span>
              <span className="bar-num">{c.n}</span>
            </div>
          ))}
          {cats.length === 0 && <p style={{ color: 'var(--faint)' }}>尚無資料</p>}
        </section>
        <section>
          <h2 className="pulse-h">最常被引用的法規</h2>
          {laws.map((l) => (
            <div className="bar-row" key={l.name}>
              <span className="bar-label">{l.name}</span>
              <span className="bar-track"><span className="bar-fill seal" style={{ width: `${(l.n / maxLaw) * 100}%` }} /></span>
              <span className="bar-num">{l.n}</span>
            </div>
          ))}
          {laws.length === 0 && <p style={{ color: 'var(--faint)' }}>尚無資料</p>}
        </section>
      </div>

      <section style={{ marginTop: 48 }}>
        <h2 className="pulse-h">最近的提問</h2>
        {recent.map((r, i) => (
          <div className="article-item" key={i}>
            <p className="article-text" style={{ color: 'var(--text)' }}>{r.question.slice(0, 60)}{r.question.length > 60 ? '…' : ''}</p>
          </div>
        ))}
        {recent.length === 0 && <p style={{ color: 'var(--faint)' }}>尚無資料</p>}
      </section>
    </main>
  );
}
