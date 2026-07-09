// 建立資料表與索引。執行：npm run db:setup
import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';

async function main() {
  const db = neon(process.env.DATABASE_URL!);
  console.log('啟用 pgvector…');
  await db`CREATE EXTENSION IF NOT EXISTS vector`;

  console.log('建立 articles 資料表…');
  await db`CREATE TABLE IF NOT EXISTS articles (
    id SERIAL PRIMARY KEY,
    law_code TEXT NOT NULL,
    law_name TEXT NOT NULL,
    category TEXT NOT NULL,
    category_name TEXT NOT NULL,
    article_no TEXT NOT NULL,
    chunk_no INT NOT NULL DEFAULT 0,
    chapter_path TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    UNIQUE (law_code, article_no, chunk_no)
  )`;

  console.log('建立 categories 資料表（領域路由用）…');
  await db`CREATE TABLE IF NOT EXISTS categories (
    category TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    embedding VECTOR(1536)
  )`;

  console.log('建立 qa_logs 資料表…');
  await db`CREATE TABLE IF NOT EXISTS qa_logs (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    result JSONB NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  console.log('建立 users / sessions 資料表…');
  await db`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await db`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  )`;
  await db`ALTER TABLE qa_logs ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE SET NULL`;
  await db`CREATE INDEX IF NOT EXISTS qa_logs_user_idx ON qa_logs (user_id, created_at DESC)`;

  console.log('建立向量索引（HNSW）…');
  await db`CREATE INDEX IF NOT EXISTS articles_embedding_idx
    ON articles USING hnsw (embedding vector_cosine_ops)`;
  await db`CREATE INDEX IF NOT EXISTS articles_law_idx ON articles (law_code, article_no)`;

  console.log('完成。接著執行 npm run ingest 匯入法條。');
}

main().catch((e) => { console.error(e); process.exit(1); });
