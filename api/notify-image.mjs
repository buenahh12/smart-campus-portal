// Vercel serverless function: the picture shown in a phone notification (like the photo in a
// Lazada or TikTok notification). A notification can only carry a link, and announcement photos
// are saved inside the announcement, so this serves that photo as a normal image.
//
// GET /api/notify-image?id=<announcement id>  ->  image/jpeg (or the school photo if it has none)
// Only published announcements are shown (firestore.rules lets anyone read those, nothing more).

const SITE_URL = process.env.SITE_URL || "https://smart-campus-portal-one.vercel.app/";
const FALLBACK = "campus/building-front.jpg";

export default async function handler(req, res) {
  const fallback = () => res.redirect(302, new URL(FALLBACK, SITE_URL).href);
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).end();
  const id = String(req.query?.id || "");
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return fallback();

  let doc;
  try {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents/announcements/${id}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return fallback();
    doc = await response.json();
  } catch {
    return fallback();
  }
  const data = doc.fields?.pictureData?.stringValue || "";
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!match || doc.fields?.published?.booleanValue !== true) return fallback();

  res.setHeader("Content-Type", match[1]);
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
  return res.status(200).send(Buffer.from(match[2], "base64"));
}
