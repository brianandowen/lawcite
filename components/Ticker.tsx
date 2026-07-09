'use client';
import { useEffect, useState } from 'react';

export default function Ticker() {
  const [d, setD] = useState<{ total: number; today: number; topCategory?: string } | null>(null);
  useEffect(() => {
    fetch('/api/pulse').then((r) => r.json()).then(setD).catch(() => {});
  }, []);
  if (!d || d.total === 0) return null;
  return (
    <p className="ticker">
      今日已回答 <em>{d.today}</em> 題 · 累計 <em>{d.total.toLocaleString()}</em> 次逐句驗證
      {d.topCategory ? <> · 最多人問 <em>{d.topCategory}</em></> : null}
    </p>
  );
}
