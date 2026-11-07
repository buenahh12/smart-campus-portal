import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { FEEDBACK_KINDS, FEEDBACK_RATINGS, deleteFeedback, sendFeedback, setFeedbackStatus, watchFeedback } from "./cms";
import "./analytics.css";

// Feedback: anyone can send a short message (signed in or not); only the administrator can read
// it, on the Feedback page. Saved in feedback/{id} (see firestore.rules and the Privacy Policy).
// Other screens open the form with: window.dispatchEvent(new CustomEvent("sscai:feedback", { detail }))
// where detail can carry { kind, page } (the floor plan sends the route it was showing).

export const openFeedback = (detail = {}) => window.dispatchEvent(new CustomEvent("sscai:feedback", { detail }));

export function FeedbackDialog({ user, role, start = {}, onClose }) {
  const [kind, setKind] = useState(start.kind || "");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [replyOk, setReplyOk] = useState(false);
  const [state, setState] = useState({ sending: false, sent: false, error: "" });
  const first = useRef(null);
  useEffect(() => {
    first.current?.focus();
    const key = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const canReply = Boolean(user && !user.isAnonymous && user.email);
  const submit = async (event) => {
    event.preventDefault();
    if (!kind) return setState({ sending: false, sent: false, error: "Choose what your feedback is about." });
    if (!message.trim()) return setState({ sending: false, sent: false, error: "Write a short message first." });
    setState({ sending: true, sent: false, error: "" });
    try {
      await sendFeedback({ kind, rating, message, page: start.page || "", user, role, replyOk: canReply && replyOk });
      setState({ sending: false, sent: true, error: "" });
    } catch (error) {
      setState({ sending: false, sent: false, error: error?.code === "unavailable" || !navigator.onLine ? "You're offline. Connect to the internet and send it again." : "Your feedback couldn't be sent. Try again in a moment." });
    }
  };
  return <div className="modal-shell feedback-shell" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={(event) => event.target === event.currentTarget && onClose()}>
    <form className="login-modal feedback-dialog" onSubmit={submit}>
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close feedback"><Icon name="close" /></button>
      {state.sent ? <div className="feedback-thanks" role="status">
        <span className="feedback-thanks-icon" aria-hidden="true"><Icon name="heart" size={30} /></span>
        <h2 id="feedback-title">Thank you!</h2>
        <p>Your feedback was sent to the school. It helps make SSCAI NAVI better for everyone.</p>
        <button type="button" className="visitor-button" onClick={onClose}>Done</button>
      </div> : <>
        <p className="kicker">SEND FEEDBACK</p>
        <h2 id="feedback-title">Tell us what you think</h2>
        <p className="modal-copy">Found a mistake, or have an idea? The school reads every message.</p>
        {start.page && <p className="feedback-about"><Icon name="route" size={15} /> About: {start.page}</p>}
        <fieldset className="feedback-kinds">
          <legend>What is it about?</legend>
          {FEEDBACK_KINDS.map((item, index) => <label key={item.value} className={kind === item.value ? "chosen" : ""}>
            <input ref={index === 0 ? first : undefined} type="radio" name="feedback-kind" value={item.value} checked={kind === item.value} onChange={() => { setKind(item.value); setState((current) => ({ ...current, error: "" })); }} />
            <span>{item.label}</span>
          </label>)}
        </fieldset>
        <fieldset className="feedback-rating">
          <legend>How do you like SSCAI NAVI? <small>(optional)</small></legend>
          {FEEDBACK_RATINGS.map((item) => <label key={item.value} className={rating === item.value ? "chosen" : ""} title={item.label}>
            <input type="radio" name="feedback-rating" value={item.value} checked={rating === item.value} onChange={() => setRating(item.value)} />
            <span aria-hidden="true">{item.face}</span><small>{item.label}</small>
          </label>)}
        </fieldset>
        <label className="feedback-message">Your message<textarea value={message} maxLength={1000} rows={4} onChange={(event) => { setMessage(event.target.value); setState((current) => ({ ...current, error: "" })); }} placeholder="For example: the directions to Room 304 said turn left, but it's on the right." /><small>{message.length} / 1000</small></label>
        {canReply && <label className="email-updates-check"><input type="checkbox" checked={replyOk} onChange={(event) => setReplyOk(event.target.checked)} /><span>The school may reply to me at {user.email}</span></label>}
        {state.error && <p className="auth-error" role="alert">{state.error}</p>}
        <button className="visitor-button" type="submit" disabled={state.sending}>{state.sending ? "Sending…" : "Send feedback"}</button>
        <p className="terms">Don&apos;t include passwords or other private information. See the <a href="#privacy">Privacy Policy</a>.</p>
      </>}
    </form>
  </div>;
}

// ---------- Admin: read and sort feedback ----------
const STATUS_TABS = [["new", "New"], ["seen", "Seen"], ["done", "Done"], ["all", "All"]];
const kindLabel = (value) => FEEDBACK_KINDS.find((item) => item.value === value)?.label || value;
const ratingOf = (value) => FEEDBACK_RATINGS.find((item) => item.value === value);
const whenText = (row) => (row.createdAt?.toDate ? row.createdAt.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Just now");

export default function AdminFeedback({ onClose, onOpenContent, onOpenVisits, onOpenSignIns, onOpenLog }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("new");
  useEffect(() => watchFeedback((items) => { setRows(items); setLoading(false); }, () => { setError("Feedback couldn't be loaded. Check that you are signed in as the administrator and the database rules are deployed."); setLoading(false); }), []);
  useEffect(() => {
    const key = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const counts = useMemo(() => Object.fromEntries(STATUS_TABS.map(([value]) => [value, value === "all" ? rows.length : rows.filter((row) => (row.status || "new") === value).length])), [rows]);
  const shown = tab === "all" ? rows : rows.filter((row) => (row.status || "new") === tab);
  const rated = rows.filter((row) => row.rating > 0);
  const average = rated.length ? (rated.reduce((sum, row) => sum + row.rating, 0) / rated.length).toFixed(1) : "–";
  const act = async (task) => {
    setError("");
    try { await task(); } catch { setError("That change couldn't be saved. Try again."); }
  };
  return <div className="admin-shell" role="dialog" aria-modal="true" aria-labelledby="fb-title">
    <div className="admin-dashboard va-dashboard">
      <header className="admin-dashboard-header">
        <div><p className="kicker">SSCAI ADMINISTRATION</p><h2 id="fb-title">Feedback</h2><p>Messages from students, families, staff and visitors. Mark each one Seen or Done as you handle it.</p></div>
        <div className="admin-header-actions">
          {onOpenContent && <button onClick={onOpenContent}>Content</button>}
          {onOpenVisits && <button onClick={onOpenVisits}>Site visits</button>}
          {onOpenSignIns && <button onClick={onOpenSignIns}>Sign-ins</button>}
          {onOpenLog && <button onClick={onOpenLog}>Change log</button>}
          <button className="admin-close" onClick={onClose} aria-label="Close feedback"><Icon name="close" /></button>
        </div>
      </header>
      <section className="va-tiles" aria-label="Feedback totals">
        <article className="va-tile va-tile-total"><span>New</span><b>{loading ? "…" : counts.new}</b><small>Not read yet</small></article>
        <article className="va-tile"><span>All messages</span><b>{loading ? "…" : counts.all}</b></article>
        <article className="va-tile"><span>Average rating</span><b>{loading ? "…" : average}</b><small>out of 3 · {rated.length} rated</small></article>
        {FEEDBACK_KINDS.slice(0, 3).map((item) => <article className="va-tile" key={item.value}><span>{item.label}</span><b>{loading ? "…" : rows.filter((row) => row.kind === item.value).length}</b></article>)}
      </section>
      <div className="va-controls">
        <div className="va-segment" role="group" aria-label="Show">
          {STATUS_TABS.map(([value, label]) => <button key={value} type="button" className={tab === value ? "active" : ""} aria-pressed={tab === value} onClick={() => setTab(value)}>{label} ({counts[value] ?? 0})</button>)}
        </div>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="fb-list">
        {loading ? <p className="va-note">Loading feedback…</p> : shown.length === 0 ? <p className="va-note">{tab === "new" ? "No new feedback. You're all caught up." : "Nothing here."}</p> : shown.map((row) => {
          const face = ratingOf(row.rating);
          const status = row.status || "new";
          return <article key={row.id} className={`fb-item status-${status}`}>
            <div className="fb-item-head">
              <span className="fb-kind">{kindLabel(row.kind)}</span>
              {face && <span className="fb-face" title={face.label}>{face.face} {face.label}</span>}
              <span className={`cms-badge ${status === "new" ? "warn" : "good"}`}>{status === "new" ? "New" : status === "seen" ? "Seen" : "Done"}</span>
            </div>
            <p className="fb-message">{row.message}</p>
            <small className="fb-meta">{whenText(row)} · {row.role || "Guest"}{row.page ? ` · About: ${row.page}` : ""}</small>
            {row.email && <small className="fb-meta">Reply to: <a href={`mailto:${row.email}`}>{row.email}</a></small>}
            <div className="fb-actions">
              {status !== "seen" && <button type="button" onClick={() => act(() => setFeedbackStatus(row.id, "seen"))}>Mark seen</button>}
              {status !== "done" && <button type="button" onClick={() => act(() => setFeedbackStatus(row.id, "done"))}>Done</button>}
              {status !== "new" && <button type="button" onClick={() => act(() => setFeedbackStatus(row.id, "new"))}>Mark new</button>}
              <button type="button" className="fb-delete" onClick={() => window.confirm("Delete this feedback? This can't be undone.") && act(() => deleteFeedback(row.id))}>Delete</button>
            </div>
          </article>;
        })}
      </div>
    </div>
  </div>;
}
