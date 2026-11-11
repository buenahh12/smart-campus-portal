import { initializeApp } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import { doc, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, serverTimestamp, setDoc } from 'firebase/firestore';
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
  sendEmailVerification,
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
// App Check: only this website may use the database, so scripts cannot flood the visit
// counters or sign-in records. Turned on by VITE_APPCHECK_SITE_KEY (the reCAPTCHA / Fraud Defense site key);
// then enforce App Check for Cloud Firestore in the Firebase console.
const APP_CHECK_SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY;
const appCheck = app && APP_CHECK_SITE_KEY
  ? initializeAppCheck(app, {
    // Fraud Defense (reCAPTCHA Enterprise) by default; VITE_APPCHECK_PROVIDER=classic for the old v3.
    provider: import.meta.env.VITE_APPCHECK_PROVIDER === 'classic' ? new ReCaptchaV3Provider(APP_CHECK_SITE_KEY) : new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })
  : null;
// This site's App Check proof, for our own server functions to pass on to Firestore ('' if off).
export const appCheckToken = async () => {
  if (!appCheck) return '';
  try {
    return (await getToken(appCheck)).token;
  } catch {
    return '';
  }
};
// Offline copy on the phone: announcements, closures and room names last seen online still show
// without internet, and visit counts made offline are sent when the connection is back. Where the
// browser cannot store it (some private modes), Firestore keeps working online only.
function openDatabase() {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return getFirestore(app);
  }
}
export const db = app ? openDatabase() : null;
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
// Visitors (no account): a Firebase anonymous sign-in, so the visit shows in the admin's
// Sign-ins list. Needs "Anonymous" turned on in Firebase Console > Authentication > Sign-in method.
export const loginAsVisitor = () => {
  if (!auth) {
    return Promise.reject(new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.'));
  }
  return signInAnonymously(auth);
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
export const createCampusAccount = async ({ email, password, name, role, gradeLevel = '', section = '', emailUpdates = false }) => {
  if (!hasFirebaseConfig) {
    throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.');
  }
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  try {
    await setDoc(doc(db, 'users', credential.user.uid), {
      name,
      role,
      ...(role === 'Student' ? { gradeLevel, section: section.trim().slice(0, 40) } : {}),
      savedPlaces: [],
      prefs: { speakAnswers: false, allClosureAlerts: true },
      updatedAt: serverTimestamp(),
    });
  } catch (profileError) {
    // The account itself was created; My Campus creates the profile on the first save.
    console.warn('Campus profile could not be saved yet:', profileError);
  }
  // Proves the address is theirs. Email updates only start for a confirmed address
  // (firestore.rules), so a wish for them is kept until My Campus sees it confirmed.
  try {
    await sendEmailVerification(credential.user);
  } catch (verifyError) {
    console.warn('The confirmation email could not be sent yet:', verifyError);
  }
  if (emailUpdates) wishForEmailUpdates(credential.user.uid, true);
  return credential.user;
};
export const sendConfirmationEmail = (user) => sendEmailVerification(user);
// Reloads the account and refreshes its token, so a just-confirmed email counts in the rules.
export const refreshEmailConfirmed = async (user) => {
  await user.reload();
  if (user.emailVerified) await user.getIdToken(true);
  return user.emailVerified;
};
// Sign-up's "email me updates" choice, kept on this device until the email is confirmed.
export function wishForEmailUpdates(uid, wanted) {
  try {
    if (wanted) localStorage.setItem(`campus-email-updates:${uid}`, '1');
    else localStorage.removeItem(`campus-email-updates:${uid}`);
  } catch { /* storage unavailable: they can turn updates on in My Campus */ }
}
export function wantsEmailUpdates(uid) {
  try {
    return localStorage.getItem(`campus-email-updates:${uid}`) === '1';
  } catch {
    return false;
  }
}
export const logoutUser = () => signOut(auth);