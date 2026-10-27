import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { SIGN_IN_METHODS, watchSignIns } from "./cms";
import "./analytics.css";

// Admin dashboard: who signed in, with which account and method, and on what device.
// Data comes from signIns/{id}, written once per browser session by recordSignIn in cms.js.

const PERIODS = [
  ["today", "Today"],
  ["7", "7 days"],
  ["30", "30 days"],
  ["year", "This year"],
];
const DEVICES = ["Phone", "Tablet", "Computer"];

function periodRange(period) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "7") start.setDate(start.getDate() - 6);
  if (period === "30") start.setDate(start.getDate() - 29);
  if (period === "year") start.setMonth(0, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return [start, end];
}

const methodLabel = (method) => SIGN_IN_METHODS[method] || method || "Unknown";
const whenText = (row) => row.at?.toDate ? row.at.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Just now";
const who = (row) => row.name || (row.method === "anonymous" ? "Visitor" : "No name");

function countBy(rows, pick) {
  const counts = {};
  rows.forEach((row) => {
    const key = pick(row) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).sort((first, second) => second[1] - first[1]);
}

function Breakdown({ title, entries, total }) {
  return (
    <section className="si-breakdown" aria-label={title}>
      <h3>{title}</h3>
      {entries.length === 0 && <p className="si-none">No data yet</p>}
      <ul>
        {entries.map(([label, count]) => <li key={label}>
          <span className="si-break-label">{label}</span>
          <span className="si-break-track" aria-hidden="true"><i style={{ width: `${(count / total) * 100}%` }} /></span>
          <b>{count}</b>
        </li>)}
      </ul>
    </section>
  );
}

export default function AdminSignIns({ onClose, onOpenContent, onOpenVisits }) {
  const [period, setPeriod] = useState("7");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [device, setDevice] = useState("all");
  const [grouping, setGrouping] = useState("person");

  useEffect(() => {
    const [from, to] = periodRange(period);
    setLoading(true);
    setError("");
    return watchSignIns(from, to, (data) => {
      setRows(data);
      setLoading(false);
    }, (problem) => {
      setLoading(false);
      setError(problem?.code === "permission-denied" ? "Only the administrator can see sign-in records." : "Sign-in records could not be loaded. Check your connection.");
    });
  }, [period]);

  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => (method === "all" || row.method === method)
      && (device === "all" || row.device === device)
      && (!term || `${row.name} ${row.email} ${row.role}`.toLowerCase().includes(term)));
  }, [rows, search, method, device]);

  // One row per person: their latest sign-in, how many times, and every device type they used.
  const people = useMemo(() => {
    const byUid = new Map();
    filtered.forEach((row) => {
      const person = byUid.get(row.uid);
      if (!person) byUid.set(row.uid, { ...row, count: 1, devices: new Set([row.device]) });
      else {
        person.count += 1;
        person.devices.add(row.device);
      }
    });
    return [...byUid.values()];
  }, [filtered]);

  const deviceCount = (name) => filtered.filter((row) => row.device === name).length;
  const total = filtered.length || 1;
  const periodLabel = PERIODS.find(([key]) => key === period)[1];

  const exportCsv = () => {
    const header = ["Date and time", "Name", "Email", "Role", "Sign-in method", "Device", "System", "Browser", "Screen"];
    const lines = filtered.map((row) => [whenText(row), who(row), row.email, row.role, methodLabel(row.method), row.device, row.os, row.browser, row.screen]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `sign-ins-${period}-${new Date().toLocaleDateString("en-CA")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="admin-shell" role="dialog" aria-modal="true" aria-labelledby="si-title">
      <div className="admin-dashboard va-dashboard">
        <header className="admin-dashboard-header">
          <div><p className="kicker">SSCAI ADMINISTRATION</p><h2 id="si-title">Sign-ins</h2><p>Who signed in, which account they used, and on what device.</p></div>
          <div className="admin-header-actions">
            {onOpenContent && <button onClick={onOpenContent}>Content manager</button>}
            {onOpenVisits && <button onClick={onOpenVisits}>Site visits</button>}
            <button onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
            <button className="admin-close" onClick={onClose} aria-label="Close sign-ins"><Icon name="close" /></button>
          </div>
        </header>

        <div className="va-controls">
          <div className="va-segment" role="group" aria-label="Time period">
            {PERIODS.map(([key, label]) => <button key={key} type="button" aria-pressed={period === key} className={period === key ? "active" : ""} onClick={() => setPeriod(key)}>{label}</button>)}
          </div>
          <label className="si-search">Search<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or role" /></label>
          <label>Signed in with<select value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="all">Any method</option>
            {Object.entries(SIGN_IN_METHODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>Device<select value={device} onChange={(event) => setDevice(event.target.value)}>
            <option value="all">Any device</option>
            {DEVICES.map((name) => <option key={name}>{name}</option>)}
          </select></label>
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <section className="va-tiles" aria-label={`Totals for ${periodLabel}`}>
          <article className="va-tile va-tile-total"><span>Sign-ins</span><b>{loading ? "…" : filtered.length.toLocaleString()}</b><small>{periodLabel}</small></article>
          <article className="va-tile"><span>People</span><b>{loading ? "…" : people.length.toLocaleString()}</b><small>Different accounts</small></article>
          {DEVICES.map((name) => <article className="va-tile" key={name}><span>{name}s</span><b>{loading ? "…" : deviceCount(name).toLocaleString()}</b></article>)}
          <article className="va-tile"><span>Google</span><b>{loading ? "…" : filtered.filter((row) => row.method === "google.com").length.toLocaleString()}</b><small>Gmail accounts</small></article>
        </section>

        <div className="si-breakdowns">
          <Breakdown title="Sign-in method" entries={countBy(filtered, (row) => methodLabel(row.method))} total={total} />
          <Breakdown title="System" entries={countBy(filtered, (row) => row.os)} total={total} />
          <Breakdown title="Browser" entries={countBy(filtered, (row) => row.browser)} total={total} />
          <Breakdown title="Role" entries={countBy(filtered, (row) => row.role || "Not set")} total={total} />
        </div>

        <section className="va-chart-card">
          <div className="va-chart-head">
            <h3>{grouping === "person" ? "People who signed in" : "Every sign-in"}</h3>
            <div className="va-segment" role="group" aria-label="Group the list">
              <button type="button" aria-pressed={grouping === "person"} className={grouping === "person" ? "active" : ""} onClick={() => setGrouping("person")}>By person</button>
              <button type="button" aria-pressed={grouping === "all"} className={grouping === "all" ? "active" : ""} onClick={() => setGrouping("all")}>Every sign-in</button>
            </div>
          </div>
          {!loading && !filtered.length && <p className="va-empty">{rows.length ? "No sign-ins match these filters." : "No sign-ins recorded in this period yet. Recording started when this feature went live."}</p>}
          {filtered.length > 0 && <div className="va-table-wrap si-table">
            <table>
              <thead><tr>
                <th scope="col">{grouping === "person" ? "Last sign-in" : "Date and time"}</th>
                <th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Signed in with</th>
                <th scope="col">Device</th><th scope="col">System</th><th scope="col">Browser</th>
                {grouping === "person" && <th scope="col">Times</th>}
              </tr></thead>
              <tbody>
                {(grouping === "person" ? people : filtered).map((row) => <tr key={grouping === "person" ? row.uid : row.id}>
                  <td>{whenText(row)}</td>
                  <th scope="row">{who(row)}</th>
                  <td>{row.email || "—"}</td>
                  <td>{row.role || "—"}</td>
                  <td>{methodLabel(row.method)}</td>
                  <td>{grouping === "person" ? [...row.devices].join(", ") : row.device}</td>
                  <td>{row.os}</td>
                  <td>{row.browser}</td>
                  {grouping === "person" && <td>{row.count}</td>}
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>

        <p className="va-note">How sign-ins are recorded: one row each time someone signs in, or opens SSCA NAVI while already signed in, once per browser session. The email comes from their verified account, so it can&apos;t be faked. Device, system, and browser are read from the browser they used. The administrator account is never recorded. People are told on the sign-in screen that this is collected.</p>
      </div>
    </div>
  );
}
