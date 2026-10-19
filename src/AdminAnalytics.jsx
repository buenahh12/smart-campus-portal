import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { VISIT_GROUPS, todayKey, watchStats } from "./cms";
import "./analytics.css";

// Admin dashboard: how many people used the portal per day, month and year, split by
// guests and signed-in roles. Data comes from the daily counters in stats/YYYY-MM-DD.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (value) => String(value).padStart(2, "0");
const toKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromKey = (key) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const shortDate = (key) => {
  const date = fromKey(key);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
};
const COUNTS = ["total", ...VISIT_GROUPS.map((group) => group.key)];
const emptyCounts = () => Object.fromEntries(COUNTS.map((key) => [key, 0]));
const addCounts = (sum, doc = {}) => {
  COUNTS.forEach((key) => { sum[key] += Number(doc[key]) || 0; });
  return sum;
};

// Rounds the chart's top value up to 1, 2 or 5 x 10^n so gridlines land on whole numbers.
function niceMax(value) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((multiple) => multiple * power >= value / 4) * power;
  return step * 4;
}

function buildBuckets(view, day, month, year, stats) {
  if (view === "day") {
    const end = fromKey(day);
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(end);
      date.setDate(end.getDate() - 13 + index);
      const key = toKey(date);
      return { key, label: shortDate(key), long: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }), counts: addCounts(emptyCounts(), stats[key]) };
    });
  }
  if (view === "month") {
    const [y, m] = month.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    return Array.from({ length: days }, (_, index) => {
      const key = `${month}-${pad(index + 1)}`;
      return { key, label: String(index + 1), long: fromKey(key).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }), counts: addCounts(emptyCounts(), stats[key]) };
    });
  }
  return MONTHS.map((name, index) => {
    const prefix = `${year}-${pad(index + 1)}`;
    const counts = Object.entries(stats).filter(([key]) => key.startsWith(prefix)).reduce((sum, [, doc]) => addCounts(sum, doc), emptyCounts());
    return { key: prefix, label: name, long: `${new Date(Number(year), index, 1).toLocaleDateString("en-US", { month: "long" })} ${year}`, counts };
  });
}

function rangeFor(view, day, month, year) {
  if (view === "day") {
    const start = fromKey(day);
    start.setDate(start.getDate() - 13);
    return [toKey(start), day];
  }
  if (view === "month") {
    const [y, m] = month.split("-").map(Number);
    return [`${month}-01`, `${month}-${pad(new Date(y, m, 0).getDate())}`];
  }
  return [`${year}-01-01`, `${year}-12-31`];
}

