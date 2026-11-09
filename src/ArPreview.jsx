import { useEffect, useState } from "react";

const asset = (file) => `${import.meta.env.BASE_URL}${file}`;

// Three moments of a walk to the high school library, shown like a phone camera.
const STEPS = [
  { photo: "campus/classroom.jpg", kind: "pill", label: "This way", step: "Head out the door and turn right", dist: "38 m", icon: "right" },
  { photo: "campus/library-elementary.jpg", kind: "sign", label: "Go up one level", sub: "12 m away", step: "Take the stairs up one floor", dist: "12 m", icon: "stairs" },
  { photo: "campus/library-high-school.jpg", kind: "chevrons", label: "Library is ahead", step: "Your destination is straight ahead", dist: "5 m", icon: "up" },
];
const STEP_MS = 3800;

function StepIcon({ name }) {
  const d = {
    right: "M5 12h12M12 6l6 6-6 6",
    stairs: "M4 19h5v-5h5V9h6",
    up: "M12 19V5M6 11l6-6 6 6",
  }[name];
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export default function ArPreview() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) return undefined;
    const id = setInterval(() => setI((n) => (n + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(id);
  }, []);

  const s = STEPS[i];
  return (
    <div className="arp" aria-hidden="true">
      <div className="arp-phone">
        {STEPS.map((p, n) => (
          <img key={p.photo} className={`arp-photo ${n === i ? "on" : ""}`} src={asset(p.photo)} alt="" loading="lazy" />
        ))}

        <div className="arp-top">
          <span className="arp-back">←</span>
          <span className="arp-title"><b>High School Library</b><small>Main Academic Building</small></span>
          <span className="arp-more">⋮</span>
        </div>

        <div className="arp-scene" key={i}>
          {s.kind === "pill" && (
            <div className="arp-pill"><span>{s.label}</span><i><StepIcon name="right" /></i></div>
          )}
          {s.kind === "sign" && (
            <div className="arp-sign"><StepIcon name="stairs" /><span><b>{s.label}</b><small>{s.sub}</small></span></div>
          )}
          {s.kind === "chevrons" && (
            <>
              <div className="arp-sign arp-sign-sm"><span><b>{s.label}</b></span></div>
              <div className="arp-chevrons"><i /><i /><i /><i /></div>
            </>
          )}
        </div>

        <div className="arp-card">
          <div className="arp-step" key={`step-${i}`}><StepIcon name={s.icon} /><span>{s.step}</span><small>{s.dist}</small></div>
          <div className="arp-dest"><b>High School Library</b><small>Saint Simon of Cyrene Academy</small></div>
          <div className="arp-dots">{STEPS.map((p, n) => <i key={p.photo} className={n === i ? "on" : ""} />)}</div>
        </div>
      </div>
    </div>
  );
}
