import { useEffect, useRef, useState } from "react";
import {
  createCampusAccount,
  finishGoogleRedirect,
  loginAsAdmin,
  loginWithGoogle,
  logoutUser,
} from "./firebase";

function Icon({ name, size = 20 }) {
  const paths = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    building: (
      <path d="M4 21V5l8-3 8 3v16M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M2 21h20" />
    ),
    bot: (
      <path d="M8 9h8a4 4 0 0 1 4 4v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4a4 4 0 0 1 4-4Zm4-6v3m-5 7h.01m10 0h.01M8 16h8" />
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    cube: <path d="m12 2 9 5-9 5-9-5 9-5Zm9 5v10l-9 5-9-5V7m9 5v10" />,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8" /></>,
    location: (
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    mic: (
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3m-4 0h8" />
    ),
    route: (
      <path d="M5 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 15c5 0 4-6 9-6" />
    ),
    scan: <path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5M8 12h8" />,
    shield: (
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Zm-3-10 2 2 4-5" />
    ),
    sparkle: (
      <path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2L12 3Zm6 11 .6 2.4L21 17l-2.4.6L18 20l-.6-2.4L15 17l2.4-.6L18 14Z" />
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function LoginModal({ onClose, onCreate, onAdmin, onSignedIn = () => {} }) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [authenticatedUser, setAuthenticatedUser] = useState(null);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setError("");
    try {
      const result = await loginWithGoogle();
      setAuthenticatedUser(result.user);
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

  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (authenticatedUser) {
    return (
      <AccountPanel
        user={authenticatedUser}
        onClose={onClose}
        onSignOut={() => {
          setAuthenticatedUser(null);
          logoutUser();
        }}
      />
    );
  }

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
        <h2 id="login-title">Access Campus Portal</h2>
        <p className="modal-copy">
          Sign in to access personalized routes, saved locations, and campus
          services.
        </p>
        <button
          className="google-button"
          onClick={handleGoogleSignIn}
          disabled={signingIn}
        >
          {signingIn
            ? "Opening Google sign-in..."
            : "Sign in with Google Account"}
        </button>
        <button className="create-account-link" onClick={onCreate}>
          Create a new campus account
        </button>
        <button className="staff-access-link" onClick={onAdmin}>Staff / administrator access</button>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <div className="divider">
          <span>OR</span>
        </div>
        <button className="visitor-button" onClick={onClose}>
          Continue as Visitor <Icon name="arrow" size={18} />
        </button>
        <p className="visitor-note">
          <Icon name="shield" size={15} /> Visitors have access to public floor
          plans and emergency exit routes.
        </p>
        <p className="terms">
          By continuing, you agree to the campus portal's{" "}
          <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

function CreateAccountModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    year: "",
    section: "",
    contact: "",
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
    if (!Object.values(form).every(Boolean)) {
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
        <p className="modal-copy">Use your email and a strong password to save routes and campus preferences.</p>
        <div className="account-fields">
          <input name="name" value={form.name} onChange={updateField} placeholder="Full name" autoComplete="name" />
          <input name="email" type="email" value={form.email} onChange={updateField} placeholder="Email address" autoComplete="email" />
          <select name="year" value={form.year} onChange={updateField}><option value="">Year level</option><option>First Year</option><option>Second Year</option><option>Third Year</option><option>Fourth Year</option><option>Faculty / Staff</option></select>
          <input name="section" value={form.section} onChange={updateField} placeholder="Section" />
          <input name="contact" type="tel" value={form.contact} onChange={updateField} placeholder="Contact number" autoComplete="tel" />
          <div className="password-field"><input name="password" type={showPassword ? "text" : "password"} value={form.password} onChange={updateField} placeholder="Password (12+ characters)" autoComplete="new-password" aria-describedby="password-strength" /><button type="button" className="password-visibility" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name={showPassword ? "eyeOff" : "eye"} size={18} /></button></div>
          {passwordStrength && <div className={`password-strength ${passwordStrength.toLowerCase()}`} id="password-strength" aria-live="polite"><div className="strength-meter"><i /><i /><i /></div><span>Password strength: <b>{passwordStrength}</b></span></div>}
          <div className="password-field"><input name="confirmPassword" type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} onChange={updateField} placeholder="Confirm password" autoComplete="new-password" /><button type="button" className="password-visibility" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}><Icon name={showConfirmPassword ? "eyeOff" : "eye"} size={18} /></button></div>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="visitor-button" type="submit" disabled={saving}>{saving ? "Creating account..." : "Create account"}</button>
        <p className="terms password-policy">Password policy: at least 12 characters, including uppercase and lowercase letters, a number, and a symbol.</p>
      </form>
    </div>
  );
}

function AccountPanel({ user, onClose, onSignOut }) {
  const [month, setMonth] = useState(() => new Date());
  const [online, setOnline] = useState(navigator.onLine);
  const profile = JSON.parse(localStorage.getItem(`campus-profile:${user.uid}`) || "{}");
  const firstName = (user.displayName || profile.name || "Student").split(" ")[0];
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const calendarDays = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, index) => index + 1);
  const storedAttendance = JSON.parse(localStorage.getItem(`campus-student-attendance:${user.uid}`) || "{}");
  const todayKey = new Date().toLocaleDateString("en-CA");
  const checkIn = storedAttendance[todayKey];
  const todaySchedule = [
    { start: "7:30 AM", end: "8:20 AM", subject: "Homeroom", room: "Room 101", teacher: "Adviser" },
    { start: "8:20 AM", end: "9:10 AM", subject: "Mathematics", room: "Room 204", teacher: "Teacher assignment pending" },
    { start: "9:30 AM", end: "10:20 AM", subject: "English", room: "Room 206", teacher: "Teacher assignment pending" },
    { start: "10:20 AM", end: "11:10 AM", subject: "Science", room: "Room 301", teacher: "Teacher assignment pending" },
  ];
  const announcements = [
    { title: "Welcome to your student portal", date: "Portal update", text: "Check this feed for school notices and event announcements." },
    { title: "Schedule information", date: "Action needed", text: "Your official class schedule and teacher details will appear when published by the school." },
  ];
  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);
  const findClass = () => {
    onClose();
    window.setTimeout(() => document.querySelector("#features")?.scrollIntoView({ behavior: "smooth" }), 50);
  };
  return (
    <div className="student-portal-shell" role="dialog" aria-modal="true" aria-labelledby="student-portal-title">
      <header className="student-portal-header"><a className="student-portal-brand" href="#about"><span className="brand-mark" /><span><b>SAINT SIMON OF CYRENE</b><small>STUDENT PORTAL</small></span></a><div className="student-header-tools"><span className={`connectivity-pill ${online ? "online" : "offline"}`}><i />{online ? "Internet connected · School Wi-Fi unverified" : "Offline · School Wi-Fi unverified"}</span><button className="student-close" onClick={onClose} aria-label="Close student portal"><Icon name="close" /></button></div></header>
      <main className="student-dashboard"><section className="student-welcome"><div><p className="kicker">PERSONAL CAMPUS DASHBOARD</p><h1 id="student-portal-title">Hello, {firstName}</h1><p>Your school day, attendance, and campus updates in one place.</p></div><div className={`checkin-card ${checkIn ? "checked-in" : "not-checked-in"}`}><span className="checkin-indicator" /><div><small>TODAY'S ATTENDANCE</small><b>{checkIn ? `Checked in at ${checkIn.time}` : "Not checked in"}</b><span>{checkIn ? checkIn.location || "Campus gate" : "Your check-in will appear here"}</span></div></div></section>
        <div className="student-dashboard-grid"><section className="student-card schedule-card"><div className="student-card-heading"><div><p className="kicker">TODAY'S CLASSES</p><h2>Daily schedule</h2></div><span className="schedule-day">{new Date().toLocaleDateString("en-US", { weekday: "long" })}</span></div><div className="schedule-notice">Sample schedule · Official class and teacher assignments are not connected yet.</div><div className="class-timeline">{todaySchedule.map((item) => <article className="class-item" key={item.start}><div className="class-time"><b>{item.start}</b><small>{item.end}</small></div><div className="class-marker" /><div className="class-details"><b>{item.subject}</b><span>{item.room} · {item.teacher}</span></div><button onClick={findClass}>Find class <Icon name="arrow" size={14} /></button></article>)}</div></section>
        <section className="student-card student-attendance-card"><div className="student-card-heading"><div><p className="kicker">MY ATTENDANCE</p><h2>Attendance history</h2></div><div className="month-switch"><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button><b>{month.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</b><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button></div></div><div className="student-calendar"><div className="student-weekdays">{"SMTWTFS".split("").map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="student-calendar-days">{Array.from({ length: monthStart.getDay() }, (_, index) => <i key={`empty-${index}`} />)}{calendarDays.map((day) => { const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; const status = storedAttendance[key]?.status || "unrecorded"; return <span key={key} className={`${status} ${key === todayKey ? "today" : ""}`} title={`${key}: ${status}`}>{day}</span>; })}</div><div className="student-calendar-legend"><span><i className="present" /> Present</span><span><i className="late" /> Late</span><span><i className="absent" /> Absent</span></div><p className="student-data-note">Attendance records will appear after the school connects your check-ins.</p></div></section>
        <section className="student-card grades-card"><div className="student-card-heading"><div><p className="kicker">ACADEMIC PROGRESS</p><h2>Grades & performance</h2></div><span className="pending-badge">Awaiting teacher data</span></div><p>Subject grades, GPA, and progress reports will be shown here when published by your teachers.</p><div className="grade-placeholder"><Icon name="building" size={21} /><span>No academic results have been published to your account yet.</span></div></section>
        <section className="student-card announcements-card"><div className="student-card-heading"><div><p className="kicker">SCHOOL BROADCAST</p><h2>Announcements</h2></div><span className="pending-badge">Portal notices</span></div>{announcements.map((item) => <article className="announcement-item" key={item.title}><span><Icon name="sparkle" size={16} /></span><div><div><b>{item.title}</b><small>{item.date}</small></div><p>{item.text}</p></div></article>)}</section></div>
        <footer className="student-portal-footer"><span>{user.displayName || profile.name || user.email} · {profile.year || "Student"}{profile.section ? ` · ${profile.section}` : ""}</span><button onClick={onSignOut}>Sign out</button></footer>
      </main>
      <SiiBot onSignIn={() => {}} onNavigate={(sectionId) => { onClose(); window.setTimeout(() => document.querySelector(`#${sectionId}`)?.scrollIntoView({ behavior: "smooth" }), 50); }} />
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

function SiiBot({ onSignIn, onNavigate, alreadySignedIn = false }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answerVisible, setAnswerVisible] = useState(false);
  const [reply, setReply] = useState("Hi! I’m SiBot. Ask me about campus directions, rooms, and school access.");

  const askSiiBot = (value) => {
    const text = value.trim();
    if (!text) {
      setReply("Please ask a question or provide a command.");
      return;
    }
    const normalized = text.toLowerCase();
    setOpen(true);
    setAnswerVisible(true);
    const hasAny = (terms) => terms.some((term) => normalized.includes(term.toLowerCase()));
    if (hasAny(["sign in", "signin", "log in", "login", "portal access", "my account"])) {
      if (alreadySignedIn) {
        setReply("You are already signed in. Your student portal is open.");
      } else {
        setReply("Sign in is in the top-right Portal Access button. I can open it for you now.");
        onSignIn();
      }
      <SiiBot alreadySignedIn onSignIn={() => {}} onNavigate={(sectionId) => { onClose(); window.setTimeout(() => document.querySelector(`#${sectionId}`)?.scrollIntoView({ behavior: "smooth" }), 50); }} />
    } else if (hasAny(["ar live", "ar view", "augmented reality", "camera guide", "live view"])) {
      setReply("AR Live View is in the Explore the Platform section. It guides you through campus with turn-by-turn directions and room distance updates.");
      onNavigate("features");
    } else if (hasAny(["3d", "floor plan", "floor map", "dollhouse", "building map", "campus map"])) {
      setReply("The 3D Dollhouse Map is in the Explore the Platform section. Choose a floor to explore the Main Academic Building and find rooms or services.");
      onNavigate("features");
    } else if (hasAny(["where is the school", "school address", "school located", "where are you located", "campus address", "location of the school"])) {
      setReply("Saint Simon of Cyrene Academy, Inc. is at N.I.A. Road / 39 Reyes Compound, Carsadang Bago II, Imus, Cavite, Philippines.");
    } else if (hasAny(["school hour", "opening hour", "what time", "when does school open", "when is the school open", "operating hour"])) {
      setReply("The school operates Monday to Friday, from 7:00 AM to 5:00 PM. Please contact the school directly for special schedules or holidays.");
    } else if (hasAny(["grade level", "academic level", "year level", "what levels", "what grades", "nursery", "kindergarten", "elementary", "junior high", "senior high"])) {
      setReply("SSCAI offers Nursery, Kindergarten and Prep, Elementary / Grade School, Junior High School, and Senior High School. Ask me about a specific level if you need help finding its campus area.");
    } else if (hasAny(["student group", "student organization", "school club", "extracurricular", "ssg", "supreme student", "star group", "pixels group"])) {
      setReply("Active groups include the SSCAI Supreme Student Government for leadership, STAR for dance, drama, music, and stage performances, and PIXELS for photography, digital content, coverage, and creative arts.");
    } else if (hasAny(["building", "zone", "multi-purpose court", "multipurpose court", "administration office", "academic building"])) {
      setReply("The campus map can be organized into the Main Academic Building, Administration, and Multi-Purpose Court zones. Use the 3D map to explore each area.");
      onNavigate("features");
    } else if (hasAny(["enroll", "enrollment", "admission", "how can i register", "how do i apply", "new student", "requirements"])) {
      setReply("For enrollment or admission requirements, please contact the SSCAI school office. I can help you locate the campus, check operating hours, or guide you through the portal.");
    } else if (hasAny(["visitor", "guest", "parent", "can i enter", "public access"])) {
      setReply("Visitors can use the public campus map and emergency routes without signing in. For entry policies, please check with the school office during Monday to Friday, 7:00 AM to 5:00 PM.");
    } else if (hasAny(["emergency", "fire exit", "safest route", "evacuate", "safety route"])) {
      setReply("Use the visible emergency exit route in the campus map and follow school staff instructions. The portal keeps public emergency guidance available without sign-in.");
      onNavigate("features");
    } else if (hasAny(["room", "office", "restroom", "comfort room", "library", "clinic", "where can i find", "how do i get to", "take me to"])) {
      setReply("Tell me the room, office, or facility name and I will point you to the campus map or AR Live View. The current portal can guide you through floors and building zones.");
      onNavigate("features");
    } else if (hasAny(["next class", "my class", "class schedule", "where is my class"])) {
      setReply("The sample schedule lists Mathematics at 8:20 AM in Room 204. Your official schedule is not connected yet, so please confirm the time and room with your adviser.");
    } else if (hasAny(["school", "campus", "saint simon", "simon of cyrene", "ssca", "what is this school"])) {
      setReply("Saint Simon of Cyrene Academy, Inc. (SSCAI) is a non-stock, non-profit private school recognized by the DepEd Division of City of Imus. It provides basic education from early childhood through high school.");
      onNavigate("about");
    } else {
      setReply("Hi! I’m SiBot. Ask me about the school address, hours, rooms, sign-in, the 3D map, or AR Live View.");
    }
    setQuestion("");
  };

  const choosePrompt = (prompt) => askSiiBot(prompt);

  function SiBotMascot({ compact = false }) {
    return (
      <img
        className={`sibot-figure ${compact ? "compact" : ""}`}
        src="/sibot-robot.png"
        alt="SiBot robot assistant"
      />
    );
  }

  return (
    <div className="siibot-wrap">
      {answerVisible && (
        <div className="siibot-answer-pop" role="status" aria-live="polite">
          <div className="siibot-answer-layout">
            <SiBotMascot compact />
            <div className="siibot-answer-card">
              <div className="siibot-answer-topline"><span><Icon name="sparkle" size={16} /> SiBot answer</span><button onClick={() => setAnswerVisible(false)} aria-label="Close SiBot answer"><Icon name="close" size={15} /></button></div>
              <p>{reply}</p>
            </div>
          </div>
        </div>
      )}
      {open && (
        <div className="siibot-panel-shell">
          <section className="siibot-panel" role="dialog" aria-label="SiBot school assistant">
            <div className="siibot-heading">
              <div className="siibot-identity">
                <span className="siibot-avatar"><Icon name="bot" size={18} /></span>
                <span><strong>SiBot</strong></span>
              </div>
              <button className="siibot-close" onClick={() => setOpen(false)} aria-label="Close SiBot"><Icon name="close" size={17} /></button>
            </div>
            <div className="siibot-message"><Icon name="sparkle" size={15} /><p>{reply}</p></div>
            <p className="siibot-label">Where do you want to go, or what would you like to know?</p>
            <div className="siibot-options">
              <button onClick={() => choosePrompt("Where is sign in?")}><Icon name="shield" size={15} /> Sign in</button>
              <button onClick={() => choosePrompt("Take me to AR Live View")}><Icon name="scan" size={15} /> AR Live View</button>
              <button onClick={() => choosePrompt("Show me the 3D map")}><Icon name="cube" size={15} /> 3D map</button>
            </div>
            <form className="siibot-form" onSubmit={(event) => { event.preventDefault(); askSiiBot(question); }}>
              <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about the school..." aria-label="Ask SiBot about the school" />
              <button type="submit" aria-label="Send question"><Icon name="arrow" size={17} /></button>
            </form>
            <small className="siibot-note">SiBot answers campus navigation questions only.</small>
          </section>
        </div>
      )}
      <button className={open ? "siibot-launcher active" : "siibot-launcher"} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label="Open SiBot school assistant">
        <Icon name={open ? "close" : "bot"} size={21} /> <span>SiBot</span>
      </button>
    </div>
  );
}

const demoStudents = [
  { id: "ST-001", name: "Maria Santos", year: "First Year", section: "Emerald" },
  { id: "ST-002", name: "Joshua Cruz", year: "Second Year", section: "Jade" },
  { id: "ST-003", name: "Leah Garcia", year: "Third Year", section: "Sapphire" },
  { id: "ST-004", name: "Daniel Reyes", year: "Fourth Year", section: "Ruby" },
];

function AdminDashboard({ onClose }) {
  const [studentId, setStudentId] = useState(demoStudents[0].id);
  const [month, setMonth] = useState("2026-09");
  const [preset, setPreset] = useState("This Week");
  const [rangeStart, setRangeStart] = useState("2026-09-01");
  const [rangeEnd, setRangeEnd] = useState("2026-09-07");
  const [dragging, setDragging] = useState(false);
  const dragAnchor = useRef(null);
  const [records] = useState(() => JSON.parse(localStorage.getItem("campus-attendance") || "{}"));
  const student = demoStudents.find((item) => item.id === studentId) || demoStudents[0];
  const monthDays = Array.from({ length: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const record = records[`2026-2027 · First Semester|${studentId}|${date}`];
    const status = record?.status || "unrecorded";
    return { day, date, status, time: record?.updatedAt ? new Date(record.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "", location: record?.location || "No location recorded" };
  });
  const selectedDays = monthDays.filter((item) => item.date >= rangeStart && item.date <= rangeEnd);
  const selectedTotals = selectedDays.reduce((summary, item) => ({ ...summary, [item.status]: (summary[item.status] || 0) + 1 }), { present: 0, late: 0, absent: 0, unrecorded: 0 });
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthStartDay = new Date(`${month}-01T12:00:00`).getDay();
  const recordedDays = monthDays.filter((item) => item.status !== "unrecorded").length;
  const monthlyRate = recordedDays ? Math.round((monthDays.filter((item) => item.status === "present").length / recordedDays) * 100) : 0;
  const selectPreset = (value) => {
    setPreset(value);
    if (value === "Last 7 Days") { setRangeStart(`${month}-01`); setRangeEnd(`${month}-07`); }
    if (value === "This Week") { setRangeStart(`${month}-07`); setRangeEnd(`${month}-13`); }
    if (value === "Last 14 Days") { setRangeStart(`${month}-01`); setRangeEnd(`${month}-14`); }
  };
  const beginDrag = (date) => {
    dragAnchor.current = date;
    setDragging(true);
    setPreset("Custom Drag Range");
    setRangeStart(date);
    setRangeEnd(date);
  };
  const chooseDay = (date) => {
    const anchor = dragAnchor.current || date;
    setPreset("Custom Drag Range");
    setRangeStart(anchor < date ? anchor : date);
    setRangeEnd(anchor < date ? date : anchor);
  };
  const finishDrag = () => {
    setDragging(false);
    dragAnchor.current = null;
  };
  const exportCsv = () => {
    const rows = [["Date", "Student", "Status", "Time", "Location"], ...selectedDays.map((item) => [item.date, student.name, item.status, item.time, item.location])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `${student.name.replaceAll(" ", "-").toLowerCase()}-attendance.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  return (
    <div className="admin-shell"><div className="admin-dashboard">
      <header className="admin-dashboard-header"><div><p className="kicker">SSCAI ADMINISTRATION</p><h2>Attendance intelligence</h2><p>Review daily check-ins, trends, and student reliability from one workspace.</p></div><div className="admin-header-actions"><button onClick={exportCsv}>Export CSV</button><button className="admin-close" onClick={onClose} aria-label="Close admin dashboard"><Icon name="close" /></button></div></header>
      <div className="admin-dashboard-controls"><label>Active student<select value={studentId} onChange={(event) => setStudentId(event.target.value)}>{demoStudents.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.section}</option>)}</select></label><label>Attendance month<select value={month} onChange={(event) => { const nextMonth = event.target.value; setMonth(nextMonth); setRangeStart(`${nextMonth}-01`); setRangeEnd(`${nextMonth}-07`); setPreset("This Week"); }}>{["2026-08", "2026-09", "2026-10", "2026-11"].map((item) => <option key={item} value={item}>{new Date(`${item}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</option>)}</select></label><span className="admin-student-meta">{student.id} · {student.year} · {monthLabel}</span></div>
      <section className="range-workspace"><div className="section-title-row"><div><p className="kicker">DATE RANGE</p><h3>Interactive attendance timeline</h3></div><span className="range-readout">{rangeStart} → {rangeEnd}</span></div><div className="preset-row">{["Last 7 Days", "This Week", "Last 14 Days", "Custom Drag Range"].map((item) => <button type="button" key={item} className={preset === item ? "active" : ""} onClick={() => selectPreset(item)}>{item}</button>)}</div><div className="timeline" onMouseLeave={() => dragging && finishDrag()} onMouseUp={finishDrag}>{monthDays.map((item) => <button type="button" key={item.date} className={`timeline-day ${item.date >= rangeStart && item.date <= rangeEnd ? "selected" : ""}`} onMouseDown={() => beginDrag(item.date)} onMouseEnter={() => dragging && chooseDay(item.date)} onMouseUp={finishDrag}><span>{item.day}</span><i className={item.status} /></button>)}</div><small className="drag-note">Click and drag across the dates to inspect a custom range. The selected dates are highlighted in green.</small></section>
      <div className="admin-dashboard-grid"><section className="status-log"><div className="section-title-row"><div><p className="kicker">SELECTED RANGE</p><h3>Detailed status log</h3></div><span className="record-count">{selectedDays.length} days</span></div><div className="admin-log-list">{selectedDays.length ? selectedDays.map((item) => <article className="admin-log-item" key={item.date}><div className="log-date"><b>{new Date(`${item.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</b><small>{month.slice(0, 4)}</small></div><div className="log-line" /><div className="log-detail"><div><span className={`attendance-status ${item.status}`}>{item.status}</span><b>{item.status === "absent" || item.status === "unrecorded" ? "No attendance record" : `Checked in at ${item.time}`}</b></div><small><Icon name="location" size={13} /> {item.location}</small></div></article>) : <p className="empty-attendance">Select at least one day to view attendance.</p>}</div></section><aside className="range-summary"><p className="kicker">RANGE SUMMARY</p><h3>Attendance snapshot</h3><div className="summary-large"><b>{selectedTotals.present + selectedTotals.late ? Math.round(((selectedTotals.present + selectedTotals.late) / (selectedDays.length - selectedTotals.unrecorded)) * 100) : 0}%</b><span>recorded attendance rate</span></div><div className="summary-stat"><span><i className="present" /> Present</span><b>{selectedTotals.present}</b></div><div className="summary-stat"><span><i className="late" /> Late</span><b>{selectedTotals.late}</b></div><div className="summary-stat"><span><i className="absent" /> Absent</span><b>{selectedTotals.absent}</b></div><div className="summary-stat"><span><i className="unrecorded" /> No record</span><b>{selectedTotals.unrecorded}</b></div></aside></div>
      <section className="analytics-section"><div className="section-title-row"><div><p className="kicker">MONTHLY ANALYTICS</p><h3>{monthLabel} overview</h3></div><span className="record-count">{student.name} · {recordedDays} recorded days</span></div><div className="analytics-grid"><div className="heatmap-card"><div className="weekday-row">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="heatmap-grid">{Array.from({ length: monthStartDay }, (_, index) => <span key={`blank-${index}`} />)}{monthDays.map((item) => <button key={`heat-${item.date}`} className={item.status} title={`${item.date}: ${item.status}`} onClick={() => { setRangeStart(item.date); setRangeEnd(item.date); setPreset("Custom Drag Range"); }}>{item.day}</button>)}</div><div className="heatmap-legend"><span><i className="present" /> Present</span><span><i className="late" /> Late</span><span><i className="absent" /> Absent</span><span><i className="unrecorded" /> No record</span></div></div><div className="trend-card"><div className="trend-heading"><div><b>Attendance trends</b><small>Student vs section average</small></div><span>Aug · Sep · Oct</span></div><div className="bar-chart">{[["Aug", 78, 84], ["Sep", 92, 88], ["Oct", 86, 90]].map(([label, studentValue, sectionValue]) => <div className="bar-group" key={label}><div className="bars"><i style={{ height: `${studentValue}%` }} title={`Student ${studentValue}%`} /><b style={{ height: `${sectionValue}%` }} title={`Section ${sectionValue}%`} /></div><span>{label}</span></div>)}</div><div className="chart-legend"><span><i /> {student.name}</span><span><b /> Section average</span></div></div></div><div className="monthly-totals"><div><b>{monthDays.filter((item) => item.status === "absent").length}</b><span>Total absences</span></div><div><b>{monthDays.filter((item) => item.status === "late").length}</b><span>Total lates</span></div><div><b>{monthlyRate}%</b><span>Recorded attendance rate</span></div><div><b>{recordedDays ? "Live" : "Pending"}</b><span>{recordedDays ? "Based on saved records" : "Awaiting attendance"}</span></div></div></section>
    </div></div>
  );
}

function AdminAttendance({ onClose }) {
  const [semester, setSemester] = useState("2026-2027 · First Semester");
  const [studentId, setStudentId] = useState(demoStudents[0].id);
  const [records, setRecords] = useState(() => JSON.parse(localStorage.getItem("campus-attendance") || "{}"));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("present");
  const student = demoStudents.find((item) => item.id === studentId) || demoStudents[0];
  const currentKey = `${semester}|${studentId}|${date}`;
  const studentRecords = Object.entries(records).filter(([key]) => key.startsWith(`${semester}|${studentId}|`));
  const totals = studentRecords.reduce((summary, [, value]) => ({ ...summary, [value.status]: summary[value.status] + 1 }), { present: 0, absent: 0, late: 0, excused: 0 });
  const saveRecord = () => {
    const next = { ...records, [currentKey]: { status, updatedAt: new Date().toISOString() } };
    setRecords(next);
    localStorage.setItem("campus-attendance", JSON.stringify(next));
  };
  const exportCsv = () => {
    const rows = [["Student ID", "Student", "Year", "Section", "Semester", "Date", "Status"], ...studentRecords.map(([key, value]) => { const [, , recordDate] = key.split("|"); return [student.id, student.name, student.year, student.section, semester, recordDate, value.status]; })];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `${student.name.replaceAll(" ", "-").toLowerCase()}-attendance.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return <div className="admin-shell"><div className="admin-panel"><div className="admin-heading"><div><p className="kicker">ADMIN WORKSPACE</p><h2>Attendance register</h2><p>Record daily attendance, review semester performance, and export a spreadsheet for reports.</p></div><button className="modal-close" onClick={onClose} aria-label="Close attendance admin"><Icon name="close" /></button></div><div className="admin-controls"><label>Semester<select value={semester} onChange={(event) => setSemester(event.target.value)}><option>2026-2027 · First Semester</option><option>2026-2027 · Second Semester</option></select></label><label>Student<select value={studentId} onChange={(event) => setStudentId(event.target.value)}>{demoStudents.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select></label><button className="attendance-save" onClick={saveRecord}>Save attendance</button></div><div className="admin-summary"><div><b>{student.name}</b><span>{student.year} · {student.section}</span></div><div><b>{totals.present}</b><span>Present</span></div><div><b>{totals.absent}</b><span>Absent</span></div><div><b>{totals.late}</b><span>Late</span></div><div><b>{totals.excused}</b><span>Excused</span></div></div><div className="attendance-tools"><h3>Attendance spreadsheet</h3><div><button onClick={exportCsv}>Export CSV</button><button onClick={() => window.print()}>Print report</button></div></div><div className="attendance-table-wrap"><table><thead><tr><th>Date</th><th>Student</th><th>Year / Section</th><th>Status</th><th>Updated</th></tr></thead><tbody>{studentRecords.length ? studentRecords.sort(([a], [b]) => b.localeCompare(a)).map(([key, value]) => { const [, , recordDate] = key.split("|"); return <tr key={key}><td>{recordDate}</td><td>{student.name}</td><td>{student.year} · {student.section}</td><td><span className={`attendance-status ${value.status}`}>{value.status}</span></td><td>{new Date(value.updatedAt).toLocaleString()}</td></tr>; }) : <tr><td colSpan="5" className="empty-attendance">No records yet. Save today&apos;s attendance above.</td></tr>}</tbody></table></div><p className="admin-note">This prototype stores attendance in this browser. Connect the same actions to Firestore before using it as the official school record.</p></div></div>;
}

export default function App() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [floor, setFloor] = useState(2);
  const [signedInUser, setSignedInUser] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const openLogin = () => setLoginOpen(true);
  const openCreateAccount = () => {
    setLoginOpen(false);
    setCreateAccountOpen(true);
  };
  const openAdminLogin = () => setAdminLoginOpen(true);
  const navigateTo = (sectionId) => document.querySelector(`#${sectionId}`)?.scrollIntoView({ behavior: "smooth" });

  const handleSignOut = async () => {
    await logoutUser();
    setSignedInUser(null);
    setAccountOpen(false);
  };

  useEffect(() => {
    finishGoogleRedirect()
      .then((result) => {
        if (result?.user) setSignedInUser(result.user);
      })
      .catch(() => setLoginOpen(true));
  }, []);

  return (
    <div className="site-main">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a
          href="#about"
          className="brand"
          aria-label="Smart Campus Portal home"
        >
          <span className="brand-mark">
            <Icon name="building" size={23} />
          </span>
          <span>
            <strong>SMART CAMPUS</strong>
            <small>PORTAL</small>
          </span>
        </a>
        <nav className={menuOpen ? "nav-links open" : "nav-links"}>
          <a href="#about">About Campus</a>
          <a href="#features">3D Dollhouse Map</a>
          <a href="#features">AR Live View</a>
          {signedInUser ? <button className="nav-cta" onClick={() => setAccountOpen(true)}><Icon name="shield" size={17} /> My Account</button> : <button className="nav-cta" onClick={openLogin}>
            <Icon name="shield" size={17} /> Sign In / Portal Access
          </button>}
        </nav>
        <button
          className="menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation"
        >
          <Icon name={menuOpen ? "close" : "menu"} size={24} />
        </button>
      </header>
      <section className="hero" id="about">
        <div className="hero-copy">
          <div className="live-badge">
            <span /> CAMPUS NAVIGATION, REIMAGINED
          </div>
          <h1>
            Navigate Our Campus in <em>Full 3D</em> &amp; AR Live View
          </h1>
          <p>
            Move confidently across every building and floor with intelligent
            routing, emergency fire exit guidance, and smart campus assistance.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() =>
                document
                  .querySelector("#features")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              <Icon name="cube" /> Launch 3D Dollhouse View{" "}
              <Icon name="arrow" size={18} />
            </button>
            <button className="secondary-button" onClick={openLogin}>
              Explore as Visitor
            </button>
          </div>
          <div className="trust-row">
            <span>
              <Icon name="shield" size={17} /> Emergency-ready routes
            </span>
            <i />
            <span>
              <Icon name="scan" size={17} /> Real-time indoor guidance
            </span>
          </div>
        </div>
      </section>
      <section className="features" id="features">
        <div className="section-heading">
          <div>
            <p className="kicker">EXPLORE THE PLATFORM</p>
            <h2>Everything you need to find your way.</h2>
          </div>
          <p>
            One intelligent campus layer, built for students, faculty, visitors,
            and emergency response teams.
          </p>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <div className="card-icon blue">
              <Icon name="cube" />
            </div>
            <div className="card-title">
              <div>
                <p>01 · SPATIAL VIEW</p>
                <h3>3D Dollhouse Viewer</h3>
              </div>
              <Icon name="arrow" />
            </div>
            <p className="card-copy">
              Explore every building layer by layer. Rotate, zoom, and jump
              directly to any room or service.
            </p>
            <div className="floor-selector">
              <div className="floor-head">
                <span>SELECT FLOOR</span>
                <b>
                  {floor === 1
                    ? "Ground"
                    : `${floor}${floor === 2 ? "nd" : floor === 3 ? "rd" : "th"} Floor`}
                </b>
              </div>
              <div className="floor-buttons">
                {[1, 2, 3, 4].map((item) => (
                  <button
                    key={item}
                    className={floor === item ? "active" : ""}
                    onClick={() => setFloor(item)}
                  >
                    {item}
                    <small>
                      {item === 1
                        ? "ST"
                        : item === 2
                          ? "ND"
                          : item === 3
                            ? "RD"
                            : "TH"}
                    </small>
                  </button>
                ))}
              </div>
              <div className="mini-plan">
                <span />
                <span />
                <span />
                <span />
                <i className={`floor-indicator level-${floor}`} />
              </div>
            </div>
          </article>
          <article className="feature-card">
            <div className="card-icon violet">
              <Icon name="scan" />
            </div>
            <div className="card-title">
              <div>
                <p>02 · IMMERSIVE GUIDANCE</p>
                <h3>AR / Live View Walkthrough</h3>
              </div>
              <Icon name="arrow" />
            </div>
            <p className="card-copy">
              Follow turn-by-turn directional overlays through your camera, with
              distance and accessibility updates.
            </p>
            <div className="ar-preview">
              <div className="corridor">
                <i />
                <i />
                <i />
              </div>
              <div className="ar-header">
                <span>AR LIVE</span>
                <b>Room 204 · 38m</b>
              </div>
              <div className="ar-arrow">↑</div>
              <div className="ar-bottom">
                <span>
                  <Icon name="route" size={14} /> Continue straight
                </span>
                <small>ETA 1 min</small>
              </div>
            </div>
          </article>
          <article className="feature-card">
            <div className="card-icon emerald">
              <Icon name="sparkle" />
            </div>
            <div className="card-title">
              <div>
                <p>03 · INTELLIGENT SUPPORT</p>
                <h3>AI Assistant</h3>
              </div>
              <Icon name="arrow" />
            </div>
            <p className="card-copy">
              Ask for any room, facility, or safest route. The assistant
              understands natural, conversational requests.
            </p>
            <div className="assistant-preview">
              <div className="assistant-status">
                <span className="ai-orb">
                  <Icon name="sparkle" size={16} />
                </span>
                <p>
                  <b>Campus AI</b>
                  <small>Online · Ready to help</small>
                </p>
                <i />
              </div>
              <div className="prompt-bubble">
                “Take me to Room 10 on the 2nd floor”
              </div>
              <div className="assistant-response">
                <Icon name="route" size={17} />
                <span>
                  <b>Route ready</b>
                  <small>4 min · Via east stairwell</small>
                </span>
              </div>
              <div className="search-box">
                <span>Ask for a destination...</span>
                <button aria-label="Search campus assistant">
                  <Icon name="arrow" size={18} />
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
      <section className="safety-strip">
        <div className="safety-icon">
          <Icon name="shield" size={27} />
        </div>
        <div>
          <p className="kicker">SAFETY-FIRST NAVIGATION</p>
          <h3>
            Emergency routes stay clear, visible, and always within reach.
          </h3>
        </div>
        <p>
          Live exit guidance and accessible routes are available to every
          visitor, no sign-in required.
        </p>
        <button onClick={openLogin}>
          View public access <Icon name="arrow" size={17} />
        </button>
      </section>
      <footer>
        <div className="brand">
          <span className="brand-mark">
            <Icon name="building" size={21} />
          </span>
          <span>
            <strong>SMART CAMPUS</strong>
            <small>PORTAL</small>
          </span>
        </div>
        <div className="footer-socials" aria-label="Saint Simon social media">
          <a href="https://www.facebook.com/SSCAIPH" target="_blank" rel="noreferrer" aria-label="Visit Saint Simon of Cyrene Academy on Facebook" title="Facebook">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2v2.2H7.6V13h2.7v8h3.1Z" /></svg>
          </a>
          <a href="https://www.youtube.com/@saintsimonofcyreneacademyinc" target="_blank" rel="noreferrer" aria-label="Visit Saint Simon of Cyrene Academy on YouTube" title="YouTube">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 7.2a2.9 2.9 0 0 0-2-2C18.2 4.7 12 4.7 12 4.7s-6.2 0-8 .5a2.9 2.9 0 0 0-2 2A30 30 0 0 0 1.5 12c0 1.6.2 3.2.5 4.8a2.9 2.9 0 0 0 2 2c1.8.5 8 .5 8 .5s6.2 0 8-.5a2.9 2.9 0 0 0 2-2c.3-1.6.5-3.2.5-4.8s-.2-3.2-.5-4.8ZM9.8 15.2V8.8l5.6 3.2-5.6 3.2Z" /></svg>
          </a>
        </div>
        <p>Building a safer, more connected campus.</p>
        <span>© 2026 Saint Simon of Cyrene Academy</span>
      </footer>
      {!accountOpen && !loginOpen && <SiiBot onSignIn={openLogin} onNavigate={navigateTo} />}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onCreate={openCreateAccount} onAdmin={openAdminLogin} onSignedIn={setSignedInUser} />}
      {accountOpen && signedInUser && <AccountPanel user={signedInUser} onClose={() => setAccountOpen(false)} onSignOut={handleSignOut} />}
      {createAccountOpen && <CreateAccountModal onClose={() => setCreateAccountOpen(false)} onCreated={(user) => { setSignedInUser(user); setCreateAccountOpen(false); }} />}
      {adminLoginOpen && <AdminLogin onClose={() => setAdminLoginOpen(false)} onSuccess={(user) => { setAdminLoginOpen(false); setLoginOpen(false); setSignedInUser(user); setAdminOpen(true); }} />}
      {adminOpen && <AdminDashboard onClose={() => setAdminOpen(false)} />}
    </div>
  );
}
