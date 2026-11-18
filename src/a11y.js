// Accessibility settings, kept on this device: bigger text, high contrast, an easy-to-read font,
// no animations, and directions read aloud. They are applied as classes on <html> (see a11y.css)
// before the first paint, so the page never flashes in the default look.
import { useEffect, useState } from "react";

const KEY = "sscai-a11y";
export const TEXT_SIZES = [1, 1.15, 1.3, 1.5, 1.75];
export const DEFAULT_A11Y = { size: 1, contrast: false, plainFont: false, still: false, speak: false };

export function readA11y() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      size: TEXT_SIZES.includes(saved.size) ? saved.size : 1,
      contrast: saved.contrast === true,
      plainFont: saved.plainFont === true,
      still: saved.still === true,
      speak: saved.speak === true,
    };
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

export function applyA11y(settings = readA11y()) {
  const root = document.documentElement;
  root.classList.toggle("a11y-zoomed", settings.size !== 1);
  root.style.setProperty("--a11y-zoom", String(settings.size));
  root.classList.toggle("a11y-contrast", settings.contrast);
  root.classList.toggle("a11y-plainfont", settings.plainFont);
  root.classList.toggle("a11y-still", settings.still);
}

const listeners = new Set();
export function saveA11y(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private window: this visit only */ }
  applyA11y(settings);
  listeners.forEach((listener) => listener(settings));
}

export function useA11y() {
  const [settings, setSettings] = useState(readA11y);
  useEffect(() => {
    listeners.add(setSettings);
    return () => listeners.delete(setSettings);
  }, []);
  return [settings, (change) => saveA11y({ ...settings, ...change })];
}

// "No animations": the phone's own Reduce motion setting, or Stop animations in our panel.
export const prefersStill = () => document.documentElement.classList.contains("a11y-still")
  || Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export function useStill() {
  const [settings] = useA11y();
  const [system, setSystem] = useState(() => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return undefined;
    const change = () => setSystem(query.matches);
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, []);
  return settings.still || system;
}

// Opens the panel from anywhere (header button, footer link, SiBot).
export const openAccessibility = () => window.dispatchEvent(new CustomEvent("sscai:a11y"));
