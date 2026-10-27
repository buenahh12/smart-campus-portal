import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth';
import { auth, db, isAdminToken } from './firebase';

// Firestore collections that administrators manage from the Content Manager.
// Security rules in firestore.rules enforce who can read and write each one.
export const CMS_COLLECTIONS = {
  rooms: 'rooms',
  offices: 'offices',
  announcements: 'announcements',
  closures: 'pathwayClosures',
  mapRooms: 'mapRooms',
  // Floors added from blueprints (drafts are admin-only) and their blueprint images (admin-only).
  planFloors: 'planFloors',
  planBlueprints: 'planBlueprints',
};

const notConfigured = () => new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.');

const byNewest = (first, second) => (second.updatedAt?.toMillis?.() || 0) - (first.updatedAt?.toMillis?.() || 0);

// Subscribes to a collection and calls onData with a sorted array whenever it changes.
// publicOnly limits announcements to published ones, which is all a non-admin may read.
export function watchCollection(name, onData, onError = () => {}, { publicOnly = false } = {}) {
  if (!db) {
    onError(notConfigured());
    return () => {};
  }
  const source = publicOnly && (name === CMS_COLLECTIONS.announcements || name === CMS_COLLECTIONS.planFloors)
    ? query(collection(db, name), where('published', '==', true))
    : collection(db, name);
  return onSnapshot(
    source,
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort(byNewest)),
    onError,
  );
}

export async function saveItem(name, id, data) {
  if (!db) throw notConfigured();
  const payload = { ...data, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || auth.currentUser?.uid || '' };
  if (id) {
    await updateDoc(doc(db, name, id), payload);
    return id;
  }
  const created = await addDoc(collection(db, name), payload);
  return created.id;
}

// Creates or fully replaces the document with a known id (used for floor plan rooms).
export function setItem(name, id, data) {
  if (!db) return Promise.reject(notConfigured());
  return setDoc(doc(db, name, id), { ...data, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || auth.currentUser?.uid || '' });
}

// One document, or null when it does not exist.
export async function readItem(name, id) {
  if (!db) throw notConfigured();
  const snapshot = await getDoc(doc(db, name, id));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export const deleteItem = (name, id) => {
  if (!db) return Promise.reject(notConfigured());
  return deleteDoc(doc(db, name, id));
};

// Reports the signed-in user and their role. The role comes from the "admin"
// custom claim inside the Firebase ID token (a signed JWT), so it cannot be
// changed from the browser; only scripts/set-admin.mjs can grant it.
export function watchSession(onChange) {
  if (!auth) {
    onChange({ user: null, role: 'guest' });
    return () => {};
  }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onChange({ user: null, role: 'guest' });
      return;
    }
    if (user.isAnonymous) {
      onChange({ user, role: 'visitor' });
      return;
    }
    try {
      const token = await getIdTokenResult(user);
      onChange({ user, role: isAdminToken(token) ? 'admin' : 'user' });
    } catch {
      onChange({ user, role: 'user' });
    }
  });
}

// Personal profile for signed-in users, stored at users/{uid}. Only the owner can
// read or change it (see firestore.rules), so it follows them to any device.
export const USER_ROLES = ['Student', 'Faculty / Staff', 'Parent / Guardian', 'Visitor'];
export const MAX_SAVED_PLACES = 30;

export function watchProfile(uid, onData, onError = () => {}) {
  if (!db) {
    onError(notConfigured());
    return () => {};
  }
  return onSnapshot(doc(db, 'users', uid), (snapshot) => onData(snapshot.exists() ? snapshot.data() : null), onError);
}

export function saveProfile(uid, changes) {
  if (!db) return Promise.reject(notConfigured());
  return setDoc(doc(db, 'users', uid), { ...changes, updatedAt: serverTimestamp() }, { merge: true });
}

// Rooms and offices share one list; this key tells them apart in savedPlaces.
export const placeKey = (place) => `${place.kind === 'Office' ? CMS_COLLECTIONS.offices : CMS_COLLECTIONS.rooms}/${place.id}`;

export const todayKey = () => new Date().toLocaleDateString('en-CA');

// A closure is in effect when it is switched on and today falls inside its dates.
export const isClosureActive = (item, today = todayKey()) =>
  item.active === true && (!item.startDate || item.startDate <= today) && (!item.endDate || item.endDate >= today);

// ---------- Site visit statistics ----------
// One document per day at stats/YYYY-MM-DD holding counters only (no names or emails).
// Each browser counts once per day; a signed-in person also counts once per day under their role.
export const VISIT_GROUPS = [
  { key: 'guests', label: 'Guests', hint: 'Not signed in' },
  { key: 'students', label: 'Students' },
  { key: 'faculty', label: 'Faculty & staff' },
  { key: 'parents', label: 'Parents & guardians' },
  { key: 'visitorAccounts', label: 'Visitor accounts' },
];
const ROLE_TO_GROUP = { Student: 'students', 'Faculty / Staff': 'faculty', 'Parent / Guardian': 'parents', Visitor: 'visitorAccounts' };

const firstTimeToday = (key) => {
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
};

