import Link from 'next/link';
import lawsMeta from '@/data/laws_meta.json';

const cats = ['民事權益', '程序救濟', '勞動職場', '生活家事'];
type Law = { code: string; name: string; category_name: string; articles: number; lastUpdate: string };

export default function BrowsePage() {
  const laws = lawsMeta as Law[];
  return (
    <main className="browse">
      <h1 className="browse-title">法規庫</h1>
      <p className="browse-sub">
        16 部法規、{laws.reduce((a, l) => a + l.articles, 0).toLocaleString()} 條條文，
        資料來源為全國法規資料庫，各法收錄至最新異動版本。
      </p>
      <div className="laws-grid">
        {cats.map((cat) => (
          <Group key={cat} cat={cat} laws={laws} />
        ))}
      </div>
    </main>
  );
}

function Group({ cat, laws }: { cat: string; laws: Law[] }) {
  return (
    <>
      <div className="law-cat">{cat}</div>
      {laws.filter((l) => l.category_name === cat).map((l) => (
        <Link key={l.code} href={`/browse/${l.code}`} className="law-card">
          <span className="law-name">{l.name}</span>
          <span className="law-count">{l.articles} 條</span>
        </Link>
      ))}
    </>
  );
}
