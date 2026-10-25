// Vercel serverless function: makes an AI picture for an announcement.
//
// The free Pollinations.ai service refuses requests sent straight from a web page (it asks
// for a bot check), so the admin panel calls this function instead and it fetches the
// picture server-side. Only the administrator can use it: the request must carry the
// admin's Firebase ID token, which is checked with Firebase before anything else happens.
//
// POST /api/ai-picture   Authorization: Bearer <Firebase ID token>
// body: { "prompt": "...", "seed": 123 }  ->  image/jpeg
import { bearerToken, cors, isAdmin, jsonBody } from "./_admin.mjs";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  if (!(await isAdmin(bearerToken(req)))) return res.status(401).json({ error: "Only the administrator can make AI pictures." });

  const body = jsonBody(req);
  const prompt = String(body.prompt || "").slice(0, 400);
  const seed = Math.abs(Number.parseInt(body.seed, 10) || 0) % 1000000;
  if (!prompt.trim()) return res.status(400).json({ error: "Missing prompt." });

  // Needs a free Pollinations account key (POLLINATIONS_KEY in Vercel, a secret "sk_" key that
  // never reaches the browser). With it, nologo=true is honoured and pictures have no
  // watermark. The no-account service always stamps a watermark, so it is never used.
  const key = process.env.POLLINATIONS_KEY;
  if (!key) return res.status(503).json({ error: "nokey" });
  let upstream;
  try {
    upstream = await fetch(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=${encodeURIComponent("black-forest-labs/flux.1-schnell")}&width=768&height=432&seed=${seed}&nologo=true`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(50000) });
  } catch {
    return res.status(504).json({ error: "The AI service did not answer in time." });
  }
  if (upstream.status === 402 || upstream.status === 429) return res.status(429).json({ error: "credits" });
  const type = upstream.headers.get("content-type") || "";
  if (!upstream.ok || !type.startsWith("image/")) return res.status(502).json({ error: "The AI service did not return a picture." });

  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(Buffer.from(await upstream.arrayBuffer()));
}