export async function recordVisit(user, role) {
  if (!db || role === 'admin') return;
  const day = todayKey();
  const changes = {};
  if (firstTimeToday(`campus-visit:${day}`)) {
    changes.total = increment(1);
    if (!user || user.isAnonymous) changes.guests = increment(1);
  }
  if (user && !user.isAnonymous && firstTimeToday(`campus-visit:${day}:${user.uid}`)) {
    let profileRole = 'Student';
    try {
      profileRole = (await getDoc(doc(db, 'users', user.uid))).data()?.role || profileRole;
    } catch { /* profile unreadable: count as a student, the default role */ }
    changes[ROLE_TO_GROUP[profileRole] || 'students'] = increment(1);
  }
  if (!Object.keys(changes).length) return;
  try {
    await setDoc(doc(db, 'stats', day), changes, { merge: true });
  } catch (error) {
    console.warn('Visit could not be counted:', error);
  }
}

// Daily stats between two YYYY-MM-DD keys (inclusive), kept live. Admin only (see firestore.rules).
export function watchStats(fromDay, toDay, onData, onError = () => {}) {
  if (!db) {
    onError(notConfigured());
    return () => {};
  }
  const range = query(collection(db, 'stats'), where(documentId(), '>=', fromDay), where(documentId(), '<=', toDay));
  return onSnapshot(range, (snapshot) => onData(Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()]))), onError);
}

// ---------- Sign-in records ----------
// signIns/{id} = one row each time someone signs in (or opens the portal while signed in),
// once per browser session: who (email from their verified token), how (Google, email and
// password, or visitor), their role, and the device, system, and browser they used.
// Only the administrator can read them (see firestore.rules). The admin is never recorded.
export const SIGN_IN_METHODS = { 'google.com': 'Google', password: 'Email & password', anonymous: 'Visitor (no account)' };

export function describeDevice(agent = navigator.userAgent) {
  const touchMac = /Macintosh/.test(agent) && navigator.maxTouchPoints > 1; // iPadOS reports itself as a Mac
  const tablet = /iPad|Tablet/i.test(agent) || touchMac || (/Android/i.test(agent) && !/Mobile/i.test(agent));
  const phone = !tablet && /Mobi|iPhone|iPod|Android/i.test(agent);
  const device = tablet ? 'Tablet' : phone ? 'Phone' : 'Computer';
  const os = /Android/i.test(agent) ? 'Android'
    : /iPhone|iPad|iPod/.test(agent) || touchMac ? 'iOS / iPadOS'
      : /Windows/.test(agent) ? 'Windows'
        : /CrOS/.test(agent) ? 'ChromeOS'
          : /Mac OS X|Macintosh/.test(agent) ? 'macOS'
            : /Linux/.test(agent) ? 'Linux' : 'Other';
  const browser = /SamsungBrowser/.test(agent) ? 'Samsung Internet'
    : /Edg\//.test(agent) ? 'Edge'
      : /OPR\/|Opera/.test(agent) ? 'Opera'
        : /FBAN|FBAV|FB_IAB/.test(agent) ? 'Facebook app'
          : /Firefox|FxiOS/.test(agent) ? 'Firefox'
            : /Chrome|CriOS/.test(agent) ? 'Chrome'
              : /Safari/.test(agent) ? 'Safari' : 'Other';
  return { device, os, browser, screen: `${window.screen.width}×${window.screen.height}` };
}

const firstTimeThisSession = (key) => {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
};

export async function recordSignIn(user, role) {
  if (!db || !user || role === 'admin' || !firstTimeThisSession(`campus-signin:${user.uid}`)) return;
  let profile = {};
  if (!user.isAnonymous) {
    try {
      profile = (await getDoc(doc(db, 'users', user.uid))).data() || {};
    } catch { /* profile unreadable: leave role blank */ }
  }
  try {
    await addDoc(collection(db, 'signIns'), {
      uid: user.uid,
      email: user.email || '',
      name: (profile.name || user.displayName || '').slice(0, 80),
      role: user.isAnonymous ? 'Visitor' : profile.role || '',
      method: user.isAnonymous ? 'anonymous' : user.providerData[0]?.providerId || 'password',
      ...describeDevice(),
      at: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Sign-in could not be recorded:', error);
  }
}

// Sign-in records between two Date objects, newest first, kept live. Admin only.
export function watchSignIns(from, to, onData, onError = () => {}) {
  if (!db) {
    onError(notConfigured());
    return () => {};
  }
  const range = query(collection(db, 'signIns'), where('at', '>=', from), where('at', '<', to), orderBy('at', 'desc'), limit(2000));
  return onSnapshot(range, (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
}

// ---------- Email updates ----------
// subscribers/{uid} = { email, name }. People opt in themselves; only the admin can read the list.
export function watchSubscription(uid, onChange) {
  if (!db) return () => {};
  return onSnapshot(doc(db, 'subscribers', uid), (snapshot) => onChange(snapshot.exists()), () => onChange(false));
}

export function setEmailUpdates(user, name, enabled) {
  if (!db) return Promise.reject(notConfigured());
  const ref = doc(db, 'subscribers', user.uid);
  return enabled ? setDoc(ref, { email: user.email, name: name || '', updatedAt: serverTimestamp() }) : deleteDoc(ref);
}
