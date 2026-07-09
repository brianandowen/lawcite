'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SAMPLES = ['房東不退押金怎麼辦？', '加班費怎麼算才合法？', '網購後悔可以退貨嗎？'];

export default function HeroAsk() {
  const [q, setQ] = useState('');
  const router = useRouter();
  const go = (question: string) => {
    if (!question.trim()) return;
    router.push(`/ask?q=${encodeURIComponent(question)}`);
  };
  return (
    <>
      <form className="hero-ask" onSubmit={(e) => { e.preventDefault(); go(q); }}>
        <input
          className="ask-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="輸入你的法律問題，例如：房東不退押金怎麼辦？"
          maxLength={300}
        />
        <button className="btn btn-primary" type="submit">提問</button>
      </form>
      <div className="hero-chips">
        {SAMPLES.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => go(s)}>{s}</button>
        ))}
      </div>
    </>
  );
}
