const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const rateLimit = require("express-rate-limit");
const Database = require("better-sqlite3");
const Parser = require("rss-parser");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;
const db = new Database(path.join(__dirname, "regpulse.sqlite"));

app.use(cors());
app.use(express.json());

// ── Rate Limiting ────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// ── Schema ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS regulations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    state            TEXT NOT NULL,
    state_abbrev     TEXT NOT NULL,
    title            TEXT NOT NULL,
    source_url       TEXT UNIQUE NOT NULL,
    date_published   TEXT,
    date_captured    TEXT NOT NULL,
    source_type      TEXT DEFAULT 'RSS',
    raw_text         TEXT,
    ai_summary       TEXT,
    topic_tags       TEXT,
    urgency_level    TEXT DEFAULT 'Informational',
    priority         TEXT DEFAULT 'Low',
    product_lines    TEXT,
    effective_date   TEXT,
    comment_deadline TEXT,
    naic_alignment   TEXT DEFAULT 'Not Applicable',
    review_status    TEXT DEFAULT 'New',
    assigned_to      TEXT,
    internal_notes   TEXT,
    flagged_for_leadership INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS feed_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT, url TEXT, error_message TEXT, timestamp TEXT
  );
`);

// ── DOI Feed Configs ────────────────────────────────────
const doiFeeds = [
  { state: "New York",      abbrev: "NY", type: "rss",    url: "https://www.dfs.ny.gov/rss/new_content" },
  { state: "California",    abbrev: "CA", type: "rss",    url: "https://www.insurance.ca.gov/0250-insurers/0300-insurers/rss.xml" },
  { state: "Texas",         abbrev: "TX", type: "rss",    url: "https://www.tdi.texas.gov/rss/rss.xml" },
  { state: "Colorado",      abbrev: "CO", type: "rss",    url: "https://doi.colorado.gov/rss.xml" },
  { state: "Florida",       abbrev: "FL", type: "scrape", url: "https://floir.com/Sections/LandH/Informational-Memoranda.aspx", sel: "a.bulletin-link" },
  { state: "Pennsylvania",  abbrev: "PA", type: "scrape", url: "https://www.insurance.pa.gov/Regulations/Pages/NoticesAndBulletins.aspx", sel: "a.bulletin-link" },
  { state: "Ohio",          abbrev: "OH", type: "scrape", url: "https://insurance.ohio.gov/Company/Pages/Bulletins.aspx", sel: "a.bulletin-link" },
];

// ── AI Classification ───────────────────────────────────
async function classifyRegulation(state, title, rawText) {
  const prompt = `You are a life insurance regulatory analyst for a US carrier.
Analyze this DOI publication and return ONLY valid JSON:
State: ${state} | Title: ${title}
Text (truncated): ${rawText.slice(0, 4000)}

Return: { "summary", "topic_tags": [], "urgency_level": "Action Required|Review|Monitor|Informational",
"priority": "Critical|High|Medium|Low", "product_lines": [],
"effective_date": "YYYY-MM-DD|null", "comment_deadline": "YYYY-MM-DD|null",
"naic_alignment": "Aligned|Diverges|Not Applicable" }`;

  try {
    const res = await axios.post(
      `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-01`,
      { messages: [{ role: "user", content: prompt }], temperature: 0.1, max_tokens: 800 },
      { headers: { "api-key": process.env.AZURE_OPENAI_KEY, "Content-Type": "application/json" } }
    );
    return JSON.parse(res.data.choices[0].message.content);
  } catch (err) {
    console.error("AI classification error:", err.message);
    return {
      summary: "AI classification failed — manual review required.",
      topic_tags: [], urgency_level: "Review", priority: "Medium",
      product_lines: [], effective_date: null, comment_deadline: null,
      naic_alignment: "Not Applicable",
    };
  }
}

// ── Feed Runner ─────────────────────────────────────────
const rssParser = new Parser();

async function fetchAllFeeds() {
  let newItems = 0;
  const errors = [];

  for (const feed of doiFeeds) {
    try {
      let items = [];
      if (feed.type === "rss") {
        const parsed = await rssParser.parseURL(feed.url);
        items = (parsed.items || []).map((i) => ({
          title: i.title || "Untitled",
          sourceUrl: i.link || feed.url,
          datePublished: i.pubDate ? new Date(i.pubDate).toISOString() : new Date().toISOString(),
        }));
      } else {
        const { data } = await axios.get(feed.url, { timeout: 15000 });
        const $ = cheerio.load(data);
        $(feed.sel || "a").each((_i, el) => {
          const title = $(el).text().trim();
          let href = $(el).attr("href") || "";
          if (href && !href.startsWith("http")) href = new URL(href, feed.url).toString();
          if (title && href) items.push({ title, sourceUrl: href, datePublished: new Date().toISOString() });
        });
      }

      for (const item of items) {
        const exists = db.prepare("SELECT 1 FROM regulations WHERE source_url = ?").get(item.sourceUrl);
        if (exists) continue;

        let rawText = item.title;
        try {
          const page = await axios.get(item.sourceUrl, { timeout: 10000 });
          rawText = cheerio.load(page.data)("body").text().replace(/\s+/g, " ").slice(0, 5000);
        } catch (fetchErr) {
          console.error(`Failed to fetch page ${item.sourceUrl}:`, fetchErr.message);
          /* keep title as fallback */
        }

        const c = await classifyRegulation(feed.state, item.title, rawText);

        db.prepare(
          `INSERT INTO regulations
           (state,state_abbrev,title,source_url,date_published,date_captured,
            source_type,raw_text,ai_summary,topic_tags,urgency_level,priority,
            product_lines,effective_date,comment_deadline,naic_alignment,review_status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          feed.state, feed.abbrev, item.title, item.sourceUrl, item.datePublished,
          new Date().toISOString(), feed.type === "rss" ? "RSS" : "Scrape", rawText,
          c.summary, JSON.stringify(c.topic_tags), c.urgency_level, c.priority,
          JSON.stringify(c.product_lines), c.effective_date, c.comment_deadline,
          c.naic_alignment, "New"
        );
        newItems++;
      }
    } catch (err) {
      errors.push({ state: feed.state, error: err.message });
      db.prepare("INSERT INTO feed_errors (state,url,error_message,timestamp) VALUES (?,?,?,?)")
        .run(feed.state, feed.url, err.message, new Date().toISOString());
    }
  }
  return { newItems, errors };
}

