import { useEffect, useState } from 'react';

// Offline app support for the page: registers the service worker (dist/sw.js, built from
// src/serviceWorker.js), tracks whether the phone is online, offers a new version when one has
// been saved in the background, and keeps the browser's "install app" prompt for a button.

let installEvent = null;
let waitingWorker = null;
let savedOffline = false; // the whole site is saved on this device
const supported = import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // show our own Install button instead of the browser's banner
    installEvent = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    notify();
  });
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
}

// Not in development (files change on every save) and only where browsers allow it (HTTPS).
// The service worker saves everything before it activates, so an active one means it is saved.
async function checkSaved() {
  try {
    const keys = await caches.keys();
    savedOffline = keys.some((key) => key.startsWith('ssca-app-'));
    notify();
  } catch { /* caches unavailable */ }
}

export function registerOfflineApp() {
  if (!supported) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      if (registration.active) checkSaved();
      const watch = (worker) => worker?.addEventListener('statechange', () => {
        // A new version finished saving while an older one runs this page.
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorker = worker;
          notify();
        }
        if (worker.state === 'activated') checkSaved();
      });
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        notify();
      }
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      // Look for a new version whenever the app comes back to the front.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {});
      });
    } catch {
      // No offline copy on this browser; the site still works online.
    }
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !waitingWorker) return;
    reloading = true;
    window.location.reload();
  });
}

const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

export function useOfflineApp() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((tick) => tick + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return {
    online: navigator.onLine,
    offlineSupported: supported,
    savedOffline,
    installed: isInstalled(),
    updateReady: Boolean(waitingWorker),
    applyUpdate: () => waitingWorker?.postMessage('skip-waiting'),
    // Android/desktop Chrome: a real install button. iPhone: Safari has no prompt, so explain.
    canInstall: !isInstalled() && Boolean(installEvent),
    iosInstallTip: !isInstalled() && isIos(),
    install: async () => {
      if (!installEvent) return;
      installEvent.prompt();
      await installEvent.userChoice.catch(() => {});
      installEvent = null;
      notify();
    },
  };
}
