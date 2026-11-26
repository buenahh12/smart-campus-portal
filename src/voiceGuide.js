// Voice guide for the 2D, 3D and AR directions: reads each step aloud in English or Tagalog, in
// the team's own recorded voices (public/voices/en-01.mp3 … tl-30.mp3). A direction without a
// recording (a distance, a room name…) is read by the phone's voice instead.
// The steps come from floorPlans.js describe() in a small set of English sentence shapes, so
// Tagalog is made by matching those shapes. Room names stay as they are on the signs.

const VOICE_KEY = "sscai-voice-guide";
export const VOICE_LANGS = { off: "Off", en: "English", tl: "Tagalog" };

const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
export const voiceSupported = () => typeof window !== "undefined" && (typeof Audio !== "undefined" || ttsSupported());

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


// ---------- Recorded clips ----------
// One English direction -> the numbers of the clips that say it (see the recording script), or
// null when a part has no recording. Distances and room names are left out on purpose: the screen
// shows them.
const LINE_RULES = [
  [/^stand in the doorway/i, ["25"]],
  [/^you are off the route/i, ["22"]],
  [/^wrong way/i, ["23"]],
  [/^point your phone/i, ["26"]],
  [/^nearest exit\.?$/i, ["28"]],
  [/^this hallway is closed/i, ["27"]],
];
const UP = { "2nd floor": "12", "3rd floor": "13", "4th floor": "14" };
const DOWN = { "3rd floor": "15", "2nd floor": "16", "ground floor": "17", "1st floor": "17" };
const PART_RULES = [
  [/^start at /i, () => ["01"]],
  [/^follow the arrows to /i, () => ["01"]],
  [/^leave /i, () => ["10"]],
  [/^take the .+ up to the (.+)$/i, (m) => (UP[m[1].toLowerCase()] ? [UP[m[1].toLowerCase()]] : null)],
  [/^take the .+ down to the (.+)$/i, (m) => (DOWN[m[1].toLowerCase()] ? [DOWN[m[1].toLowerCase()]] : null)],
  [/^go out through /i, () => ["29"]],
  [/^(arrive at|you have arrived at) /i, () => ["21"]],
  [/^you will arrive at /i, () => ["19"]],
  [/^you are already there$/i, () => ["24"]],
  [/^step off the stairs and turn left$/i, () => ["11", "03"]],
  [/^step off the stairs and turn right$/i, () => ["11", "04"]],
  [/^step off the stairs( and turn around and walk)?$/i, (m) => (m[1] ? ["11", "05"] : ["11"])],
  [/^step out of the stairway$/i, () => ["11"]],
  [/^step out into the hallway$/i, () => ["10"]],
  [/^turn left down the hallway$/i, () => ["06"]],
  [/^turn right down the hallway$/i, () => ["07"]],
  [/^turn around(?: and walk)?(?: .*)?$/i, () => ["05"]],
  [/^turn left(?: .*)?$/i, () => ["03"]],
  [/^turn right(?: .*)?$/i, () => ["04"]],
  [/^walk down the hallway$/i, () => ["08"]],
  [/^go ahead a few steps$/i, () => ["09"]],
  [/^walk through /i, () => ["18"]],
  [/^(keep going|walk)(?: straight| past .+| about \d+ m| to .+)?$/i, () => ["02"]],
  [/^following the arrows on the steps$/i, () => []],
];
export function clipsFor(text) {
  const line = String(text || "").trim();
  for (const [pattern, ids] of LINE_RULES) if (pattern.test(line)) return ids;
  const ids = [];
  const sentences = line.split(/(?<=[a-z0-9)]\.)\s+/);
  for (const sentence of sentences) {
    for (const piece of sentence.replace(/\.$/, "").split(/, then |, (?=following)/i)) {
      const part = piece.trim();
      if (!part) continue;
      const rule = PART_RULES.find(([pattern]) => pattern.test(part));
      const found = rule && rule[1](part.match(rule[0]));
      if (!found) return null;
      ids.push(...found);
    }
  }
  return ids.length ? ids : null;
}

// A queue of things to say, one after another: recorded clips, or the phone's voice.
let queue = [];
let current = null;
let token = 0;
const clipUrl = (lang, id) => `${import.meta.env.BASE_URL}voices/${lang}-${id}.mp3`;

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

function next(myToken) {
  if (myToken !== token) return;
  const item = queue.shift();
  if (!item) { current = null; return; }
  const done = () => next(myToken);
  if (item.clip) {
    const audio = new Audio(item.clip);
    current = audio;
    audio.onended = done;
    audio.onerror = () => { queue.unshift({ text: item.fallback, lang: item.lang }); done(); };
    audio.play().catch(() => { queue.unshift({ text: item.fallback, lang: item.lang }); done(); });
  } else if (item.text && ttsSupported()) {
    const utterance = new SpeechSynthesisUtterance(item.lang === "tl" ? toTagalog(item.text) : item.text);
    const voice = pickVoice(item.lang);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || (item.lang === "tl" ? "fil-PH" : "en-US");
    utterance.rate = 0.95;
    utterance.onend = done;
    utterance.onerror = done;
    current = utterance;
    window.speechSynthesis.speak(utterance);
  } else {
    done();
  }
}

// Says English directions (one line or several) in "en" or "tl": the newest call wins, so an old
// step is never read out late.
export function speak(lines, lang) {
  if (lang === "off" || !lines) return;
  stopSpeaking();
  const list = (Array.isArray(lines) ? lines : [lines]).map((line) => String(line || "").trim()).filter(Boolean);
  queue = [];
  for (const line of list) {
    const ids = clipsFor(line);
    if (ids) {
      if (ids.length === 0) continue;
      ids.forEach((id, index) => queue.push({ clip: clipUrl(lang, id), lang, fallback: index === 0 ? line : "" }));
    } else {
      queue.push({ text: line, lang });
    }
  }
  token += 1;
  next(token);
}

// Phones only allow sound after a tap: call this from the tap that turns the voice guide on.
export function unlockVoice() {
  try {
    const audio = new Audio(clipUrl("en", "02"));
    audio.volume = 0;
    audio.play().then(() => audio.pause()).catch(() => {});
  } catch { /* no audio */ }
  if (ttsSupported()) {
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  }
}

export function stopSpeaking() {
  token += 1;
  queue = [];
  if (current instanceof Audio) { current.onended = null; current.onerror = null; current.pause(); }
  current = null;
  if (ttsSupported()) window.speechSynthesis.cancel();
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
