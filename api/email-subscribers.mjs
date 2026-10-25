// Vercel serverless function: emails an update to everyone who turned on email updates.
//
// Sending happens here, not in the browser, so the EmailJS keys never reach visitors. (With
// browser keys and a template whose recipient, subject and message are variables, anyone could
// send any email to anyone from the school's Gmail.) Only the administrator can call it: the
// request carries the admin's Firebase ID token, and the subscriber list is read with that same
// token, so firestore.rules still decide who may see it.
//
// Vercel environment variables (none start with VITE_, so none are put in the website):
//   EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY
// In EmailJS > Account > Security, turn on "Allow EmailJS API for non-browser applications"
// and "Use Private Key". The template's "To email" is {{to_email}}; it also uses {{subject}},
// {{to_name}}, {{message}} and {{site_url}}.
//
// POST /api/email-subscribers   Authorization: Bearer <Firebase ID token>
// body: { "subject": "...", "message": "..." }  ->  { configured, total, sent, failed, notSent }
import { bearerToken, cors, isAdmin, jsonBody } from "./_admin.mjs";

export const config = { maxDuration: 60 };

const SITE_URL = process.env.SITE_URL || "https://smart-campus-portal-one.vercel.app/";
const TIME_BUDGET_MS = 50000; // stop before Vercel's 60 s limit and report what was not sent
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function listSubscribers(idToken) {
  const project = process.env.VITE_FIREBASE_PROJECT_ID;
  const people = [];
  let pageToken = "";
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/subscribers?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!response.ok) throw new Error(`Subscriber list: HTTP ${response.status}`);
    const page = await response.json();
    for (const item of page.documents || []) {
      const email = item.fields?.email?.stringValue || "";
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) people.push({ email, name: item.fields?.name?.stringValue || "" });
    }
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return people;
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const idToken = bearerToken(req);
  if (!(await isAdmin(idToken))) return res.status(401).json({ error: "Only the administrator can email subscribers." });

  const { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY } = process.env;
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
    return res.status(503).json({ configured: false, total: 0, sent: 0, failed: 0, notSent: 0 });
  }

  const body = jsonBody(req);
  const subject = String(body.subject || "").trim().slice(0, 200);
  const message = String(body.message || "").trim().slice(0, 5000);
  if (!subject || !message) return res.status(400).json({ error: "Missing subject or message." });

  let subscribers;
  try {
    subscribers = await listSubscribers(idToken);
  } catch {
    return res.status(502).json({ error: "The subscriber list could not be read." });
  }

  const started = Date.now();
  let sent = 0;
  let failed = 0;
  for (const person of subscribers) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ID,
          user_id: EMAILJS_PUBLIC_KEY,
          accessToken: EMAILJS_PRIVATE_KEY,
          template_params: { to_email: person.email, to_name: person.name || "there", subject, message, site_url: SITE_URL },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
    // EmailJS limits how fast emails can be sent, so space them out a little.
    await pause(300);
  }
  const total = subscribers.length;
  return res.status(200).json({ configured: true, total, sent, failed, notSent: total - sent - failed });
}
