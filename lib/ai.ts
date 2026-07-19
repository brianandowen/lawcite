// AI 呼叫層。設計原則：生成者（Gemini）與驗證者（OpenAI）分屬不同供應商，互不批改自己的考卷。
// 生成採「JSON Lines 行協定」串流：每行一個物件，句子逐句抵達前端。

const OPENAI_MODEL = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const EMBED_MODEL = () => process.env.EMBED_MODEL || 'text-embedding-3-small';

export type Sentence = { text: string; cite: string };
export type Step = { name: string; cite: string; detail: string; condition?: string };
export type Verdict = {
  idx: number; verdict: 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED'; reason: string; quote?: string;
};
export type RetrievedArticle = {
  law_name: string; article_no: string; chapter_path: string; content: string; score?: number;
};
export type GenEvent =
  | { t: 's'; text: string; cite: string }
  | { t: 'step'; name: string; cite: string; detail: string; condition?: string }
  | { t: 'caveat'; text: string };

function stripFence(s: string) {
  return s.replace(/```json\s*/g, '').replace(/```/g, '').trim();
}

async function openaiChat(system: string, user: string, json = true) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL(), temperature: 0.2,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

// ---------- Embedding ----------
export async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBED_MODEL(), input: texts }),
  });
  if (!res.ok) throw new Error(`Embedding 失敗 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

// ---------- 生成（行協定） ----------
const GEN_SYSTEM = `你是台灣法律資訊助理。全程以繁體中文思考與回答。你只能依據使用者提供的法條回答，嚴禁使用法條以外的知識或自行推測。
以 JSON Lines 格式輸出：每行恰好一個 JSON 物件，禁止輸出陣列、markdown 圍欄或任何其他文字。行的種類：
{"t":"s","text":"回答句（白話、一句一個重點）","cite":"民法第184條"}
{"t":"step","name":"步驟名稱","cite":"民事訴訟法第436條之8","detail":"這一步要做什麼","condition":"進入此步驟的條件（可省略）"}
{"t":"caveat","text":"補充提醒"}
規則：
1. 每個 s 行必須引用「恰好一條」提供的法條，cite 需與提供的法條名稱條號完全一致。
2. 無法由提供法條支撐的內容一律不得輸出。
3. 先輸出 3~7 個 s 行；若問題屬於「程序怎麼走」（如何救濟、如何起訴、如何求償），接著輸出 2~6 個 step 行，依時間順序排列。
4. 最後可輸出至多一個 caveat 行。
5. 若提供的法條與問題無關，只輸出一行：{"t":"caveat","text":"原因"}`;

function buildGenUser(question: string, articles: RetrievedArticle[]) {
  const ctx = articles
    .map((a, i) => `【${i + 1}】${a.law_name}${a.article_no}（${a.chapter_path}）\n${a.content}`)
    .join('\n\n');
  return `可引用的法條如下：\n\n${ctx}\n\n使用者問題：${question}`;
}

function parseGenLine(line: string): GenEvent | null {
  const s = line.trim();
  if (!s || s.startsWith('```')) return null;
  try {
    const o = JSON.parse(s);
    if (o.t === 's' && o.text && o.cite) return o;
    if (o.t === 'step' && o.name && o.cite) return o;
    if (o.t === 'caveat' && typeof o.text === 'string') return o;
  } catch {}
  return null;
}

