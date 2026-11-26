import { useEffect, useMemo, useState } from "react";
import { Timestamp, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import Icon from "./Icon";
import { auth, db } from "./firebase";
import { accessKey, cleanBirthdate, cleanId, claimsRef, studentListRef, useCampusAccess, validId } from "./campusAccess";
import "./adminplan.css";

// Content manager tab "Student access": who may see the full campus map.
// 1. Upload the school's list (from the registrar's SF1 / LIS export): lrn, name, birthdate, role.
//    Each row is saved only as a scrambled key (SHA-256 of ID + birthdate) with the name.
// 2. Students verify themselves in the app; the list shows who is linked.
// 3. Reset a row if a student changed accounts or someone used their LRN.
// 4. Upload the private map file (room names, numbers and doors) once.

const schoolYearNow = () => {
  const now = new Date();
  const start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1; // June
  return `${start}-${start + 1}`;
};

function parseCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], problems: ["The file is empty."] };
  const split = (line) => line.split(/,|\t|;/).map((cell) => cell.trim().replace(/^"|"$/g, ""));
  let header = split(lines[0]).map((cell) => cell.toLowerCase());
  let body = lines.slice(1);
  if (!header.some((cell) => /lrn|id|number/.test(cell))) { header = ["lrn", "name", "birthdate", "role"]; body = lines; }
  const col = (...names) => header.findIndex((cell) => names.some((name) => cell.includes(name)));
  const idAt = col("lrn", "employee", "id", "number");
  const nameAt = col("name");
  const birthAt = col("birth", "bday", "dob");
  const roleAt = col("role", "type");
  const rows = [];
  const problems = [];
  body.forEach((line, index) => {
    const cells = split(line);
    const role = /staff|teacher|faculty|employee/i.test(cells[roleAt] || "") ? "staff" : "student";
    const id = cleanId(cells[idAt], role);
    const name = String(cells[nameAt] || "").replace(/\s+/g, " ").slice(0, 80);
    const birthdate = cleanBirthdate(cells[birthAt]);
    if (!validId(id, role) || !name || !birthdate) problems.push(`Line ${index + 2}: ${!validId(id, role) ? (role === "staff" ? "employee number" : "LRN must be 12 digits") : !name ? "no name" : "birthdate (use YYYY-MM-DD or MM/DD/YYYY)"}`);
    else rows.push({ id, name, birthdate, role });
  });
  return { rows, problems };
}

