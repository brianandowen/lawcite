import Link from 'next/link';
import HeroStage from '@/components/HeroStage';
import HeroAsk from '@/components/HeroAsk';
import Ticker from '@/components/Ticker';
import lawsMeta from '@/data/laws_meta.json';

const totalArticles = (lawsMeta as { articles: number }[]).reduce((a, l) => a + l.articles, 0);
const cats = ['民事權益', '程序救濟', '勞動職場', '生活家事'];

const FEATURES = [
  { no: '01', name: '逐句引用驗證', desc: '每一句回答綁定一條法條，並由第二個模型獨立審查——可信標綠、存疑標黃、站不住標紅。', href: '/ask' },
  { no: '02', name: '系統思考流', desc: '從查詢改寫、領域路由到交叉審查，AI 的每一步工作即時攤在你眼前，不是黑箱。', href: '/ask' },
  { no: '03', name: '案件診斷', desc: '不知道怎麼問？像初談律師一樣反問你幾個關鍵問題，把情況整理成精準的法律提問。', href: '/diagnose' },
  { no: '04', name: '時效倒數', desc: '訴願 30 天、網購 7 天——選個日期，算出你的截止日與剩餘天數，一鍵加入行事曆。', href: '/ask' },
  { no: '05', name: '行動路徑圖', desc: '「我該怎麼辦」的答案不是一段文字，是一條步驟時間軸，每一步附依據條文。', href: '/ask' },
  { no: '06', name: '存證信函草稿', desc: '以驗證通過的條文為法律依據，生成可列印的正式函稿——從知道權利到採取行動。', href: '/ask' },
];

export default function Home() {
  return (
    <main>
      <HeroStage>
        <div className="hero-inner">
          <p className="hero-eyebrow">Citation-verified legal answers</p>
          <h1 className="hero-title">
            每一句解答，
            <br />
            都有法可依<span className="seal-mark" aria-label="驗訖">驗</span>
          </h1>
          <p className="hero-sub">
            收錄 <strong>16 部民生法規、{totalArticles.toLocaleString()} 條條文</strong>。
            AI 的每一句回答都附上依據條文，並由第二個模型逐句驗證。
          </p>
          <HeroAsk />
          <Ticker />
        </div>
      </HeroStage>

      <section className="stats">
        <div className="stats-inner">
          <div className="stat"><div className="stat-num">16</div><div className="stat-label">部法規</div></div>
          <div className="stat"><div className="stat-num">{totalArticles.toLocaleString()}</div><div className="stat-label">條條文</div></div>
          <div className="stat"><div className="stat-num">逐句</div><div className="stat-label">引用驗證</div></div>
          <div className="stat"><div className="stat-num"><em>2</em> 模型</div><div className="stat-label">交叉制衡</div></div>
        </div>
      </section>

      <section className="section" id="features">
        <p className="section-eyebrow">FEATURES</p>
        <h2 className="section-title">從「查得到」到「敢相信」，再到「做得到」</h2>
        <p className="section-desc">
          法律資訊的問題從來不是找不到，而是看不懂、不敢信、不知道下一步。六個功能，對付三個問題。
        </p>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <Link key={f.no} href={f.href} className="fcard">
              <span className="fcard-no">{f.no}</span>
              <h3 className="fcard-name">{f.name}</h3>
              <p className="fcard-desc">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section" id="how" style={{ paddingTop: 0 }}>
        <p className="section-eyebrow">HOW IT WORKS</p>
        <h2 className="section-title">生成者與驗證者，分屬兩個模型</h2>
        <p className="section-desc">
          一般 AI 問答的引用只是裝飾——來源和句子沒有對應，也沒人檢查來源是否真的支撐那句話。
          本系統把粒度切到句子級，並讓另一個模型批改考卷。
        </p>
        <div className="pipeline">
          <div className="pipe-card">
            <span className="pipe-no">01 / RETRIEVE</span>
            <h3 className="pipe-name">混合檢索</h3>
            <p className="pipe-desc">
              先把口語問題改寫成法條語言，向量檢索與法律關鍵詞比對雙路並行；
              出現「勞基法第 24 條」這類字樣時條號直達。刑事等超範圍問題，系統誠實<code>拒答</code>。
            </p>
          </div>
          <div className="pipe-card">
            <span className="pipe-no">02 / GENERATE</span>
            <h3 className="pipe-name">逐句附引用生成</h3>
            <p className="pipe-desc">
              生成模型被要求：只依檢索到的條文回答、每句綁定恰好一條依據、無法被條文支撐的內容禁止輸出。
              回答不是一團文字，而是一組<code>句子—條文</code>配對。
            </p>
          </div>
          <div className="pipe-card">
            <span className="pipe-no">03 / VERIFY</span>
            <h3 className="pipe-name">跨模型逐句驗證</h3>
            <p className="pipe-desc">
              第二個模型獨立審查每組配對：完整支撐、部分支撐、無法支撐。
              引用不存在的條文一律攔截。不讓模型自己批改自己的考卷。
            </p>
          </div>
        </div>
      </section>

      <section className="section" id="laws" style={{ paddingTop: 0 }}>
        <p className="section-eyebrow">CORPUS</p>
        <h2 className="section-title">涵蓋一般人一生會遇到的法律</h2>
        <p className="section-desc">
          租屋、車禍、消費糾紛、職場權益、鄰居、家事、對政府處分不服——四大領域、16 部法規。
          刑事責任涉及構成要件判斷，明訂為範圍外，由拒答機制把關。
        </p>
        <div className="laws-grid">
          {cats.map((cat) => (
            <CatGroup key={cat} cat={cat} />
          ))}
        </div>
      </section>
    </main>
  );
}

function CatGroup({ cat }: { cat: string }) {
  const laws = (lawsMeta as { code: string; name: string; category_name: string; articles: number }[])
    .filter((l) => l.category_name === cat);
  return (
    <>
      <div className="law-cat">{cat}</div>
      {laws.map((l) => (
        <Link key={l.code} href={`/browse/${l.code}`} className="law-card">
          <span className="law-name">{l.name}</span>
          <span className="law-count">{l.articles} 條</span>
        </Link>
      ))}
    </>
  );
}
