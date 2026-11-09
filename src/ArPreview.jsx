import { useEffect, useState } from "react";

const asset = (file) => `${import.meta.env.BASE_URL}${file}`;

// Three moments of a real walk in the Main Academic Building, shown like a phone camera.
const DEST = "Computer Room";
const DEST_SUB = "2nd floor · Main Academic Building";
const STEPS = [
  { photo: "campus/courtyard.jpg", pos: "28% 60%", kind: "pill", label: "This way", step: "Walk past the open court to the stairs", dist: "46 m", icon: "right" },
  { photo: "campus/corridor-corner.jpg", pos: "12% 60%", kind: "sign", label: "Turn left", sub: "at the corner, 2nd floor", step: "Up the stairs, then turn left", dist: "20 m", icon: "left" },
  { photo: "campus/hallway.jpg", pos: "35% 60%", kind: "chevrons", label: `${DEST} ahead`, step: "Go straight down the hallway", dist: "8 m", icon: "up" },
];
const STEP_MS = 3800;

function StepIcon({ name }) {
  const d = {
    right: "M5 12h12M12 6l6 6-6 6",
    left: "M19 12H7M12 6l-6 6 6 6",
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
          <img key={p.photo} className={`arp-photo ${n === i ? "on" : ""}`} src={asset(p.photo)} style={{ objectPosition: p.pos, transformOrigin: p.pos }} alt="" loading="lazy" />
        ))}

        <div className="arp-top">
          <span className="arp-back">←</span>
          <span className="arp-title"><b>{DEST}</b><small>{DEST_SUB}</small></span>
          <span className="arp-more">⋮</span>
        </div>

        <div className="arp-scene" key={i}>
          {s.kind === "pill" && (
            <div className="arp-pill"><span>{s.label}</span><i><StepIcon name="right" /></i></div>
          )}
          {s.kind === "sign" && (
            <div className="arp-sign"><StepIcon name={s.icon} /><span><b>{s.label}</b><small>{s.sub}</small></span></div>
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
          <div className="arp-dest"><b>{DEST}</b><small>{DEST_SUB}</small></div>
          <div className="arp-dots">{STEPS.map((p, n) => <i key={p.photo} className={n === i ? "on" : ""} />)}</div>
        </div>
      </div>
    </div>
  );
}
