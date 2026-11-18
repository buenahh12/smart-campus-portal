import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { DEFAULT_A11Y, TEXT_SIZES, useA11y } from "./a11y";

// The Accessibility panel: opened by the header button, the footer link, or asking SiBot.
export default function AccessibilityPanel() {
  const [open, setOpen] = useState(false);
  const [settings, update] = useA11y();
  const closeRef = useRef(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("sscai:a11y", show);
    return () => window.removeEventListener("sscai:a11y", show);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;

  const step = TEXT_SIZES.indexOf(settings.size);
  const toggle = (name, label, hint) => <label className="a11y-toggle">
    <input type="checkbox" checked={settings[name]} onChange={(event) => update({ [name]: event.target.checked })} />
    <span><b>{label}</b><small>{hint}</small></span>
  </label>;

  return <div className="modal-shell a11y-shell" role="dialog" aria-modal="true" aria-labelledby="a11y-title" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="a11y-panel">
      <header className="a11y-head">
        <span className="a11y-mark" aria-hidden="true"><Icon name="access" size={24} /></span>
        <h2 id="a11y-title">Accessibility</h2>
        <button ref={closeRef} type="button" className="a11y-close" onClick={() => setOpen(false)} aria-label="Close accessibility settings"><Icon name="close" size={18} /></button>
      </header>
      <p className="a11y-intro">Make SSCAI NAVI easier to see, read and hear. Saved on this phone.</p>

      <div className="a11y-size" role="group" aria-labelledby="a11y-size-label">
        <span id="a11y-size-label"><b>Text size</b><small>Bigger text and buttons</small></span>
        <div className="a11y-size-controls">
          <button type="button" onClick={() => update({ size: TEXT_SIZES[Math.max(0, step - 1)] })} disabled={step <= 0} aria-label="Smaller text">A<sup>−</sup></button>
          <output aria-live="polite">{Math.round(settings.size * 100)}%</output>
          <button type="button" onClick={() => update({ size: TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, step + 1)] })} disabled={step >= TEXT_SIZES.length - 1} aria-label="Bigger text" className="big">A<sup>+</sup></button>
        </div>
      </div>

      {toggle("contrast", "High contrast", "Darker text, stronger lines, plain backgrounds.")}
      {toggle("plainFont", "Easy-to-read font", "A plain font with no capitals-only words. Helps with dyslexia.")}
      {toggle("still", "Stop animations", "No sliding, fading or moving pictures.")}
      {toggle("speak", "Read directions aloud", "The 2D Guide speaks each step of the route.")}

      <div className="a11y-note">
        <Icon name="volume" size={18} />
        <p><b>Blind or low vision?</b> SSCAI NAVI works with <b>TalkBack</b> (Android) and <b>VoiceOver</b> (iPhone). Ask SiBot with your voice: tap SiBot, then the microphone, and say &ldquo;where is the clinic&rdquo;. Press and hold the SiBot button for the nearest exit.</p>
      </div>

      <div className="a11y-actions">
        <button type="button" className="a11y-reset" onClick={() => update(DEFAULT_A11Y)}>Reset</button>
        <button type="button" className="a11y-done" onClick={() => setOpen(false)}>Done</button>
      </div>
    </section>
  </div>;
}
