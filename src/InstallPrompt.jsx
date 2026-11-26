import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useOfflineApp } from "./offline";

// "Add SSCAI NAVI to your phone": our own pop-up a few seconds after someone enters (the browser's
// own bar is turned off in offline.js). Android and computers: one tap opens the browser's Install
// window. iPhone: Safari has no install button for websites, so it shows the two steps.
// "Not now" hides it for 7 days; it never shows once the app is on the home screen.
const LATER_KEY = "sscai-install-later";
const LATER_MS = 7 * 24 * 60 * 60 * 1000;
const inAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|MicroMessenger|TikTok|; wv\)/i.test(navigator.userAgent);
const snoozed = () => {
  try { return Date.now() - Number(localStorage.getItem(LATER_KEY) || 0) < LATER_MS; } catch { return false; }
};

export default function InstallPrompt({ ready }) {
  const app = useOfflineApp();
  const [shown, setShown] = useState(false);
  const [closed, setClosed] = useState(false);
  const can = !app.installed && !inAppBrowser() && (app.canInstall || app.iosInstallTip);

  useEffect(() => {
    if (!ready || !can || closed || snoozed()) return undefined;
    const timer = setTimeout(() => setShown(true), 5000);
    return () => clearTimeout(timer);
  }, [ready, can, closed]);

  if (!shown || closed || !can) return null;
  const later = () => {
    try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch { /* fine */ }
    setClosed(true);
  };
  const add = async () => {
    await app.install();
    setClosed(true);
  };
  return <aside className="install-pop" role="dialog" aria-label="Add SSCAI NAVI to your phone">
    <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width="52" height="52" />
    <div className="install-pop-text">
      <b>Add SSCAI NAVI to your phone</b>
      {app.canInstall
        ? <small>Opens like an app from your home screen, and works even without Wi-Fi.</small>
        : <small>Tap <b>Share</b> <Icon name="share" size={14} /> at the bottom of Safari, then <b>Add to Home Screen</b>.</small>}
    </div>
    <div className="install-pop-actions">
      {app.canInstall && <button type="button" className="install-pop-add" onClick={add}><Icon name="addHome" size={16} /> Add</button>}
      <button type="button" className="install-pop-later" onClick={later}>{app.canInstall ? "Not now" : "OK"}</button>
    </div>
  </aside>;
}