// Gemini SSE 串流：文字增量累積成行，逐行 parse 後即時回呼
async function generateStreamGemini(
  question: string, articles: RetrievedArticle[], onEvent: (e: GenEvent) => void,
  onTrace?: (t: string) => void,
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: GEN_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: buildGenUser(question, articles) }] }],
      generationConfig: { temperature: 0.2, thinkingConfig: { includeThoughts: true } },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sse = '', textBuf = '', emitted = 0;
  const feed = (chunk: string) => {
    textBuf += chunk;
    const lines = textBuf.split('\n');
    textBuf = lines.pop() ?? '';
    for (const l of lines) {
      const ev = parseGenLine(l);
      if (ev) { emitted++; onEvent(ev); }
    }
  };
  // SSE 逐行解析：正規化 \r\n（Gemini 使用 CRLF），不依賴事件分隔符
  let thoughtsSent = 0;
  const handleDataLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const j = JSON.parse(payload);
      const parts = j.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts as { text?: string; thought?: boolean }[]) {
        if (p.thought && p.text && onTrace && thoughtsSent < 2) {
          const t = p.text.replace(/\s+/g, ' ').trim().slice(0, 90);
          if (t.length > 10) { thoughtsSent++; onTrace(t); }
        }
      }
      const t = parts
        .filter((p: { text?: string; thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text ?? '')
        .join('');
      if (t) feed(t);
    } catch {}
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    sse += decoder.decode(value, { stream: true }).replace(/\r/g, '');
    const lines = sse.split('\n');
    sse = lines.pop() ?? '';
    for (const line of lines) handleDataLine(line);
  }
  if (sse) handleDataLine(sse);
  const last = parseGenLine(textBuf);
  if (last) { emitted++; onEvent(last); }
  // 串流完成卻沒有任何可解析輸出：視為失敗，讓上層切換 OpenAI 備援
  if (emitted === 0) throw new Error('Gemini 串流無可解析輸出');
}

// OpenAI 備援（非串流，一次回傳後逐行派發）
async function generateFallbackOpenAI(
  question: string, articles: RetrievedArticle[], onEvent: (e: GenEvent) => void,
) {
  const sys = GEN_SYSTEM + '\n請將所有行放進 JSON 物件的 lines 陣列：{"lines":[{...},{...}]}';
  const content = await openaiChat(sys, buildGenUser(question, articles));
  const parsed = JSON.parse(stripFence(content));
  for (const o of parsed.lines ?? []) {
    const ev = parseGenLine(JSON.stringify(o));
    if (ev) onEvent(ev);
  }
}

export async function generateStream(
  question: string, articles: RetrievedArticle[], onEvent: (e: GenEvent) => void,
  onTrace?: (t: string) => void,
): Promise<{ engine: string }> {
  let count = 0;
  const counted = (e: GenEvent) => { count++; onEvent(e); };
  if (process.env.GEMINI_API_KEY) {
    try {
      await generateStreamGemini(question, articles, counted, onTrace);
      return { engine: 'gemini' };
    } catch (e) {
      console.error('[generate] Gemini 失敗：', e);
      // 已有部分輸出就不重跑備援，避免句子重複
      if (count > 0) return { engine: 'gemini-partial' };
      console.error('[generate] 改用 OpenAI 備援');
    }
  }
  await generateFallbackOpenAI(question, articles, counted);
  return { engine: 'openai' };
}

// ---------- 驗證（附支撐原文，供玻璃箱字級高亮） ----------
const VERIFY_SYSTEM = `你是嚴格的法律引用審查員。針對每一組「主張」與其「引用條文」，獨立判斷條文是否支撐該主張：
- SUPPORTED：條文內容可完整支撐主張。
- PARTIAL：條文與主張相關，但主張包含條文未明示的推論、數字或範圍。
- UNSUPPORTED：條文內容無法推出該主張，或主張與條文無關。
quote 必須是「引用條文中逐字存在」的一段原文（20 字以內），指出支撐主張的關鍵字句；UNSUPPORTED 時 quote 給空字串。
只輸出 JSON：{"verdicts":[{"idx":0,"verdict":"SUPPORTED","reason":"一句話理由","quote":"條文原文片段"}]}`;

export async function verifyCitations(
  pairs: { idx: number; claim: string; article: string }[],
): Promise<Verdict[]> {
  if (pairs.length === 0) return [];
  const user = pairs.map((p) => `[主張 ${p.idx}] ${p.claim}\n[引用條文 ${p.idx}] ${p.article}`).join('\n\n');
  const content = await openaiChat(VERIFY_SYSTEM, user);
  const parsed = JSON.parse(stripFence(content));
  return parsed.verdicts ?? [];
}