export default function AdminAnalytics({ onClose, onOpenContent }) {
  const today = todayKey();
  const [view, setView] = useState("month");
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState(null);
  const [from, to] = rangeFor(view, day, month, year);

  useEffect(() => {
    setLoading(true);
    setError("");
    return watchStats(from, to, (data) => {
      setStats(data);
      setLoading(false);
    }, (problem) => {
      setLoading(false);
      setError(problem?.code === "permission-denied" ? "Only the administrator can see visit statistics." : "Visit statistics could not be loaded. Check your connection.");
    });
  }, [from, to]);

  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const buckets = useMemo(() => buildBuckets(view, day, month, year, stats), [view, day, month, year, stats]);
  const totals = view === "day" ? addCounts(emptyCounts(), stats[day]) : buckets.reduce((sum, bucket) => addCounts(sum, bucket.counts), emptyCounts());
  const top = niceMax(Math.max(...buckets.map((bucket) => bucket.counts.total)));
  const periodLabel = view === "day" ? fromKey(day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : view === "month" ? fromKey(`${month}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : year;
  const chartTitle = view === "day" ? "Visits per day, last 14 days" : view === "month" ? `Visits per day in ${periodLabel}` : `Visits per month in ${year}`;
  const showLabel = (index) => view !== "month" || index === 0 || (index + 1) % 5 === 0;
  const hasData = buckets.some((bucket) => bucket.counts.total > 0);
  const years = Array.from({ length: 4 }, (_, index) => String(Number(today.slice(0, 4)) - index));

  const exportCsv = () => {
    const header = ["Period", "Total visits", ...VISIT_GROUPS.map((group) => group.label)];
    const rows = buckets.map((bucket) => [bucket.key, bucket.counts.total, ...VISIT_GROUPS.map((group) => bucket.counts[group.key])]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `site-visits-${view}-${view === "day" ? day : view === "month" ? month : year}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const activeBucket = active === null ? null : buckets[active];

  return (
    <div className="admin-shell" role="dialog" aria-modal="true" aria-labelledby="va-title">
      <div className="admin-dashboard va-dashboard">
        <header className="admin-dashboard-header">
          <div><p className="kicker">SSCAI ADMINISTRATION</p><h2 id="va-title">Site visits</h2><p>How many people used the campus portal, and who they were.</p></div>
          <div className="admin-header-actions">
            {onOpenContent && <button onClick={onOpenContent}>Content manager</button>}
            <button onClick={exportCsv}>Export CSV</button>
            <button className="admin-close" onClick={onClose} aria-label="Close site visits"><Icon name="close" /></button>
          </div>
        </header>

        <div className="va-controls">
          <div className="va-segment" role="group" aria-label="Time period">
            {[["day", "Day"], ["month", "Month"], ["year", "Year"]].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} className={view === key ? "active" : ""} onClick={() => { setView(key); setActive(null); }}>{label}</button>)}
          </div>
          {view === "day" && <label>Day<input type="date" value={day} max={today} onChange={(event) => event.target.value && setDay(event.target.value)} /></label>}
          {view === "month" && <label>Month<input type="month" value={month} max={today.slice(0, 7)} onChange={(event) => event.target.value && setMonth(event.target.value)} /></label>}
          {view === "year" && <label>Year<select value={year} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item}>{item}</option>)}</select></label>}
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <section className="va-tiles" aria-label={`Totals for ${periodLabel}`}>
          <article className="va-tile va-tile-total"><span>Total visits</span><b>{loading ? "…" : totals.total.toLocaleString()}</b><small>{periodLabel}</small></article>
          {VISIT_GROUPS.map((group) => <article className="va-tile" key={group.key}><span>{group.label}</span><b>{loading ? "…" : totals[group.key].toLocaleString()}</b>{group.hint && <small>{group.hint}</small>}</article>)}
        </section>

        <section className="va-chart-card" aria-labelledby="va-chart-title">
          <div className="va-chart-head"><h3 id="va-chart-title">{chartTitle}</h3><small>Hover or tap a bar for the breakdown</small></div>
          {!loading && !hasData && <p className="va-empty">No visits recorded in this period yet. Counting started when this feature went live.</p>}
          <div className="va-chart" onMouseLeave={() => setActive(null)}>
            <div className="va-grid" aria-hidden="true">
              {[4, 3, 2, 1, 0].map((step) => <div key={step} className="va-gridline"><span>{Math.round((top / 4) * step)}</span></div>)}
            </div>
            <div className="va-bars" role="list" style={{ "--count": buckets.length }}>
              {buckets.map((bucket, index) => <div key={bucket.key} className="va-bar-slot" role="listitem">
                <button
                  type="button"
                  className={`va-bar ${active === index ? "active" : ""}`}
                  style={{ "--h": `${(bucket.counts.total / top) * 100}%` }}
                  aria-label={`${bucket.long}: ${bucket.counts.total} ${bucket.counts.total === 1 ? "visit" : "visits"}`}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(active === index ? null : index)}
                ><i /></button>
                <span className="va-xlabel" aria-hidden="true">{showLabel(index) ? bucket.label : ""}</span>
              </div>)}
            </div>
            {activeBucket && <div className="va-tooltip" role="status" style={{ "--x": (active + 0.5) / buckets.length }}>
              <b>{activeBucket.long}</b>
              <span className="va-tooltip-total">{activeBucket.counts.total} {activeBucket.counts.total === 1 ? "visit" : "visits"}</span>
              {VISIT_GROUPS.map((group) => <span key={group.key}>{group.label}<em>{activeBucket.counts[group.key]}</em></span>)}
            </div>}
          </div>
          <details className="va-table-toggle">
            <summary>Show as a table</summary>
            <div className="va-table-wrap">
              <table>
                <thead><tr><th scope="col">{view === "year" ? "Month" : "Day"}</th><th scope="col">Total</th>{VISIT_GROUPS.map((group) => <th scope="col" key={group.key}>{group.label}</th>)}</tr></thead>
                <tbody>{buckets.map((bucket) => <tr key={bucket.key}><th scope="row">{bucket.long}</th><td>{bucket.counts.total}</td>{VISIT_GROUPS.map((group) => <td key={group.key}>{bucket.counts[group.key]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </details>
        </section>

        <p className="va-note">How visits are counted: each browser counts once per day as a visit. Guests are visits from people who aren&apos;t signed in. Students, faculty and staff, parents, and visitor accounts are counted once per day when they&apos;re signed in, by the role on their account. No names or emails are stored, and the administrator is never counted.</p>
      </div>
    </div>
  );
}
