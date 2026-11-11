import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  createCampusAccount,
  finishGoogleRedirect,
  inAppBrowserName,
  loginAsAdmin,
  loginWithEmail,
  loginWithGoogle,
  logoutUser,
  requestPasswordReset,
} from "./firebase";
import Icon from "./Icon";
import ArPreview from "./ArPreview";
import CampusUpdates, { usePublicCollection, visibleAnnouncements } from "./CampusUpdates";
import { AnnouncementArt } from "./EventArt";
import { CMS_COLLECTIONS, GRADE_LEVELS, MAX_SECTION_LENGTH, USER_ROLES, isClosureActive, recordSignIn, recordVisit, todayKey, watchSession } from "./cms";
import { usePlanVersion } from "./usePlan";
import { useOfflineApp } from "./offline";
import { BUILDING_NAME, FLOORS, PLACES, blockedKeyOf, findPlaceKey, floorShort, placeByKey, placeTitle, sectionsOf, floorLabel as planFloorLabel } from "./floorPlans";
import { searchPlace } from "./placeSearch";
import { PolicyDialog, PrivacyNotice, privacyNoticeSeen } from "./Policies";
import { FeedbackDialog, openFeedback } from "./Feedback";

// Where the person said they are, last time they used the floor plan (to pick the nearest CR).
const savedStart = () => {
  try {
    return localStorage.getItem("campus-map-start") || "";
  } catch {
    return "";
  }
};

// three.js is large, so the 3D dollhouse loads after the page; the flat mini plan shows meanwhile,
// and stays if the 3D part cannot be downloaded (connection dropped).
const Dollhouse3D = lazy(() => import("./Dollhouse3D").catch(() => ({ default: ({ fallback }) => fallback })));

// Sign-in and account changes need Firebase online; everything for finding rooms does not.
const NEEDS_INTERNET = "This needs an internet connection. Floor plans, directions and AR live view still work offline.";
const isOfflineError = (error) => error?.code === "auth/network-request-failed" || !navigator.onLine;

// Offline notice, and the button for a new version saved in the background.
function AppStatus({ online, updateReady, onUpdate }) {
  if (updateReady) {
    return <div className="app-status" role="status"><span>A new version of SSCAI NAVI is ready.</span><button type="button" onClick={onUpdate}>Update</button></div>;
  }
  if (!online) {
    return <div className="app-status app-status-offline" role="status"><span><b>You&apos;re offline.</b> Floor plans, directions and AR live view still work. New announcements show when you&apos;re back online.</span></div>;
  }
  return null;
}

// "Download the app?" offer, a few seconds after the page opens. Android Chrome installs for real;
// iPhone Safari has no install button, so it shows the two steps; Messenger and other in-app
// browsers cannot install, so it hands the page to Chrome first. "Not now" waits a week.
const INSTALL_SNOOZE_KEY = "campus-install-snoozed-until";
const installSnoozed = () => {
  try {
    return Number(localStorage.getItem(INSTALL_SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
};

function InstallPrompt({ offlineApp, hidden }) {
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(installSnoozed);
  const inApp = /Android/i.test(navigator.userAgent) ? inAppBrowserName() : "";
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  const kind = offlineApp.canInstall ? "android" : offlineApp.iosInstallTip ? "ios" : inApp ? "inapp" : "";
  if (!ready || closed || hidden || !kind) return null;
  const notNow = () => {
    try { localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000)); } catch { /* storage unavailable */ }
    setClosed(true);
  };
  // Close the card at once; the browser's own install window takes over from here.
  const download = () => {
    setClosed(true);
    offlineApp.install();
  };
  return <aside className="install-prompt" role="dialog" aria-labelledby="install-prompt-title">
    <img src={asset("icon-192.png")} alt="" width="56" height="56" />
    <div>
      <h2 id="install-prompt-title">Download the SSCAI NAVI app?</h2>
      <p>Floor plans, directions and AR live view work at school even without Wi-Fi. About 1 MB.</p>
      {kind === "ios" && <ol><li>Tap <b>Share</b> <span aria-hidden="true">⬆</span> at the bottom of Safari.</li><li>Tap <b>Add to Home Screen</b>.</li></ol>}
      {kind === "inapp" && <p className="install-prompt-note">{inApp} can&apos;t install apps. Open this page in Chrome, then tap Download.</p>}
      <div className="install-prompt-actions">
        {kind === "android" && <button type="button" className="primary" onClick={download}>Download app</button>}
        {kind === "inapp" && <a className="primary" href={chromeIntentFor(window.location.href.split("#")[0])}>Open in Chrome</a>}
        <button type="button" onClick={notNow}>{kind === "ios" ? "Got it" : "Not now"}</button>
      </div>
    </div>
  </aside>;
}

// Fourth panel of "Three ways to find your way": offline mode, always visible. Says whether the
// site is saved on this device, what works without internet, and how to get the app here.
function OfflinePanel({ offlineApp }) {
  const inApp = /Android/i.test(navigator.userAgent) ? inAppBrowserName() : "";
  const status = offlineApp.savedOffline
    ? { tone: "ready", text: "Ready offline on this device" }
    : offlineApp.offlineSupported
      ? { tone: "saving", text: offlineApp.online ? "Saving for offline use…" : "Open once with internet to save it" }
      : { tone: "off", text: "Saves itself on the published site" };
  let action;
  if (offlineApp.installed) action = <p className="ss-offline-done"><Icon name="download" size={16} /> You&apos;re using the app. It opens from your home screen, even offline.</p>;
  else if (offlineApp.canInstall) action = <div className="dollhouse-actions"><button type="button" onClick={offlineApp.install}><Icon name="download" size={16} /> Download the app</button></div>;
  else if (offlineApp.iosInstallTip) action = <ol className="ss-offline-steps"><li>Tap <b>Share</b> <span aria-hidden="true">⬆</span> at the bottom of Safari.</li><li>Tap <b>Add to Home Screen</b>.</li></ol>;
  else if (inApp) action = <div className="dollhouse-actions"><a href={chromeIntentFor(window.location.href.split("#")[0])}>Open in Chrome to download</a></div>;
  else action = <p className="ss-offline-hint">To add an icon, open this page in Chrome or Edge and choose <b>Install</b> from the menu. Even without it, this browser keeps the offline copy.</p>;
  return <article className="ss-way ss-way-offline" id="offline">
    <div className="ss-offline-intro">
      <span className="ss-way-icon" aria-hidden="true"><Icon name="download" size={26} /></span>
      <h3>Offline mode <span className={`ss-offline-status is-${status.tone}`}>{status.text}</span></h3>
      <p>No Wi-Fi at school? Open SSCAI NAVI once with internet and it saves itself on your phone. After that you can find your way with no Wi-Fi or data.</p>
      {action}
    </div>
    <div className="ss-offline-lists">
      <div>
        <h4>Works offline</h4>
        <ul><li>2D floor plans and directions</li><li>Routes across floors and stairs</li><li>3D dollhouse</li><li>AR live view</li><li>Nearest exit and SiBot&apos;s answers</li></ul>
      </div>
      <div>
        <h4>Needs internet</h4>
        <ul><li>Signing in</li><li>New announcements and closures (the last ones seen still show)</li><li>The street map and voice questions</li></ul>
      </div>
    </div>
  </article>;
}

function ScreenLoading() {
  return <div className="screen-loading" role="status"><i aria-hidden="true" /><span className="screen-loading-sr">Loading…</span></div>;
}

// Shown in place of a screen whose code could not be downloaded, instead of crashing the page.
function ScreenUnavailable({ onClose }) {
  return <div className="screen-loading" role="alert">
    <b>This screen couldn&apos;t load.</b>
    <span>Check your internet connection, then reload the page.</span>
    <div className="screen-loading-actions">
      <button type="button" onClick={() => window.location.reload()}>Reload</button>
      <button type="button" onClick={onClose}>Close</button>
    </div>
  </div>;
}

// Screens opened from a button download when first opened, so the home page shows sooner on
// slow connections. Every one of them takes onClose.
const lazyScreen = (load) => lazy(() => load().catch(() => ({ default: ScreenUnavailable })));
const loadCampusMap = () => import("./CampusMap");
const loadMyCampus = () => import("./MyCampus");
const ArLiveView = lazyScreen(() => import("./ArLiveView"));
const Route3DView = lazyScreen(() => import("./Route3D"));
const CampusMap = lazyScreen(loadCampusMap);
const MyCampus = lazyScreen(loadMyCampus);
const AdminCms = lazyScreen(() => import("./AdminCms"));
const AdminAnalytics = lazyScreen(() => import("./AdminAnalytics"));
const AdminSignIns = lazyScreen(() => import("./AdminSignIns"));
const AdminFeedback = lazyScreen(() => import("./Feedback"));
const AdminChangeLog = lazyScreen(() => import("./AdminChangeLog"));

// Fetch the screens visitors use most once the page is idle, so they still open if the
// connection drops later.
function usePrefetchScreens() {
  useEffect(() => {
    const prefetch = () => { loadCampusMap().catch(() => {}); loadMyCampus().catch(() => {}); };
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(prefetch, { timeout: 5000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(prefetch, 3000);
    return () => window.clearTimeout(timer);
  }, []);
}

// Public files live under the site base path (GitHub Pages serves the app from a sub-folder).
const asset = (file) => `${import.meta.env.BASE_URL}${file}`;
// Read on each render: staff can rename rooms at any time (see usePlan.js).
const mappedPlaces = () => PLACES.filter((item) => item.type !== "exit" && item.type !== "stairs" && !item.unlabeled);
const exitCount = () => PLACES.filter((item) => item.type === "exit").length;
// Floors of the main building (the 3D dollhouse and its floor buttons); added floors included.
const mainFloors = () => FLOORS.filter((plan) => plan.building === BUILDING_NAME).map((plan) => plan.floor);
// Big picture buttons on the home page for the places people look for most. "CR" opens the
// one nearest to where the person said they are (searchPlace), and "Way out" the nearest exit.
// The place buttons under the search box. Each kind of place has its own colour (tone), so young
// learners can spot "the pink one" for the clinic.
const QUICK_PLACES = [
  { label: "Clinic", hint: "Feeling sick?", icon: "heart", search: "clinic", tone: "pink" },
  { label: "CR", hint: "Comfort room", icon: "restroom", search: "cr", tone: "blue" },
  { label: "Library", hint: "Books & reading", icon: "book", search: "library", tone: "yellow" },
  { label: "Guidance", hint: "Talk to someone", icon: "chat", search: "guidance", tone: "purple" },
  { label: "Computer Room", hint: "Computer class", icon: "monitor", search: "computer", tone: "sky" },
  { label: "Director's Office", hint: "School head", icon: "building", search: "director", tone: "orange" },
  { label: "Faculty", hint: "Teachers' room", icon: "info", search: "faculty", tone: "lime" },
  { label: "Way out", hint: "Nearest exit", icon: "door", exit: true, tone: "red" },
];
// School location. Google Maps finds the school by name, so no exact coordinates are hard-coded.
const SCHOOL_MAP_QUERY = "Saint Simon of Cyrene Academy, Carsadang Bago II, Imus, Cavite";
const MAP_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(SCHOOL_MAP_QUERY)}&output=embed`;
const MAP_OPEN_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SCHOOL_MAP_QUERY)}`;
const MAP_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(SCHOOL_MAP_QUERY)}`;
const SIBOT_PROMPTS = ["Where is the clinic?", "Take me to Room 403", "Show the nearest exit", "What are the school hours?"];

// Small, real outline of the chosen floor; opens the full floor plan.
function MiniPlan({ floor, onOpen }) {
  const plan = FLOORS.find((item) => item.floor === floor);
  return <button type="button" className="ss-miniplan" onClick={onOpen} aria-label={`Open the ${planFloorLabel(floor).toLowerCase()} plan`}>
    <svg key={floor} viewBox="-2 -2 164 104" aria-hidden="true">
      <rect x="0" y="0" width="160" height="100" className="mp-floor" />
      {plan.rooms.map((item) => <rect key={item.id} x={item.rect[0]} y={item.rect[1]} width={item.rect[2]} height={item.rect[3]} className={`mp-room mp-${item.type}`} />)}
      <rect x="0" y="0" width="160" height="100" className="mp-outline" />
    </svg>
  </button>;
}

// Android: an intent link hands the page from an in-app browser to Chrome. iOS has no equivalent.
const chromeIntentFor = (url) => `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;

// Shown instead of the Google button inside Messenger/Facebook and other in-app browsers.
function OpenInBrowser({ app }) {
  const [copied, setCopied] = useState(false);
  const url = window.location.href.split("#")[0];
  const android = /Android/i.test(navigator.userAgent);
  const chromeIntent = chromeIntentFor(url);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link and open it in your browser:", url);
    }
  };
  return <div className="inapp-notice" role="note">
    <b>Google sign-in doesn&apos;t work inside {app}</b>
    <p>{app} opens links in its own browser, and Google blocks sign-in there. Open this page in {android ? "Chrome" : "Safari"} to sign in with Google, or use your email and password below.</p>
    {android
      ? <a className="google-button" href={chromeIntent}>Open in Chrome</a>
      : <p className="inapp-steps">Tap <b>•••</b> at the top right, then <b>Open in browser</b> (or <b>Open in Safari</b>).</p>}
    <button type="button" className="create-account-link" onClick={copy}>{copied ? "Link copied. Paste it in your browser." : "Copy the link instead"}</button>
  </div>;
}