// ---------- 查詢改寫：口語問題 → 法條語言 + 法律關鍵詞（跨越語彙落差） ----------
const REWRITE_SYSTEM = `你是台灣法律檢索查詢改寫器。使用者的問題是日常口語，法條使用的是法律語言，你的任務是翻譯兩者：
1. query：把問題改寫成「法條會使用的語言」的檢索語句（30 字內）。例：「朋友欠錢不還」→「消費借貸借用人未依約返還借款之請求與給付遲延」
2. keywords：3~6 個「條文原文中會出現」的法律詞彙。例：["消費借貸","返還借款","給付遲延","催告","強制執行"]
移除人名代號、金額、日期等細節。只輸出 JSON：{"query":"...","keywords":["..."]}`;

export async function rewriteQuery(question: string): Promise<{ query: string; keywords: string[] }> {
  const content = await openaiChat(REWRITE_SYSTEM, question);
  const parsed = JSON.parse(stripFence(content));
  return {
    query: (parsed.query as string) || question,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 6) : [],
  };
}

// ---------- 案件診斷：反問下一題 ----------
const INTERVIEW_SYSTEM = `你是台灣法律諮詢的初談助理，負責在正式檢索法條前釐清案件事實。
根據使用者的描述與已回答的問題，決定下一個最關鍵的釐清問題（優先問：時間點、金額、有無書面、對方身分、目前進度）。
最多問 5 題；資訊已足夠或已達 5 題時結束，並把全部事實濃縮成一段可供法規檢索的完整問題描述。
只輸出 JSON：
進行中 {"done":false,"question":"下一題","options":["選項1","選項2","選項3"],"allow_free_text":true}
結束時 {"done":true,"summary":"濃縮後的完整問題描述（一段話，含關鍵事實）"}
options 給 2~4 個常見情況選項，涵蓋不了時使用者會自行輸入。`;

export async function interviewNext(description: string, history: { q: string; a: string }[]) {
  const user = `案件描述：${description}\n\n已釐清：\n${
    history.map((h, i) => `${i + 1}. 問：${h.q}\n   答：${h.a}`).join('\n') || '（尚無）'
  }\n\n已問 ${history.length} 題。`;
  const content = await openaiChat(INTERVIEW_SYSTEM, user);
  return JSON.parse(stripFence(content));
}

// ---------- 存證信函草稿 ----------
const DRAFT_SYSTEM = `你是台灣的法律文書助理，撰寫「存證信函」草稿。
語氣：正式、堅定、不威脅；引用法條僅限使用者提供的「已驗證條文」，不得引用其他法條。
結構：受文者稱謂 → 事實經過（含日期金額）→ 法律依據（逐條）→ 具體請求與期限（自函到達日起 7 日內）→ 逾期將採取之法律行動 → 結尾。
只輸出 JSON：{"title":"函件主旨","body":"信函全文（段落以\\n\\n分隔，不要markdown）"}`;

export async function draftLetter(input: {
  question: string;
  facts: { sender: string; recipient: string; address: string; amount: string; eventDate: string; extra: string };
  articles: { cite: string; content: string }[];
}) {
  const user = `原始問題：${input.question}
寄件人：${input.facts.sender}
受文者：${input.facts.recipient}（地址：${input.facts.address}）
金額或標的：${input.facts.amount}
關鍵日期：${input.facts.eventDate}
補充事實：${input.facts.extra || '無'}

已驗證可引用的法條：
${input.articles.map((a) => `${a.cite}：${a.content}`).join('\n\n')}`;
  const content = await openaiChat(DRAFT_SYSTEM, user);
  return JSON.parse(stripFence(content)) as { title: string; body: string };
}
