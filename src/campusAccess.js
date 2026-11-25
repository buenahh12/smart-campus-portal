// Students and staff access: who may see the full campus map.
//
// Everyone starts as a visitor (offices, clinic, comfort rooms, stairs and exits only). A signed-in
// student verifies once with their LRN and birthdate (staff: employee number and birthdate). The
// check is automatic, against the school's list that the administrator uploads each school year,
// so nobody waits for an approval:
//
//   studentList/{key}   one row per student or staff member; key = SHA-256 of the ID and birthdate,
//                       so the list holds no readable LRNs or birthdates and can't be listed by users
//   lrnClaims/{key}     which account a row belongs to: one LRN = one account
//   campusAccess/{uid}  "this account is verified"; firestore.rules check it, and that its row is
//                       still on this year's list, before sending the campusPlan/rooms document
//   verifyTries/{uid}   wrong tries: 5, then wait an hour
//
// firestore.rules enforce all of it on the server; this file is only the friendly side.
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { getIdTokenResult, onAuthStateChanged } from "firebase/auth";
import { useSyncExternalStore } from "react";
import { auth, db, isAdminToken } from "./firebase";
import { applyPrivateDetails } from "./floorPlans";

export const MAX_TRIES = 5;
const LOCK_MS = 60 * 60 * 1000;

// "136728150001" for an LRN (12 digits), "EMP-0042" style for an employee number.
export const cleanId = (value, role) => (role === "staff"
  ? String(value || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20)
  : String(value || "").replace(/\D/g, "").slice(0, 12));
export const validId = (value, role) => (role === "staff" ? /^[A-Z0-9-]{3,20}$/.test(value) : /^\d{12}$/.test(value));

// Birthdates as YYYY-MM-DD; the list upload also accepts MM/DD/YYYY.
export function cleanBirthdate(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return "";
}

export async function accessKey(id, birthdate) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sscai-access-v1|${id}|${birthdate}`));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

// ---------- Who is looking (shared by the whole app) ----------
// status: "loading" | "visitor" | "verified" | "admin"
let state = { status: "loading", name: "", role: "", schoolYear: "", rooms: 0 };
const listeners = new Set();
const set = (next) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getCampusAccess = () => state;
export const onCampusAccess = subscribe; // for code outside React
export const useCampusAccess = () => {
  startCampusAccess();
  return useSyncExternalStore(subscribe, getCampusAccess);
};
export const hasFullMap = (value = state) => value.status === "verified" || value.status === "admin";

let stopAccess = () => {};
let stopPlan = () => {};
let started = false;

function watchPlan(status) {
  stopPlan();
  stopPlan = onSnapshot(doc(db, "campusPlan", "rooms"), (snapshot) => {
    applyPrivateDetails(snapshot.exists() ? snapshot.data() : null);
    set({ status, rooms: snapshot.exists() ? Object.keys(snapshot.data().rooms || {}).length : 0 });
  }, () => {
    // Not allowed (taken off this year's list) or offline with nothing saved: the visitor map.
    applyPrivateDetails(null);
    set({ status: status === "admin" ? "admin" : "visitor", rooms: 0 });
  });
}

function becomeVisitor() {
  stopPlan();
  stopPlan = () => {};
  applyPrivateDetails(null);
  set({ status: "visitor", name: "", role: "", schoolYear: "", rooms: 0 });
}

export function startCampusAccess() {
  if (started) return;
  started = true;
  if (!auth || !db) {
    set({ status: "visitor" });
    return;
  }
  onAuthStateChanged(auth, async (user) => {
    stopAccess();
    stopAccess = () => {};
    if (!user || user.isAnonymous) { becomeVisitor(); return; }
    try {
      if (isAdminToken(await getIdTokenResult(user))) {
        set({ name: "Administrator", role: "admin", schoolYear: "" });
        watchPlan("admin");
        return;
      }
    } catch { /* offline: carry on as a normal account */ }
    stopAccess = onSnapshot(doc(db, "campusAccess", user.uid), (snapshot) => {
      if (!snapshot.exists()) { becomeVisitor(); return; }
      const data = snapshot.data();
      set({ name: data.name || "", role: data.role || "student", schoolYear: data.schoolYear || "" });
      watchPlan("verified");
    }, becomeVisitor);
  });
}

// ---------- Verify (student or staff) ----------
const friendly = (code) => ({
  "signed-out": "Sign in with your own account first (not as a guest), then verify.",
  locked: "Too many wrong tries. Please wait an hour, or ask the school office to check your details.",
  "not-found": "We couldn't find that LRN and birthdate on this school year's list. Check both, or ask the school office.",
  taken: "This LRN is already linked to another account. Ask the school office to reset it.",
}[code] || "Couldn't verify right now. Check your connection and try again.");

export async function verifyCampusAccess({ id, birthdate, role }) {
  const user = auth?.currentUser;
  if (!user || user.isAnonymous) throw new Error(friendly("signed-out"));
  const cleanedId = cleanId(id, role);
  const day = cleanBirthdate(birthdate);
  if (!validId(cleanedId, role)) throw new Error(role === "staff" ? "Enter your employee number." : "Your LRN has 12 digits. Check your report card or school ID.");
  if (!day) throw new Error("Enter your birthdate.");
  const key = await accessKey(cleanedId, day);

  // Count the try first (the rules only let a counted try read the list).
  const triesRef = doc(db, "verifyTries", user.uid);
  const tries = await getDoc(triesRef).catch(() => null);
  const before = tries?.exists() ? tries.data() : null;
  const lastAt = before?.at?.toMillis?.() || 0;
  let count = (before?.count || 0) + 1;
  if (before && before.count >= MAX_TRIES) {
    if (Date.now() - lastAt < LOCK_MS) throw new Error(friendly("locked"));
    count = 1;
  }
  await setDoc(triesRef, { count, at: serverTimestamp() });

  let row;
  try {
    row = await getDoc(doc(db, "studentList", key));
  } catch {
    throw new Error(friendly("locked"));
  }
  if (!row.exists()) {
    const left = MAX_TRIES - count;
    throw new Error(`${friendly("not-found")}${left > 0 ? ` (${left} ${left === 1 ? "try" : "tries"} left)` : ""}`);
  }
  const entry = row.data();
  if ((entry.role || "student") !== role) throw new Error(role === "staff" ? "That number is listed as a student. Choose Student and enter the LRN." : "That number is listed as staff. Choose Teacher / staff.");

  const claimRef = doc(db, "lrnClaims", key);
  const mine = await getDoc(claimRef).then((snapshot) => snapshot.exists() && snapshot.data().uid === user.uid).catch(() => false);
  const batch = writeBatch(db);
  if (!mine) batch.set(claimRef, { uid: user.uid, at: serverTimestamp() });
  batch.set(doc(db, "campusAccess", user.uid), { key, name: entry.name, role: entry.role, schoolYear: entry.schoolYear, at: serverTimestamp() });
  try {
    await batch.commit();
  } catch {
    throw new Error(friendly(mine ? "" : "taken"));
  }
  return entry;
}

// ---------- Administrator ----------
export const studentListRef = () => collection(db, "studentList");
export const claimsRef = () => collection(db, "lrnClaims");
