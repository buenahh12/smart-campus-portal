// Voice guide for the 3D directions: reads each step aloud in English or Tagalog.
// The steps come from floorPlans.js describe() in a small set of English sentence shapes, so
// Tagalog is made by matching those shapes. Room names stay as they are on the signs.

const VOICE_KEY = "sscai-voice-guide";
export const VOICE_LANGS = { off: "Off", en: "English", tl: "Tagalog" };

export const voiceSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

export function savedVoiceLang() {
  try {
    const value = localStorage.getItem(VOICE_KEY);
    return value in VOICE_LANGS ? value : "off";
  } catch {
    return "off";
  }
}
export function saveVoiceLang(value) {
  try { localStorage.setItem(VOICE_KEY, value); } catch { /* private window: just not remembered */ }
}

const unthe = (text) => text.replace(/\bthe two /g, "dalawang ").replace(/\bthe /g, "");
const names = (text) => unthe(text).replace(/ and /g, " at ");
const turnWord = { "turn left": "kumaliwa", "turn right": "kumanan", "turn around and walk": "bumalik" };

// One English step -> Tagalog (everyday Taglish, as people give directions in school).
export function toTagalog(text) {
  let m;
  if ((m = /^Start at the (.+) on the (.+)$/.exec(text))) return `Magsimula sa ${m[1]}, ${m[2]}`;
  if ((m = /^Leave (.+) \((.+)\)$/.exec(text))) return `Lumabas sa ${m[1]}, ${m[2]}`;
  if ((m = /^Take the (.+) up to the (.+)$/.exec(text))) return `Umakyat sa ${m[1]} hanggang ${m[2]}`;
  if ((m = /^Take the (.+) down to the (.+)$/.exec(text))) return `Bumaba sa ${m[1]} hanggang ${m[2]}`;
  if ((m = /^Go out through the (.+)$/.exec(text))) return `Lumabas sa ${m[1]}`;
  if ((m = /^Arrive at (.+)$/.exec(text))) return `Nandito ka na sa ${unthe(m[1])}`;
  if ((m = /^Walk to (.+?)(?: in the (.+))?$/.exec(text))) return `Maglakad papunta sa ${unthe(m[1])}${m[2] ? ` sa ${m[2]}` : ""}`;

  const past = (rest) => (rest ? `, dadaan sa ${names(rest)}` : "");
  if ((m = /^Step off the stairs(?: and (turn left|turn right|turn around and walk))?(?:, then walk past (.+))?$/.exec(text))) {
    return `Umalis sa hagdan${m[1] ? ` at ${turnWord[m[1]]}` : ""}${m[2] ? `, tapos maglakad${past(m[2])}` : ""}`;
  }
  if (text === "Walk down the hallway") return "Maglakad sa pasilyo";
  if (text === "Keep going straight") return "Dumiretso lang";
  if ((m = /^Keep going past (.+)$/.exec(text))) return `Dumiretso lang${past(m[1])}`;
  if ((m = /^Walk past (.+)$/.exec(text))) return `Maglakad${past(m[1])}`;
  if ((m = /^Walk through (.+)$/.exec(text))) return `Dumaan sa loob ng ${unthe(m[1])}`;
  if ((m = /^(Turn left|Turn right|Turn around and walk) and walk through (.+)$/.exec(text))) return `${cap(turnWord[m[1].toLowerCase()])} at dumaan sa loob ng ${unthe(m[2])}`;
  if ((m = /^(Turn left|Turn right) at (.+?)(?:, then walk past (.+))?$/.exec(text))) return `${cap(turnWord[m[1].toLowerCase()])} sa ${unthe(m[2])}${m[3] ? `, tapos maglakad${past(m[3])}` : ""}`;
  if ((m = /^(Turn left|Turn right|Turn around and walk) and walk past (.+)$/.exec(text))) return `${cap(turnWord[m[1].toLowerCase()])}, tapos maglakad${past(m[2])}`;
  if ((m = /^(Turn left|Turn right|Turn around and walk) down the hallway$/.exec(text))) return `${cap(turnWord[m[1].toLowerCase()])} sa pasilyo`;
  return text;
}
const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);

export const stepText = (text, lang) => (lang === "tl" ? toTagalog(text) : text);

// The best installed voice for the language: Filipino first for Tagalog (most phones have one),
// otherwise any voice reads it; English prefers a Philippine English voice.
function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  const wanted = lang === "tl" ? [/^fil/i, /^tl/i] : [/^en-PH/i, /^en-US/i, /^en/i];
  for (const pattern of wanted) {
    const found = voices.find((voice) => pattern.test(voice.lang));
    if (found) return found;
  }
  return null;
}

export function speak(text, lang) {
  if (!voiceSupported() || lang === "off" || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel(); // the newest step wins: never read out an old one late
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || (lang === "tl" ? "fil-PH" : "en-US");
  utterance.rate = 0.95;
  synth.speak(utterance);
}

export function unlockVoice() {
  if (!voiceSupported()) return;
  const silent = new SpeechSynthesisUtterance(" ");
  silent.volume = 0;
  window.speechSynthesis.speak(silent);
}

export function stopSpeaking() {
  if (voiceSupported()) window.speechSynthesis.cancel();
}

// Where along the route (0 to 1) each step begins, from the metres of the steps before it.
export function stepStarts(steps) {
  const total = steps.reduce((sum, step) => sum + (step.meters || 0), 0) || 1;
  let walked = 0;
  return steps.map((step) => {
    if (step.done) return 0.995;
    const at = walked / total;
    walked += step.meters || 0;
    return at;
  });
}
