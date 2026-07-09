'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// 石碑刻文：滑鼠聚光燈 + 可點選（點任一列法條顯示原文卡）
const STELE: { cite: string; text: string }[] = [
  { cite: '民法第1條', text: '民事，法律所未規定者，依習慣；無習慣者，依法理。' },
  { cite: '民法第184條', text: '因故意或過失，不法侵害他人之權利者，負損害賠償責任。故意以背於善良風俗之方法，加損害於他人者亦同。' },
  { cite: '勞動基準法第24條', text: '雇主延長勞工工作時間者，其延長工作時間之工資，按平日每小時工資額加給三分之一以上。' },
  { cite: '民法第345條', text: '稱買賣者，謂當事人約定一方移轉財產權於他方，他方支付價金之契約。' },
  { cite: '訴願法第1條', text: '人民對於中央或地方機關之行政處分，認為違法或不當，致損害其權利或利益者，得依本法提起訴願。' },
  { cite: '消費者保護法第19條', text: '通訊交易之消費者，得於收受商品後七日內，以退回商品或書面通知方式解除契約，無須說明理由及負擔任何費用。' },
  { cite: '租賃住宅市場發展及管理條例第7條', text: '押金之數額，不得逾越二個月之租金總額。' },
  { cite: '國家賠償法第2條', text: '公務員於執行職務行使公權力時，因故意或過失不法侵害人民自由或權利者，國家應負損害賠償責任。' },
  { cite: '民法第1055條', text: '夫妻離婚者，對於未成年子女權利義務之行使或負擔，依協議由一方或雙方共同任之。' },
  { cite: '強制執行法第1條', text: '民事強制執行事務，於地方法院及其分院設民事執行處辦理之。' },
];

export default function HeroStage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [pop, setPop] = useState<{ cite: string; text: string } | null>(null);
  return (
    <section
      ref={ref}
      className="hero"
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
      }}
    >
      <div className="stele">
        {STELE.map((s) => (
          <button
            key={s.cite}
            type="button"
            className="stele-col"
            title={s.cite}
            onClick={() => setPop(pop?.cite === s.cite ? null : s)}
          >
            {s.text.replace(/[，。；]/g, '').repeat(3)}
          </button>
        ))}
      </div>
      {children}
      {pop && (
        <div className="stele-pop" role="dialog" onClick={() => setPop(null)}>
          <p className="stele-pop-cite">{pop.cite}</p>
          <p className="stele-pop-text">{pop.text}</p>
        </div>
      )}
    </section>
  );
}