// Fades sections in as they scroll into view; everything shows at once when reduced motion is on.
// Fades sections in as they scroll into view. The mark is a data-revealed attribute, not a class:
// React rewrites className when a section changes (the search box showing a message), which used
// to wipe a "visible" class and hide the section again. Sections that appear later are watched too.
function useReveal() {
  useEffect(() => {
    const show = (element) => element.setAttribute("data-revealed", "");
    const instant = !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = instant ? null : new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        show(entry.target);
        observer.unobserve(entry.target);
      }
    }), { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    const watch = (root) => {
      const items = root.matches?.("[data-reveal]") ? [root] : [];
      items.push(...(root.querySelectorAll?.("[data-reveal]:not([data-revealed])") || []));
      items.forEach((element) => (instant ? show(element) : observer.observe(element)));
    };
    watch(document.body);
    const added = new MutationObserver((changes) => changes.forEach((change) => change.addedNodes.forEach((node) => node.nodeType === 1 && watch(node))));
    added.observe(document.body, { childList: true, subtree: true });
    return () => {
      added.disconnect();
      observer?.disconnect();
    };
  }, []);
}

// The administrator's username (VITE_ADMIN_USERNAME, "admin1" by default) and Firebase email.
const ADMIN_USERNAME = (import.meta.env.VITE_ADMIN_USERNAME || "admin1").toLowerCase();
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "";

