import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { FEEDBACK_FEATURES, FEEDBACK_IMPROVE, FEEDBACK_KINDS, FEEDBACK_RATINGS, FEEDBACK_SURVEY, deleteFeedback, sendFeedback, setFeedbackStatus, watchFeedback } from "./cms";
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
  const [answers, setAnswers] = useState({});
  const [used, setUsed] = useState([]);
  const [improve, setImprove] = useState([]);
  const toggle = (list, setList, value) => setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const survey = { ...answers, ...(used.length ? { used } : {}), ...(improve.length ? { improve } : {}) };
  const answered = Object.keys(survey).length > 0 || rating > 0;
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
    if (!answered && !message.trim()) return setState({ sending: false, sent: false, error: "Answer a question or write a short message first." });
    if (message.trim() && !kind) return setState({ sending: false, sent: false, error: "Choose what your message is about." });
    setState({ sending: true, sent: false, error: "" });
    try {
      await sendFeedback({ kind: message.trim() ? kind : kind || "survey", rating, message, page: start.page || "", user, role, replyOk: canReply && replyOk, survey: Object.keys(survey).length ? survey : null });
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
        <p className="modal-copy">Tap your answers. Every question is optional, and it takes about a minute. The school reads every reply.</p>
        {start.page && <p className="feedback-about"><Icon name="route" size={15} /> About: {start.page}</p>}
        <fieldset className="feedback-rating">
          <legend>Overall, how do you like SSCAI NAVI?</legend>
          {FEEDBACK_RATINGS.map((item) => <label key={item.value} className={rating === item.value ? "chosen" : ""} title={item.label}>
            <input type="radio" name="feedback-rating" value={item.value} checked={rating === item.value} onChange={() => setRating(item.value)} />
            <span aria-hidden="true">{item.face}</span><small>{item.label}</small>
          </label>)}
        </fieldset>
        {FEEDBACK_SURVEY.map((item) => <fieldset className="feedback-kinds feedback-question" key={item.key}>
          <legend>{item.question}</legend>
          {item.options.map(([value, label]) => <label key={value} className={answers[item.key] === value ? "chosen" : ""}>
            <input type="radio" name={`fb-${item.key}`} checked={answers[item.key] === value} onChange={() => { setAnswers((current) => ({ ...current, [item.key]: value })); setState((current) => ({ ...current, error: "" })); }} />
            <span>{label}</span>
          </label>)}
        </fieldset>)}
        <fieldset className="feedback-kinds feedback-question">
          <legend>What did you use? <small>(tap all that apply)</small></legend>
          {FEEDBACK_FEATURES.map(([value, label]) => <label key={value} className={used.includes(value) ? "chosen" : ""}>
            <input type="checkbox" checked={used.includes(value)} onChange={() => toggle(used, setUsed, value)} />
            <span>{label}</span>
          </label>)}
        </fieldset>
        <fieldset className="feedback-kinds feedback-question">
          <legend>What should we make better? <small>(tap all that apply)</small></legend>
          {FEEDBACK_IMPROVE.map(([value, label]) => <label key={value} className={improve.includes(value) ? "chosen" : ""}>
            <input type="checkbox" checked={improve.includes(value)} onChange={() => toggle(improve, setImprove, value)} />
            <span>{label}</span>
          </label>)}
        </fieldset>
        <fieldset className="feedback-kinds">
          <legend>Anything else? What is it about? <small>(optional)</small></legend>
          {FEEDBACK_KINDS.map((item, index) => <label key={item.value} className={kind === item.value ? "chosen" : ""}>
            <input ref={index === 0 ? first : undefined} type="radio" name="feedback-kind" value={item.value} checked={kind === item.value} onChange={() => { setKind(item.value); setState((current) => ({ ...current, error: "" })); }} />
            <span>{item.label}</span>
          </label>)}
        </fieldset>
        <label className="feedback-message">Your message <small>(optional)</small><textarea value={message} maxLength={1000} rows={4} onChange={(event) => { setMessage(event.target.value); setState((current) => ({ ...current, error: "" })); }} placeholder="Other comments, ideas, or something that went wrong. For example: the directions to Room 304 said turn left, but it's on the right." /><small>{message.length} / 1000</small></label>
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
const answerLabel = (key, value) => FEEDBACK_SURVEY.find((item) => item.key === key)?.options.find(([option]) => option === value)?.[1] || value;
const listLabel = (list, value) => list.find(([option]) => option === value)?.[1] || value;
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");

// Bars for one question: how many chose each answer.
function SurveyBars({ title, options, count, total }) {
  const max = Math.max(1, ...options.map(([value]) => count(value)));
  return <article className="fb-survey-card">
    <h4>{title}</h4>
    <small>{total} answered</small>
    {options.map(([value, label]) => {
      const n = count(value);
      return <div className="fb-bar" key={value}>
        <span>{label}</span>
        <i><b style={{ width: `${(n / max) * 100}%` }} /></i>
        <em>{n}</em>
      </div>;
    })}
  </article>;
}
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
  const [showSurvey, setShowSurvey] = useState(true);
  const surveyed = rows.filter((row) => row.survey);
  const answeredOf = (key) => surveyed.filter((row) => row.survey[key] !== undefined && row.survey[key] !== "");
  const eased = answeredOf("ease");
  const easeAverage = eased.length ? (eased.reduce((sum, row) => sum + row.survey.ease, 0) / eased.length).toFixed(1) : "–";
  const sibotUsers = answeredOf("sibot").filter((row) => row.survey.sibot !== "unused");
  const yesShare = (key) => percent(answeredOf(key).filter((row) => row.survey[key] === "yes").length, answeredOf(key).length);
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
        <article className="va-tile"><span>Easy to use</span><b>{loading ? "…" : easeAverage}</b><small>out of 5 · {eased.length} answered</small></article>
        <article className="va-tile"><span>Found their place</span><b>{loading ? "…" : yesShare("found")}</b><small>said yes</small></article>
        <article className="va-tile"><span>SiBot helped</span><b>{loading ? "…" : percent(sibotUsers.filter((row) => row.survey.sibot === "yes" || row.survey.sibot === "little").length, sibotUsers.length)}</b><small>of {sibotUsers.length} who used it</small></article>
        <article className="va-tile"><span>Would recommend</span><b>{loading ? "…" : yesShare("recommend")}</b><small>said yes</small></article>
      </section>
      <div className="va-controls">
        <div className="va-segment" role="group" aria-label="Show">
          {STATUS_TABS.map(([value, label]) => <button key={value} type="button" className={tab === value ? "active" : ""} aria-pressed={tab === value} onClick={() => setTab(value)}>{label} ({counts[value] ?? 0})</button>)}
        </div>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {!loading && surveyed.length > 0 && <section className="fb-survey" aria-labelledby="fb-survey-title">
        <div className="fb-survey-head">
          <h3 id="fb-survey-title">Survey answers <small>({surveyed.length} {surveyed.length === 1 ? "person" : "people"})</small></h3>
          <button type="button" onClick={() => setShowSurvey(!showSurvey)} aria-expanded={showSurvey}>{showSurvey ? "Hide" : "Show"}</button>
        </div>
        {showSurvey && <div className="fb-survey-grid">
          {FEEDBACK_SURVEY.map((item) => <SurveyBars key={item.key} title={item.question} options={item.options} total={answeredOf(item.key).length} count={(value) => answeredOf(item.key).filter((row) => row.survey[item.key] === value).length} />)}
          <SurveyBars title="What people used" options={FEEDBACK_FEATURES} total={surveyed.filter((row) => row.survey.used?.length).length} count={(value) => surveyed.filter((row) => row.survey.used?.includes(value)).length} />
          <SurveyBars title="What to make better" options={FEEDBACK_IMPROVE} total={surveyed.filter((row) => row.survey.improve?.length).length} count={(value) => surveyed.filter((row) => row.survey.improve?.includes(value)).length} />
        </div>}
      </section>}
      <div className="fb-list">
        {loading ? <p className="va-note">Loading feedback…</p> : shown.length === 0 ? <p className="va-note">{tab === "new" ? "No new feedback. You're all caught up." : "Nothing here."}</p> : shown.map((row) => {
          const face = ratingOf(row.rating);
          const status = row.status || "new";
          return <article key={row.id} className={`fb-item status-${status}`}>
            <div className="fb-item-head">
              <span className="fb-kind">{row.kind === "survey" ? "Survey only" : kindLabel(row.kind)}</span>
              {face && <span className="fb-face" title={face.label}>{face.face} {face.label}</span>}
              <span className={`cms-badge ${status === "new" ? "warn" : "good"}`}>{status === "new" ? "New" : status === "seen" ? "Seen" : "Done"}</span>
            </div>
            {row.message && <p className="fb-message">{row.message}</p>}
            {row.survey && <ul className="fb-answers">
              {FEEDBACK_SURVEY.filter((item) => row.survey[item.key] !== undefined && row.survey[item.key] !== "").map((item) => <li key={item.key}><span>{item.question}</span> <b>{answerLabel(item.key, row.survey[item.key])}</b></li>)}
              {row.survey.used?.length > 0 && <li><span>Used:</span> <b>{row.survey.used.map((value) => listLabel(FEEDBACK_FEATURES, value)).join(", ")}</b></li>}
              {row.survey.improve?.length > 0 && <li><span>Make better:</span> <b>{row.survey.improve.map((value) => listLabel(FEEDBACK_IMPROVE, value)).join(", ")}</b></li>}
            </ul>}
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
