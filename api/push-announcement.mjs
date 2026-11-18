// Vercel serverless function: sends a phone notification (Web Push) to everyone who tapped
// "Notify me", e.g. "Walang pasok bukas". Only the administrator can call it.
//
// Vercel environment variable (not VITE_, so it never reaches the website):
//   VAPID_PRIVATE_KEY   private half of the site's push key pair (public half is in src/push.js)
//
// POST /api/push-announcement   Authorization: Bearer <Firebase ID token>
// body: { "title": "...", "message": "..." }  ->  { configured, total, sent, failed, removed }
import webpush from "web-push";
import { appCheckHeader, bearerToken, cors, isAdmin, jsonBody } from "./_admin.mjs";

export const config = { maxDuration: 60 };

const VAPID_PUBLIC_KEY = "BPuUqIWf1cpHtFn4UR3DEEssXQy_EaGZx6zIvEbrr0Gi8HtTb8sglDYB76xL-CXjBtDpzq-L6BG0WPTaAmvOGkA";
const SITE_URL = process.env.SITE_URL || "https://smart-campus-portal-one.vercel.app/";
const BATCH = 25;

const documentsUrl = () => `https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents`;

async function listPhones(idToken, extraHeaders) {
  const phones = [];
  let pageToken = "";
  do {
    const response = await fetch(`${documentsUrl()}/pushSubscriptions?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, { headers: { Authorization: `Bearer ${idToken}`, ...extraHeaders } });
    if (!response.ok) throw new Error(`Phone list: HTTP ${response.status}`);
    const page = await response.json();
    for (const item of page.documents || []) {
      const f = item.fields || {};
      const endpoint = f.endpoint?.stringValue || "";
      if (endpoint.startsWith("https://")) phones.push({ name: item.name, subscription: { endpoint, keys: { p256dh: f.p256dh?.stringValue || "", auth: f.auth?.stringValue || "" } } });
    }
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return phones;
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const idToken = bearerToken(req);
  if (!(await isAdmin(idToken))) return res.status(401).json({ error: "Only the administrator can send notifications." });

  const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
  if (!privateKey) return res.status(503).json({ configured: false, total: 0, sent: 0, failed: 0, removed: 0 });
  webpush.setVapidDetails(SITE_URL.replace(/\/$/, ""), VAPID_PUBLIC_KEY, privateKey);

  const body = jsonBody(req);
  const title = String(body.title || "").trim().slice(0, 120);
  const message = String(body.message || "").trim().slice(0, 400);
  if (!title) return res.status(400).json({ error: "Missing title." });
  const payload = JSON.stringify({ title, body: message, url: `${SITE_URL}#updates`, tag: `sscai-${Date.now()}` });

  const headers = appCheckHeader(req);
  let phones;
  try {
    phones = await listPhones(idToken, headers);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }

  let sent = 0;
  let failed = 0;
  let removed = 0;
  for (let index = 0; index < phones.length; index += BATCH) {
    await Promise.all(phones.slice(index, index + BATCH).map(async (phone) => {
      try {
        await webpush.sendNotification(phone.subscription, payload, { TTL: 2 * 24 * 60 * 60, urgency: "high" });
        sent += 1;
      } catch (error) {
        failed += 1;
        // 404/410: the phone turned notifications off or the browser was reset; forget it.
        if (error.statusCode === 404 || error.statusCode === 410) {
          const gone = await fetch(`https://firestore.googleapis.com/v1/${phone.name}`, { method: "DELETE", headers: { Authorization: `Bearer ${idToken}`, ...headers } }).catch(() => null);
          if (gone?.ok) removed += 1;
        }
      }
    }));
  }
  return res.status(200).json({ configured: true, total: phones.length, sent, failed, removed });
}
