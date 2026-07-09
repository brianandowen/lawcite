'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AccountPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || '發生錯誤'); return; }
      router.push('/ask');
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <main className="account">
      <div className="account-card">
        <div className="account-tabs">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>登入</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>註冊</button>
        </div>
        <h1 className="account-title">{mode === 'login' ? '歡迎回來' : '建立帳號'}</h1>
        <p className="account-sub">
          {mode === 'login'
            ? '登入後可查看歷史問答與保存診斷報告。'
            : '訪客也能提問——註冊是為了保存你的紀錄。帳號為 3~20 字英數或底線。'}
        </p>
        <form onSubmit={submit} className="account-form">
          <label>帳號
            <input className="ask-input" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="例如 chen_ting" autoComplete="username" />
          </label>
          {mode === 'register' && (
            <label>顯示名稱（選填）
              <input className="ask-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder="出現在右上角的名字" />
            </label>
          )}
          <label>密碼
            <input className="ask-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '至少 8 個字元' : ''} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {err && <p className="account-err">{err}</p>}
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? '處理中' : mode === 'login' ? '登入' : '註冊並登入'}
          </button>
        </form>
      </div>
    </main>
  );
}