function LoginModal({ onClose, onCreate, onSignedIn = () => {}, onAdminSignedIn = () => {} }) {
  const [signingIn, setSigningIn] = useState(false);
  const [emailSigningIn, setEmailSigningIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState("");

  const handleEmailSignIn = async (event) => {
    event.preventDefault();
    setError("");
    const typed = loginEmail.trim();
    const isUsername = !typed.includes("@");
    // The administrator signs in here with their username, like everyone else.
    if (isUsername && typed.toLowerCase() === ADMIN_USERNAME) {
      if (!ADMIN_EMAIL) {
        setError("Admin sign-in needs VITE_ADMIN_EMAIL configured for the authorized Firebase account.");
        return;
      }
      setEmailSigningIn(true);
      try {
        onAdminSignedIn(await loginAsAdmin({ email: ADMIN_EMAIL, password: loginPassword }));
      } catch (adminError) {
        setError(isOfflineError(adminError) ? NEEDS_INTERNET : "Username or password is incorrect. Check both and try again.");
      } finally {
        setEmailSigningIn(false);
      }
      return;
    }
    // Just a name, like "juan.delacruz": most families use Gmail, so try name@gmail.com.
    const email = isUsername ? `${typed}@gmail.com` : typed;
    setEmailSigningIn(true);
    try {
      const credential = await loginWithEmail({ email, password: loginPassword });
      onSignedIn(credential.user);
    } catch (signInError) {
      setError(isOfflineError(signInError) ? NEEDS_INTERNET : signInError.code === "auth/invalid-credential" || signInError.code === "auth/user-not-found" || signInError.code === "auth/wrong-password"
        ? isUsername ? `We couldn't sign in as ${email}. Check your password, or type your full email address.` : "Email or password is incorrect. Check both and try again."
        : signInError.code === "auth/too-many-requests"
          ? "Too many sign-in attempts. Wait a little and try again, or reset your password."
          : signInError.code === "auth/invalid-email"
            ? "Type your email (like juan@gmail.com) or your username."
            : signInError.message || "Email sign-in could not be completed.");
    } finally {
      setEmailSigningIn(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setError("");
    try {
      const result = await loginWithGoogle();
      onSignedIn(result.user);
    } catch (signInError) {
      setError(isOfflineError(signInError) ? NEEDS_INTERNET :
        signInError.code === "auth/popup-closed-by-user"
          ? "The Google sign-in window was closed."
          : signInError.code ===
              "auth/api-key-not-valid.-please-pass-a-valid-api-key."
            ? "This Firebase API key is invalid or belongs to a different project. Copy the Web app config from Firebase Console and update .env."
            : signInError.message || "Google sign-in could not be completed.",
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    setError("");
    setResetSent(false);
    setResettingPassword(true);
    try {
      await requestPasswordReset(resetEmail);
      setResetSent(true);
    } catch (resetError) {
      setError(isOfflineError(resetError) ? NEEDS_INTERNET : resetError.code === "auth/invalid-email"
        ? "Enter a valid email address."
        : resetError.code === "auth/too-many-requests"
          ? "Too many attempts. Please wait a while and try again."
          : resetError.message || "The password reset email could not be sent.");
    } finally {
      setResettingPassword(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="modal-shell"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="login-modal">
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close sign in"
        >
          <Icon name="close" />
        </button>
        <div className="modal-mark">
          <Icon name="building" size={26} />
        </div>
        <p className="kicker">SECURE ACCESS</p>
        <h2 id="login-title">{resetMode ? "Reset your password" : "Sign in to SSCAI NAVI"}</h2>
        {resetMode ? (
          <>
            <p className="modal-copy">Enter the email address on your campus account. Firebase will email you a secure link to reset your password.</p>
            <form className="password-reset-form" onSubmit={handlePasswordReset}>
              <input type="email" value={resetEmail} onChange={(event) => { setResetEmail(event.target.value); setResetSent(false); }} placeholder="Email address" autoComplete="email" aria-label="Account email address" required />
              {error && <p className="auth-error" role="alert">{error}</p>}
              {resetSent && <p className="auth-success" role="status">If an account exists for that address, a password reset email has been sent. Check your Gmail inbox and spam folder.</p>}
              <button className="visitor-button" type="submit" disabled={resettingPassword}>{resettingPassword ? "Sending reset email..." : "Send reset email"}</button>
            </form>
            <button className="create-account-link" onClick={() => { setResetMode(false); setError(""); setResetSent(false); }}>Back to sign in</button>
          </>
        ) : (
          <>
            <p className="modal-copy">Sign in to access personalized routes, saved locations, and campus services.</p>
            {inAppBrowserName()
              ? <OpenInBrowser app={inAppBrowserName()} />
              : <button className="google-button" onClick={handleGoogleSignIn} disabled={signingIn}>
                {signingIn ? "Opening Google sign-in..." : "Sign in with Google Account"}
              </button>}
            <div className="divider"><span>OR USE EMAIL</span></div>
            <form className="email-login-form" onSubmit={handleEmailSignIn}>
              <label>Email or username<input type="text" inputMode="email" autoCapitalize="none" spellCheck={false} value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} autoComplete="username" placeholder="juan@gmail.com or juan" required /></label>
              <label>Password<div className="password-field"><input type={showLoginPassword ? "text" : "password"} value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" placeholder="Your password" required /><button type="button" className="password-visibility" onClick={() => setShowLoginPassword((visible) => !visible)} aria-label={showLoginPassword ? "Hide password" : "Show password"}><Icon name={showLoginPassword ? "eyeOff" : "eye"} size={18} /></button></div></label>
              <button className="password-reset-inline" type="button" onClick={() => { const typed = loginEmail.trim(); setResetEmail(typed.includes("@") ? typed : typed && typed.toLowerCase() !== ADMIN_USERNAME ? `${typed}@gmail.com` : ""); setResetMode(true); setError(""); setResetSent(false); }}>Forgot password?</button>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="visitor-button" type="submit" disabled={emailSigningIn}>{emailSigningIn ? "Signing in..." : "Sign in with email"}</button>
            </form>
            <button className="create-account-link" onClick={onCreate}>Create a new campus account</button>
            <p className="auth-security-note"><Icon name="shield" size={15} /> Sign-in is handled by Firebase. Your password is not shared with Google.</p>
            <p className="auth-security-note"><Icon name="info" size={15} /> When you sign in, the school can see your account email, how you signed in, and your device type and browser.</p>
            <p className="terms">By continuing, you agree to SSCAI NAVI&apos;s <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
          </>
        )}
      </div>
    </div>
  );
}

function CreateAccountModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "",
    gradeLevel: "",
    section: "",
    emailUpdates: true,
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const passwordChecks = [
    form.password.length >= 12,
    /[a-z]/.test(form.password),
    /[A-Z]/.test(form.password),
    /\d/.test(form.password),
    /[^A-Za-z\d]/.test(form.password),
  ].filter(Boolean).length;
  const passwordStrength = !form.password ? "" : passwordChecks === 5 ? "Strong" : passwordChecks >= 3 ? "Medium" : "Low";
  const updateField = (event) =>
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const handleCreate = async (event) => {
    event.preventDefault();
    setError("");
    if (!["name", "email", "role", "password", "confirmPassword"].every((field) => form[field].trim())) {
      setError("Complete every field before creating your account.");
      return;
    }
    if (form.role === "Student" && !form.gradeLevel) {
      setError("Choose your grade level.");
      return;
    }
    // Same limit as the profile in firestore.rules, so the profile always saves.
    if (form.name.trim().length > 80) {
      setError("Please shorten your name to 80 characters or fewer.");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/.test(form.password)) {
      setError("Password must be at least 12 characters with uppercase, lowercase, number, and symbol.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const user = await createCampusAccount({ ...form, name: form.name.trim(), email: form.email.trim() });
      onCreated(user);
    } catch (createError) {
      setError(isOfflineError(createError) ? NEEDS_INTERNET : createError.code === "auth/email-already-in-use"
        ? "That email already has an account. Use Google sign-in or sign in with email."
        : createError.message || "Account creation failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="create-account-title">
      <form className="login-modal account-form" onSubmit={handleCreate}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close account creation"><Icon name="close" /></button>
        <div className="modal-mark"><Icon name="building" size={26} /></div>
        <p className="kicker">NEW CAMPUS ACCOUNT</p>
        <h2 id="create-account-title">Create your account</h2>
        <p className="modal-copy">Save the rooms and offices you visit and get alerts when a hallway on your way is closed.</p>
        <div className="account-fields">
          <input name="name" value={form.name} onChange={updateField} placeholder="Full name" autoComplete="name" maxLength={80} />
          <input name="email" type="email" value={form.email} onChange={updateField} placeholder="Email address" autoComplete="email" maxLength={254} />
          <select name="role" value={form.role} onChange={updateField} aria-label="I am a"><option value="">I am a…</option>{USER_ROLES.map((item) => <option key={item}>{item}</option>)}</select>
          {form.role === "Student" && <div className="account-grade">
            <select name="gradeLevel" value={form.gradeLevel} onChange={(event) => setForm((current) => ({ ...current, gradeLevel: event.target.value, section: "" }))} aria-label="Grade level"><option value="">Grade level…</option>{GRADE_LEVELS.map((item) => <option key={item}>{item}</option>)}</select>
            <input name="section" value={form.section} onChange={updateField} placeholder="Section (optional)" list="account-sections" maxLength={MAX_SECTION_LENGTH} autoComplete="off" aria-label="Section" />
            <datalist id="account-sections">{sectionsOf(form.gradeLevel).map((item) => <option key={item} value={item} />)}</datalist>
          </div>}
          <div className="password-field"><input name="password" type={showPassword ? "text" : "password"} value={form.password} onChange={updateField} placeholder="Password (12+ characters)" autoComplete="new-password" aria-describedby="password-strength" maxLength={128} /><button type="button" className="password-visibility" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name={showPassword ? "eyeOff" : "eye"} size={18} /></button></div>
          {passwordStrength && <div className={`password-strength ${passwordStrength.toLowerCase()}`} id="password-strength" aria-live="polite"><div className="strength-meter"><i /><i /><i /></div><span>Password strength: <b>{passwordStrength}</b></span></div>}
          <div className="password-field"><input name="confirmPassword" type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} onChange={updateField} placeholder="Confirm password" autoComplete="new-password" maxLength={128} /><button type="button" className="password-visibility" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}><Icon name={showConfirmPassword ? "eyeOff" : "eye"} size={18} /></button></div>
        </div>
        <label className="email-updates-check"><input type="checkbox" checked={form.emailUpdates} onChange={(event) => setForm((current) => ({ ...current, emailUpdates: event.target.checked }))} /><span>Email me new school announcements and closed hallways once I confirm my email. You can turn this off anytime in My Campus.</span></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="visitor-button" type="submit" disabled={saving}>{saving ? "Creating account..." : "Create account"}</button>
        <p className="terms password-policy">Password policy: at least 12 characters, including uppercase and lowercase letters, a number, and a symbol.</p>
      </form>
    </div>
  );
}

function AdminLogin({ onClose, onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const adminEmail = ADMIN_EMAIL;
    if (username.trim().toLowerCase() !== ADMIN_USERNAME) {
      setError("The administrator username or password is incorrect.");
      return;
    }
    if (!adminEmail) {
      setError("Admin sign-in needs VITE_ADMIN_EMAIL configured for the authorized Firebase account.");
      return;
    }
    setBusy(true);
    try {
      const user = await loginAsAdmin({ email: adminEmail, password });
      onSuccess(user);
    } catch (loginError) {
      setError(isOfflineError(loginError) ? NEEDS_INTERNET : loginError.code === "auth/invalid-credential" ? "The administrator username or password is incorrect." : loginError.message || "Staff sign-in failed.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="admin-login-title"><form className="login-modal admin-login" onSubmit={submit}><button type="button" className="modal-close" onClick={onClose} aria-label="Close admin login"><Icon name="close" /></button><div className="modal-mark"><Icon name="shield" size={26} /></div><p className="kicker">RESTRICTED STAFF ACCESS</p><h2 id="admin-login-title">Administrator sign in</h2><p className="modal-copy">Sign in with the administrator username and password.</p><input className="admin-password" type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" autoComplete="username" required autoFocus /><input className="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete="current-password" required />{error && <p className="auth-error" role="alert">{error}</p>}<button className="visitor-button" type="submit" disabled={busy}>{busy ? "Verifying admin access..." : "Sign in to admin"}</button><p className="terms">Admin access is verified by Firebase authorization.</p></form></div>;
}

// The campus facts. On a phone they take turns, one at a time, sliding in with the number counting
// up over a soft gradient; tap to skip ahead. On a computer, or when the phone asks for less motion, they sit in a grid.
const FACT_SECONDS = 3;

function useMedia(query) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const change = () => setMatches(list.matches);
    change();
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, [query]);
  return matches;
}

function CountUp({ value }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 700);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

function CampusFacts({ facts }) {
  const phone = useMedia("(max-width: 640px)");
  const still = useMedia("(prefers-reduced-motion: reduce)");
  const [index, setIndex] = useState(0);
  const rotating = phone && !still;
  useEffect(() => {
    if (!rotating) return undefined;
    const timer = setInterval(() => { if (!document.hidden) setIndex((current) => (current + 1) % facts.length); }, FACT_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [rotating, facts.length, index]);
  if (!rotating) {
    return <dl className="ss-facts" data-reveal style={{ "--delay": "120ms" }}>
      {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd className={fact.text ? "ss-facts-text" : undefined}>{fact.text || fact.value}</dd></div>)}
    </dl>;
  }
  const fact = facts[index];
  return <div className="ss-facts ss-facts-rotate" data-reveal style={{ "--delay": "120ms" }} role="group" aria-label="Campus facts">
    <button type="button" className="ss-fact-slide" key={index} onClick={() => setIndex((index + 1) % facts.length)} aria-label={`${fact.label}: ${fact.text || fact.value}. Tap for the next fact.`}>
      <span className="ss-fact-label">{fact.label}</span>
      <span className={`ss-fact-value ${fact.text ? "text" : ""}`}>{fact.text || <CountUp value={fact.value} />}</span>
    </button>
  </div>;
}

// Real photos of the school at the top of the home page, fading from one to the next with a slow
// zoom. Tap to go to the next one. Phones that ask for less motion get no zoom and no autoplay.
const CAMPUS_PHOTOS = [
  { file: "campus/building-front.jpg", caption: "Main Academic Building, Carsadang Bago II", alt: "The green Main Academic Building of Saint Simon of Cyrene Academy, Inc. seen from the street" },
  { file: "campus/building-sign.jpg", caption: "Saint Simon of Cyrene Academy, Inc.", alt: "The school's name and logo painted across the front of the building" },
  { file: "campus/classroom.jpg", caption: "A classroom", alt: "A light blue classroom with rows of wooden armchairs, windows and air conditioners" },
  { file: "campus/library-elementary.jpg", caption: "Elementary library", alt: "The elementary library with green walls, bookshelves, a globe and reading tables" },
  { file: "campus/library-high-school.jpg", caption: "High school library", alt: "The high school library with blue walls, tall bookshelves and students reading" },
];
const PHOTO_SECONDS = 5;

function CampusPhotos() {
  const still = useMedia("(prefers-reduced-motion: reduce)");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (still) return undefined;
    const timer = setInterval(() => { if (!document.hidden) setIndex((current) => (current + 1) % CAMPUS_PHOTOS.length); }, PHOTO_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [still, index]);
  const photo = CAMPUS_PHOTOS[index];
  return <figure className="ss-hero-figure ss-photos" data-reveal style={{ "--delay": "200ms" }}>
    <button type="button" className="ss-photo-frame" onClick={() => setIndex((index + 1) % CAMPUS_PHOTOS.length)} aria-label={`Photo ${index + 1} of ${CAMPUS_PHOTOS.length}: ${photo.alt}. Tap for the next photo.`}>
      {CAMPUS_PHOTOS.map((item, i) => <img key={item.file} src={asset(item.file)} alt="" width="1200" height="900" decoding="async" loading={i === 0 ? "eager" : "lazy"} className={`ss-photo ${i === index ? "on" : ""}`} />)}
    </button>
    <figcaption key={index}>{photo.caption}</figcaption>
  </figure>;
}

const SIBOT_KEEP = 3; // questions (with their answers) SiBot keeps on screen

// The newest announcement slides in at the top for 5 seconds (paused while pointed at or focused).
// Tapping it scrolls to that announcement in "On campus today" and makes it glow for a moment.
// Each announcement shows once per browser, and again if the school updates it.
const ANNOUNCEMENT_SEEN_KEY = "sscai-announcement-seen";
const ANNOUNCEMENT_SECONDS = 5;
const announcementVersion = (item) => `${item.id}:${item.updatedAt?.toMillis?.() || 0}`;

function AnnouncementPopup({ hidden }) {
  const announcements = usePublicCollection(CMS_COLLECTIONS.announcements);
  const [shown, setShown] = useState(null);
  const [paused, setPaused] = useState(false);
  const newest = visibleAnnouncements(announcements.items).sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))[0];
  useEffect(() => {
    if (!newest || hidden || shown) return;
    let seen = "";
    try { seen = localStorage.getItem(ANNOUNCEMENT_SEEN_KEY) || ""; } catch { /* storage blocked: show it */ }
    if (seen === announcementVersion(newest)) return;
    setShown(newest);
  }, [newest, hidden, shown]);
  const close = () => {
    try { localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, announcementVersion(shown)); } catch { /* storage unavailable */ }
    setShown(false);
  };
  useEffect(() => {
    if (!shown || paused || hidden) return undefined;
    const timer = setTimeout(close, ANNOUNCEMENT_SECONDS * 1000);
    return () => clearTimeout(timer);
  });
  if (!shown || hidden) return null;
  const open = () => {
    const id = shown.id;
    close();
    document.querySelector("#updates")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      const card = document.getElementById(`announcement-${id}`);
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      card.setAttribute("data-spotlight", "");
      setTimeout(() => card.removeAttribute("data-spotlight"), 2600);
    }, 700);
  };
  return <aside className="announce-pop" role="status" aria-live="polite" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <button type="button" className="announce-pop-open" onClick={open}>
      <span className="announce-pop-art" aria-hidden="true"><AnnouncementArt title={shown.title} body={shown.body} picture={shown.picture === "none" ? "art" : shown.picture || "ai"} seed={shown.pictureSeed} aiImage={shown.pictureData} /></span>
      <span className="announce-pop-text"><small>{shown.pinned ? "Important announcement" : "New announcement"}</small><b>{shown.title}</b><em>Tap to read</em></span>
    </button>
    <button type="button" className="announce-pop-close" onClick={close} aria-label="Close the announcement"><Icon name="close" size={16} /></button>
  </aside>;
}

// The role shown with a feedback message (no names or emails unless they choose to be replied to).
const feedbackRole = (role) => ({ admin: "Administrator", visitor: "Visitor (no account)", user: "Signed in", guest: "Guest" }[role] || "Guest");

function SiiBot({ onSignIn, onSignOut, onOpenAccount, onNavigate, onOpenMap, alreadySignedIn = false, speakAnswers = false }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [centerAnswer, setCenterAnswer] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [messages, setMessages] = useState([{ id: "welcome", role: "assistant", text: "Hi! I’m SiBot, your school helper. Ask about school hours, the address, school levels, or finding your way around campus." }]);
  const liveRooms = usePublicCollection(CMS_COLLECTIONS.rooms).items;
  const liveOffices = usePublicCollection(CMS_COLLECTIONS.offices).items;
  const liveClosures = usePublicCollection(CMS_COLLECTIONS.closures).items;
  const conversationRef = useRef(null);
  const askRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceCommandRef = useRef(false);

  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages, open]);

  const startVoiceInput = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceStatus("Voice input is not available in this browser. You can type your question instead.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-PH";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      voiceCommandRef.current = true;
      setListening(true);
      setVoiceStatus("Listening… say a question or a command.");
    };
    recognition.onresult = (event) => {
      const spokenText = event.results[0][0].transcript;
      setQuestion(spokenText);
      setVoiceStatus(`I heard: “${spokenText}”`);
      askSiiBot(spokenText);
    };
    recognition.onerror = (event) => {
      voiceCommandRef.current = false;
      setListening(false);
      setVoiceStatus(event.error === "not-allowed"
        ? "Please allow microphone access in your browser to use voice commands."
        : event.error === "no-speech"
          ? "I didn’t hear anything. Tap the microphone and try again."
          : event.error === "network" || !navigator.onLine
            ? "Voice questions need internet. You can type your question instead."
            : "Voice input had a problem. You can type your question instead.");
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
    } catch {
      voiceCommandRef.current = false;
      setListening(false);
      setVoiceStatus("Could not start the microphone. Please try again or type your question.");
    }
  };

  const askSiiBot = (value) => {
    const text = value.trim();
    if (!text) return;
    const normalized = text.toLowerCase();
    setOpen(true);
    setVoiceStatus(voiceCommandRef.current ? `I heard: “${text}”` : "");
    const hasAny = (terms) => terms.some((term) => normalized.includes(term.toLowerCase()));
    const floorName = (floor) => (floor === 0 ? "the ground floor" : `floor ${floor}`);
    const activeClosures = liveClosures.filter((item) => isClosureActive(item, todayKey()));
    // Longest name first so "Room 204" wins over "Room 2".
    const place = [...liveOffices, ...liveRooms]
      .filter((item) => item.name && normalized.includes(item.name.toLowerCase()))
      .sort((first, second) => second.name.length - first.name.length)[0];
    const planPlace = placeByKey(findPlaceKey(normalized)) || placeByKey(searchPlace(normalized, savedStart())?.key);
    let answer;
    if (place) {
      const closedNearby = activeClosures.filter((item) => item.building === place.building && item.floor === place.floor);
      answer = `${place.name} is in the ${place.building}, on ${floorName(place.floor)}${place.room ? `, ${place.room}` : ""}.`
        + (place.hours ? ` Office hours: ${place.hours}.` : "")
        + (place.status && place.status !== "Available" ? ` Status right now: ${place.status.toLowerCase()}.` : "")
        + (closedNearby.length ? ` Heads up: ${closedNearby.map((item) => `${item.pathway} is closed${item.detour ? ` (${item.detour})` : ""}`).join("; ")}.` : "");
      const mapKey = findPlaceKey(place.room, place.name);
      if (mapKey && onOpenMap) onOpenMap({ destination: mapKey, floor: place.floor });
      else onNavigate("updates");
    } else if (hasAny(["closed", "closure", "blocked", "maintenance", "restricted", "hallway", "pathway", "detour"])) {
      answer = activeClosures.length
        ? `Current pathway restrictions: ${activeClosures.map((item) => `${item.pathway} in the ${item.building}, ${floorName(item.floor)} (${item.reason.toLowerCase()})${item.detour ? `. ${item.detour}` : ""}`).join("; ")}.`
        : "All campus pathways are open right now.";
      onNavigate("updates");
    } else if (hasAny(["sign out", "signout", "sign me out", "log out", "log me out", "logout"])) {
      if (alreadySignedIn) {
        answer = "Okay, I’m signing you out.";
        onSignOut?.();
      } else {
        answer = "You’re not signed in right now.";
      }
    } else if (hasAny(["open my account", "open account", "show my account", "my profile", "student portal", "open portal"])) {
      if (alreadySignedIn) {
        answer = "Opening your student account now.";
        onOpenAccount?.();
      } else {
        answer = "Please sign in first. I’ll open the sign-in window for you.";
        onSignIn?.();
      }
    } else if (hasAny(["sign in", "signin", "sign me in", "sign into", "log in", "log me in", "log into", "login", "portal access"])) {
      if (alreadySignedIn) {
        answer = "You’re signed in already. Choose My Account in the top menu to open your student portal.";
      } else {
        answer = "Choose Sign in in the top menu. I’ll open it for you now.";
        onSignIn?.();
      }
    } else if (hasAny(["ar live", "ar view", "augmented reality", "camera guide", "live view"])) {
      answer = "AR Live View is in Explore the Platform. Open it for a visual walkthrough with directions and room distance.";
      onNavigate("features");
    } else if (hasAny(["emergency", "fire exit", "nearest exit", "safest route", "evacuate", "safety route", "earthquake", "way out"])) {
      answer = "I’m showing the nearest exit on the floor plan. In a real emergency, stay calm and follow your teacher and school staff first.";
      onOpenMap?.({ emergency: true });
    } else if (planPlace && hasAny(["where", "take me", "go to", "find", "how do i get", "directions", "room", "office", "clinic", "library", "guidance", "laboratory", "lab", "cr", "c.r.", "comfort", "restroom", "toilet", "bathroom", "banyo", "nasaan", "saan", "grade"])) {
      answer = `${placeTitle(planPlace)} is on the ${planFloorLabel(planPlace.floor).toLowerCase()} of the Main Academic Building. I’ve opened the floor plan with directions.`;
      onOpenMap?.({ destination: planPlace.key, floor: planPlace.floor });
    } else if (hasAny(["2d", "floor plan", "floor map", "directions", "navigate"])) {
      answer = "Opening the 2D floor plan. Tap any room to get directions, or use Route to the nearest exit.";
      onOpenMap?.({});
    } else if (hasAny(["3d", "dollhouse", "building map", "campus map"])) {
      answer = "The 3D campus map is in Explore the Platform. Choose a floor to look around the campus buildings.";
      onNavigate("features");
    } else if (hasAny(["address", "where is the school", "school located", "where are you located", "campus location", "location of the school", "directions to the school", "how do i get to school"])) {
      answer = "Saint Simon of Cyrene Academy, Inc. is at N.I.A. Road / 39 Reyes Compound, Carsadang Bago II, Imus, Cavite, Philippines. I've scrolled to the map so you can get directions.";
      onNavigate("visit");
    } else if (hasAny(["school hour", "school hours", "opening hour", "what time does school", "when does school open", "when is the school open", "operating hour", "open on saturday"])) {
      answer = "The school is open Monday to Friday, 7:00 AM to 5:00 PM. For holiday or special schedules, please check with the school office.";
    } else if (hasAny(["grade level", "academic level", "year level", "school levels", "what levels", "what grades", "nursery", "kindergarten", "elementary", "grade school", "junior high", "senior high", "prep class"])) {
      answer = "The school has Nursery, Kindergarten and Prep, Elementary, Junior High School, and Senior High School. Ask a teacher or the school office about a specific grade.";
    } else if (hasAny(["student group", "student organization", "school club", "extracurricular", "ssg", "supreme student", "star group", "pixels group", "clubs", "organizations"])) {
      answer = "Student groups include SSG for student leadership, STAR for performing arts, and PIXELS for photography and creative media. Ask the school which groups are open to your grade.";
    } else if (hasAny(["subject list", "what subjects", "curriculum", "what do students study", "subjects do you offer"])) {
      answer = "I don’t have the official subject list in my school information yet. Subjects can differ by grade, so please check with your teacher or adviser.";
    } else if (hasAny(["building", "zone", "multi-purpose court", "multipurpose court", "administration office", "academic building", "how many floors", "which floors"])) {
      answer = "The campus map includes the Main Academic Building, Administration area, and Multi-Purpose Court. The map has floor choices from 1 to 4. Open the 3D map to explore.";
      onNavigate("features");
    } else if (hasAny(["enroll", "enrollment", "admission", "how can i register", "how do i apply", "new student", "requirements", "tuition", "school fee"])) {
      answer = "For enrollment, documents, tuition, or fees, please ask a parent or guardian to contact the school office. I don’t have the current rates or requirements listed.";
    } else if (hasAny(["contact", "phone number", "telephone", "email address", "facebook", "youtube", "social media", "office number"])) {
      answer = "I don’t have a verified phone number or email in my information. You can find the school’s Facebook and YouTube links in the page footer, or ask a parent to contact the school office.";
    } else if (hasAny(["visitor", "guest", "parent", "can i enter", "public access"])) {
      answer = "Visitors can look at the public campus map without signing in. Please ask school staff about visiting rules before coming to campus.";
    } else if (hasAny(["room", "office", "restroom", "comfort room", "library", "clinic", "where can i find", "how do i get to", "take me to", "where is"])) {
      answer = "Open the 2D floor plan and tap a room to get directions. If you still need help, ask a teacher or staff member.";
      onOpenMap?.({});
    } else if (hasAny(["saved place", "my places", "favorite", "favourite", "bookmark"])) {
      answer = alreadySignedIn
        ? "Your saved places are in My Campus. Search for a room or office there and tap Save. I’ll open it for you."
        : "Sign in to save rooms and offices to your account and get alerts when a hallway near them is closed.";
      if (alreadySignedIn) onOpenAccount?.(); else onSignIn?.();
    } else if (hasAny(["sscai navi", "ssca navi", "what is navi", "what is this app", "what is this website", "what is this site"])) {
      answer = "SSCAI NAVI is the campus navigation system of Saint Simon of Cyrene Academy, Inc.. It shows the floor plans, gives step-by-step directions and AR guidance to any room, finds the nearest exit, and shares campus updates, even with no Wi-Fi once you have opened it.";
    } else if (hasAny(["who is saint simon", "tell me about the school", "about the school", "what is this school", "what does sscai mean", "what kind of school"])) {
      answer = "Saint Simon of Cyrene Academy, Inc. (SSCAI) is a private, non-stock, non-profit school in Imus, Cavite. It provides basic education from early childhood through Senior High School and is recognized by the DepEd Division of City of Imus.";
      onNavigate("about");
    } else {
      answer = "I don’t have that answer in my school information yet. I can help with the school overview, address and hours, grade levels, student groups, subjects, enrollment, contact links, finding rooms and offices, closed hallways, and the campus map. For other details, please ask a teacher or the school office.";
    }
    const timestamp = Date.now();
    // Keep the welcome and the last 3 questions with their answers; older ones drop off.
    setMessages((current) => {
      const [welcome, ...rest] = current;
      return [welcome, ...rest.slice(-(SIBOT_KEEP * 2 - 2)),
        { id: `${timestamp}-question-${Math.random()}`, role: "user", text },
        { id: `${timestamp}-answer-${Math.random()}`, role: "assistant", text: answer },
      ];
    });
    setCenterAnswer(answer);
    if ((voiceCommandRef.current || speakAnswers) && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const spokenAnswer = new SpeechSynthesisUtterance(answer);
      spokenAnswer.lang = "en-PH";
      window.speechSynthesis.speak(spokenAnswer);
    }
    voiceCommandRef.current = false;
    setQuestion("");
  };

  const choosePrompt = (prompt) => askSiiBot(prompt);
  askRef.current = askSiiBot;
  useEffect(() => {
    const onAsk = (event) => askRef.current?.(String(event.detail || ""));
    window.addEventListener("sibot:ask", onAsk);
    return () => window.removeEventListener("sibot:ask", onAsk);
  }, []);

  return (
    <div className="siibot-wrap">
      {centerAnswer && <div className="siibot-answer-pop" role="status" aria-live="assertive"><section className="siibot-answer-card"><div className="siibot-answer-topline"><span><Icon name="sparkle" size={16} /> SiBot answer</span><button onClick={() => setCenterAnswer("")} aria-label="Close answer"><Icon name="close" size={15} /></button></div><p>{centerAnswer}</p><button className="siibot-answer-dismiss" onClick={() => setCenterAnswer("")}>Got it</button></section></div>}
      {open && (
        <div className="siibot-panel-shell">
          <section className="siibot-panel" role="dialog" aria-label="SiBot school assistant">
            <div className="siibot-heading">
              <div className="siibot-identity">
                <span className="siibot-avatar"><Icon name="bot" size={18} /></span>
                <span><strong>SiBot</strong><small>School helper</small></span>
              </div>
              <button className="siibot-close" onClick={() => setOpen(false)} aria-label="Close SiBot"><Icon name="close" size={17} /></button>
            </div>
            <div className="siibot-conversation" ref={conversationRef} aria-live="polite" aria-relevant="additions">
              {messages.map((message) => <div className={`siibot-message ${message.role === "user" ? "from-user" : "from-bot"}`} key={message.id}><p>{message.text}</p></div>)}
            </div>
            <p className="siibot-label">Ask a question or try a command</p>
            <div className="siibot-options">
              <button onClick={() => choosePrompt("What are the school hours?")}>School hours</button>
              <button onClick={() => choosePrompt("What is the school address?")}>School address</button>
              <button onClick={() => choosePrompt("What grade levels are there?")}>Grade levels</button>
              <button onClick={() => choosePrompt("Show me the 3D campus map")}>Campus map</button>
              {alreadySignedIn ? <><button onClick={() => choosePrompt("Open my account")}>My account</button><button onClick={() => choosePrompt("Sign out")}>Sign out</button></> : <button onClick={() => choosePrompt("Sign in")}>Sign in</button>}
            </div>
            <form className="siibot-form" onSubmit={(event) => { event.preventDefault(); askSiiBot(question); }}>
              <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Type your question..." aria-label="Ask SiBot about the school" />
              <button type="button" className={`siibot-voice-button ${listening ? "listening" : ""}`} onClick={startVoiceInput} aria-label={listening ? "Stop listening" : "Ask SiBot by voice"} title={listening ? "Stop listening" : "Ask by voice"}><Icon name="mic" size={17} /></button>
              <button type="submit" aria-label="Send question"><Icon name="arrow" size={17} /></button>
            </form>
            {voiceStatus && <small className="siibot-voice-status" role="status">{voiceStatus}</small>}
            <small className="siibot-note">Tap the microphone to speak. SiBot can answer common school questions and help you sign in or out.</small>
          </section>
        </div>
      )}
      <button className={open ? "siibot-launcher active" : "siibot-launcher"} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={open ? "Close SiBot school assistant" : "Open SiBot school assistant"}>
        <Icon name={open ? "close" : "bot"} size={21} /> <span>SiBot</span>
      </button>
    </div>
  );
}

