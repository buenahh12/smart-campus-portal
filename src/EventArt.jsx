import { useEffect, useId, useState } from "react";

// Pictures generated from what the admin types, with no image files to upload.
//  - AnnouncementArt: picks a scene from keywords in the title (Halloween, Christmas,
//    sports, graduation, exams, ...) and draws it with seeded randomness, so every
//    announcement gets its own arrangement. Unknown events get an abstract composition.
//    Optionally an AI picture (Pollinations.ai, free tier) fades in on top once it loads.
//  - ClosureArt: draws the closed stairs or hallway with a barrier and a CLOSED sign that
//    carries the real pathway name and reopening date.

const W = 320;
const H = 180;

const hash = (text) => {
  let value = 2166136261;
  for (const char of String(text)) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
};

// mulberry32: small seeded random number generator (0 <= n < 1).
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pick = (r, list) => list[Math.floor(r() * list.length)];
const between = (r, min, max) => min + r() * (max - min);
const at = (x, y, s = 1, rotate = 0) => `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotate.toFixed(1)}) scale(${s.toFixed(2)})`;

// ---------- Shapes (drawn around 0,0) ----------

const starPath = (r, inner = 0.45) => Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 ? r * inner : r;
  const angle = (Math.PI / 5) * i - Math.PI / 2;
  return `${i ? "L" : "M"}${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
}).join(" ") + "Z";

const Star = ({ x, y, r = 6, fill = "#f6d77a", rotate = 0 }) => <path transform={at(x, y, 1, rotate)} d={starPath(r)} fill={fill} />;

const Pumpkin = ({ x, y, s = 1 }) => <g transform={at(x, y, s)}>
  <path d="M-1 -16 q1 -7 7 -9" stroke="#3b6347" strokeWidth="3.5" fill="none" strokeLinecap="round" />
  <ellipse cx="-10" cy="0" rx="12" ry="15" fill="#c9611b" />
  <ellipse cx="10" cy="0" rx="12" ry="15" fill="#c9611b" />
  <ellipse cx="0" cy="0" rx="12" ry="16.5" fill="#e8822a" />
  <path d="M-10 -4 l4 -6 l4 6z M2 -4 l4 -6 l4 6z M-9 4 Q0 13 9 4 Q0 8 -9 4z" fill="#3a1d0e" />
</g>;

const Bat = ({ x, y, s = 1 }) => <path transform={at(x, y, s)} fill="#1b1026" d="M0 2 C-3 -4 -9 -6 -17 -3 C-12 -2 -10 0 -10 3 C-13 1 -16 2 -18 4 C-12 4 -7 6 -4 9 L-1 5 L0 7 L1 5 L4 9 C7 6 12 4 18 4 C16 2 13 1 10 3 C10 0 12 -2 17 -3 C9 -6 3 -4 0 2Z" />;

const Tree = ({ x, y, s = 1, r }) => <g transform={at(x, y, s)}>
  <rect x="-5" y="10" width="10" height="12" fill="#6b4226" />
  <path d="M0 -52 L20 -22 H9 L26 -2 H12 L32 14 H-32 L-12 -2 H-26 L-9 -22 H-20Z" fill="#2f7a4a" />
  {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={between(r, -20, 20) * (0.3 + i / 12)} cy={-40 + i * 6} r="2.6" fill={pick(r, ["#e0483e", "#f6d77a", "#f2f2f2", "#5aa9e6"])} />)}
  <Star x={0} y={-54} r={8} />
</g>;

const Parol = ({ x, y, s = 1, fill = "#e0483e" }) => <g transform={at(x, y, s)}>
  <path d="M-6 12 L-10 34 M0 12 V36 M6 12 L10 34" stroke="#f6d77a" strokeWidth="2" />
  <path d={starPath(16, 0.5)} fill={fill} stroke="#f6d77a" strokeWidth="1.5" />
  <circle r="5" fill="#f6d77a" />
</g>;

const Gift = ({ x, y, s = 1, fill = "#e0483e" }) => <g transform={at(x, y, s)}>
  <rect x="-12" y="-10" width="24" height="20" rx="2" fill={fill} />
  <rect x="-2.5" y="-10" width="5" height="20" fill="#f6d77a" />
  <rect x="-12" y="-4" width="24" height="5" fill="#f6d77a" />
  <path d="M0 -10 c-8 -9 -12 -2 -6 0 M0 -10 c8 -9 12 -2 6 0" stroke="#f6d77a" strokeWidth="2.5" fill="none" />
</g>;

const Ball = ({ x, y, s = 1, kind = "basket" }) => kind === "basket"
  ? <g transform={at(x, y, s)}><circle r="12" fill="#e07a2f" /><path d="M0 -12 V12 M-12 0 H12 M-8 -9 Q-2 0 -8 9 M8 -9 Q2 0 8 9" stroke="#3a1d0e" strokeWidth="1.3" fill="none" /></g>
  : <g transform={at(x, y, s)}><circle r="12" fill="#f8f5ee" stroke="#2b3a4a" strokeWidth="1.2" /><path d="M-11 -4 Q0 2 11 -4 M-6 10 Q-3 0 -8 -9 M7 9 Q4 0 9 -8" stroke="#2b5d8a" strokeWidth="1.4" fill="none" /></g>;

const Cap = ({ x, y, s = 1, rotate = 0 }) => <g transform={at(x, y, s, rotate)}>
  <path d="M-12 3 v8 q12 7 24 0 v-8" fill="#22302a" />
  <path d="M0 -9 L24 0 L0 9 L-24 0Z" fill="#111a15" />
  <path d="M0 0 L16 4 V14" stroke="#f6d77a" strokeWidth="1.6" fill="none" />
  <circle cx="16" cy="15" r="2.4" fill="#f6d77a" />
</g>;

const Balloon = ({ x, y, s = 1, fill = "#e0483e" }) => <g transform={at(x, y, s)}>
  <path d="M0 13 q-4 10 2 18 q5 8 -1 16" stroke="#6d6a62" strokeWidth="1" fill="none" />
  <ellipse rx="10" ry="13" fill={fill} />
  <path d="M-2 13 h4 l-2 -3z" fill={fill} />
  <ellipse cx="-4" cy="-5" rx="2.5" ry="4" fill="#fff" opacity=".35" />
</g>;

const Note = ({ x, y, s = 1, fill = "#fff", rotate = 0 }) => <g transform={at(x, y, s, rotate)} fill={fill}>
  <ellipse cx="-4" cy="10" rx="5.5" ry="4" transform="rotate(-20 -4 10)" />
  <rect x="0.5" y="-14" width="2.4" height="24" />
  <path d="M2.9 -14 q9 3 8 12 q-2 -6 -8 -6z" />
</g>;

const Cloud = ({ x, y, s = 1, fill = "#e9edf0" }) => <g transform={at(x, y, s)} fill={fill}>
  <circle cx="-14" cy="4" r="10" /><circle cx="0" cy="-4" r="14" /><circle cx="15" cy="3" r="11" /><rect x="-24" y="3" width="50" height="12" rx="6" />
</g>;

const Drop = ({ x, y, s = 1 }) => <path transform={at(x, y, s, 12)} d="M0 -7 C3 -2 4 1 4 3 A4 4 0 0 1 -4 3 C-4 1 -3 -2 0 -7Z" fill="#9cc7e6" />;

const Book = ({ x, y, s = 1, fill = "#2b5d8a", rotate = 0 }) => <g transform={at(x, y, s, rotate)}>
  <rect x="-16" y="-11" width="32" height="22" rx="2" fill={fill} />
  <rect x="-13" y="-8" width="26" height="16" fill="#fbf7ee" />
  <path d="M0 -8 V8 M-10 -3 H-3 M-10 1 H-3 M3 -3 H10 M3 1 H10" stroke="#b9ab8f" strokeWidth="1" />
</g>;

const Flask = ({ x, y, s = 1, fill = "#7fd3b5" }) => <g transform={at(x, y, s)}>
  <path d="M-4 -16 H4 V-5 L13 12 Q14 15 11 15 H-11 Q-14 15 -13 12 L-4 -5Z" fill="#eaf6f6" stroke="#cfe5e8" />
  <path d="M-8 4 H8 L12 12 Q13 14 11 14 H-11 Q-13 14 -12 12Z" fill={fill} />
  <circle cx="2" cy="-1" r="1.6" fill={fill} /><circle cx="-1" cy="-7" r="1.2" fill={fill} />
</g>;

const Atom = ({ x, y, s = 1 }) => <g transform={at(x, y, s)} fill="none" stroke="#9fe0f0" strokeWidth="1.6">
  <ellipse rx="22" ry="8" /><ellipse rx="22" ry="8" transform="rotate(60)" /><ellipse rx="22" ry="8" transform="rotate(-60)" />
  <circle r="3.5" fill="#f6d77a" stroke="none" />
</g>;

const Heart = ({ x, y, s = 1, fill = "#d94b64", rotate = 0 }) => <path transform={at(x, y, s, rotate)} d="M0 8 C-14 -2 -10 -13 -3 -11 C-1 -10 0 -8 0 -7 C0 -8 1 -10 3 -11 C10 -13 14 -2 0 8Z" fill={fill} />;

const Paper = ({ x, y, s = 1, rotate = 0 }) => <g transform={at(x, y, s, rotate)}>
  <rect x="-15" y="-20" width="30" height="40" rx="2" fill="#fffdf7" stroke="#d6cbb4" />
  <path d="M-9 -12 H9 M-9 -6 H9 M-9 0 H5 M-9 6 H9" stroke="#b9ab8f" strokeWidth="1.2" />
  <path d="M-6 13 l4 4 l9 -10" stroke="#2a7d4f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
</g>;

const Pencil = ({ x, y, s = 1, rotate = -35 }) => <g transform={at(x, y, s, rotate)}>
  <rect x="-24" y="-4" width="40" height="8" fill="#f2b632" />
  <rect x="-28" y="-4" width="5" height="8" fill="#e58a9a" />
  <path d="M16 -4 L26 0 L16 4Z" fill="#f1d9b0" /><path d="M23 -1.2 L26 0 L23 1.2Z" fill="#333" />
</g>;

const Fruit = ({ x, y, s = 1, fill = "#e0483e" }) => <g transform={at(x, y, s)}>
  <circle r="10" fill={fill} />
  <path d="M0 -10 q2 -5 6 -6" stroke="#5a3a1e" strokeWidth="1.6" fill="none" />
  <path d="M2 -12 q7 -6 11 0 q-6 4 -11 0z" fill="#4c9a4a" />
</g>;

const Bubble = ({ x, y, s = 1, fill = "#fff" }) => <g transform={at(x, y, s)}>
  <rect x="-20" y="-13" width="40" height="24" rx="8" fill={fill} />
  <path d="M-8 10 L-12 19 L0 11Z" fill={fill} />
  <path d="M-12 -4 H12 M-12 2 H6" stroke="#b9ab8f" strokeWidth="1.6" strokeLinecap="round" />
</g>;

const Flag = ({ x, y, s = 1 }) => <g transform={at(x, y, s)}>
  <rect x="-2" y="-30" width="3" height="62" fill="#8a7d63" />
  <path d="M1 -30 H45 V-8 H1Z" fill="#0038a8" /><path d="M1 -8 H45 V14 H1Z" fill="#ce1126" />
  <path d="M1 -30 L20 -8 L1 14Z" fill="#fff" /><circle cx="7.5" cy="-8" r="3.2" fill="#fcd116" />
</g>;

const Cone = ({ x, y, s = 1 }) => <g transform={at(x, y, s)}>
  <rect x="-11" y="10" width="22" height="4" rx="1" fill="#c25414" />
  <path d="M-8 10 L-2 -14 H2 L8 10Z" fill="#ee7a2a" />
  <path d="M-5.6 0 H5.6 L6.6 4 H-6.6Z" fill="#fff" />
</g>;

const Confetti = ({ r, count = 26, colors, top = 0, bottom = 150 }) => <g>{Array.from({ length: count }, (_, i) => <rect key={i} x={between(r, 6, W - 6)} y={between(r, top, bottom)} width="5" height="2.6" rx="1" fill={pick(r, colors)} transform={`rotate(${between(r, 0, 180).toFixed(0)} ${0} ${0})`} style={{ transformBox: "fill-box", transformOrigin: "center" }} />)}</g>;

// Fiesta bunting (banderitas) across the top.
const Bunting = ({ r, colors, y = 14 }) => {
  const sag = 16;
  const flags = 13;
  return <g>
    <path d={`M0 ${y} Q${W / 2} ${y + sag * 2} ${W} ${y}`} stroke="#6d6a62" strokeWidth="1" fill="none" />
    {Array.from({ length: flags }, (_, i) => {
      const t = (i + 0.5) / flags;
      const x = t * W;
      const cy = y + 2 * sag * 2 * t * (1 - t);
      return <path key={i} d={`M${(x - 9).toFixed(1)} ${cy.toFixed(1)} L${(x + 9).toFixed(1)} ${cy.toFixed(1)} L${x.toFixed(1)} ${(cy + 16).toFixed(1)}Z`} fill={colors[(i + Math.floor(r() * 2)) % colors.length]} />;
    })}
  </g>;
};

// ---------- Scenes ----------

const THEMES = [
  {
    key: "halloween", words: /hallowe+n|undas|costume|trick or treat|spooky|horror|haunted|zombie|ghost/,
    sky: ["#25183a", "#4a2c5e"], ground: "#1d1426", ai: "carved pumpkins, paper bats, children in cute costumes",
    draw: (r) => <>
      {Array.from({ length: 22 }, (_, i) => <circle key={i} cx={between(r, 0, W)} cy={between(r, 0, 110)} r={between(r, 0.5, 1.4)} fill="#f6efe1" opacity={between(r, 0.4, 0.9)} />)}
      <circle cx={between(r, 210, 270)} cy={between(r, 38, 52)} r="26" fill="#f6e7b0" />
      {Array.from({ length: 4 }, (_, i) => <Bat key={i} x={between(r, 30, 290)} y={between(r, 20, 90)} s={between(r, 0.7, 1.3)} />)}
      {Array.from({ length: 4 }, (_, i) => <Pumpkin key={i} x={30 + i * 80 + between(r, -14, 14)} y={between(r, 148, 156)} s={between(r, 0.9, 1.35)} />)}
    </>,
  },
  {
    key: "christmas", words: /christmas|pasko|xmas|simbang|noel|yuletide|holiday party|exchange gift|parol/,
    sky: ["#123524", "#1f5138"], ground: "#e9efe9", ai: "a Christmas tree, colorful parol star lanterns, gifts",
    draw: (r) => <>
      {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={between(r, 0, W)} cy={between(r, 0, 150)} r={between(r, 0.8, 2)} fill="#fff" opacity=".85" />)}
      <Tree x={between(r, 80, 120)} y={130} s={1.25} r={r} />
      <Parol x={between(r, 220, 260)} y={50} s={1.2} fill={pick(r, ["#e0483e", "#f2b632", "#5aa9e6"])} />
      <Parol x={between(r, 170, 190)} y={34} s={0.7} fill={pick(r, ["#e0483e", "#f2b632", "#5aa9e6"])} />
      {[0, 1, 2].map((i) => <Gift key={i} x={180 + i * 34 + between(r, -6, 6)} y={150 - i % 2 * 4} s={between(r, 0.9, 1.25)} fill={pick(r, ["#e0483e", "#5aa9e6", "#f2b632", "#9b59b6"])} />)}
    </>,
  },
  {
    key: "graduation", words: /graduat|moving up|commencement|recognition|honor|award|diploma|completion|baccalaureate/,
    sky: ["#1c3a2a", "#2f5e46"], ground: "#16301f", ai: "students in togas throwing graduation caps, diplomas",
    draw: (r) => <>
      {Array.from({ length: 12 }, (_, i) => <Star key={i} x={between(r, 10, W - 10)} y={between(r, 10, 140)} r={between(r, 3, 7)} rotate={between(r, 0, 60)} />)}
      {Array.from({ length: 5 }, (_, i) => <Cap key={i} x={40 + i * 60 + between(r, -10, 10)} y={between(r, 40, 120)} s={between(r, 0.9, 1.4)} rotate={between(r, -25, 25)} />)}
      <Confetti r={r} count={18} colors={["#f6d77a", "#f1c39a", "#ffffff"]} />
    </>,
  },
  {
    key: "sports", words: /sport|intramural|palaro|athlet|basketball|volleyball|football|futsal|badminton|fun run|marathon|olympic|fitness|track and field|tournament|varsity/,
    sky: ["#1f6f8b", "#7cc6d9"], ground: "#c9763a", ai: "students playing basketball and volleyball at a school sports fest",
    draw: (r) => <>
      <path d={`M0 150 H${W}`} stroke="#fff" strokeWidth="2" opacity=".7" />
      <path d={`M${W / 2} 150 V180`} stroke="#fff" strokeWidth="2" opacity=".7" />
      {Array.from({ length: 5 }, (_, i) => <Ball key={i} x={30 + i * 64 + between(r, -12, 12)} y={between(r, 50, 132)} s={between(r, 1, 1.6)} kind={i % 2 ? "volley" : "basket"} />)}
      <Bunting r={r} colors={["#e0483e", "#f2b632", "#2b5d8a", "#ffffff"]} />
    </>,
  },
  {
    key: "exam", words: /exam|quiz\b|\btests?\b|assessment|periodical|midterm|finals|review|reviewer|grades|report card|card giving/,
    sky: ["#f3ecdc", "#e6dcc6"], ground: "#d8ccb2", ai: "school desk with test papers, pencils, books, calm study mood",
    draw: (r) => <>
      {Array.from({ length: 4 }, (_, i) => <Paper key={i} x={60 + i * 66 + between(r, -8, 8)} y={between(r, 70, 100)} s={between(r, 1.1, 1.5)} rotate={between(r, -14, 14)} />)}
      <Pencil x={between(r, 120, 200)} y={140} s={1.4} rotate={between(r, -20, -8)} />
      <Book x={40} y={150} s={1.1} fill="#8a4c30" rotate={-6} /><Book x={278} y={148} s={1.1} fill="#2a7d4f" rotate={8} />
    </>,
  },
  {
    key: "music", words: /concert|music|\bsing|choir|dance|recital|\bband\b|talent|showcase|drama|theater|theatre|\bplay\b|\barts?\b|festival|film|contest|pageant|mr\.? and ms|search for/,
    sky: ["#3e1f62", "#b2507a"], ground: "#2a1442", ai: "students performing on a school stage with spotlights and music notes",
    draw: (r) => <>
      {[70, 160, 250].map((x, i) => <path key={i} d={`M${x} 0 L${x - 50} 160 H${x + 50}Z`} fill="#fff4c9" opacity=".12" />)}
      {Array.from({ length: 7 }, (_, i) => <Note key={i} x={between(r, 20, 300)} y={between(r, 30, 130)} s={between(r, 0.9, 1.5)} rotate={between(r, -20, 20)} fill={pick(r, ["#fff", "#f6d77a", "#f1c39a"])} />)}
      {Array.from({ length: 8 }, (_, i) => <Star key={i} x={between(r, 10, 310)} y={between(r, 8, 140)} r={between(r, 2, 5)} fill="#fff4c9" />)}
    </>,
  },
  {
    key: "science", words: /science|stem|robot|investigatory|research|math|quiz bee|olympiad|\btech|coding|computer|\blab\b|laboratory|innovation/,
    sky: ["#0f3a4a", "#1e6a7a"], ground: "#0b2a36", ai: "science fair with flasks, a robot and an atom model",
    draw: (r) => <>
      {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={between(r, 0, W)} cy={between(r, 0, 150)} r="1" fill="#9fe0f0" opacity=".5" />)}
      <Atom x={between(r, 220, 260)} y={60} s={1.6} />
      {Array.from({ length: 3 }, (_, i) => <Flask key={i} x={50 + i * 50 + between(r, -6, 6)} y={136} s={between(r, 1.2, 1.6)} fill={pick(r, ["#7fd3b5", "#f2b632", "#e58a9a", "#9fb8ff"])} />)}
    </>,
  },
  {
    key: "weather", words: /typhoon|\bstorm|\brain|flood|suspend|suspension|no class|class cancel|walang pasok|bagyo|signal no|weather|earthquake drill|fire drill|drill\b/,
    sky: ["#4a5a6a", "#7d8c99"], ground: "#56636f", ai: "rainy day with dark clouds over a school building, umbrellas",
    draw: (r) => <>
      {Array.from({ length: 4 }, (_, i) => <Cloud key={i} x={40 + i * 80 + between(r, -14, 14)} y={between(r, 30, 60)} s={between(r, 1, 1.5)} fill={pick(r, ["#e9edf0", "#cfd8df", "#b8c4cd"])} />)}
      {Array.from({ length: 36 }, (_, i) => <Drop key={i} x={between(r, 5, W - 5)} y={between(r, 70, 150)} s={between(r, 0.7, 1.1)} />)}
    </>,
  },
  {
    key: "valentine", words: /valentine|hearts? day|friendship day|\blove\b/,
    sky: ["#f6d5d8", "#e98c9a"], ground: "#d9707f", ai: "pastel hearts, flowers and friendship cards",
    draw: (r) => <>{Array.from({ length: 14 }, (_, i) => <Heart key={i} x={between(r, 15, 305)} y={between(r, 15, 150)} s={between(r, 0.8, 2.2)} rotate={between(r, -20, 20)} fill={pick(r, ["#d94b64", "#fff", "#b8324c", "#f5a3b2"])} />)}</>,
  },
  {
    key: "nutrition", words: /nutrition|food|healthy|fruit|vegetable|feeding|cooking|bake|cook/,
    sky: ["#e8f1d8", "#c9dfa6"], ground: "#9cc070", ai: "colorful fruits and vegetables, healthy food for kids",
    draw: (r) => <>{Array.from({ length: 9 }, (_, i) => <Fruit key={i} x={30 + (i % 5) * 64 + between(r, -10, 10)} y={i < 5 ? between(r, 120, 140) : between(r, 60, 90)} s={between(r, 1.1, 1.7)} fill={pick(r, ["#e0483e", "#f2a33a", "#f2d23a", "#7cb342"])} />)}</>,
  },
  {
    key: "national", words: /independence|kalayaan|buwan ng wika|linggo ng wika|wika|filipino|heroes|bayani|rizal|bonifacio|flag|national|peace|united nations|un day|cultural|culture|heritage|history/,
    sky: ["#f6efe1", "#e7dcc3"], ground: "#d8ccb2", ai: "Philippine flags and colorful banderitas at a school celebration",
    draw: (r) => <>
      <Bunting r={r} colors={["#0038a8", "#ce1126", "#fcd116", "#ffffff"]} />
      <Flag x={between(r, 70, 100)} y={110} s={1.4} />
      <Bubble x={between(r, 210, 240)} y={70} s={1.4} /><Bubble x={between(r, 260, 280)} y={112} s={1} fill="#fcd116" />
      <Book x={180} y={150} s={1.2} fill="#0038a8" rotate={-8} /><Book x={220} y={154} s={1.1} fill="#ce1126" rotate={6} />
    </>,
  },
  {
    key: "meeting", words: /meeting|pta|parent|orientation|assembly|seminar|conference|enrol+ment|registration|consultation|forum|general assembly|webinar|training|workshop/,
    sky: ["#e9efe5", "#cddcc8"], ground: "#a9bfa3", ai: "parents and teachers meeting in a bright school hall",
    draw: (r) => <>
      <Bubble x={between(r, 80, 110)} y={60} s={1.6} /><Bubble x={between(r, 190, 230)} y={48} s={1.3} fill="#f1c39a" />
      <Bubble x={between(r, 140, 160)} y={98} s={1.1} fill="#dcebdf" />
      {Array.from({ length: 6 }, (_, i) => <g key={i} transform={at(40 + i * 48, 150)}><rect x="-12" y="-12" width="24" height="5" rx="2" fill="#3b6347" /><rect x="-12" y="-28" width="5" height="21" rx="2" fill="#3b6347" /><path d="M-10 -7 V8 M10 -7 V8" stroke="#3b6347" strokeWidth="3" /></g>)}
    </>,
  },
  {
    key: "party", words: /party|celebrat|foundation|anniversary|birthday|fiesta|fair\b|family day|christmas|reunion|acquaintance|welcome|teachers'? day|teacher|children|kids|\bday\b/,
    sky: ["#f6e3c8", "#f1c39a"], ground: "#e3b98f", ai: "school celebration with balloons, confetti and banderitas",
    draw: (r) => <>
      <Bunting r={r} colors={["#8a4c30", "#2a7d4f", "#f2b632", "#5aa9e6", "#e0483e"]} />
      {Array.from({ length: 6 }, (_, i) => <Balloon key={i} x={30 + i * 52 + between(r, -10, 10)} y={between(r, 60, 100)} s={between(r, 1, 1.5)} fill={pick(r, ["#e0483e", "#2a7d4f", "#f2b632", "#5aa9e6", "#8a4c30"])} />)}
      <Confetti r={r} colors={["#e0483e", "#2a7d4f", "#f2b632", "#5aa9e6"]} top={40} bottom={160} />
    </>,
  },
];

// Unknown events: an abstract composition in the site palette, different for every title.
const PALETTE = ["#1c3a2a", "#3b6347", "#8a4c30", "#a3b18a", "#dcc9a3", "#f1c39a", "#2a7d4f"];
const abstractScene = (r) => {
  const shapes = [];
  for (let i = 0; i < 9; i += 1) {
    const x = between(r, -10, W + 10);
    const y = between(r, -10, H + 10);
    const size = between(r, 18, 70);
    const fill = pick(r, PALETTE);
    const kind = Math.floor(r() * 4);
    if (kind === 0) shapes.push(<circle key={i} cx={x} cy={y} r={size / 2} fill={fill} />);
    else if (kind === 1) shapes.push(<path key={i} d={`M${x - size / 2} ${y} A${size / 2} ${size / 2} 0 0 1 ${x + size / 2} ${y}Z`} fill={fill} transform={`rotate(${Math.floor(r() * 4) * 90} ${x} ${y})`} />);
    else if (kind === 2) shapes.push(<rect key={i} x={x - size / 2} y={y - size / 3} width={size} height={size / 1.5} rx={size / 6} fill={fill} />);
    else shapes.push(<path key={i} d={`M${x} ${y} q${size / 2} ${-size / 2} ${size} 0 t${size} 0`} stroke={fill} strokeWidth="6" strokeLinecap="round" fill="none" />);
  }
  return shapes;
};

export const themeFor = (text) => {
  const value = String(text || "").toLowerCase();
  return THEMES.find((theme) => theme.words.test(value)) || null;
};

// Waits until the admin stops typing before generating a new AI picture.
export function useDebounced(value, ms = 800) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const pictureSeed = (title, seed) => hash(String(title).trim().toLowerCase() || "campus") + Number(seed || 0) * 7919;

// The AI picture comes from our Vercel function (api/ai-picture.mjs), which works from
// both the Vercel and the GitHub Pages copy of the site.
const AI_PICTURE_ENDPOINT = import.meta.env.VITE_AI_PICTURE_ENDPOINT || "https://smart-campus-portal-one.vercel.app/api/ai-picture";

// Generates the AI picture once, for the admin, and returns a compressed JPEG data URL that
// is saved with the announcement. Visitors load that saved copy, so the free AI service
// (one picture every 45 seconds) is never called by the public.
export async function generateAiPicture(title, body, seed, idToken) {
  const theme = themeFor(`${title} ${body}`);
  const prompt = `Cheerful wordless children's book illustration for a Philippine school announcement: ${String(title).slice(0, 100)}. ${theme?.ai || "happy students at school"}. Bright, friendly, safe for kids, no text, no letters, no words.`;
  const response = await fetch(AI_PICTURE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ prompt, seed: pictureSeed(title, seed) % 100000 }),
  });
  if (response.status === 429 || response.status === 503) throw new Error((await response.json().catch(() => ({}))).error || "limit");
  if (!response.ok || !(response.headers.get("content-type") || "").startsWith("image/")) throw new Error("failed");
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
  context.drawImage(bitmap, (canvas.width - bitmap.width * scale) / 2, (canvas.height - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  return canvas.toDataURL("image/jpeg", 0.78);
}

export function AnnouncementArt({ title = "", body = "", picture = "ai", seed = 0, aiImage = "", className = "" }) {
  const artId = useId().replace(/:/g, "");
  if (picture === "none") return null;
  const theme = themeFor(`${title} ${body}`);
  const r = seeded(pictureSeed(title, seed));
  const showAi = picture === "ai" && aiImage;
  const [top, bottom] = theme?.sky || ["#efe6d2", "#e3d6bb"];
  const gradientId = `sky-${artId}`;
  return (
    <figure className={`event-art ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={theme ? `${theme.key} illustration` : "Event illustration"} preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={top} /><stop offset="1" stopColor={bottom} /></linearGradient></defs>
        <rect width={W} height={H} fill={`url(#${gradientId})`} />
        {theme ? <>
          {theme.ground && <path d={`M0 ${H - 26} Q${W / 2} ${H - 34} ${W} ${H - 26} V${H} H0Z`} fill={theme.ground} />}
          {theme.draw(r)}
        </> : abstractScene(r)}
      </svg>
      {showAi && <img className="event-art-ai" src={aiImage} alt="" />}
      {showAi && <figcaption>AI picture</figcaption>}
    </figure>
  );
}

// ---------- Closed hallway / stairs ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (key) => {
  const [y, m, d] = String(key).split("-").map(Number);
  return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : key;
};

// Splits text into at most `lines` lines of about `width` characters.
function wrap(text, width, lines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  let line = "";
  for (const word of words) {
    if ((`${line} ${word}`).trim().length > width && line) {
      out.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) out.push(line);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = `${out[lines - 1].slice(0, width - 1)}â€¦`;
  }
  return out;
}

const Hallway = () => <g>
  <path d="M0 0 H320 L250 50 H150Z" fill="#f6f0e3" />
  <path d="M0 0 L150 50 V118 L0 180Z" fill="#ece2cc" />
  <path d="M320 0 L250 50 V118 L320 180Z" fill="#e3d7bd" />
  <rect x="150" y="50" width="100" height="68" fill="#d8caab" />
  <path d="M0 180 L150 118 H250 L320 180Z" fill="#cdbd9c" />
  {[0.2, 0.4, 0.6, 0.8].map((t) => <path key={t} d={`M${150 + 100 * t} 118 L${320 * t} 180`} stroke="#bba985" strokeWidth="1" />)}
  <path d="M120 130 H280 M75 148 H300" stroke="#bba985" strokeWidth="1" />
  <path d="M40 42 L80 55 V140 L40 158Z" fill="#a8835c" /><circle cx="72" cy="100" r="2" fill="#f6d77a" />
  <path d="M286 40 L262 55 V120 L286 132Z" fill="#9b7853" />
  <path d="M175 18 H225 L218 26 H182Z" fill="#fff8dc" opacity=".9" /><path d="M188 38 H212 L208 44 H192Z" fill="#fff8dc" opacity=".8" />
</g>;

const Stairs = () => <g>
  <rect width="320" height="180" fill="#ece2cc" />
  <rect y="0" width="320" height="40" fill="#f6f0e3" />
  {Array.from({ length: 7 }, (_, i) => {
    const x = 10 + i * 34;
    const y = 158 - i * 20;
    return <g key={i}>
      <rect x={x} y={y} width={320 - x} height={180 - y} fill={i % 2 ? "#cdbd9c" : "#c2b08d"} />
      <rect x={x} y={y} width={320 - x} height="4" fill="#e3d7bd" />
    </g>;
  })}
  <path d="M14 112 L262 -12" stroke="#5c4a34" strokeWidth="4" strokeLinecap="round" />
  {[0, 1, 2, 3].map((i) => <path key={i} d={`M${30 + i * 68} ${104 - i * 34} V${150 - i * 40}`} stroke="#5c4a34" strokeWidth="2.5" />)}
</g>;

export function ClosureArt({ closure, className = "" }) {
  const id = useId().replace(/:/g, "");
  const text = `${closure.pathway || ""} ${closure.mapArea || ""}`.toLowerCase();
  const stairs = /stair|hagdan|steps|staircase/.test(text);
  const reason = closure.reason || "";
  const until = closure.endDate ? `Open again after ${prettyDate(closure.endDate)}` : "Open until further notice";
  const lines = wrap(closure.pathway || (stairs ? "Stairs" : "Hallway"), 21, 2);
  return (
    <figure className={`event-art closure-art ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${closure.pathway || "Pathway"} is closed. ${until}.`}>
        <defs>
          <pattern id={`stripes-${id}`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#fff" /><rect width="6" height="12" fill="#c8372d" /></pattern>
        </defs>
        {stairs ? <Stairs /> : <Hallway />}
        {/* barrier */}
        <g>
          <path d="M28 176 L44 120 M60 176 L44 120 M126 176 L142 120 M158 176 L142 120" stroke="#3a3a3a" strokeWidth="3.5" strokeLinecap="round" />
          <rect x="22" y="112" width="146" height="16" rx="2" fill={`url(#stripes-${id})`} stroke="#7a2019" strokeWidth="1" />
          <rect x="30" y="140" width="130" height="9" rx="2" fill={`url(#stripes-${id})`} stroke="#7a2019" strokeWidth="1" />
        </g>
        {/(maintenance|construction|safety|other)/i.test(reason) && <><Cone x={14} y={163} s={1} /><Cone x={168} y={164} s={0.95} /></>}
        {/cleaning/i.test(reason) && <g transform={at(166, 150)}>
          <path d="M-12 26 L-4 -14 H4 L12 26" fill="#f2c230" stroke="#9b7a12" strokeWidth="1.2" />
          <path d="M0 -6 L7 7 H-7Z" fill="none" stroke="#2b2b2b" strokeWidth="1.6" /><path d="M0 -2 V3" stroke="#2b2b2b" strokeWidth="1.6" />
        </g>}
        {/school event/i.test(reason) && <Bunting r={seeded(hash(closure.pathway || ""))} colors={["#8a4c30", "#2a7d4f", "#f2b632", "#5aa9e6"]} y={6} />}
        {/* sign */}
        <g>
          <path d="M222 150 V176 M290 150 V176" stroke="#5c4a34" strokeWidth="4" strokeLinecap="round" />
          <rect x="182" y="34" width="134" height="118" rx="6" fill="#fffdf7" stroke="#c8372d" strokeWidth="2.5" />
          <path d="M182 40 a6 6 0 0 1 6 -6 h122 a6 6 0 0 1 6 6 v26 h-134z" fill="#c8372d" />
          <path d="M191 60 L199 44 L207 60Z" fill="#fff" /><path d="M199 49.5 V55 M199 57.6 V57.8" stroke="#c8372d" strokeWidth="1.8" strokeLinecap="round" />
          <text x="258" y="58" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="800" letterSpacing="1.5" fontFamily="Archivo, system-ui, sans-serif">CLOSED</text>
          {lines.map((line, i) => <text key={i} x="249" y={84 + i * 13} textAnchor="middle" fill="#1b2a21" fontSize="10.5" fontWeight="700" fontFamily="Archivo, system-ui, sans-serif">{line}</text>)}
          {reason && <text x="249" y={84 + lines.length * 13 + 1} textAnchor="middle" fill="#5d6a5e" fontSize="8.5" fontFamily="Archivo, system-ui, sans-serif">{reason}</text>}
          {wrap(until, 27, 2).map((line, i, all) => <text key={i} x="249" y={(all.length > 1 ? 128 : 136) + i * 11} textAnchor="middle" fill="#8a4c30" fontSize="8.5" fontWeight="800" fontFamily="Archivo, system-ui, sans-serif">{line}</text>)}
        </g>
      </svg>
    </figure>
  );
}
