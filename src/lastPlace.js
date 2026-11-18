// Where the person last said they were (or last arrived), shared by the 2D Guide, 3D and AR.
// Phones can't tell which room or floor they are in indoors, so we remember the last place the
// person chose or reached, with the time, and treat it as "probably still here" for an hour.
import { PLACES, placeByKey } from "./floorPlans";

const KEY = "campus-map-start"; // same key the 2D Guide and AR already used
const AT = "campus-map-start-at";
export const FRESH_MS = 60 * 60 * 1000;

export function rememberPlace(key) {
  if (!key || !placeByKey(key)) return;
  try {
    localStorage.setItem(KEY, key);
    localStorage.setItem(AT, String(Date.now()));
  } catch { /* storage unavailable */ }
}

export function lastPlace() {
  try {
    const key = localStorage.getItem(KEY);
    const place = key && placeByKey(key);
    if (!place) return null;
    const at = Number(localStorage.getItem(AT)) || 0;
    return { key, place, at, fresh: at > 0 && Date.now() - at < FRESH_MS };
  } catch {
    return null;
  }
}

// "8 min ago", "just now".
export function agoText(at) {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
}

// A starting point on a floor when we don't know the room: the room nearest the middle of that
// floor, so the guess is never far off. (Stairs and exits are left out: the From list can't show them.)
const centerOf = (item) => [item.rect[0] + item.rect[2] / 2, item.rect[1] + item.rect[3] / 2];
export const floorStart = (floor) => {
  const rooms = PLACES.filter((item) => item.floor === floor && item.rect && item.type !== "stairs" && item.type !== "exit" && !(item.unlabeled && item.type === "classroom"));
  if (!rooms.length) return null;
  const centers = rooms.map(centerOf);
  const mx = centers.reduce((sum, [x]) => sum + x, 0) / centers.length;
  const my = centers.reduce((sum, [, y]) => sum + y, 0) / centers.length;
  const distance = (item) => Math.hypot(centerOf(item)[0] - mx, centerOf(item)[1] - my);
  return rooms.reduce((best, item) => (distance(item) < distance(best) ? item : best)).key;
};
