'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NavUser() {
  const [user, setUser] = useState<{ username: string; displayName: string } | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setUser(d.user)).catch(() => {});
  }, []);

  if (!user) return <Link href="/account" className="nav-login">登入</Link>;
  return (
    <div className="nav-user">
      <button className="nav-user-btn" onClick={() => setOpen(!open)}>{user.displayName}</button>
      {open && (
        <div className="nav-menu">
          <Link href="/history" onClick={() => setOpen(false)}>我的紀錄</Link>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              setUser(null); setOpen(false); router.refresh();
            }}
          >登出</button>
        </div>
      )}
    </div>
  );
}
