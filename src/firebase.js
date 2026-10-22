import { initializeApp } from 'firebase/app';
import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  getIdTokenResult,
  updateProfile,
  signInAnonymously, 
  signOut 
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();
// Always show Google's account chooser instead of silently using the last account,
// so people on shared or school computers can pick (or add) the right Gmail.
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Browsers built into apps (Messenger, Facebook, Instagram, TikTok, LINE, WeChat, Android
// WebViews). Google blocks sign-in inside them and they wipe the storage Firebase needs,
// so the sign-in screen asks people to open the page in Chrome or Safari instead.
export const inAppBrowserName = (agent = navigator.userAgent) => {
  if (/FBAN|FBAV|FB_IAB|FBIOS|Messenger|MESSENGER/.test(agent)) return /Messenger|MESSENGER|Orca/.test(agent) ? 'Messenger' : 'Facebook';
  if (/Instagram/.test(agent)) return 'Instagram';
  if (/musical_ly|TikTok|BytedanceWebview/i.test(agent)) return 'TikTok';
  if (/\bLine\//.test(agent)) return 'LINE';
  if (/MicroMessenger/.test(agent)) return 'WeChat';
  if (/Android.*; wv\)/.test(agent)) return 'this app';
  return '';
};

export const loginWithGoogle = () => {
  if (!hasFirebaseConfig) {
    return Promise.reject(new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.'));
  }
  return signInWithPopup(auth, googleProvider).catch((error) => {
    // Only fall back to a full-page redirect when the browser blocked the popup outright.
    if (error.code === 'auth/popup-blocked') return signInWithRedirect(auth, googleProvider);
    throw error;
  });
};
export const finishGoogleRedirect = () => hasFirebaseConfig ? getRedirectResult(auth) : Promise.resolve(null);
export const loginWithEmail = ({ email, password }) => {
  if (!auth) {
    return Promise.reject(new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.'));
  }
  return signInWithEmailAndPassword(auth, email.trim(), password);
};
export const requestPasswordReset = (email) => {
  if (!auth) {
    return Promise.reject(new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.'));
  }
  return sendPasswordResetEmail(auth, email.trim());
};
// There is exactly one administrator: the configured admin account (admin1).
// firestore.rules enforces the same single account on the server.
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase();
export const isAdminToken = (token) => Boolean(ADMIN_EMAIL) && String(token.claims.email || '').toLowerCase() === ADMIN_EMAIL;

export const loginAsAdmin = async ({ email, password }) => {
  if (!auth) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await getIdTokenResult(credential.user, true);
  if (!isAdminToken(token)) {
    await signOut(auth);
    throw new Error('This Firebase account is not authorized for staff administration.');
  }
  return credential.user;
};
export const createCampusAccount = async ({ email, password, name, role, emailUpdates = false }) => {
  if (!hasFirebaseConfig) {
    throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.');
  }
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  try {
    await setDoc(doc(db, 'users', credential.user.uid), {
      name,
      role,
      savedPlaces: [],
      prefs: { speakAnswers: false, allClosureAlerts: true },
      updatedAt: serverTimestamp(),
    });
  } catch (profileError) {
    // The account itself was created; My Campus creates the profile on the first save.
    console.warn('Campus profile could not be saved yet:', profileError);
  }
  if (emailUpdates) {
    try {
      await setDoc(doc(db, 'subscribers', credential.user.uid), { email: credential.user.email, name, updatedAt: serverTimestamp() });
    } catch (subscribeError) {
      console.warn('Email updates could not be turned on yet:', subscribeError);
    }
  }
  return credential.user;
};
export const loginAsVisitor = () => signInAnonymously(auth);
export const logoutUser = () => signOut(auth);