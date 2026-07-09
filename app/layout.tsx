import type { Metadata } from 'next';
import Link from 'next/link';
import NavUser from '@/components/NavUser';
import './globals.css';

export const metadata: Metadata = {
  title: '律證 LawCite — 可驗證的法律問答',
  description: '收錄 16 部民生法規、3,731 條條文。AI 回答逐句附引用、逐句驗證，讓每一句解答都有法可依。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;900&family=Noto+Sans+TC:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <nav className="nav">
          <Link href="/" className="nav-brand">
            <span className="nav-seal">律</span>
            <span>律證 <em>LawCite</em></span>
          </Link>
          <div className="nav-links">
            <Link href="/ask">提問</Link>
            <Link href="/diagnose">診斷</Link>
            <Link href="/browse">法規庫</Link>
            <NavUser />
          </div>
        </nav>
        {children}
        <footer className="footer">
          <p>
            資料來源：全國法規資料庫（law.moj.gov.tw）· 條文更新至各法最新異動日期
          </p>
          <p className="footer-muted">
            本系統提供法規資訊檢索與整理，不構成法律意見。具體個案請諮詢律師或法律扶助基金會。
            {' '}<Link href="/pulse">系統統計</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
