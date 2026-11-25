import { useEffect, useState } from "react";
import "./intro.css";

// Opening transition, once per visit: a gold ring draws around the school logo, the logo rises
// in with a flash, "SSCAI NAVI" appears letter by letter, then we fly through the logo and a
// circle opens from its middle onto the site. About 3 seconds; a tap skips it. Not shown to
// people who turned motion off (phone setting or Accessibility > Stop animations).
const SEEN_KEY = "sscai-intro-seen";
const PLAY_MS = 2500; // then the fly-through
const OUT_MS = 900;

function shouldPlay() {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch { /* private window: play it */ }
  const still = document.documentElement.classList.contains("a11y-still") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return !still && !/HeadlessChrome|bot|crawl|spider/i.test(navigator.userAgent);
}

export default function Intro() {
  const [phase, setPhase] = useState(() => (shouldPlay() ? "play" : "done"));

  useEffect(() => {
    if (phase === "play") {
      const timer = setTimeout(() => setPhase("out"), PLAY_MS);
      return () => clearTimeout(timer);
    }
    if (phase === "out") {
      const timer = setTimeout(() => setPhase("done"), OUT_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [phase]);

  if (phase === "done") return null;
  const title = "SSCAI NAVI";
  return <div className={`intro intro-${phase}`} aria-hidden="true" onPointerDown={() => setPhase((now) => (now === "play" ? "out" : now))}>
    <div className="intro-glow" />
    <div className="intro-stage">
      <div className="intro-badge">
        <svg className="intro-ring" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="92" className="intro-ring-track" />
          <circle cx="100" cy="100" r="92" className="intro-ring-line" pathLength="1" />
        </svg>
        <span className="intro-flash" />
        <img src={`${import.meta.env.BASE_URL}logologooo.jpg`} alt="" width="128" height="128" />
      </div>
      <h1 className="intro-title">{[...title].map((letter, index) => <span key={index} style={{ animationDelay: `${1150 + index * 55}ms` }}>{letter === " " ? " " : letter}</span>)}</h1>
      <i className="intro-line" />
      <p className="intro-sub">Saint Simon of Cyrene Academy, Inc.</p>
    </div>
    <small className="intro-skip">Tap to skip</small>
  </div>;
}
