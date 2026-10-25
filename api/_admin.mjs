// Shared by the serverless functions in this folder (files starting with "_" are not routes).

const ALLOWED_ORIGINS = [/^https:\/\/smart-campus-portal[a-z0-9-]*\.vercel\.app$/, /^https:\/\/buenahh12\.github\.io$/, /^http:\/\/localhost:\d+$/];

export function cors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.some((pattern) => pattern.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

export const bearerToken = (req) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");

// The request must carry the administrator's Firebase ID token. Firebase checks the token's
// signature and expiry and tells us whose account it is; only the admin account passes.
export async function isAdmin(idToken) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  const adminEmail = (process.env.VITE_ADMIN_EMAIL || "").toLowerCase();
  if (!idToken || idToken.length > 4096 || !apiKey || !adminEmail) return false;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return false;
    const { users = [] } = await response.json();
    return String(users[0]?.email || "").toLowerCase() === adminEmail;
  } catch {
    return false;
  }
}

// Request body as an object; malformed JSON counts as empty instead of crashing the function.
export function jsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}
