import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

// The Terms and the Privacy Policy (opened by #terms and #privacy links), and the short privacy
// notice shown once on the first visit. Everything here describes what the site really does:
// keep it in step with cms.js (visits, sign-in records, profiles, email updates), ArLiveView.jsx
// (camera) and firestore.rules (who can read what).

const UPDATED = "November 2026";
const NOTICE_KEY = "sscai-privacy-notice-seen";

const PAGES = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["Who we are", <p key="a">SSCAI NAVI is the campus navigation website of Saint Simon of Cyrene Academy, Inc. (Carsadang Bago II, Imus, Cavite). The school is responsible for the information described here.</p>],
      ["If you use it without signing in", <>
        <p>We don&apos;t ask for your name or email. We only add one to a daily visit count (a number, with no names), so the school knows how many people use the site.</p>
        <p>Your phone or computer keeps a few things for you, and they stay on your device: the room you said you are starting from, a saved copy of the site so it works without Wi-Fi, and whether you already saw this notice or the install offer.</p>
      </>],
      ["Camera (AR live view) and location", <p key="c">AR live view uses your camera only on your phone, to draw arrows on the screen. The video is never recorded, saved or sent anywhere. The site does not use GPS or your location.</p>],
      ["SiBot", <p key="s">SiBot&apos;s answers are worked out on your device, and your questions are not saved. If you ask by voice, your browser turns your speech into text. In some browsers (such as Chrome) this is done by the browser maker&apos;s speech service.</p>],
      ["If you sign in", <>
        <p>Sign-in is handled by Firebase (Google). You can sign in with Google, with an email and password, or as a visitor with no account.</p>
        <p>Each time you sign in (once per browser session), the school records:</p>
        <ul>
          <li>your account email and name, and the role you chose (student, faculty or staff, parent or guardian, or visitor)</li>
          <li>how you signed in (Google, email and password, or visitor)</li>
          <li>your device type (phone, tablet or computer), its system (for example Android or iOS), your browser and screen size</li>
          <li>the date and time</li>
        </ul>
        <p>Your profile keeps your name, role, your grade level and section (students only, if you give them), saved places and settings, so they follow you to any device. Only you can read your profile.</p>
      </>],
      ["Email updates (only if you turn them on)", <p key="e">If you turn on email updates in My Campus, we keep your email and name so the school can email you announcements. The emails are sent through EmailJS. You can turn them off at any time in My Campus.</p>],
      ["Feedback", <p key="f">If you send feedback, the school keeps what it is about, your message, your rating (if you chose one), what you were looking at (for example a route), and whether you were signed in. Your email is kept only if you tick &quot;The school may reply to me&quot;. Only the administrator can read feedback.</p>],
      ["Who can see it", <p key="w">Only the school&apos;s administrator account can see sign-in records, the visit counts and the email list. The database rules block everyone else. Your information is not sold and is not used for ads. It is stored with Google Firebase, and the site is hosted on Vercel.</p>],
      ["How long we keep it", <p key="h">Records are kept until the school&apos;s administrator deletes them, or until you ask us to delete yours.</p>],
      ["Your rights", <p key="r">Under the Data Privacy Act of 2012 (Republic Act No. 10173) you can ask to see, correct or delete your information, or ask how it is used. Ask at the school office (Monday to Friday, 7:00 AM to 5:00 PM) or message the school&apos;s Facebook page.</p>],
    ],
  },
  terms: {
    title: "Terms of Use",
    sections: [
      ["What SSCAI NAVI is for", <p key="a">SSCAI NAVI helps students, families, staff and visitors find rooms and offices in the Main Academic Building of Saint Simon of Cyrene Academy, Inc., get directions, find the nearest exit, and read campus updates. It is free to use.</p>],
      ["Directions are a guide", <p key="d">Floor plans and directions are kept as accurate as we can, but rooms, closures and schedules can change, and the saved offline copy may be out of date. Always follow school staff and the safety signs, especially in an emergency.</p>],
      ["Stay safe with AR", <p key="s">Look where you are walking. Don&apos;t use AR live view on the stairs or while running.</p>],
      ["Accounts", <p key="c">Keep your password to yourself and sign in only as yourself. You don&apos;t need an account to find your way.</p>],
      ["Be respectful", <p key="b">Don&apos;t try to break the site, overload it, or get into parts you are not allowed to use, such as the administrator pages.</p>],
      ["The school's content", <p key="o">The floor plans, photos, announcements and the school&apos;s name and logo belong to Saint Simon of Cyrene Academy, Inc.</p>],
      ["Changes", <p key="g">The school may update the site and these terms. The Privacy Policy explains what information the site uses.</p>],
    ],
  },
};

// Opens when the address ends in #terms or #privacy; closing goes back to where you were.
export function PolicyDialog() {
  const [page, setPage] = useState(() => (typeof location !== "undefined" ? location.hash.slice(1) : ""));
  const closeRef = useRef(null);
  useEffect(() => {
    const change = () => setPage(location.hash.slice(1));
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const content = PAGES[page];
  useEffect(() => {
    if (!content) return undefined;
    closeRef.current?.focus();
    // Caught first (capture), so Escape closes this page and not the sign-in window under it.
    const key = (event) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  if (!content) return null;
  function close() {
    history.replaceState(null, "", location.pathname + location.search);
    setPage("");
  }
  return <div className="modal-shell policy-shell" role="dialog" aria-modal="true" aria-labelledby="policy-title" onClick={(event) => event.target === event.currentTarget && close()}>
    <article className="policy-dialog">
      <header>
        <div><p className="kicker">SSCAI NAVI</p><h2 id="policy-title">{content.title}</h2><small>Last updated {UPDATED}</small></div>
        <button ref={closeRef} type="button" className="modal-close" onClick={close} aria-label={`Close ${content.title}`}><Icon name="close" /></button>
      </header>
      <div className="policy-body">
        {content.sections.map(([heading, body]) => <section key={heading}><h3>{heading}</h3>{body}</section>)}
      </div>
      <footer>
        <a href={page === "privacy" ? "#terms" : "#privacy"}>{page === "privacy" ? "Read the Terms of Use" : "Read the Privacy Policy"}</a>
        <button type="button" className="ss-btn ss-btn-primary" onClick={close}>Done</button>
      </footer>
    </article>
  </div>;
}

export const privacyNoticeSeen = () => {
  try {
    return localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return true; // storage blocked: don't show it on every page load
  }
};

// The short notice on the first visit.
export function PrivacyNotice({ onDone }) {
  const done = () => {
    try { localStorage.setItem(NOTICE_KEY, "1"); } catch { /* storage unavailable */ }
    onDone();
  };
  return <section className="privacy-notice" role="dialog" aria-labelledby="privacy-notice-title" aria-live="polite">
    <span className="privacy-notice-icon" aria-hidden="true"><Icon name="shield" size={22} /></span>
    <div>
      <h2 id="privacy-notice-title">Your privacy</h2>
      <p>You can find any room without giving your name. We count visits without names, and your phone saves a copy of the site so it works without Wi-Fi. The AR camera stays on your phone. If you sign in, the school sees your email, how you signed in, and your device type and browser.</p>
      <div className="privacy-notice-actions">
        <button type="button" className="ss-btn ss-btn-primary" onClick={done}>OK, got it</button>
        <a href="#privacy" onClick={done}>Read the Privacy Policy</a>
      </div>
    </div>
  </section>;
}
