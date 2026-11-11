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

// Simple, everyday Taglish, the way students and guards give directions: "Liko sa kaliwa",
// "Diretso lang", "Akyat sa hagdan". Hallway, stairs and room names stay in English like the signs.
const name = (text) => text.replace(/\bthe two /gi, "dalawang ").replace(/\bthe /gi, "").replace(/ and /g, " at ");
const TURN = { "turn left": "liko sa kaliwa", "turn right": "liko sa kanan", "turn around and walk": "balik ka" };
const T = "(turn left|turn right|turn around and walk)";
const RULES = [
  [/^start at the (.+) on the (.+)$/i, (m) => `simula sa ${name(m[1])}, ${m[2]}`],
  [/^leave (.+) \((.+)\)$/i, (m) => `labas sa ${name(m[1])} (${m[2]})`],
  [/^take the (.+) up to the (.+)$/i, (m) => `akyat sa ${name(m[1])} papuntang ${m[2]}`],
  [/^take the (.+) down to the (.+)$/i, (m) => `baba sa ${name(m[1])} papuntang ${m[2]}`],
  [/^go out through the (.+)$/i, (m) => `labas sa ${name(m[1])}`],
  [/^(?:arrive at|you have arrived at) (.+)$/i, (m) => `nandito ka na sa ${name(m[1])}`],
  [/^you will arrive at (.+)$/i, (m) => `doon na ang ${name(m[1])}`],
  [/^walk to (.+?)(?: in the (.+))?$/i, (m) => `lakad papunta sa ${name(m[1])}`],
  [/^follow the arrows to (.+)$/i, (m) => `sundan ang arrow papunta sa ${name(m[1])}`],
  [/^you are off the route$/i, () => "wala ka na sa daan"],
  [/^walk back to the arrows.*$/i, () => "bumalik sa mga arrow"],
  [/^tap next at the turn$/i, () => "pindutin ang Next pagdating sa liko"],
  [/^tap next on the (.+)$/i, (m) => `pindutin ang Next pagdating sa ${m[1]}`],
  [new RegExp(`^step off the stairs(?: and ${T})?$`, "i"), (m) => `paglabas sa hagdan${m[1] ? `, ${TURN[m[1].toLowerCase()]}` : ""}`],
  [/^walk down the hallway$/i, () => "lakad lang sa hallway"],
  // The AR live view screen.
  [/^(\d+) m left$/i, (m) => `${m[1]} metro pa`],
  [/^(\d+) m left \(about (\d+) steps\)$/i, (m) => `${m[1]} metro pa (mga ${m[2]} hakbang)`],
  [/^following the arrows on the steps$/i, () => "sundan ang arrow sa hagdan"],
  [/^stand in the doorway of (.+) with your back to the room$/i, (m) => `tumayo sa pinto ng ${name(m[1])}, nakatalikod sa room`],
  [/^facing the hallway$/i, () => "nakaharap sa hallway"],
  [/^then tap start$/i, () => "tapos pindutin ang Start"],
  [/^choose where you are \(from\) and where you want to go \(to\)$/i, () => "piliin kung nasaan ka (From) at saan ka pupunta (To)"],
  [/^you are already there$/i, () => "nandito ka na"],
  [/^keep going straight$/i, () => "diretso lang"],
  [/^keep going past (.+)$/i, (m) => `diretso lang, lampas sa ${name(m[1])}`],
  [/^walk past (.+)$/i, (m) => `lakad lampas sa ${name(m[1])}`],
  [/^walk through (.+)$/i, (m) => `dumaan sa ${name(m[1])}`],
  [new RegExp(`^${T} and walk through (.+)$`, "i"), (m) => `${TURN[m[1].toLowerCase()]}, dumaan sa ${name(m[2])}`],
  [/^(turn left|turn right) at (.+)$/i, (m) => `${TURN[m[1].toLowerCase()]} pagdating sa ${name(m[2])}`],
  [new RegExp(`^${T} and walk past (.+)$`, "i"), (m) => `${TURN[m[1].toLowerCase()]}, lampas sa ${name(m[2])}`],
  [new RegExp(`^${T} down the hallway$`, "i"), (m) => `${TURN[m[1].toLowerCase()]} sa hallway`],
  [new RegExp(`^${T} and walk about (\\d+) m$`, "i"), (m) => `${TURN[m[1].toLowerCase()]}, lakad ng ${m[2]} metro`],
  [new RegExp(`^${T}$`, "i"), (m) => TURN[m[1].toLowerCase()]],
  [/^walk about (\d+) m$/i, (m) => `lakad ng ${m[1]} metro`],
  [/^keep going about (\d+) m$/i, (m) => `diretso lang ng ${m[1]} metro`],
  [/^go ahead a few steps$/i, () => "konting lakad pa"],
  [/^step out into the hallway$/i, () => "labas sa hallway"],
  [/^step out of the stairway$/i, () => "labas sa hagdan"],
];
const part = (text) => {
  for (const [pattern, make] of RULES) {
    const m = pattern.exec(text.trim());
    if (m) return make(m);
  }
  return text.trim();
};
const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);

// One English direction (one or more sentences, parts joined by ", then ") -> simple Tagalog.
export function toTagalog(text) {
  // A sentence ends at a full stop after a small letter or a number ("6 m.", "floor."), never
  // inside a name like "C.R." or "C.R. Girls".
  return text.split(/(?<=[a-z0-9)]\.)\s+/).map((sentence) => {
    const end = /[a-z0-9)]\.$/.test(sentence) ? "." : "";
    const body = end ? sentence.slice(0, -1) : sentence;
    return cap(body.split(/, then /i).flatMap((piece) => piece.split(/, (?=following|facing)/i)).map(part).join(", tapos ").replace(/, tapos (sundan ang arrow sa hagdan|nakaharap)/g, ", $1")) + end;
  }).join(" ").trim();
}

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
