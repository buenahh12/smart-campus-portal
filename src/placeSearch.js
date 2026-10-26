import { PLACES, placeByKey, placeTitle } from './floorPlans';

// Forgiving search for "Where do you want to go?", written for how children (and everyone)
// actually type: everyday words ("cr", "comfort room", "library", "way out"), grade levels and
// section names ("grade 3", "sapphire"), room numbers in any form ("204", "rm 204", "room204"),
// Filipino words, and small spelling mistakes ("clnic", "libary").
//
// searchPlace(query, fromKey) returns
//   { key }            the best place; with several equal matches (a CR on every floor) the one
//                      on the floor of fromKey, else the lowest floor
//   { exit: true }     they asked for a way out: show the nearest exit
//   { suggestions }    nothing certain; up to 3 close matches for "Did you mean…?"
//   null               nothing close

// Everyday words -> the word used in the floor plan names (or a tag added below).
const ALIASES = {
  cr: ['cr', 'comfort', 'restroom', 'restrooms', 'toilet', 'toilets', 'bathroom', 'bathrooms', 'washroom', 'banyo', 'palikuran', 'wc', 'lavatory'],
  girls: ['girls', 'girl', 'female', 'ladies', 'babae'],
  boys: ['boys', 'boy', 'male', 'gents', 'lalaki'],
  director: ['director', 'directors', 'principal', 'principals', 'head'],
  faculty: ['faculty', 'teacher', 'teachers', 'staff', 'guro'],
  library: ['library', 'books', 'aklatan'],
  computer: ['computer', 'computers', 'ict', 'comlab'],
  clinic: ['clinic', 'nurse', 'sick', 'infirmary', 'klinika', 'hurt'],
  guidance: ['guidance', 'counselor', 'counsellor', 'counseling', 'counselling'],
  lab: ['lab', 'labs', 'laboratory'],
  science: ['science', 'agham'],
  files: ['files', 'records', 'registrar'],
};
const EXIT_WORDS = ['exit', 'exits', 'out', 'labasan', 'labas', 'emergency', 'escape'];
// Words that carry no meaning in a place search.
const IGNORE = new Set(['the', 'a', 'an', 'to', 'go', 'where', 'is', 'i', 'want', 'need', 'take', 'me', 'find', 'please', 'show', 'way', 'room', 'rm', 'office', 'of', 'in', 'at', 'for', 'sa', 'ang', 'nasaan', 'saan', 'yung', 'po', 'ko', 'and', 'fire', 'nearest']);

const canonical = new Map(Object.entries(ALIASES).flatMap(([word, list]) => list.map((alias) => [alias, word])));

export const normalize = (text) => String(text || '')
  .toLowerCase()
  .replace(/c\.\s*r\.?/g, 'cr')
  .replace(/comfort\s+room/g, 'cr')
  .replace(/([a-z])(\d)/g, '$1 $2')
  .replace(/(\d)([a-z])/g, '$1 $2')
  .replace(/[^a-z0-9ñ\s]/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

// Spelling distance between two words (letters added, removed or changed).
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const kept = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length];
}

// How well one typed word matches one word of a place: 3 exact, 2 start of the word, 1.5 a
// small spelling mistake, 0 no match.
function wordScore(typed, word) {
  if (typed === word) return 3;
  if (typed.length >= 3 && word.startsWith(typed)) return 2;
  const allowed = typed.length >= 7 ? 2 : typed.length >= 4 ? 1 : 0;
  return allowed && distance(typed, word) <= allowed ? 1.5 : 0;
}

const searchable = () => PLACES
  .filter((place) => place.type !== 'stairs' && place.type !== 'exit' && !place.unlabeled)
  .map((place) => {
    const words = new Set(normalize(`${place.name} ${place.code}`).map((word) => canonical.get(word) || word));
    if (place.type === 'cr') words.add('cr');
    if (place.type === 'lab') words.add('lab');
    if (/physics|biology|chemistry/i.test(place.name)) words.add('science');
    return { place, words: [...words] };
  });

// Typed words, with everyday words swapped for the plan's word. A misspelled everyday word
// ("libary", "restrom") is matched against the alias list first.
function queryWords(query) {
  return normalize(query)
    .filter((word) => !IGNORE.has(word) && (word.length > 1 || /\d/.test(word))) // "where's" leaves a stray "s"
    .map((word) => {
      if (canonical.has(word)) return canonical.get(word);
      if (word.length >= 4) {
        const near = [...canonical.keys()].find((alias) => alias.length >= 4 && distance(word, alias) <= (word.length >= 7 ? 2 : 1));
        if (near) return canonical.get(near);
      }
      return word;
    });
}

// "3rd floor", "third", "ground floor", "4th": the floor they mean, taken out of the query.
const FLOOR_WORDS = [[/\b(1st|first|ground|g\/f|gf|unang)\b/, 1], [/\b(2nd|second|ikalawang)\b/, 2], [/\b(3rd|third|ikatlong)\b/, 3], [/\b(4th|fourth|ikaapat)\b/, 4]];
function takeFloor(query) {
  let text = String(query || '').toLowerCase();
  let floor = null;
  for (const [pattern, number] of FLOOR_WORDS) {
    if (pattern.test(text)) {
      floor = number;
      text = text.replace(pattern, ' ');
    }
  }
  return { text: text.replace(/\b(floor|flr|palapag)\b/g, ' '), floor };
}

export function searchPlace(query, fromKey = '') {
  const { text, floor } = takeFloor(query);
  query = text;
  const words = queryWords(query);
  if (!words.length) return null;
  // "exit", "way out", "fire exit", "labasan" (and "exti"): every meaningful word is about
  // getting out, so show the nearest exit.
  const isExitWord = (word) => EXIT_WORDS.includes(word) || (word.length >= 4 && EXIT_WORDS.some((exit) => exit.length >= 4 && distance(word, exit) <= 1));
  if (words.every(isExitWord)) return { exit: true };

  // A room number decides on its own.
  const number = words.find((word) => /^\d{3}$/.test(word));
  if (number) {
    const room = PLACES.find((place) => place.code.toLowerCase() === `room ${number}`);
    if (room) return { key: room.key };
  }

  const from = placeByKey(fromKey);
  // A named floor narrows the search to it (when that floor has a match at all).
  const onFloor = (items) => (floor && items.some(({ place }) => place.floor === floor) ? items.filter(({ place }) => place.floor === floor) : items);
  const scored = onFloor(searchable()).map(({ place, words: placeWords }) => {
    let total = 0;
    let matched = 0;
    for (const word of words) {
      const best = Math.max(0, ...placeWords.map((placeWord) => wordScore(word, placeWord)));
      total += best;
      if (best > 0) matched += 1;
    }
    return { place, total, matched };
  }).filter((item) => item.total > 0);
  if (!scored.length) return null;

  scored.sort((a, b) => b.matched - a.matched || b.total - a.total
    || Number(b.place.floor === from?.floor) - Number(a.place.floor === from?.floor)
    || a.place.floor - b.place.floor
    || placeTitle(a.place).length - placeTitle(b.place).length);
  const best = scored[0];
  // Every typed word matched: confident. Otherwise offer the closest few.
  if (best.matched === words.length) return { key: best.place.key };
  const seen = new Set();
  const suggestions = scored.filter((item) => {
    const title = placeTitle(item.place);
    if (seen.has(title)) return false;
    seen.add(title);
    return true;
  }).slice(0, 3).map((item) => item.place.key);
  return { suggestions };
}
