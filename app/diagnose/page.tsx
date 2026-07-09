'use client';
// 案件診斷：系統反問 3~5 題釐清事實，濃縮成完整問題後導入問答 pipeline
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type QA = { q: string; a: string };

export default function DiagnosePage() {
  const [desc, setDesc] = useState('');
  const [history, setHistory] = useState<QA[]>([]);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [free, setFree] = useState('');
  const [phase, setPhase] = useState<'intro' | 'asking' | 'loading'>('intro');
  const [err, setErr] = useState('');
  const router = useRouter();

  async function step(desc0: string, h: QA[]) {
    setPhase('loading'); setErr('');
    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc0, history: h }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || '發生錯誤'); setPhase(h.length ? 'asking' : 'intro'); return; }
      if (d.done) {
        sessionStorage.setItem('lc_diagnose_q', d.summary);
        router.push('/ask?from=diagnose');
        return;
      }
      setQuestion(d.question); setOptions(d.options ?? []); setFree('');
      setPhase('asking');
    } catch {
      setErr('連線失敗，請再試一次。'); setPhase(h.length ? 'asking' : 'intro');
    }
  }

  function answer(a: string) {
    if (!a.trim()) return;
    const h = [...history, { q: question, a }];
    setHistory(h);
    step(desc, h);
  }

  return (
    <main className="console" style={{ maxWidth: 780 }}>
      <p className="section-eyebrow">DIAGNOSE</p>
      <h1 className="section-title">案件診斷</h1>
      <p className="section-desc" style={{ marginBottom: 32 }}>
        不知道怎麼問才對？描述你的情況，系統像初談律師一樣反問幾個關鍵問題，
        釐清事實後再進行法條檢索——問得越準，答得越準。
      </p>

      {phase === 'intro' && (
        <form onSubmit={(e) => { e.preventDefault(); if (desc.trim()) step(desc, []); }}>
          <textarea
            className="ask-input" rows={4} style={{ width: '100%', resize: 'vertical' }}
            value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500}
            placeholder="例如：我上個月從租屋處搬走，房東到現在都不還押金，訊息也不讀不回…"
          />
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" type="submit">開始診斷</button>
          </div>
        </form>
      )}

      {phase === 'loading' && (
        <div className="stages"><span className="stage active"><span className="stage-dot" />分析中</span></div>
      )}

      {phase === 'asking' && (
        <div className="diag-panel">
          <div className="diag-history">
            {history.map((h, i) => (
              <p key={i}><span className="diag-q">{h.q}</span><span className="diag-a">{h.a}</span></p>
            ))}
          </div>
          <h2 className="diag-question">{question}</h2>
          <div className="chips" style={{ marginBottom: 16 }}>
            {options.map((o) => (
              <button key={o} className="chip" onClick={() => answer(o)}>{o}</button>
            ))}
          </div>
          <form className="ask-form" onSubmit={(e) => { e.preventDefault(); answer(free); }}>
            <input className="ask-input" value={free} onChange={(e) => setFree(e.target.value)}
              placeholder="或自行輸入…" />
            <button className="btn" type="submit">回答</button>
          </form>
          <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 12, fontFamily: 'var(--mono)' }}>
            {history.length + 1} / 5
          </p>
        </div>
      )}

      {err && <p className="account-err" style={{ marginTop: 16 }}>{err}</p>}
    </main>
  );
}
