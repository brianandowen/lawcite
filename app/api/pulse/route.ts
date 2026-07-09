import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = sql();
    const [t] = (await db`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE created_at >= current_date)::int AS today FROM qa_logs`) as
      { total: number; today: number }[];
    const top = (await db`SELECT c AS name, count(*)::int AS n
      FROM qa_logs, jsonb_array_elements_text(result->'categories') AS c
      GROUP BY c ORDER BY n DESC LIMIT 1`) as { name: string; n: number }[];
    return Response.json({ ...t, topCategory: top[0]?.name ?? null });
  } catch {
    return Response.json({ total: 0, today: 0 });
  }
}
