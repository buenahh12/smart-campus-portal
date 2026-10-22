import { useEffect, useRef, useState } from "react";
import {
  createCampusAccount,
  finishGoogleRedirect,
  loginAsAdmin,
  loginWithEmail,
  loginWithGoogle,
  logoutUser,
  requestPasswordReset,
} from "./firebase";
import Icon from "./Icon";
import AdminCms from "./AdminCms";
import CampusUpdates, { usePublicCollection } from "./CampusUpdates";
import { CMS_COLLECTIONS, USER_ROLES, isClosureActive, recordSignIn, recordVisit, todayKey, watchSession } from "./cms";
import AdminAnalytics from "./AdminAnalytics";
import AdminSignIns from "./AdminSignIns";
import { usePlanVersion } from "./usePlan";
import MyCampus from "./MyCampus";
import CampusMap from "./CampusMap";
import { FLOORS, PLACES, findPlaceKey, placeByKey, placeTitle, floorLabel as planFloorLabel } from "./floorPlans";

// Public files live under the site base path (GitHub Pages serves the app from a sub-folder).
const asset = (file) => `${import.meta.env.BASE_URL}${file}`;
// Read on each render: staff can rename rooms at any time (see usePlan.js).
const mappedPlaces = () => PLACES.filter((item) => item.type !== "exit" && item.type !== "stairs" && !item.unlabeled);
const EXIT_COUNT = PLACES.filter((item) => item.type === "exit").length;
const QUICK_PLACES = ["2:clinic", "2:guidance", "3:library-hs", "2:computer-room", "4:room-403"];
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

// Fades sections in as they scroll into view; everything shows at once when reduced motion is on.
function useReveal() {
  useEffect(() => {
    const items = [...document.querySelectorAll("[data-reveal]")];
    const show = (element) => element.classList.add("is-visible");
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach(show);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        show(entry.target);
        observer.unobserve(entry.target);
      }
    }), { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
}

