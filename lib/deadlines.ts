// 時效對照表：引用到這些條文時，前端顯示「計算我的期限」。
// from：起算描述；unit：day 或 year。
export type DeadlineRule = { days: number; unit: 'day' | 'year'; from: string; note: string };

export const DEADLINES: Record<string, DeadlineRule> = {
  訴願法第14條: { days: 30, unit: 'day', from: '行政處分達到或公告期滿之次日', note: '逾期訴願將不受理' },
  消費者保護法第19條: { days: 7, unit: 'day', from: '收受商品或接受服務之次日', note: '通訊交易七日猶豫期，退回商品或書面通知即解除契約' },
  民事訴訟法第440條: { days: 20, unit: 'day', from: '判決送達之次日', note: '上訴期間，逾期判決確定' },
  民事訴訟法第516條: { days: 20, unit: 'day', from: '支付命令送達之次日', note: '對支付命令提出異議之期限' },
  民事訴訟法第518條: { days: 20, unit: 'day', from: '支付命令送達之次日', note: '未於期限內異議，支付命令得為執行名義' },
  道路交通管理處罰條例第9條: { days: 30, unit: 'day', from: '裁決書送達之次日', note: '期限內得繳納罰鍰或向處罰機關陳述意見' },
  道路交通管理處罰條例第87條: { days: 30, unit: 'day', from: '裁決書送達之次日', note: '不服裁決得提起行政訴訟之期限' },
  行政訴訟法第106條: { days: 60, unit: 'day', from: '訴願決定書送達之次日', note: '提起撤銷訴訟（經訴願程序）之期限為二個月' },
  國家賠償法第8條: { days: 2, unit: 'year', from: '知有損害時起', note: '賠償請求權時效（自損害發生時起逾五年亦消滅）' },
  民法第197條: { days: 2, unit: 'year', from: '知有損害及賠償義務人時起', note: '侵權行為損害賠償請求權時效（自有侵權行為時起逾十年亦消滅）' },
  勞動基準法第58條: { days: 5, unit: 'year', from: '退休金請領權利發生時起', note: '退休金請求權時效' },
  性別平等工作法第34條: { days: 30, unit: 'day', from: '接獲申訴處理結果之次日', note: '不服雇主處理結果之申訴期限（依主管機關規定）' },
};
