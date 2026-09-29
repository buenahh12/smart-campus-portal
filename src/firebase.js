import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
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
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => {
  if (!hasFirebaseConfig) {
    return Promise.reject(new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.'));
  }
  return signInWithPopup(auth, googleProvider).catch((error) => {
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
      return signInWithRedirect(auth, googleProvider);
    }
    throw error;
  });
};
export const finishGoogleRedirect = () => hasFirebaseConfig ? getRedirectResult(auth) : Promise.resolve(null);
export const loginAsAdmin = async ({ email, password }) => {
  if (!auth) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await getIdTokenResult(credential.user, true);
  if (token.claims.admin !== true) {
    await signOut(auth);
    throw new Error('This Firebase account is not authorized for staff administration.');
  }
  return credential.user;
};
export const createCampusAccount = async ({ email, password, name, year, section, contact }) => {
  if (!hasFirebaseConfig) {
    throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your .env file.');
  }
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  localStorage.setItem(`campus-profile:${credential.user.uid}`, JSON.stringify({ name, year, section, contact }));
  return credential.user;
};
export const loginAsVisitor = () => signInAnonymously(auth);
export const logoutUser = () => signOut(auth);