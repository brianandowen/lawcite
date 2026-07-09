# 律證 LawCite — 可驗證的法律問答系統

收錄 16 部民生法規（3,731 條），AI 回答逐句附引用條文，並由第二個模型逐句驗證可信度（已驗證 / 部分支撐 / 無法支撐）。

技術棧：Next.js 15（App Router）＋ Neon PostgreSQL（pgvector）＋ Gemini（生成）＋ OpenAI（embedding 與驗證）。部署於 Vercel。

## 功能總覽

- **逐句串流問答**：答案一句句抵達，徽章即時翻牌（已驗證／部分支撐／無法支撐），可信度分數滾動計分、朱印蓋章。
- **玻璃箱檢驗室**：一鍵透視——條文中支撐每句話的原文字句高亮、檢索相似度、領域路由、審查理由全部攤開。
- **案件診斷**（/diagnose）：系統像初談律師反問 3~5 題釐清事實，濃縮成精準問題後自動檢索。
- **時效倒數**：引用到有期限的條文（訴願 30 天、網購 7 天…）時，選日期即算出你的截止日與剩餘天數，可下載 .ics 加入行事曆。
- **行動路徑圖**：程序類問題（怎麼救濟、怎麼起訴）自動生成步驟時間軸，每步附依據條文。
- **存證信函草稿**：以驗證通過的條文為法律依據生成正式函稿，公文紙預覽、可列印。
- **社會脈動**（/pulse）：全站問答匿名聚合——領域分布、最常被引用的法規、拒答率。
- **會員系統**：自訂帳號＋密碼（bcrypt），訪客可直接提問，登入後保存歷史紀錄（/history）；users.plan 欄位為未來付費分級預留。
- **三層拒答**：刑事關鍵詞閘門、向量下限攔非法律雜訊、生成端讀完條文後自我棄權——超範圍誠實拒答，範圍內不誤殺；**Demo 模式**：設 `DEMO_MODE=1` 時同題直接回放快取，現場斷網保險。

---

## 一、事前準備（三個帳號）

1. **Neon**（免費）：https://neon.tech 註冊 → Create project → 進入專案後複製 **Connection string**（`postgresql://...` 開頭那串）。
2. **OpenAI**：https://platform.openai.com/api-keys 建立 API key（帳戶需有少量額度，整個專案含匯入約用 NT$30 以內）。
3. **Google Gemini**（免費額度即夠用）：https://aistudio.google.com/apikey 建立 API key。

環境需求：Node.js 20 以上（終端機輸入 `node -v` 確認）、VSCode、Git。

## 二、本機啟動

```bash
# 1. 進入專案資料夾、安裝套件
cd lawcite
npm install

# 2. 建立環境變數檔（VSCode 中複製 .env.example 改名為 .env.local，填入三把 key）
cp .env.example .env.local

# 3. 建立資料表
npm run db:setup

# 4. 匯入 3,731 條法條（約 10~20 分鐘；中斷可重跑，會自動略過已匯入的）
npm run ingest

# 5. 啟動
npm run dev
# 打開 http://localhost:3000
```

## 三、部署到 Vercel

```bash
git init
git add .
git commit -m "init"
# 在 GitHub 建立空 repo 後：
git remote add origin https://github.com/你的帳號/lawcite.git
git push -u origin main
```

1. https://vercel.com → Add New → Project → 匯入剛才的 GitHub repo。
2. 在 **Environment Variables** 貼上 `.env.local` 裡的所有變數（`DATABASE_URL`、`OPENAI_API_KEY`、`GEMINI_API_KEY` 等）。
3. Deploy。資料庫在 Neon 雲端，本機匯入過就不用再跑一次。

> `.env.local` 已被 `.gitignore` 排除，**金鑰不會**被推上 GitHub——請勿手動移除該規則。

## 四、系統評估（報告書用數據）

先 `npm run dev`，另開一個終端機：

```bash
npm run eval
```

會對 `scripts/eval-questions.json` 的 20 題（15 題檢索題＋5 題拒答題）批次測試，輸出**檢索命中率**與**拒答正確率**。題目可自行增修；評估模式只跑檢索不呼叫生成模型，幾乎不花錢。

## 五、環境變數一覽

| 變數 | 說明 |
|---|---|
| `DATABASE_URL` | Neon 連線字串 |
| `OPENAI_API_KEY` | embedding 與驗證模型 |
| `GEMINI_API_KEY` | 生成模型（未設定時自動改用 OpenAI 生成） |
| `OPENAI_MODEL` | 預設 `gpt-4o-mini` |
| `GEMINI_MODEL` | 預設 `gemini-2.5-flash` |
| `EMBED_MODEL` | 預設 `text-embedding-3-small` |
| `REFUSE_THRESHOLD` | 向量下限（三層拒答之第二層），預設 `0.15`，僅攔非法律雜訊 |
| `DEMO_MODE` | 設 `1` 啟用快取回放（賽前把 demo 題目各問一次即完成快取） |

## 六、專案結構

```
data/articles.json        16 部法規清洗後的種子資料（3,757 檢索塊）
data/laws_meta.json       法規清單與統計
scripts/setup-db.ts       建表（pgvector、HNSW 索引）
scripts/ingest.ts         向量化匯入（可續跑）
scripts/eval.ts           檢索命中率／拒答正確率評估
lib/retrieval.ts          混合檢索：條號直達、查詢改寫（口語轉法條語言）、向量檢索、關鍵詞精確比對、三層拒答
lib/ai.ts                 生成（Gemini，OpenAI 備援）與驗證（OpenAI）
app/api/ask/route.ts      問答 pipeline，NDJSON 串流回傳三階段
app/page.tsx              首頁（石碑 hero）
app/ask/page.tsx          問答主控台（逐句徽章、左右對照）
app/browse/                法規庫瀏覽
```

## 七、常見問題

- **ingest 中斷了**：直接重跑 `npm run ingest`，已匯入的會自動跳過。
- **回答一直拒答**：`REFUSE_THRESHOLD` 調低（如 0.25），重啟 dev server。
- **Gemini 額度用完**：不用處理，系統會自動改用 OpenAI 生成。
- **更新法條**：法規修正後，替換 `data/articles.json` 中對應法規資料再重跑 ingest 即可。

---

資料來源：全國法規資料庫（https://law.moj.gov.tw）。本系統提供法規資訊整理，不構成法律意見。
