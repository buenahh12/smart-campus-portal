// Phone notifications (Web Push): "Walang pasok bukas" shows on the lock screen like a
// Messenger message, even when the site is closed. No sign-in needed.
//
// The phone gives us a private push address; we keep it in Firestore (pushSubscriptions), where
// only the administrator can read it. When the admin publishes, api/push-announcement.mjs sends
// to every address. Android (Chrome, Samsung Internet) and computers work in the browser;
// iPhone (iOS 16.4+) only once SSCAI NAVI is added to the Home Screen.
import { useEffect, useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Public half of the site's push key pair (safe to publish; the private half is in Vercel).
const VAPID_PUBLIC_KEY = 'BPuUqIWf1cpHtFn4UR3DEEssXQy_EaGZx6zIvEbrr0Gi8HtTb8sglDYB76xL-CXjBtDpzq-L6BG0WPTaAmvOGkA';
const ID_KEY = 'sscai-push-id';

const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

// "on" | "off" | "blocked" (said no in the browser) | "install-first" (iPhone, not on Home Screen) | "unsupported"
export function pushStatus() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (!('PushManager' in window) || !('Notification' in window)) return isIos() && !isInstalled() ? 'install-first' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  let id = '';
  try { id = localStorage.getItem(ID_KEY) || ''; } catch { /* storage unavailable */ }
  return Notification.permission === 'granted' && id ? 'on' : 'off';
}

const toKeyBytes = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};
const hexHash = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export async function turnOnPush() {
  if (!db) throw new Error('Notifications need the published site.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'blocked' : 'dismissed');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKeyBytes(VAPID_PUBLIC_KEY) });
  const { endpoint, keys } = subscription.toJSON();
  const id = await hexHash(endpoint);
  await setDoc(doc(db, 'pushSubscriptions', id), { endpoint, p256dh: keys.p256dh, auth: keys.auth, updatedAt: serverTimestamp() });
  try { localStorage.setItem(ID_KEY, id); } catch { /* storage unavailable */ }
  notifyChange();
}

export async function turnOffPush() {
  let id = '';
  try { id = localStorage.getItem(ID_KEY) || ''; } catch { /* storage unavailable */ }
  const registration = await navigator.serviceWorker.ready;
  await (await registration.pushManager.getSubscription())?.unsubscribe();
  if (id && db) await deleteDoc(doc(db, 'pushSubscriptions', id)).catch(() => {});
  try { localStorage.removeItem(ID_KEY); } catch { /* storage unavailable */ }
  notifyChange();
}

const listeners = new Set();
const notifyChange = () => listeners.forEach((listener) => listener());

// { status, busy, problem, toggle }
export function usePush() {
  const [status, setStatus] = useState(pushStatus);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const listener = () => setStatus(pushStatus());
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  const toggle = async () => {
    setBusy(true);
    setProblem('');
    try {
      if (status === 'on') await turnOffPush();
      else await turnOnPush();
    } catch (error) {
      setProblem(error.message === 'blocked'
        ? 'Notifications are blocked for this site. Allow them in your browser settings (tap the lock icon beside the address), then try again.'
        : error.message === 'dismissed' ? 'Tap Allow when your phone asks, to get notifications.'
          // The database refused the phone's address: the school hasn't switched this on yet.
          : error.code === 'permission-denied' ? 'Phone notifications aren’t switched on by the school yet. Please try again later.'
            : !navigator.onLine ? 'You’re offline. Connect to the internet and try again.'
              : 'Notifications could not be turned on on this phone. Please try again later.');
    } finally {
      setStatus(pushStatus());
      setBusy(false);
    }
  };
  return { status, busy, problem, toggle };
}