function LoginModal({ onClose, onCreate, onAdmin, onSignedIn = () => {} }) {
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
    setEmailSigningIn(true);
    try {
      const credential = await loginWithEmail({ email: loginEmail, password: loginPassword });
      onSignedIn(credential.user);
    } catch (signInError) {
      setError(signInError.code === "auth/invalid-credential" || signInError.code === "auth/user-not-found" || signInError.code === "auth/wrong-password"
        ? "Email or password is incorrect. Check both and try again."
        : signInError.code === "auth/too-many-requests"
          ? "Too many sign-in attempts. Wait a little and try again, or reset your password."
          : signInError.code === "auth/invalid-email"
            ? "Enter a valid email address."
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
      setError(
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
      setError(resetError.code === "auth/invalid-email"
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
          aria-label="Close portal access"
        >
          <Icon name="close" />
        </button>
        <div className="modal-mark">
          <Icon name="building" size={26} />
        </div>
        <p className="kicker">SECURE ACCESS</p>
        <h2 id="login-title">{resetMode ? "Reset your password" : "Access Campus Portal"}</h2>
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
            <button className="google-button" onClick={handleGoogleSignIn} disabled={signingIn}>
              {signingIn ? "Opening Google sign-in..." : "Sign in with Google Account"}
            </button>
            <div className="divider"><span>OR USE EMAIL</span></div>
            <form className="email-login-form" onSubmit={handleEmailSignIn}>
              <label>Email address<input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} autoComplete="username" placeholder="you@example.com" required /></label>
              <label>Password<div className="password-field"><input type={showLoginPassword ? "text" : "password"} value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" placeholder="Your password" required /><button type="button" className="password-visibility" onClick={() => setShowLoginPassword((visible) => !visible)} aria-label={showLoginPassword ? "Hide password" : "Show password"}><Icon name={showLoginPassword ? "eyeOff" : "eye"} size={18} /></button></div></label>
              <button className="password-reset-inline" type="button" onClick={() => { setResetEmail(loginEmail); setResetMode(true); setError(""); setResetSent(false); }}>Forgot password?</button>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="visitor-button" type="submit" disabled={emailSigningIn}>{emailSigningIn ? "Signing in..." : "Sign in with email"}</button>
            </form>
            <button className="create-account-link" onClick={onCreate}>Create a new campus account</button>
            <button className="staff-access-link" onClick={onAdmin}>Staff / administrator access</button>
            <p className="auth-security-note"><Icon name="shield" size={15} /> Sign-in is handled by Firebase. Your password is not shared with Google.</p>
            <p className="auth-security-note"><Icon name="info" size={15} /> When you sign in, the school can see your account email, how you signed in, and your device type and browser.</p>
            <p className="terms">By continuing, you agree to the campus portal&apos;s <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
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
    if (!["name", "email", "role", "password", "confirmPassword"].every((field) => form[field])) {
      setError("Complete every field before creating your account.");
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
      const user = await createCampusAccount(form);
      onCreated(user);
    } catch (createError) {
      setError(createError.code === "auth/email-already-in-use"
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
          <input name="name" value={form.name} onChange={updateField} placeholder="Full name" autoComplete="name" />
          <input name="email" type="email" value={form.email} onChange={updateField} placeholder="Email address" autoComplete="email" />
          <select name="role" value={form.role} onChange={updateField} aria-label="I am a"><option value="">I am a…</option>{USER_ROLES.map((item) => <option key={item}>{item}</option>)}</select>
          <div className="password-field"><input name="password" type={showPassword ? "text" : "password"} value={form.password} onChange={updateField} placeholder="Password (12+ characters)" autoComplete="new-password" aria-describedby="password-strength" /><button type="button" className="password-visibility" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name={showPassword ? "eyeOff" : "eye"} size={18} /></button></div>
          {passwordStrength && <div className={`password-strength ${passwordStrength.toLowerCase()}`} id="password-strength" aria-live="polite"><div className="strength-meter"><i /><i /><i /></div><span>Password strength: <b>{passwordStrength}</b></span></div>}
          <div className="password-field"><input name="confirmPassword" type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} onChange={updateField} placeholder="Confirm password" autoComplete="new-password" /><button type="button" className="password-visibility" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}><Icon name={showConfirmPassword ? "eyeOff" : "eye"} size={18} /></button></div>
        </div>
        <label className="email-updates-check"><input type="checkbox" checked={form.emailUpdates} onChange={(event) => setForm((current) => ({ ...current, emailUpdates: event.target.checked }))} /><span>Email me new school announcements and closed hallways. You can turn this off anytime in My Campus.</span></label>
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
    const adminUsername = import.meta.env.VITE_ADMIN_USERNAME || "admin1";
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    if (username.trim().toLowerCase() !== adminUsername.toLowerCase()) {
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
      setError(loginError.code === "auth/invalid-credential" ? "The administrator username or password is incorrect." : loginError.message || "Staff sign-in failed.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="admin-login-title"><form className="login-modal admin-login" onSubmit={submit}><button type="button" className="modal-close" onClick={onClose} aria-label="Close admin login"><Icon name="close" /></button><div className="modal-mark"><Icon name="shield" size={26} /></div><p className="kicker">RESTRICTED STAFF ACCESS</p><h2 id="admin-login-title">Administrator sign in</h2><p className="modal-copy">Sign in with the administrator username and password.</p><input className="admin-password" type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" autoComplete="username" required autoFocus /><input className="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete="current-password" required />{error && <p className="auth-error" role="alert">{error}</p>}<button className="visitor-button" type="submit" disabled={busy}>{busy ? "Verifying admin access..." : "Sign in to admin"}</button><p className="terms">Admin access is verified by Firebase authorization.</p></form></div>;
}

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
    const planPlace = placeByKey(findPlaceKey(normalized));
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
        answer = "Choose Sign In / Portal Access in the top menu. I’ll open it for you now.";
        onSignIn?.();
      }
    } else if (hasAny(["ar live", "ar view", "augmented reality", "camera guide", "live view"])) {
      answer = "AR Live View is in Explore the Platform. Open it for a visual walkthrough with directions and room distance.";
      onNavigate("features");
    } else if (hasAny(["emergency", "fire exit", "nearest exit", "safest route", "evacuate", "safety route", "earthquake", "way out"])) {
      answer = "I’m showing the nearest exit on the floor plan. In a real emergency, stay calm and follow your teacher and school staff first.";
      onOpenMap?.({ emergency: true });
    } else if (planPlace && hasAny(["where", "take me", "go to", "find", "how do i get", "directions", "room", "office", "clinic", "library", "guidance", "laboratory", "lab"])) {
      answer = `${placeTitle(planPlace)} is on the ${planFloorLabel(planPlace.floor).toLowerCase()} of the Main Academic Building. I’ve opened the floor plan with directions.`;
      onOpenMap?.({ destination: planPlace.key, floor: planPlace.floor });
    } else if (hasAny(["2d", "floor plan", "floor map", "directions", "navigate"])) {
      answer = "Opening the 2D floor plan. Tap any room to get directions, or use Route to the nearest exit.";
      onOpenMap?.({});
    } else if (hasAny(["3d", "dollhouse", "building map", "campus map"])) {
      answer = "The 3D campus map is in Explore the Platform. Choose a floor to look around the campus buildings.";
      onNavigate("features");
    } else if (hasAny(["address", "where is the school", "school located", "where are you located", "campus location", "location of the school", "directions to the school", "how do i get to school"])) {
      answer = "Saint Simon of Cyrene Academy is at N.I.A. Road / 39 Reyes Compound, Carsadang Bago II, Imus, Cavite, Philippines. I've scrolled to the map so you can get directions.";
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
    } else if (hasAny(["who is saint simon", "tell me about the school", "about the school", "what is this school", "what does sscai mean", "what kind of school"])) {
      answer = "Saint Simon of Cyrene Academy, Inc. (SSCAI) is a private, non-stock, non-profit school in Imus, Cavite. It provides basic education from early childhood through Senior High School and is recognized by the DepEd Division of City of Imus.";
      onNavigate("about");
    } else {
      answer = "I don’t have that answer in my school information yet. I can help with the school overview, address and hours, grade levels, student groups, subjects, enrollment, contact links, finding rooms and offices, closed hallways, and the campus map. For other details, please ask a teacher or the school office.";
    }
    const timestamp = Date.now();
    setMessages((current) => [...current,
      { id: `${timestamp}-question-${Math.random()}`, role: "user", text },
      { id: `${timestamp}-answer-${Math.random()}`, role: "assistant", text: answer },
    ]);
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
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [floor, setFloor] = useState(2);
  const [mapState, setMapState] = useState(null);
  const [where, setWhere] = useState("");
  const [whereError, setWhereError] = useState("");
  const [scrolled, setScrolled] = useState(false);
  useReveal();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  usePlanVersion(); // re-render when staff rename a room on the floor plan
  const [signedInUser, setSignedInUser] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [role, setRole] = useState("guest");
  const [adminView, setAdminView] = useState(null);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const isAdmin = role === "admin";
  const openLogin = () => {
    setMenuOpen(false);
    setLoginOpen(true);
  };
  const openCreateAccount = () => {
    setLoginOpen(false);
    setCreateAccountOpen(true);
  };
  const openAdminLogin = () => setAdminLoginOpen(true);
  const navigateTo = (sectionId) => document.querySelector(`#${sectionId}`)?.scrollIntoView({ behavior: "smooth" });

  const submitWhere = (event) => {
    event.preventDefault();
    const query = where.trim();
    if (!query) {
      setWhereError("Type a room number or name, for example Room 204 or Clinic.");
      return;
    }
    const lower = query.toLowerCase();
    const exact = mappedPlaces().find((item) => [placeTitle(item), item.name, item.code].some((value) => value && value.toLowerCase() === lower));
    const key = exact?.key || findPlaceKey(query);
    if (!key) {
      setWhereError(`No room called “${query}” is on the floor plan yet. Try a room number such as 204, or pick from the list.`);
      return;
    }
    setMapState({ destination: key, floor: placeByKey(key).floor });
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
    if (nextRole !== "admin") setAdminView(null);
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
            <span><b>Saint Simon of Cyrene Academy</b><small>Campus Portal</small></span>
          </a>
          <nav id="ss-nav" className={`ss-nav ${menuOpen ? "open" : ""}`} aria-label="Main">
            <button type="button" className="ss-nav-link" onClick={() => { setMenuOpen(false); setMapState({ floor: 2 }); }}>Floor plan</button>
            <a className="ss-nav-link" href="#explore" onClick={() => setMenuOpen(false)}>3D &amp; AR</a>
            <a className="ss-nav-link" href="#updates" onClick={() => setMenuOpen(false)}>Campus updates</a>
            <a className="ss-nav-link" href="#visit" onClick={() => setMenuOpen(false)}>Visit</a>
            <div className="ss-nav-actions">
              {isAdmin && <button type="button" className="ss-btn ss-btn-quiet" onClick={() => { setMenuOpen(false); setAdminView("content"); }}>Admin</button>}
              {signedInUser
                ? <button type="button" className="ss-btn ss-btn-primary" onClick={() => { setMenuOpen(false); setAccountOpen(true); }}>My Campus</button>
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
              <h1 id="ss-hero-title" className="ss-display" data-reveal style={{ "--delay": "80ms" }}><span>Find any room</span> <span className="t-outline">at Saint Simon</span> <span className="t-stripe">of Cyrene Academy</span></h1>
              <p className="ss-lead" data-reveal style={{ "--delay": "160ms" }}>Search for a classroom, office, or lab and get step-by-step directions across all four floors, including the nearest way out.</p>
              <form className={`ss-search ${whereError ? "has-error" : ""}`} onSubmit={submitWhere} role="search" data-reveal style={{ "--delay": "240ms" }}>
                <label htmlFor="ss-where">Where do you need to go?</label>
                <div className="ss-search-row">
                  <input id="ss-where" list="ss-places" value={where} onChange={(event) => { setWhere(event.target.value); setWhereError(""); }} placeholder="Room 204, Clinic, Computer Room…" autoComplete="off" aria-describedby={whereError ? "ss-where-error" : undefined} aria-invalid={Boolean(whereError)} />
                  <button type="submit" className="ss-btn ss-btn-primary">Get directions</button>
                </div>
                <datalist id="ss-places">{mappedPlaces().map((item) => <option key={item.key} value={placeTitle(item)} />)}</datalist>
                {whereError && <p id="ss-where-error" className="ss-field-error" role="alert">{whereError}</p>}
              </form>
              <div className="ss-quick" aria-label="Common places" data-reveal style={{ "--delay": "320ms" }}>
                <span>Often searched:</span>
                {QUICK_PLACES.map((key) => placeByKey(key)).filter(Boolean).map((item) => <button key={item.key} type="button" onClick={() => setMapState({ destination: item.key, floor: item.floor })}>{item.code && item.code !== item.name ? item.code : item.name}</button>)}
              </div>
            </div>
            <figure className="ss-hero-figure" data-reveal style={{ "--delay": "200ms" }}>
              <img src={asset("campus.jpg")} alt="Illustration of the Saint Simon of Cyrene Academy main building" width="1192" height="896" decoding="async" />
              <figcaption>Main Academic Building, Carsadang Bago II</figcaption>
            </figure>
          </div>
          <div className="ss-container">
            <dl className="ss-facts" data-reveal style={{ "--delay": "120ms" }}>
              <div><dt>Floors mapped</dt><dd>4</dd></div>
              <div><dt>Rooms &amp; offices</dt><dd>{mappedPlaces().length}</dd></div>
              <div><dt>Exits &amp; fire stairs</dt><dd>{EXIT_COUNT}</dd></div>
              <div><dt>Office hours</dt><dd className="ss-facts-text">Mon–Fri, 7 AM–5 PM</dd></div>
            </dl>
          </div>
        </section>

        <section className="ss-section" id="explore" aria-labelledby="ss-explore-title">
          <div className="ss-container">
            <div className="ss-section-head" data-reveal>
              <h2 id="ss-explore-title" className="ss-display"><span>Three ways to</span> <span className="t-outline">find your way</span></h2>
              <p>Use the plan you&apos;re most comfortable with. They all share the same room list, so directions match.</p>
            </div>
            <div className="ss-ways" data-reveal>
              <article className="ss-way" id="features">
                <span className="ss-way-icon" aria-hidden="true"><Icon name="cube" size={26} /></span>
                <h3>3D dollhouse</h3>
                <p>Look at the building one floor at a time, then open the flat floor plan for turn-by-turn directions.</p>
                <div className="floor-selector">
                  <div className="floor-head">
                    <span>Floor</span>
                    <b>{planFloorLabel(floor)}</b>
                  </div>
                  <div className="floor-buttons" role="group" aria-label="Choose a floor">
                    {[1, 2, 3, 4].map((item) => <button key={item} type="button" className={floor === item ? "active" : ""} aria-pressed={floor === item} onClick={() => setFloor(item)}>{item === 1 ? "G" : item}</button>)}
                  </div>
                  <MiniPlan floor={floor} onOpen={() => setMapState({ floor })} />
                </div>
                <div className="dollhouse-actions">
                  <button type="button" onClick={() => setMapState({ floor })}><Icon name="route" size={16} /> Open the 2D floor plan</button>
                </div>
              </article>
              <article className="ss-way">
                <span className="ss-way-icon" aria-hidden="true"><Icon name="scan" size={26} /></span>
                <h3>AR live view <span className="ss-tag">Preview</span></h3>
                <p>Point your phone down a hallway and follow arrows to the room, with the distance left to walk.</p>
                <div className="ar-preview" aria-hidden="true">
                  <div className="corridor"><i /><i /><i /></div>
                  <div className="ar-header"><span>AR</span><b>Room 204 · 38 m</b></div>
                  <div className="ar-arrow">↑</div>
                  <div className="ar-bottom"><span><Icon name="route" size={14} /> Continue straight</span><small>about 1 min</small></div>
                </div>
              </article>
              <article className="ss-way">
                <span className="ss-way-icon" aria-hidden="true"><Icon name="bot" size={26} /></span>
                <h3>Ask SiBot</h3>
                <p>Type or say what you need. SiBot answers common school questions and opens the floor plan for you.</p>
                <ul className="ss-prompts">
                  {SIBOT_PROMPTS.map((prompt) => <li key={prompt}><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("sibot:ask", { detail: prompt }))}><span>{prompt}</span><Icon name="arrow" size={16} /></button></li>)}
                </ul>
              </article>
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
                <iframe title="Map showing Saint Simon of Cyrene Academy in Imus, Cavite" src={MAP_EMBED_URL} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
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
          <a href="#top">Back to top</a>
        </div>
      </footer>
      {!accountOpen && !loginOpen && !mapState && <SiiBot onSignIn={openLogin} onSignOut={handleSignOut} onOpenAccount={() => setAccountOpen(true)} alreadySignedIn={Boolean(signedInUser)} onNavigate={navigateTo} onOpenMap={setMapState} />}
      {mapState && <CampusMap onClose={() => setMapState(null)} initialFloor={mapState.floor || 2} initialDestination={mapState.destination || null} initialEmergency={Boolean(mapState.emergency)} />}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onCreate={openCreateAccount} onAdmin={openAdminLogin} onSignedIn={(user) => { setSignedInUser(user); setLoginOpen(false); setAccountOpen(true); }} />}
      {accountOpen && signedInUser && <MyCampus
        user={signedInUser}
        onClose={() => setAccountOpen(false)}
        onSignOut={handleSignOut}
        onShowMap={(place) => { setAccountOpen(false); setMapState({ destination: findPlaceKey(place?.room, place?.name), floor: place?.floor }); }}
        renderAssistant={(prefs) => <SiiBot onSignIn={() => {}} onSignOut={handleSignOut} onOpenAccount={() => {}} alreadySignedIn speakAnswers={prefs.speakAnswers} onNavigate={(sectionId) => { setAccountOpen(false); window.setTimeout(() => navigateTo(sectionId), 50); }} onOpenMap={(state) => { setAccountOpen(false); setMapState(state); }} />}
      />}
      {createAccountOpen && <CreateAccountModal onClose={() => setCreateAccountOpen(false)} onCreated={(user) => { setSignedInUser(user); setCreateAccountOpen(false); setAccountOpen(true); }} />}
      {adminLoginOpen && <AdminLogin onClose={() => setAdminLoginOpen(false)} onSuccess={(user) => { setAdminLoginOpen(false); setLoginOpen(false); setSignedInUser(user); setRole("admin"); setAdminView("content"); }} />}
      {isAdmin && adminView === "analytics" && <AdminAnalytics onClose={() => setAdminView(null)} onOpenContent={() => setAdminView("content")} onOpenSignIns={() => setAdminView("signins")} />}
      {isAdmin && adminView === "signins" && <AdminSignIns onClose={() => setAdminView(null)} onOpenContent={() => setAdminView("content")} onOpenVisits={() => setAdminView("analytics")} />}
      {isAdmin && adminView === "content" && <AdminCms onClose={() => setAdminView(null)} onOpenAnalytics={() => setAdminView("analytics")} onOpenSignIns={() => setAdminView("signins")} />}
    </div>
  );
}
