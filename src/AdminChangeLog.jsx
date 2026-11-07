import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { LOG_TYPES, watchChangeLog } from "./cms";
import "./analytics.css";

// Admin: the content update log, newest first. Lines come from changeLog/{id}, written by cms.js
// whenever the administrator adds, edits, publishes, unpublishes or deletes something.
const whenText = (row) => (row.at?.toDate ? row.at.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Just now");
const ACTION_TONE = { added: "good", published: "good", "turned on": "warn", edited: "neutral", unpublished: "warn", "turned off": "neutral", deleted: "bad", reset: "neutral" };
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export default function AdminChangeLog({ onClose, onOpenContent, onOpenVisits, onOpenSignIns, onOpenFeedback }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  useEffect(() => watchChangeLog((items) => { setRows(items); setLoading(false); }, () => { setError("The change log couldn't be loaded. Check that you are signed in as the administrator and the database rules are deployed."); setLoading(false); }), []);
  useEffect(() => {
    const key = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const term = search.trim().toLowerCase();
  const shown = useMemo(() => rows.filter((row) => (type === "all" || row.type === type) && (!term || [row.title, row.fields, row.action, LOG_TYPES[row.type]].some((value) => String(value || "").toLowerCase().includes(term)))), [rows, type, term]);
  const today = new Date().toDateString();
  return <div className="admin-shell" role="dialog" aria-modal="true" aria-labelledby="log-title">
    <div className="admin-dashboard va-dashboard">
      <header className="admin-dashboard-header">
        <div><p className="kicker">SSCAI ADMINISTRATION</p><h2 id="log-title">Change log</h2><p>Every change made in the admin side: what changed, when, and by whom. Lines can&apos;t be edited or deleted.</p></div>
        <div className="admin-header-actions">
          {onOpenContent && <button onClick={onOpenContent}>Content</button>}
          {onOpenVisits && <button onClick={onOpenVisits}>Site visits</button>}
          {onOpenSignIns && <button onClick={onOpenSignIns}>Sign-ins</button>}
          {onOpenFeedback && <button onClick={onOpenFeedback}>Feedback</button>}
          <button className="admin-close" onClick={onClose} aria-label="Close change log"><Icon name="close" /></button>
        </div>
      </header>
      <section className="va-tiles" aria-label="Change totals">
        <article className="va-tile va-tile-total"><span>Changes</span><b>{loading ? "…" : rows.length}</b><small>All time</small></article>
        <article className="va-tile"><span>Today</span><b>{loading ? "…" : rows.filter((row) => row.at?.toDate && row.at.toDate().toDateString() === today).length}</b></article>
        <article className="va-tile"><span>Announcements</span><b>{loading ? "…" : rows.filter((row) => row.type === "announcements").length}</b></article>
        <article className="va-tile"><span>Deleted</span><b>{loading ? "…" : rows.filter((row) => row.action === "deleted").length}</b></article>
      </section>
      <div className="va-controls log-controls">
        <label className="log-filter">Show<select value={type} onChange={(event) => setType(event.target.value)}><option value="all">Everything</option>{Object.entries(LOG_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <input className="directory-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the log…" aria-label="Search the change log" />
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="log-list" role="list">
        {loading ? <p className="va-note">Loading the change log…</p> : shown.length === 0 ? <p className="va-note">{rows.length ? "No changes match." : "No changes yet. Changes made from now on appear here."}</p> : shown.map((row) => <article key={row.id} className="log-item" role="listitem">
          <span className={`cms-badge log-action ${ACTION_TONE[row.action] || "neutral"}`}>{capital(row.action)}</span>
          <div className="log-text">
            <b>{LOG_TYPES[row.type] || row.type}{row.title ? <>: <q>{row.title}</q></> : ""}</b>
            {row.fields && <small>Changed: {row.fields}</small>}
          </div>
          <small className="log-when">{whenText(row)}<br />{row.by === "admin1@sscai-portal.invalid" ? "admin1" : row.by || "Unknown"}</small>
        </article>)}
      </div>
    </div>
  </div>;
}
