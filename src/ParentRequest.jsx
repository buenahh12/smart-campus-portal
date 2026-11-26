import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import Icon from "./Icon";
import { auth, db } from "./firebase";
import { GRADE_LEVELS } from "./cms";
import { useCampusAccess } from "./campusAccess";

// Parent or guardian: asks the school for the full map with a photo of a valid ID, like showing it
// to the guard. Saved to parentRequests/{uid}; the administrator approves or rejects it in
// Content manager > Student access, and the ID photo is deleted as soon as they decide.
// While waiting, the parent uses the visitor map.

// A phone photo -> a JPEG small enough for one database document (about 350 KB at most).
async function shrinkPhoto(file) {
  const image = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file is not a photo.")); };
    img.src = url;
  });
  for (const [side, quality] of [[1400, 0.8], [1200, 0.7], [1000, 0.65], [800, 0.6]]) {
    const scale = Math.min(1, side / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.length <= 360000) return data;
  }
  throw new Error("The photo is too big. Try again a little further from the ID.");
}

export default function ParentRequest({ onContinue }) {
  const access = useCampusAccess();
  const user = auth?.currentUser;
  const [request, setRequest] = useState(undefined);
  const [form, setForm] = useState({ name: user?.displayName || "", contact: "", childName: "", childGrade: "" });
  const [photo, setPhoto] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db || !user) return undefined;
    return onSnapshot(doc(db, "parentRequests", user.uid), (snapshot) => setRequest(snapshot.exists() ? snapshot.data() : null), () => setRequest(null));
  }, [user]);

  if (access.status === "verified") {
    return <div className="verify-access verified" role="status"><span className="verify-icon" aria-hidden="true"><Icon name="shield" size={20} /></span>
      <div><b>Approved: {access.name}</b><small>The school checked your ID. You can see the full map until the end of the school year.</small></div></div>;
  }
  if (request === undefined) return <p className="welcome-lead">Checking…</p>;
  if (request?.status === "pending") {
    return <div className="parent-status">
      <span className="verify-icon waiting" aria-hidden="true"><Icon name="info" size={20} /></span>
      <b>Waiting for the school to check your ID</b>
      <small>The school office will approve it soon. You can already use the visitor map: offices, cashier, clinic, comfort rooms and the way out.</small>
      {onContinue && <button type="button" className="verify-button" onClick={onContinue}>Continue with the visitor map</button>}
    </div>;
  }

  const set = (key) => (event) => setForm((now) => ({ ...now, [key]: event.target.value }));
  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try { setPhoto(await shrinkPhoto(file)); } catch (failure) { setError(failure.message); }
  };
  const submit = async (event) => {
    event.preventDefault();
    const clean = (value, max) => value.trim().replace(/\s+/g, " ").slice(0, max);
    const name = clean(form.name, 80);
    const contact = clean(form.contact, 40);
    const childName = clean(form.childName, 80);
    if (name.length < 2) return setError("Please type your full name.");
    if (!/^[0-9+()\-\s]{7,20}$/.test(contact)) return setError("Please type your contact number, e.g. 0917 123 4567.");
    if (childName.length < 2 || !form.childGrade) return setError("Please type your child's name and grade.");
    if (!photo) return setError("Please add a photo of your valid ID.");
    if (!agree) return setError("Please tick the box to agree first.");
    setError("");
    setBusy(true);
    try {
      await setDoc(doc(db, "parentRequests", user.uid), { name, contact, childName, childGrade: form.childGrade, idPhoto: photo, status: "pending", reason: "", at: serverTimestamp() });
    } catch {
      setError("Couldn't send it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return <form className="verify-form parent-form" onSubmit={submit} noValidate>
    {request?.status === "rejected" && <p className="verify-error" role="alert">The school could not approve your last request{request.reason ? `: ${request.reason}` : "."} You can send a new one.</p>}
    <label>Your full name<input value={form.name} onChange={set("name")} autoComplete="name" maxLength={80} required /></label>
    <label>Contact number<input value={form.contact} onChange={set("contact")} inputMode="tel" autoComplete="tel" placeholder="e.g. 0917 123 4567" maxLength={20} required /></label>
    <label>Your child&apos;s name<input value={form.childName} onChange={set("childName")} maxLength={80} required /></label>
    <label>Your child&apos;s grade<select value={form.childGrade} onChange={set("childGrade")} required>
      <option value="">Choose…</option>
      {GRADE_LEVELS.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
    </select></label>
    <div className="parent-photo">
      {photo ? <img src={photo} alt="Your ID" /> : <span className="parent-photo-empty"><Icon name="scan" size={26} /></span>}
      <div>
        <b>Photo of a valid ID</b>
        <small>Any government ID (driver&apos;s license, UMID, PhilSys, passport…). Make sure your name and face are clear.</small>
        <label className="verify-button parent-photo-button"><Icon name="scan" size={16} /> {photo ? "Take another" : "Take or choose a photo"}<input type="file" accept="image/*" capture="environment" onChange={pick} hidden /></label>
      </div>
    </div>
    <label className="verify-agree"><input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
      <span>I agree that the school office checks my ID. The photo is deleted as soon as they approve or reject it; only the result is kept (Data Privacy Act, RA 10173).</span>
    </label>
    {error && <p className="verify-error" role="alert">{error}</p>}
    <button type="submit" className="verify-button" disabled={busy}>{busy ? "Sending…" : "Send to the school"}</button>
  </form>;
}