export default function App() {
  usePrefetchScreens();
  const offlineApp = useOfflineApp();
  const [loginOpen, setLoginOpen] = useState(false);
  const [route3d, setRoute3d] = useState(null); // { start, end } while the 3D directions are open
  useEffect(() => {
    const open = (event) => { setMapState(null); setRoute3d(event.detail || {}); };
    window.addEventListener("sscai:route3d", open);
    return () => window.removeEventListener("sscai:route3d", open);
  }, []);
  // "Sign in" from a Save route button: close the map, 3D or AR and open the sign-in window.
  useEffect(() => {
    const open = () => { setMapState(null); setRoute3d(null); setArOpen(false); setLoginOpen(true); };
    window.addEventListener("sscai:login", open);
    return () => window.removeEventListener("sscai:login", open);
  }, []);
  const [feedbackStart, setFeedbackStart] = useState(null); // open feedback form, with what it is about
  useEffect(() => {
    const open = (event) => setFeedbackStart(event.detail || {});
    window.addEventListener("sscai:feedback", open);
    return () => window.removeEventListener("sscai:feedback", open);
  }, []);
  const [noticeOpen, setNoticeOpen] = useState(() => !privacyNoticeSeen());
  const [menuOpen, setMenuOpen] = useState(false);
  const [floor, setFloor] = useState(2);
  const [highlight3d, setHighlight3d] = useState(null); // a place key lit up in the 3D view
  const [view3d, setView3d] = useState("outside"); // the home 3D card: the building's outside, or its floors
  const [mapState, setMapState] = useState(null);
  // A link ending in #ar-live or ?ar-live (for example from a printed QR code, or the hand-over
  // from Messenger to Chrome) opens AR live view directly.
  const [arOpen, setArOpen] = useState(() => window.location.hash === "#ar-live" || new URLSearchParams(window.location.search).has("ar-live"));
  const [where, setWhere] = useState("");
  const [whereError, setWhereError] = useState("");
  const [whereSuggestions, setWhereSuggestions] = useState([]);
  const [whereNudge, setWhereNudge] = useState(0);
  const searchForm = useRef(null);
  // A problem with the search: say so, shake the box (every time), and bring the message into view.
  const searchProblem = (message) => {
    setWhereError(message);
    setWhereNudge((count) => count + 1);
    requestAnimationFrame(() => searchForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const [scrolled, setScrolled] = useState(false);
  useReveal();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const planVersion = usePlanVersion(); // re-render when staff rename rooms or add floors
  const homeClosures = usePublicCollection(CMS_COLLECTIONS.closures).items;
  const homeBlocked = blockedKeyOf(homeClosures.filter((item) => isClosureActive(item)));
  const [signedInUser, setSignedInUser] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [role, setRole] = useState("guest");
  const [adminView, setAdminView] = useState(null);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const isAdmin = role === "admin";
  const roleRef = useRef(role);
  roleRef.current = role;
  const openLogin = () => {
    setMenuOpen(false);
    setLoginOpen(true);
  };
  // The admin never gets the student "My Campus" screen: their account button opens the admin side.
  const openAccount = () => {
    setMenuOpen(false);
    if (roleRef.current === "admin") setAdminView("content");
    else setAccountOpen(true);
  };
  const openCreateAccount = () => {
    setLoginOpen(false);
    setCreateAccountOpen(true);
  };
  // The administrator's private ways in: signing in with the admin username, or the site address
  // followed by #admin. Nothing on the site shows or links to the admin side (no Admin button);
  // the admin account and the database rules guard everything behind it. Already signed in as the
  // admin, #admin goes straight to the Content manager.
  useEffect(() => {
    const check = () => {
      if (location.hash !== "#admin") return;
      history.replaceState(null, "", location.pathname + location.search);
      if (roleRef.current === "admin") setAdminView("content");
      else setAdminLoginOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  const navigateTo = (sectionId) => document.querySelector(`#${sectionId}`)?.scrollIntoView({ behavior: "smooth" });

  // One tap from a place button: open the floor plan with the route there.
  const goToPlace = (item) => {
    const found = item.exit ? { exit: true } : searchPlace(item.search, savedStart());
    if (found?.exit) setMapState({ emergency: true });
    else if (found?.key) setMapState({ destination: found.key, floor: placeByKey(found.key).floor });
  };

  const submitWhere = (event) => {
    event.preventDefault();
    const query = where.trim();
    setWhereSuggestions([]);
    if (!query) {
      searchProblem("You didn’t type anything yet. Type where you want to go, like clinic, CR or 204, or tap a place below.");
      return;
    }
    const lower = query.toLowerCase();
    const exact = mappedPlaces().find((item) => [placeTitle(item), item.name, item.code].some((value) => value && value.toLowerCase() === lower));
    const found = exact ? { key: exact.key } : searchPlace(query, savedStart());
    if (found?.exit) {
      setMapState({ emergency: true });
      return;
    }
    if (found?.key) {
      setMapState({ destination: found.key, floor: placeByKey(found.key).floor });
      return;
    }
    if (found?.suggestions?.length) {
      setWhereSuggestions(found.suggestions);
      setWhereError(`Did you mean one of these?`);
      return;
    }
    searchProblem(`We couldn’t find “${query}” in the building. Try a room number like 204, or tap a place below.`);
  };

  const handleSignOut = async () => {
    await logoutUser();
    setSignedInUser(null);
    setRole("guest");
    setAccountOpen(false);
    setAdminView(null);
  };

  // Keeps the signed-in user and their role (from the Firebase JWT claims) in sync,
  // including after a page reload.
  useEffect(() => watchSession(({ user, role: nextRole }) => {
    setSignedInUser(user && !user.isAnonymous ? user : null);
    setRole(nextRole);
    recordVisit(user, nextRole);
    recordSignIn(user, nextRole);
    roleRef.current = nextRole;
    if (nextRole === "admin") {
      // However the admin signed in (username, email, Google, or a page reload), they land on the
      // admin side, never in the student portal.
      setAccountOpen(false);
      setCreateAccountOpen(false);
      setAdminView((current) => current || "content");
    } else setAdminView(null);
  }), []);

  useEffect(() => {
    finishGoogleRedirect()
      .then((result) => {
        if (result?.user) setSignedInUser(result.user);
      })
      .catch(() => setLoginOpen(true));
  }, []);

  return (
    <div className="ss-site">
      <a className="ss-skip" href="#main">Skip to main content</a>
      <header className={`ss-header ${scrolled ? "is-scrolled" : ""}`}>
        <div className="ss-container ss-header-inner">
          <a className="ss-brand" href="#top" onClick={() => setMenuOpen(false)}>
            <img src={asset("logologooo.jpg")} alt="" width="44" height="44" />
            <span><b>Saint Simon of Cyrene Academy, Inc.</b><small>SSCAI NAVI</small></span>
          </a>
          <nav id="ss-nav" className={`ss-nav ${menuOpen ? "open" : ""}`} aria-label="Main">
            <button type="button" className="ss-nav-link" onClick={() => { setMenuOpen(false); setMapState({ floor: 2 }); }}>Floor plan</button>
            <a className="ss-nav-link" href="#explore" onClick={() => setMenuOpen(false)}>3D &amp; AR</a>
            <a className="ss-nav-link" href="#updates" onClick={() => setMenuOpen(false)}>Campus updates</a>
            <a className="ss-nav-link" href="#visit" onClick={() => setMenuOpen(false)}>Visit</a>
            <div className="ss-nav-actions">
              {offlineApp.canInstall && <button type="button" className="ss-btn ss-btn-quiet" onClick={() => { setMenuOpen(false); offlineApp.install(); }}>Install app</button>}
              {isAdmin && <button type="button" className="ss-btn ss-btn-quiet" onClick={() => { setMenuOpen(false); handleSignOut(); }}>Sign out</button>}
              {signedInUser || isAdmin
                ? <button type="button" className="ss-btn ss-btn-primary" onClick={openAccount}>{isAdmin ? "Admin panel" : "My Campus"}</button>
                : <button type="button" className="ss-btn ss-btn-primary" onClick={openLogin}>Sign in</button>}
            </div>
          </nav>
          <button type="button" className="ss-menu" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="ss-nav" aria-label={menuOpen ? "Close menu" : "Open menu"}>
            <Icon name={menuOpen ? "close" : "menu"} size={22} />
          </button>
        </div>
      </header>

      <main id="main">
        <section className="ss-hero" id="top" aria-labelledby="ss-hero-title">
          <div className="ss-container ss-hero-grid">
            <div className="ss-hero-copy">
              <p className="ss-overline" data-reveal style={{ "--delay": "0ms" }}>// Main Academic Building · Imus, Cavite</p>
              <h1 id="ss-hero-title" className="ss-display" data-reveal style={{ "--delay": "80ms" }}><span>Find any room</span> <span className="t-outline">at Saint Simon</span> <span className="t-stripe">of Cyrene Academy, Inc.</span></h1>
              <p className="ss-lead" data-reveal style={{ "--delay": "160ms" }}>Type a room or tap a place. We&apos;ll show you the way, step by step.</p>
              <form ref={searchForm} className={`ss-search ${whereError ? "has-error" : ""}`} onSubmit={submitWhere} role="search" data-reveal style={{ "--delay": "240ms" }}>
                <label htmlFor="ss-where">Where do you want to go?</label>
                {whereError && !whereSuggestions.length && <p id="ss-where-error" className="ss-field-error" role="alert">{whereError}</p>}
                <div className="ss-search-row" key={whereNudge}>
                  <input id="ss-where" list="ss-places" value={where} onChange={(event) => { setWhere(event.target.value); setWhereError(""); setWhereSuggestions([]); }} placeholder="Try: clinic, CR, 204, library" autoComplete="off" enterKeyHint="go" aria-describedby={whereError ? "ss-where-error" : undefined} aria-invalid={Boolean(whereError && !whereSuggestions.length)} />
                  <button type="submit" className="ss-btn ss-btn-primary">Show me the way</button>
                </div>
                <datalist id="ss-places">{mappedPlaces().map((item) => <option key={item.key} value={placeTitle(item)} />)}</datalist>
                {whereError && whereSuggestions.length > 0 && <p id="ss-where-error" className="ss-field-hint" role="status">{whereError}</p>}
                {whereSuggestions.length > 0 && <div className="ss-suggestions">
                  {whereSuggestions.map((key) => placeByKey(key)).map((item) => <button key={item.key} type="button" onClick={() => setMapState({ destination: item.key, floor: item.floor })}>
                    <b>{placeTitle(item)}</b><small>{planFloorLabel(item.floor)}</small>
                  </button>)}
                </div>}
              </form>
              <div className="ss-quick" data-reveal style={{ "--delay": "320ms" }}>
                <p id="ss-quick-label">Or tap a place:</p>
                <div className="ss-quick-grid" role="group" aria-labelledby="ss-quick-label">
                  {QUICK_PLACES.map((item) => <button key={item.label} type="button" className={`tone-${item.tone} ${item.exit ? "is-exit" : ""}`} onClick={() => goToPlace(item)}>
                    <span className="ss-quick-icon" aria-hidden="true"><Icon name={item.icon} size={24} /></span>
                    <span><b>{item.label}</b>{item.hint && <small>{item.hint}</small>}</span>
                  </button>)}
                </div>
              </div>
            </div>
            <CampusPhotos />
          </div>
          <div className="ss-container">
            <CampusFacts facts={[
              { label: "Floors mapped", value: FLOORS.length },
              { label: "Rooms & offices", value: mappedPlaces().length },
              { label: "Exits & fire stairs", value: exitCount() },
              { label: "Office hours", text: "Mon–Fri, 7 AM–5 PM" },
            ]} />
          </div>
        </section>

        <section className="ss-section ss-start" id="start" aria-labelledby="ss-start-title">
          <div className="ss-container">
            <div className="ss-section-head" data-reveal>
              <h2 id="ss-start-title" className="ss-display"><span>Finding your way</span> <span className="t-outline">is easy</span></h2>
              <p>Three steps, for everyone from Grade 1 to Grade 12, parents and visitors. You don&apos;t need an account.</p>
            </div>
            <ol className="ss-steps" data-reveal>
              <li className="tone-yellow"><span className="ss-step-number">1</span><span className="ss-step-icon" aria-hidden="true"><Icon name="location" size={28} /></span><h3>Pick a place</h3><p>Type a room like <b>204</b>, or tap a button like <b>Clinic</b>.</p></li>
              <li className="tone-lime"><span className="ss-step-number">2</span><span className="ss-step-icon" aria-hidden="true"><Icon name="route" size={28} /></span><h3>Follow the green line</h3><p>The map draws your path, floor by floor, and tells you which stairs to take.</p></li>
              <li className="tone-sky"><span className="ss-step-number">3</span><span className="ss-step-icon" aria-hidden="true"><Icon name="heart" size={28} /></span><h3>You&apos;re there!</h3><p>Look for the bouncing pin. Still lost? Ask SiBot or a teacher.</p></li>
            </ol>
            <aside className="ss-visitors" aria-labelledby="ss-visitors-title" data-reveal>
              <div className="ss-visitors-head">
                <span className="ss-step-icon" aria-hidden="true"><Icon name="info" size={26} /></span>
                <div><p className="kicker">For parents and visitors</p><h3 id="ss-visitors-title">First time here?</h3></div>
              </div>
              <ul>
                <li><b>Come in</b> through the main entrance of the Main Academic Building, on N.I.A. Road.</li>
                <li><b>Offices are open</b> Monday to Friday, 7:00 AM to 5:00 PM.</li>
                <li><b>In an emergency,</b> tap <b>Way out</b> and follow the line to the nearest exit.</li>
              </ul>
              <p className="ss-visitors-label">Show me the way to:</p>
              <div className="ss-visitors-actions">
                {QUICK_PLACES.filter((item) => ["Director's Office", "Guidance", "Clinic", "CR"].includes(item.label)).map((item) => <button key={item.label} type="button" className={`tone-${item.tone}`} onClick={() => goToPlace(item)}><Icon name={item.icon} size={18} /> {item.label}</button>)}
              </div>
            </aside>
          </div>
        </section>

        <section className="ss-section" id="explore" aria-labelledby="ss-explore-title">
          <div className="ss-container">
            <div className="ss-section-head" data-reveal>
              <h2 id="ss-explore-title" className="ss-display"><span>Three ways to</span> <span className="t-outline">find your way</span></h2>
              <p>Pick the way that&apos;s easiest for you. They all show the same rooms.</p>
            </div>
            <div className="ss-ways" data-reveal>
              <article className="ss-way" id="features">
                <span className="ss-way-icon" aria-hidden="true"><Icon name="cube" size={26} /></span>
                <h3>3D dollhouse</h3>
                <p>See the school in 3D. Tap a floor number to look inside, then open the map to get directions.</p>
                <div className="floor-selector">
                  <div className="floor-head">
                    <span>Floor</span>
                    <b>{planFloorLabel(floor)}</b>
                  </div>
                  <div className="floor-buttons" role="group" aria-label="Choose a floor" style={{ gridTemplateColumns: `repeat(${mainFloors().length}, minmax(0, 1fr))` }}>
                    {mainFloors().map((item) => <button key={item} type="button" className={floor === item ? "active" : ""} aria-pressed={floor === item} onClick={() => { setFloor(item); setView3d("inside"); }}>{floorShort(item)}</button>)}
                  </div>
                  <div className="va-segment home-3d-views" role="group" aria-label="3D view">
                    <button type="button" className={view3d === "outside" ? "active" : ""} aria-pressed={view3d === "outside"} onClick={() => setView3d("outside")}>Outside</button>
                    <button type="button" className={view3d === "inside" ? "active" : ""} aria-pressed={view3d === "inside"} onClick={() => setView3d("inside")}>Inside</button>
                  </div>
                  <Suspense fallback={<MiniPlan floor={floor} onOpen={() => setMapState({ floor })} />}>
                    <Dollhouse3D key={planVersion} blocked={homeBlocked} floor={floor} highlight={highlight3d} view={view3d} zoom onOpen={() => setMapState({ floor })} label={`3D model of the ${planFloorLabel(floor).toLowerCase()}`}
                      fallback={<MiniPlan floor={floor} onOpen={() => setMapState({ floor })} />} />
                    {highlight3d && placeByKey(highlight3d) && <p className="ss-3d-showing"><Icon name="location" size={16} /> Showing <b>{placeTitle(placeByKey(highlight3d))}</b> · {planFloorLabel(placeByKey(highlight3d).floor)}<button type="button" onClick={() => setHighlight3d(null)} aria-label="Stop showing this room">Clear</button></p>}
                  </Suspense>
                </div>
                <div className="dollhouse-actions">
                  <button type="button" className="dollhouse-route" onClick={() => setRoute3d({})}><Icon name="cube" size={16} /> Watch a route in 3D</button>
                  <button type="button" onClick={() => setMapState({ floor })}><Icon name="route" size={16} /> Open the 2D floor plan</button>
                </div>
              </article>
              <article className="ss-way">
                <span className="ss-way-icon" aria-hidden="true"><Icon name="scan" size={26} /></span>
                <h3>AR live view</h3>
                <p>Hold up your phone and follow the arrows on the floor all the way to your room.</p>
                <ArPreview />
                <div className="dollhouse-actions">
                  <button type="button" onClick={() => setArOpen(true)}><Icon name="scan" size={16} /> Start AR live view</button>
                </div>
                <p className="ar-app-note">Uses your phone&apos;s camera. Works best in Chrome on Android. No app to download: it runs right here in the browser.</p>
              </article>
              <article className="ss-way">
                <span className="ss-way-icon" aria-hidden="true"><Icon name="bot" size={26} /></span>
                <h3>Ask SiBot</h3>
                <p>Ask by typing or talking, like &ldquo;Where is the clinic?&rdquo; SiBot answers and shows you the way.</p>
                <ul className="ss-prompts">
                  {SIBOT_PROMPTS.map((prompt) => <li key={prompt}><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("sibot:ask", { detail: prompt }))}><span>{prompt}</span><Icon name="arrow" size={16} /></button></li>)}
                </ul>
              </article>
              <OfflinePanel offlineApp={offlineApp} />
            </div>
          </div>
        </section>

        <CampusUpdates onShowMap={(key) => setMapState({ destination: key, floor: placeByKey(key).floor })} />

        <section className="ss-section ss-visit" id="visit" aria-labelledby="ss-visit-title">
          <div className="ss-container">
            <div className="ss-section-head" data-reveal>
              <h2 id="ss-visit-title" className="ss-display"><span>How to</span> <span className="t-outline">get here</span></h2>
              <p>The school is on N.I.A. Road in Carsadang Bago II, Imus, Cavite. Get directions from wherever you are.</p>
            </div>
            <div className="ss-visit-grid" data-reveal>
              <div className="ss-map-frame">
                {offlineApp.online
                  ? <iframe title="Map showing Saint Simon of Cyrene Academy, Inc. in Imus, Cavite" src={MAP_EMBED_URL} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
                  : <p className="ss-map-offline">The street map needs internet. The school is on N.I.A. Road, Carsadang Bago II, Imus, Cavite.</p>}
              </div>
              <aside className="ss-visit-card" aria-label="Address and directions">
                <h3>Saint Simon of Cyrene Academy, Inc.</h3>
                <address>N.I.A. Road / 39 Reyes Compound<br />Carsadang Bago II, Imus, Cavite<br />Philippines</address>
                <dl>
                  <div><dt>Office hours</dt><dd>Monday to Friday, 7:00 AM to 5:00 PM</dd></div>
                  <div><dt>On campus</dt><dd>Use the floor plan above to find a room once you arrive.</dd></div>
                </dl>
                <div className="ss-visit-actions">
                  <a className="ss-btn ss-btn-primary" href={MAP_DIRECTIONS_URL} target="_blank" rel="noreferrer"><Icon name="route" size={18} /> Get directions</a>
                  <a className="ss-btn ss-btn-quiet" href={MAP_OPEN_URL} target="_blank" rel="noreferrer">Open in Google Maps</a>
                </div>
                <p className="ss-visit-note">Opens Google Maps in a new tab. Directions start from your current location.</p>
              </aside>
            </div>
          </div>
        </section>

        <section className="ss-emergency" aria-labelledby="ss-emergency-title">
          <div className="ss-container ss-emergency-inner" data-reveal>
            <div>
              <h2 id="ss-emergency-title" className="ss-display"><span>In an</span> <span className="t-stripe">emergency</span></h2>
              <p>Stay calm and follow your teacher and school staff. The floor plan shows the closest exit or fire stairs from any room, and you don&apos;t need to sign in.</p>
            </div>
            <button type="button" className="ss-btn ss-btn-danger" onClick={() => setMapState({ emergency: true })}><Icon name="alert" size={18} /> Show the nearest exit</button>
          </div>
        </section>
      </main>

      <footer className="ss-footer">
        <div className="ss-container ss-footer-grid" data-reveal>
          <div className="ss-footer-school" id="about">
            <a className="ss-brand" href="#top"><img src={asset("logologooo.jpg")} alt="" width="44" height="44" /><span><b>Saint Simon of Cyrene Academy, Inc.</b><small>Since 2006</small></span></a>
            <p>A private, non-stock, non-profit school in Imus, Cavite, teaching learners from nursery through senior high school.</p>
            <p className="ss-offline-tip"><b>No Wi-Fi at school?</b> Open SSCAI NAVI once with internet and the floor plans, directions and AR keep working offline.{offlineApp.canInstall && <> <button type="button" onClick={offlineApp.install}>Install the app</button></>}{offlineApp.iosInstallTip && " On iPhone, tap Share, then Add to Home Screen."}</p>
          </div>
          <div>
            <h2>Visit</h2>
            <address>N.I.A. Road / 39 Reyes Compound<br />Carsadang Bago II, Imus, Cavite</address>
          </div>
          <div>
            <h2>Office hours</h2>
            <p>Monday to Friday<br />7:00 AM to 5:00 PM</p>
          </div>
          <div>
            <h2>Follow the school</h2>
            <ul className="ss-social">
              <li><a className="ss-social-fb" href="https://www.facebook.com/SSCAIPH" target="_blank" rel="noreferrer"><span className="ss-social-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13.4 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2v2.2H7.6V13h2.7v8h3.1Z" /></svg></span>Facebook</a></li>
              <li><a className="ss-social-yt" href="https://www.youtube.com/@saintsimonofcyreneacademyinc" target="_blank" rel="noreferrer"><span className="ss-social-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9.6 8.2v7.6l6.6-3.8Z" /></svg></span>YouTube</a></li>
            </ul>
          </div>
        </div>
        <div className="ss-container ss-footer-bottom">
          <span>© 2026 Saint Simon of Cyrene Academy, Inc.</span>
          <span className="ss-footer-links"><button type="button" className="ss-footer-feedback" onClick={() => openFeedback()}>Send feedback</button> <a href="#privacy">Privacy Policy</a> <a href="#terms">Terms of Use</a> <a href="#top">Back to top</a></span>
        </div>
      </footer>
      {!accountOpen && !loginOpen && !mapState && !arOpen && !route3d && <SiiBot onSignIn={openLogin} onSignOut={handleSignOut} onOpenAccount={openAccount} alreadySignedIn={Boolean(signedInUser)} onNavigate={navigateTo} onOpenMap={setMapState} />}
      <AppStatus online={offlineApp.online} updateReady={offlineApp.updateReady} onUpdate={offlineApp.applyUpdate} />
      <InstallPrompt offlineApp={offlineApp} hidden={Boolean(noticeOpen || route3d || mapState || arOpen || loginOpen || accountOpen || createAccountOpen || adminLoginOpen || adminView || offlineApp.updateReady)} />
      {noticeOpen && !mapState && !arOpen && !adminView && <PrivacyNotice onDone={() => setNoticeOpen(false)} />}
      <AnnouncementPopup hidden={Boolean(noticeOpen || route3d || mapState || arOpen || loginOpen || accountOpen || createAccountOpen || adminLoginOpen || adminView)} />
      <PolicyDialog />
      {feedbackStart && <FeedbackDialog user={signedInUser} role={feedbackRole(role)} start={feedbackStart} onClose={() => setFeedbackStart(null)} />}
      <Suspense fallback={<ScreenLoading />}>
      {arOpen && <ArLiveView onClose={() => setArOpen(false)} initialStart={arOpen.start || ""} initialDestination={arOpen.end || ""} />}
      {route3d && <Route3DView start={route3d.start} end={route3d.end} onClose={() => setRoute3d(null)} onOpenMap={(key, mapFloor) => { setRoute3d(null); setMapState({ destination: key, floor: mapFloor }); }} />}
      {mapState && <CampusMap onClose={() => setMapState(null)} initialFloor={mapState.floor || 2} initialDestination={mapState.destination || null} initialEmergency={Boolean(mapState.emergency)} initialStart={mapState.start || null} />}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onCreate={openCreateAccount} onSignedIn={(user) => { setSignedInUser(user); setLoginOpen(false); if (ADMIN_EMAIL && String(user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) { setRole("admin"); roleRef.current = "admin"; } openAccount(); }} onAdminSignedIn={(user) => { setLoginOpen(false); setSignedInUser(user); setRole("admin"); setAdminView("content"); }} />}
      {accountOpen && signedInUser && !isAdmin && <MyCampus
        user={signedInUser}
        onClose={() => setAccountOpen(false)}
        onSignOut={handleSignOut}
        onOpenRoute={(how, from, to) => {
          setAccountOpen(false);
          if (how === "3d") setRoute3d({ start: from, end: to });
          else if (how === "ar") setArOpen({ start: from, end: to });
          else setMapState({ start: from, destination: to, floor: placeByKey(to)?.floor || 2 });
        }}
        onShowMap={(place) => { setAccountOpen(false); setMapState({ destination: place?.mapKey || findPlaceKey(place?.room, place?.name), floor: place?.floor }); }}
        onShow3D={(place) => {
          setAccountOpen(false);
          setView3d("inside");
          setFloor(place.floor);
          setHighlight3d(place.mapKey);
          setTimeout(() => document.querySelector(".ss-dollhouse")?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
        }}
        renderAssistant={(prefs) => <SiiBot onSignIn={() => {}} onSignOut={handleSignOut} onOpenAccount={() => {}} alreadySignedIn speakAnswers={prefs.speakAnswers} onNavigate={(sectionId) => { setAccountOpen(false); window.setTimeout(() => navigateTo(sectionId), 50); }} onOpenMap={(state) => { setAccountOpen(false); setMapState(state); }} />}
      />}
      {createAccountOpen && <CreateAccountModal onClose={() => setCreateAccountOpen(false)} onCreated={(user) => { setSignedInUser(user); setCreateAccountOpen(false); setAccountOpen(true); }} />}
      {adminLoginOpen && <AdminLogin onClose={() => setAdminLoginOpen(false)} onSuccess={(user) => { setAdminLoginOpen(false); setLoginOpen(false); setSignedInUser(user); setRole("admin"); setAdminView("content"); }} />}
      {isAdmin && adminView === "analytics" && <AdminAnalytics onClose={() => setAdminView(null)} onOpenContent={() => setAdminView("content")} onOpenSignIns={() => setAdminView("signins")} onOpenFeedback={() => setAdminView("feedback")} onOpenLog={() => setAdminView("log")} />}
      {isAdmin && adminView === "feedback" && <AdminFeedback onClose={() => setAdminView(null)} onOpenContent={() => setAdminView("content")} onOpenVisits={() => setAdminView("analytics")} onOpenSignIns={() => setAdminView("signins")} onOpenLog={() => setAdminView("log")} />}
      {isAdmin && adminView === "log" && <AdminChangeLog onClose={() => setAdminView(null)} onOpenContent={() => setAdminView("content")} onOpenVisits={() => setAdminView("analytics")} onOpenSignIns={() => setAdminView("signins")} onOpenFeedback={() => setAdminView("feedback")} />}
      {isAdmin && adminView === "signins" && <AdminSignIns onClose={() => setAdminView(null)} onOpenContent={() => setAdminView("content")} onOpenVisits={() => setAdminView("analytics")} />}
      {isAdmin && adminView === "content" && <AdminCms onClose={() => setAdminView(null)} onSignOut={handleSignOut} onOpenAnalytics={() => setAdminView("analytics")} onOpenSignIns={() => setAdminView("signins")} onOpenFeedback={() => setAdminView("feedback")} onOpenLog={() => setAdminView("log")} />}
      </Suspense>
    </div>
  );
}
