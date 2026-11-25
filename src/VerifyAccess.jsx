import { useState } from "react";
import Icon from "./Icon";
import { auth } from "./firebase";
import { useCampusAccess, verifyCampusAccess } from "./campusAccess";

// "Students and staff: see the full map". A signed-in account verifies once with an LRN (or an
// employee number) and birthdate, checked automatically against the school's list.
export default function VerifyAccess({ compact = false, initialRole = "student", bare = false }) {
  const access = useCampusAccess();
  const [role, setRole] = useState(initialRole);
  const [id, setId] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const user = auth?.currentUser;
  const signedIn = Boolean(user && !user.isAnonymous);

  if (access.status === "verified" || access.status === "admin") {
    return <div className={`verify-access verified${compact ? " compact" : ""}`} role="status">
      <span className="verify-icon" aria-hidden="true"><Icon name="shield" size={20} /></span>
      <div>
        <b>{done || (access.status === "admin" ? "Administrator: full map" : `Verified ${access.role === "staff" ? "staff" : "student"}: ${access.name}`)}</b>
        <small>Every room, classroom and lab is on your 2D, 3D and AR map{access.schoolYear ? ` for school year ${access.schoolYear}` : ""}.</small>
      </div>
    </div>;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!agree) { setError("Please tick the box to agree first."); return; }
    setBusy(true);
    try {
      const entry = await verifyCampusAccess({ id, birthdate, role });
      setDone(`Welcome, ${entry.name}! The full map is unlocked.`);
      setId("");
      setBirthdate("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return <div className={`verify-access${compact ? " compact" : ""}${bare ? " bare" : ""}`}>
    {!bare && <div className="verify-head">
      <span className="verify-icon" aria-hidden="true"><Icon name="shield" size={20} /></span>
      <div>
        <b>Students and staff: unlock the full map</b>
        <small>For safety, visitors only see the offices, clinic, comfort rooms and exits. Verify once to see every classroom and lab.</small>
      </div>
    </div>}
    {!signedIn ? <>
      <p className="verify-note">Sign in with your own account first (not as a guest). Then come back here to verify.</p>
      <button type="button" className="verify-button" onClick={() => window.dispatchEvent(new Event("sscai:login"))}>Sign in</button>
    </> : <form onSubmit={submit} className="verify-form">
      <div className="verify-roles" role="radiogroup" aria-label="I am a">
        <label className={role === "student" ? "on" : ""}><input type="radio" name="verify-role" checked={role === "student"} onChange={() => setRole("student")} /> Student</label>
        <label className={role === "staff" ? "on" : ""}><input type="radio" name="verify-role" checked={role === "staff"} onChange={() => setRole("staff")} /> Teacher / staff</label>
      </div>
      <label>{role === "staff" ? "Employee number" : "LRN (12 digits, on your report card)"}
        <input value={id} onChange={(event) => setId(event.target.value)} inputMode={role === "staff" ? "text" : "numeric"} autoComplete="off" maxLength={role === "staff" ? 20 : 14} placeholder={role === "staff" ? "e.g. EMP-0042" : "e.g. 136728150001"} required />
      </label>
      <label>Birthdate
        <input type="date" value={birthdate} onChange={(event) => setBirthdate(event.target.value)} max={new Date().toISOString().slice(0, 10)} required />
      </label>
      <label className="verify-agree"><input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
        <span>I agree that SSCAI NAVI checks my {role === "staff" ? "employee number" : "LRN"} and birthdate against the school&apos;s list. They are not saved as text, only as a scrambled code (Data Privacy Act, RA 10173).</span>
      </label>
      {error && <p className="verify-error" role="alert">{error}</p>}
      <button type="submit" className="verify-button" disabled={busy}>{busy ? "Checking…" : "Verify"}</button>
    </form>}
  </div>;
}
