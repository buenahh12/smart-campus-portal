// Vercel serverless function: makes an AI picture for an announcement.
//
// The free Pollinations.ai service refuses requests sent straight from a web page (it asks
// for a bot check), so the admin panel calls this function instead and it fetches the
// picture server-side. Only the administrator can use it: the request must carry the
// admin's Firebase ID token, which is checked with Firebase before anything else happens.
//
// POST /api/ai-picture   Authorization: Bearer <Firebase ID token>
// body: { "prompt": "...", "seed": 123 }  ->  image/jpeg

export const config = { maxDuration: 60 };

const ALLOWED_ORIGINS = [/^https:\/\/smart-campus-portal[a-z0-9-]*\.vercel\.app$/, /^https:\/\/buenahh12\.github\.io$/, /^http:\/\/localhost:\d+$/];

function cors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.some((pattern) => pattern.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

async function isAdmin(idToken) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  const adminEmail = (process.env.VITE_ADMIN_EMAIL || "").toLowerCase();
  if (!idToken || !apiKey || !adminEmail) return false;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return false;
  const { users = [] } = await response.json();
  return String(users[0]?.email || "").toLowerCase() === adminEmail;
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const idToken = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!(await isAdmin(idToken))) return res.status(401).json({ error: "Only the administrator can make AI pictures." });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const prompt = String(body.prompt || "").slice(0, 400);
  const seed = Math.abs(Number.parseInt(body.seed, 10) || 0) % 1000000;
  if (!prompt.trim()) return res.status(400).json({ error: "Missing prompt." });

  // With a free Pollinations account key (POLLINATIONS_KEY in Vercel, a secret "sk_" key that
  // never reaches the browser) pictures use the better FLUX model without the anonymous limit.
  // Without a key the anonymous service is tried, which is usually busy from shared servers.
  const key = process.env.POLLINATIONS_KEY;
  const upstream = key
    ? await fetch(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=${encodeURIComponent("black-forest-labs/flux.1-schnell")}&width=768&height=432&seed=${seed}&nologo=true`, { headers: { Authorization: `Bearer ${key}` } })
    : await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=432&seed=${seed}&nologo=true`, { signal: AbortSignal.timeout(45000) }).catch(() => ({ status: 429, ok: false, headers: new Headers() }));
  if (upstream.status === 402 || upstream.status === 429) return res.status(429).json({ error: key ? "credits" : "limit" });
  const type = upstream.headers.get("content-type") || "";
  if (!upstream.ok || !type.startsWith("image/")) return res.status(502).json({ error: "The AI service did not return a picture." });

  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(Buffer.from(await upstream.arrayBuffer()));
}