export default function AdminAccess() {
  const access = useCampusAccess();
  const [list, setList] = useState([]);
  const [claims, setClaims] = useState({});
  const [schoolYear, setSchoolYear] = useState(schoolYearNow());
  const [replace, setReplace] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!db) return undefined;
    const stopList = onSnapshot(studentListRef(), (snapshot) => setList(snapshot.docs.map((item) => ({ key: item.id, ...item.data() }))), () => setError("The student list could not be loaded. Deploy the new firestore.rules and sign in as the administrator."));
    const stopClaims = onSnapshot(claimsRef(), (snapshot) => setClaims(Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()]))), () => {});
    return () => { stopList(); stopClaims(); };
  }, []);

  const shown = useMemo(() => list
    .filter((item) => !filter.trim() || item.name.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [list, filter]);
  const linked = list.filter((item) => claims[item.key]).length;

  const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" });

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setNotice("");
    const { rows, problems } = parseCsv(await file.text());
    if (!rows.length) { setError(`No rows could be read. ${problems.slice(0, 3).join(" · ")}`); return; }
    if (!/^\d{4}-\d{4}$/.test(schoolYear)) { setError("School year looks like 2026-2027."); return; }
    setBusy(true);
    try {
      const keys = new Set();
      const writes = [];
      for (const row of rows) {
        const key = await accessKey(row.id, row.birthdate);
        keys.add(key);
        writes.push([key, { name: row.name, role: row.role, schoolYear, ...stamp() }]);
      }
      const removals = replace ? list.filter((item) => !keys.has(item.key)).map((item) => item.key) : [];
      for (let index = 0; index < writes.length + removals.length; index += 400) {
        const batch = writeBatch(db);
        [...writes.map(([key, data]) => ["set", key, data]), ...removals.map((key) => ["delete", key])].slice(index, index + 400).forEach(([kind, key, data]) => {
          if (kind === "set") batch.set(doc(db, "studentList", key), data);
          else batch.delete(doc(db, "studentList", key));
        });
        await batch.commit();
      }
      setNotice(`Saved ${rows.length} ${rows.length === 1 ? "person" : "people"} for ${schoolYear}.${removals.length ? ` Removed ${removals.length} no longer on the list (they lose full-map access).` : ""}${problems.length ? ` Skipped ${problems.length}: ${problems.slice(0, 3).join(" · ")}` : ""}`);
    } catch (failure) {
      setError(`The list could not be saved: ${failure.message}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (item, removeRow = false) => {
    const claim = claims[item.key];
    if (!window.confirm(removeRow ? `Remove ${item.name} from the list? They lose full-map access.` : `Reset ${item.name}? Their LRN can then be verified again on a new account.`)) return;
    setError(""); setNotice("");
    try {
      if (claim?.uid) {
        await deleteDoc(doc(db, "campusAccess", claim.uid)).catch(() => {});
        await deleteDoc(doc(db, "verifyTries", claim.uid)).catch(() => {});
      }
      await deleteDoc(doc(db, "lrnClaims", item.key)).catch(() => {});
      if (removeRow) await deleteDoc(doc(db, "studentList", item.key));
      setNotice(removeRow ? `${item.name} was removed.` : `${item.name} can verify again.`);
    } catch (failure) {
      setError(failure.message);
    }
  };

  const uploadMap = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setNotice("");
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== "sscai-map-details-1" || typeof data.rooms !== "object") throw new Error("This is not the SSCAI NAVI map file (sscai-map-details.json).");
      await setDoc(doc(db, "campusPlan", "rooms"), { rooms: data.rooms, walks: data.walks || {}, ...stamp() });
      setNotice(`Map file saved: ${Object.keys(data.rooms).length} rooms. Verified students and staff see them now.`);
    } catch (failure) {
      setError(`The map file could not be saved: ${failure.message}`);
    }
  };

  return <div className="access-admin">
    <ParentRequests />
    <section className="access-card">
      <div className="access-head"><span className="verify-icon" aria-hidden="true"><Icon name="shield" size={20} /></span><div>
        <h3>Who can see the full map</h3>
        <p>Visitors see only the offices, clinic, comfort rooms, stairs and exits. Students and teachers unlock every room by verifying with their LRN (or employee number) and birthdate, checked automatically against this list. No approvals needed.</p>
      </div></div>
      <div className="access-stats">
        <div><b>{list.length}</b><small>on the list</small></div>
        <div><b>{linked}</b><small>verified</small></div>
        <div><b>{access.rooms || 0}</b><small>private rooms on the map</small></div>
      </div>
    </section>

    <section className="access-card">
      <h3>1. Upload this school year&apos;s list</h3>
      <p>A CSV or Excel &ldquo;Save as CSV&rdquo; file with columns <code>lrn, name, birthdate, role</code> (role: student or staff; staff use their employee number instead of an LRN). Only a scrambled code and the name are saved.</p>
      <div className="access-row">
        <label>School year<input value={schoolYear} onChange={(event) => setSchoolYear(event.target.value.trim())} placeholder="2026-2027" /></label>
        <label className="access-check"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} /> Replace the whole list (people not in the file lose access)</label>
      </div>
      <label className={`verify-button access-file${busy ? " busy" : ""}`}><Icon name="download" size={16} /> {busy ? "Saving…" : "Choose the list file"}<input type="file" accept=".csv,text/csv,.txt" onChange={upload} disabled={busy} hidden /></label>
    </section>

    {(notice || error) && <p className={error ? "auth-error" : "access-notice"} role={error ? "alert" : "status"}>{error || notice}</p>}

    <section className="access-card">
      <div className="access-list-head"><h3>2. People on the list</h3><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search a name" aria-label="Search a name" /></div>
      {shown.length ? <ul className="access-list">
        {shown.map((item) => <li key={item.key}>
          <div><b>{item.name}</b><small>{item.role === "staff" ? "Staff" : "Student"} · {item.schoolYear} · {claims[item.key] ? "Verified" : "Not verified yet"}</small></div>
          {claims[item.key] && <button type="button" className="cms-link-button" onClick={() => reset(item)}>Reset</button>}
          <button type="button" className="cms-link-button bp-danger" onClick={() => reset(item, true)}>Remove</button>
        </li>)}
      </ul> : <p className="updates-empty">{list.length ? "No name matches." : "No one yet. Upload the list above."}</p>}
    </section>

    <section className="access-card">
      <h3>3. Private map file (once)</h3>
      <p>The classroom, lab and staff room names, numbers and doors are not in the public website. Upload <code>sscai-map-details.json</code> once; only verified accounts and the administrator can read it. {access.rooms ? `Now: ${access.rooms} rooms saved.` : "Not uploaded yet."}</p>
      <label className="verify-button access-file"><Icon name="download" size={16} /> Choose the map file<input type="file" accept=".json,application/json" onChange={uploadMap} hidden /></label>
    </section>
  </div>;
}

// End of this school year (31 May), when a parent's approval runs out.
const schoolYearEnd = () => {
  const now = new Date();
  const year = now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear();
  return new Date(year, 4, 31, 23, 59, 59);
};

// Parents who sent a valid ID. Approve = full map until the end of the school year. Either way the
// ID photo is deleted at once; only the name, child and result stay.
function ParentRequests() {
  const [requests, setRequests] = useState([]);
  const [approved, setApproved] = useState([]);
  const [open, setOpen] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!db) return undefined;
    const stopRequests = onSnapshot(collection(db, "parentRequests"), (snapshot) => setRequests(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }))), () => setError("Parent requests could not be loaded. Deploy the new firestore.rules."));
    const stopApproved = onSnapshot(collection(db, "parentAccess"), (snapshot) => setApproved(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }))), () => {});
    return () => { stopRequests(); stopApproved(); };
  }, []);
  const waiting = requests.filter((item) => item.status === "pending").sort((a, b) => (a.at?.toMillis?.() || 0) - (b.at?.toMillis?.() || 0));

  const decide = async (item, approve) => {
    let reason = "";
    if (!approve) {
      reason = (window.prompt(`Why can't ${item.name} be approved? (They will see this.)`, "The ID photo is not clear") || "").trim().slice(0, 120);
      if (!reason) return;
    }
    setError(""); setNotice("");
    try {
      if (approve) {
        await setDoc(doc(db, "parentAccess", item.uid), { name: item.name, childName: item.childName, until: Timestamp.fromDate(schoolYearEnd()), approvedAt: serverTimestamp(), approvedBy: auth.currentUser?.email || "" });
      }
      await updateDoc(doc(db, "parentRequests", item.uid), { status: approve ? "approved" : "rejected", reason, idPhoto: "", decidedAt: serverTimestamp() });
      setOpen(null);
      setNotice(approve ? `${item.name} is approved until 31 May. The ID photo was deleted.` : `${item.name} was not approved. The ID photo was deleted.`);
    } catch (failure) {
      setError(failure.message);
    }
  };
  const removeParent = async (item) => {
    if (!window.confirm(`Remove full-map access for ${item.name}?`)) return;
    try { await deleteDoc(doc(db, "parentAccess", item.uid)); } catch (failure) { setError(failure.message); }
  };

  return <section className="access-card">
    <h3>Parent requests {waiting.length > 0 && <span className="access-badge">{waiting.length} waiting</span>}</h3>
    <p>Parents send a photo of a valid ID and their child&apos;s name. Check it against your records. Approved parents see the full map until 31 May. The ID photo is deleted as soon as you decide.</p>
    {(notice || error) && <p className={error ? "auth-error" : "access-notice"} role={error ? "alert" : "status"}>{error || notice}</p>}
    {waiting.length ? <ul className="access-list">
      {waiting.map((item) => <li key={item.uid} className="parent-request">
        <div><b>{item.name}</b><small>Parent of {item.childName} · {item.childGrade} · {item.contact}</small></div>
        <button type="button" className="cms-link-button" onClick={() => setOpen(open === item.uid ? null : item.uid)}>{open === item.uid ? "Hide ID" : "See ID"}</button>
        <button type="button" className="verify-button" onClick={() => decide(item, true)}>Approve</button>
        <button type="button" className="cms-link-button bp-danger" onClick={() => decide(item, false)}>Reject</button>
        {open === item.uid && item.idPhoto && <img className="parent-id" src={item.idPhoto} alt={`ID of ${item.name}`} />}
      </li>)}
    </ul> : <p className="updates-empty">No requests waiting.</p>}
    {approved.length > 0 && <>
      <h4 className="access-sub">Approved parents ({approved.length})</h4>
      <ul className="access-list">
        {approved.map((item) => <li key={item.uid}>
          <div><b>{item.name}</b><small>Parent of {item.childName} · until {item.until?.toDate?.().toLocaleDateString() || "—"}</small></div>
          <button type="button" className="cms-link-button bp-danger" onClick={() => removeParent(item)}>Remove</button>
        </li>)}
      </ul>
    </>}
  </section>;
}