// ── Routes ──────────────────────────────────────────────
app.get("/api/regulations", (req, res) => {
  const { state, priority, urgency, status, topic, search, limit = "50", offset = "0" } = req.query;
  let q = "SELECT * FROM regulations WHERE 1=1";
  const p = [];
  if (state)    { q += " AND state_abbrev = ?"; p.push(state); }
  if (priority) { q += " AND priority = ?";     p.push(priority); }
  if (urgency)  { q += " AND urgency_level = ?"; p.push(urgency); }
  if (status)   { q += " AND review_status = ?"; p.push(status); }
  if (topic)    { q += " AND topic_tags LIKE ?"; p.push(`%${topic}%`); }
  if (search)   { q += " AND (title LIKE ? OR ai_summary LIKE ?)"; p.push(`%${search}%`, `%${search}%`); }
  q += " ORDER BY date_captured DESC LIMIT ? OFFSET ?";
  p.push(Number(limit), Number(offset));

  const rows = db.prepare(q).all(...p).map((r) => ({
    ...r,
    topic_tags: JSON.parse(r.topic_tags || "[]"),
    product_lines: JSON.parse(r.product_lines || "[]"),
  }));

  const kpis = db.prepare(`SELECT
    SUM(CASE WHEN urgency_level='Action Required' THEN 1 ELSE 0 END) AS action_required,
    SUM(CASE WHEN comment_deadline IS NOT NULL AND comment_deadline>=date('now') THEN 1 ELSE 0 END) AS open_comments,
    SUM(CASE WHEN effective_date IS NOT NULL AND effective_date<date('now') AND review_status NOT IN ('Completed','Archived') THEN 1 ELSE 0 END) AS overdue,
    SUM(CASE WHEN review_status='New' THEN 1 ELSE 0 END) AS awaiting_review
  FROM regulations WHERE review_status!='Archived'`).get();

  res.json({ regulations: rows, kpis });
});

app.get("/api/regulations/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM regulations WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ...row, topic_tags: JSON.parse(row.topic_tags || "[]"), product_lines: JSON.parse(row.product_lines || "[]") });
});

app.patch("/api/regulations/:id", (req, res) => {
  const allowed = ["review_status", "assigned_to", "internal_notes", "flagged_for_leadership"];
  const sets = [], vals = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      sets.push(`${k}=?`);
      vals.push(k === "flagged_for_leadership" ? (req.body[k] ? 1 : 0) : req.body[k]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: "No fields" });
  vals.push(req.params.id);
  db.prepare(`UPDATE regulations SET ${sets.join(",")} WHERE id=?`).run(...vals);
  res.json({ success: true });
});

app.post("/api/regulations/pull-now", async (_req, res) => {
  const result = await fetchAllFeeds();
  res.json(result);
});

// ── Cron: 6 AM ET daily ────────────────────────────────
cron.schedule("0 6 * * *", () => fetchAllFeeds(), { timezone: "America/New_York" });

app.listen(PORT, () => console.log(`RegPulse API on :${PORT}`));
