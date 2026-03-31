import React, { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useParams,
  useLocation,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import axios from "axios";

// ═══════════════════════════════════════════════════════════
//  API CLIENT
// ═══════════════════════════════════════════════════════════
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
});

const fetchRegulations = (params) =>
  api.get("/regulations", { params }).then((r) => r.data);

const fetchRegulation = (id) =>
  api.get(`/regulations/${id}`).then((r) => r.data);

const patchRegulation = (id, data) =>
  api.patch(`/regulations/${id}`, data).then((r) => r.data);

const triggerPull = () => api.post("/regulations/pull-now").then((r) => r.data);

// ═══════════════════════════════════════════════════════════
//  PRIORITY BADGE
// ═══════════════════════════════════════════════════════════
const priorityColors = {
  Critical: "#E74C3C",
  High: "#F39C12",
  Medium: "#2E86C1",
  Low: "#95A5A6",
};

function PriorityBadge({ priority }) {
  return (
    <span
      style={{
        background: priorityColors[priority] || "#ccc",
        color: "#fff",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {priority}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
//  KPI CARDS
// ═══════════════════════════════════════════════════════════
function KPICards({ kpis }) {
  const cards = [
    { label: "Action Required", value: kpis.action_required, color: "#E74C3C" },
    { label: "Open Comments", value: kpis.open_comments, color: "#F39C12" },
    { label: "Overdue", value: kpis.overdue, color: "#C0392B" },
    { label: "Awaiting Review", value: kpis.awaiting_review, color: "#2E86C1" },
  ];

  return (
    <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            flex: 1,
            background: "#fff",
            borderLeft: `4px solid ${c.color}`,
            borderRadius: 6,
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "#888" }}>{c.label}</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  LAYOUT + SIDEBAR
// ═══════════════════════════════════════════════════════════
function Layout({ children }) {
  const location = useLocation();

  const handleManualPull = async () => {
    if (window.confirm("Trigger an on-demand DOI feed pull?")) {
      try {
        const result = await triggerPull();
        alert(`Done — ${result.newItems} new items ingested.`);
      } catch (err) {
        alert(`Feed pull failed: ${err.message || "Unknown error"}`);
      }
    }
  };

  const navLink = (to, label, icon) => (
    <li style={{ marginBottom: "0.75rem" }}>
      <Link
        to={to}
        style={{
          color: location.pathname === to ? "#F8C471" : "#D5E8D4",
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: "0.95rem",
        }}
      >
        {icon} {label}
      </Link>
    </li>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 220,
          background: "#1B4F72",
          color: "#fff",
          padding: "1.5rem 1rem",
          flexShrink: 0,
        }}
      >
        <h2 style={{ fontSize: "1.25rem", marginBottom: "2rem" }}>
          ⚖️ RegPulse
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {navLink("/", "Dashboard", "📊")}
          {navLink("/search", "Search", "🔍")}
        </ul>
        <button
          onClick={handleManualPull}
          style={{
            background: "transparent",
            border: "1px solid #D5E8D4",
            color: "#D5E8D4",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0.4rem 0.6rem",
            borderRadius: 4,
            marginTop: "1.5rem",
            fontSize: "0.85rem",
          }}
        >
          🔄 Pull Feeds Now
        </button>
      </nav>

      <main style={{ flex: 1, padding: "1.5rem 2rem", background: "#F7F9FC" }}>
        {children}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════
function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["regulations"],
    queryFn: () => fetchRegulations({ limit: "30" }),
  });

  if (isLoading) return <p>Loading…</p>;

  const { regulations, kpis } = data;

  const timeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 1) return "just now";
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        RegPulse Dashboard
      </h1>
      <KPICards kpis={kpis} />

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          background: "#fff",
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <thead>
          <tr
            style={{
              background: "#1B4F72",
              color: "#fff",
              textAlign: "left",
            }}
          >
            <th style={{ padding: "0.6rem 1rem" }}>State</th>
            <th style={{ padding: "0.6rem 1rem" }}>Title</th>
            <th style={{ padding: "0.6rem 1rem" }}>Priority</th>
            <th style={{ padding: "0.6rem 1rem" }}>Urgency</th>
            <th style={{ padding: "0.6rem 1rem" }}>Captured</th>
          </tr>
        </thead>
        <tbody>
          {regulations.map((reg) => (
            <tr
              key={reg.id}
              style={{ borderBottom: "1px solid #eee" }}
            >
              <td style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>
                {reg.state_abbrev}
              </td>
              <td style={{ padding: "0.6rem 1rem" }}>
                <Link
                  to={`/regulation/${reg.id}`}
                  style={{ color: "#2E86C1", textDecoration: "none" }}
                >
                  {reg.title.length > 70
                    ? reg.title.slice(0, 70) + "…"
                    : reg.title}
                </Link>
              </td>
              <td style={{ padding: "0.6rem 1rem" }}>
                <PriorityBadge priority={reg.priority} />
              </td>
              <td style={{ padding: "0.6rem 1rem" }}>{reg.urgency_level}</td>
              <td
                style={{
                  padding: "0.6rem 1rem",
                  fontSize: "0.85rem",
                  color: "#666",
                }}
              >
                {timeAgo(reg.date_captured)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
//  REGULATION DETAIL PAGE
// ═══════════════════════════════════════════════════════════
const STATUS_FLOW = [
  "New",
  "Under Review",
  "Action Required",
  "Assigned",
  "Completed",
];

function RegulationDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const { data: reg, isLoading } = useQuery({
    queryKey: ["regulation", id],
    queryFn: () => fetchRegulation(id),
  });

  const mutation = useMutation({
    mutationFn: (updates) => patchRegulation(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regulation", id] }),
  });

  if (isLoading) return <p>Loading…</p>;

  const daysTo = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - Date.now()) / 86400000);
  };

  const daysRemaining = daysTo(reg.effective_date);

  const handleAddNote = () => {
    const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const updated = (reg.internal_notes || "") + `\n${timestamp} — ${note}`;
    mutation.mutate({ internal_notes: updated });
    setNote("");
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Link to="/" style={{ color: "#2E86C1", fontSize: "0.85rem" }}>
        ← Back to Dashboard
      </Link>
      <h1 style={{ fontSize: "1.3rem", marginTop: "0.5rem" }}>{reg.title}</h1>

      {/* AI Summary */}
      <div
        style={{
          background: "#EBF5FB",
          border: "1px solid #AED6F1",
          borderRadius: 6,
          padding: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <strong>AI Summary</strong>
        <p style={{ margin: "0.5rem 0 0" }}>{reg.ai_summary}</p>
      </div>

      {/* Metadata */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "0.75rem 1.5rem",
          marginBottom: "1.5rem",
          fontSize: "0.9rem",
        }}
      >
        <div><strong>State:</strong> {reg.state} ({reg.state_abbrev})</div>
        <div><strong>Published:</strong> {reg.date_published?.slice(0, 10)}</div>
        <div><strong>Priority:</strong> <PriorityBadge priority={reg.priority} /></div>
        <div><strong>Urgency:</strong> {reg.urgency_level}</div>
        <div>
          <strong>Effective:</strong>{" "}
          {reg.effective_date ? (
            <>
              {reg.effective_date}{" "}
              <span style={{ color: daysRemaining < 0 ? "red" : "green", fontWeight: 600 }}>
                ({daysRemaining < 0
                  ? `OVERDUE by ${Math.abs(daysRemaining)} days`
                  : `${daysRemaining} days left`})
              </span>
            </>
          ) : "N/A"}
        </div>
        <div><strong>Comment Deadline:</strong> {reg.comment_deadline || "N/A"}</div>
        <div>
          <strong>NAIC:</strong>{" "}
          <span
            style={{
              color:
                reg.naic_alignment === "Aligned" ? "#27AE60"
                : reg.naic_alignment === "Diverges" ? "#F39C12"
                : "#BDC3C7",
              fontWeight: 600,
            }}
          >
            {reg.naic_alignment}
          </span>
        </div>
        <div><strong>Topics:</strong> {(reg.topic_tags || []).join(", ") || "—"}</div>
        <div><strong>Products:</strong> {(reg.product_lines || []).join(", ") || "—"}</div>
      </div>

      {/* Source link */}
      <a
        href={reg.source_url}
        target="_blank"
        rel="noreferrer"
        style={{ display: "inline-block", marginBottom: "1.5rem", color: "#2E86C1" }}
      >
        🔗 Open source document
      </a>

      {/* Status workflow */}
      <div style={{ marginBottom: "1.5rem" }}>
        <strong>Status:</strong> {reg.review_status}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          {STATUS_FLOW.map((s) => (
            <button
              key={s}
              disabled={s === reg.review_status}
              onClick={() => mutation.mutate({ review_status: s })}
              style={{
                padding: "0.35rem 0.7rem",
                borderRadius: 4,
                border:
                  s === reg.review_status
                    ? "2px solid #1B4F72"
                    : "1px solid #ccc",
                background: s === reg.review_status ? "#1B4F72" : "#fff",
                color: s === reg.review_status ? "#fff" : "#333",
                cursor: s === reg.review_status ? "default" : "pointer",
                fontSize: "0.8rem",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Flag for Leadership */}
      <label style={{ display: "block", marginBottom: "1.5rem" }}>
        <input
          type="checkbox"
          checked={!!reg.flagged_for_leadership}
          onChange={(e) =>
            mutation.mutate({ flagged_for_leadership: e.target.checked })
          }
        />{" "}
        🚩 Flag for Leadership
      </label>

      {/* Internal Notes */}
      <div>
        <strong>Internal Notes</strong>
        <pre
          style={{
            background: "#f5f5f5",
            padding: "0.75rem",
            borderRadius: 4,
            whiteSpace: "pre-wrap",
            maxHeight: 200,
            overflow: "auto",
            fontSize: "0.85rem",
          }}
        >
          {reg.internal_notes || "(none)"}
        </pre>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
            style={{ flex: 1, padding: "0.4rem" }}
          />
          <button onClick={handleAddNote} disabled={!note.trim()}>
            Add Note
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  SEARCH PAGE
// ═══════════════════════════════════════════════════════════
const ALL_STATES = [
  "All","AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL",
  "GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY",
];

function SearchPage() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("All");
  const [priority, setPriority] = useState("All");

  const params = {};
  if (search) params.search = search;
  if (state !== "All") params.state = state;
  if (priority !== "All") params.priority = priority;

  const { data, isLoading } = useQuery({
    queryKey: ["search", params],
    queryFn: () => fetchRegulations(params),
  });

  return (
    <>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        Search Regulations
      </h1>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or summary…"
          style={{ flex: 1, padding: "0.5rem" }}
        />
        <select value={state} onChange={(e) => setState(e.target.value)}>
          {ALL_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          {["All", "Critical", "High", "Medium", "Low"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p>Searching…</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {(data?.regulations || []).map((reg) => (
            <li
              key={reg.id}
              style={{
                background: "#fff",
                padding: "0.75rem 1rem",
                marginBottom: "0.5rem",
                borderRadius: 6,
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              <Link
                to={`/regulation/${reg.id}`}
                style={{
                  color: "#2E86C1",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                [{reg.state_abbrev}] {reg.title}
              </Link>
              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  marginTop: "0.25rem",
                  fontSize: "0.85rem",
                  color: "#666",
                  alignItems: "center",
                }}
              >
                <PriorityBadge priority={reg.priority} />
                <span>{reg.urgency_level}</span>
                <span>{reg.date_published?.slice(0, 10)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
//  APP ROOT
// ═══════════════════════════════════════════════════════════
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/regulation/:id" element={<RegulationDetail />} />
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
