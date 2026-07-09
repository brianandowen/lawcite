import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import lawsMeta from '@/data/laws_meta.json';

export const dynamic = 'force-dynamic';

type Law = { code: string; name: string; category_name: string; lastUpdate: string };

export default async function LawPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const law = (lawsMeta as Law[]).find((l) => l.code === code);
  if (!law) notFound();

  const rows = (await sql()`
    SELECT article_no, chapter_path, content, chunk_no
    FROM articles WHERE law_code = ${code}
    ORDER BY id`) as { article_no: string; chapter_path: string; content: string; chunk_no: number }[];

  const upd = law.lastUpdate
    ? `${law.lastUpdate.slice(0, 4)}/${law.lastUpdate.slice(4, 6)}/${law.lastUpdate.slice(6)}`
    : '';

  return (
    <main className="browse">
      <Link href="/browse" className="back-link">← 返回法規庫</Link>
      <h1 className="browse-title">{law.name}</h1>
      <p className="browse-sub">{law.category_name} · 最新異動 {upd} · 共 {rows.filter((r) => r.chunk_no === 0).length} 條</p>
      <div>
        {rows.map((r, i) => (
          <article className="article-item" key={i}>
            <p className="article-no">{r.article_no}{r.chunk_no > 0 ? `（續 ${r.chunk_no + 1}）` : ''}</p>
            {r.chapter_path && <p className="article-path">{r.chapter_path}</p>}
            <p className="article-text">{r.content}</p>
          </article>
        ))}
        {rows.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>資料庫尚無此法條文——請先執行 npm run ingest 匯入。</p>
        )}
      </div>
    </main>
  );
}
