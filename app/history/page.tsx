import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const user = await currentUser();
  if (!user) {
    return (
      <main className="browse">
        <h1 className="browse-title">我的紀錄</h1>
        <p className="browse-sub">登入後即可查看你的歷史問答。<Link href="/account" style={{ color: 'var(--seal)' }}>前往登入</Link></p>
      </main>
    );
  }
  const rows = (await sql()`
    SELECT id, question, result->>'score' AS score, (result->>'refused')::boolean AS refused, created_at
    FROM qa_logs WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 50`) as
    { id: number; question: string; score: string | null; refused: boolean | null; created_at: string }[];

  return (
    <main className="browse">
      <h1 className="browse-title">我的紀錄</h1>
      <p className="browse-sub">{user.display_name} · 最近 {rows.length} 筆問答</p>
      <div>
        {rows.map((r) => (
          <div className="article-item" key={r.id}>
            <p className="article-no">{new Date(r.created_at).toLocaleString('zh-TW')}</p>
            <p className="article-text" style={{ color: 'var(--text)' }}>{r.question}</p>
            <p className="article-path" style={{ marginTop: 6 }}>
              {r.refused ? '超出範圍，已拒答' : r.score !== null ? `可信度 ${r.score} / 100` : ''}
            </p>
          </div>
        ))}
        {rows.length === 0 && <p style={{ color: 'var(--muted)' }}>還沒有紀錄——去問第一個問題吧。</p>}
      </div>
    </main>
  );
}
