// Shared by the serverless functions in this folder (files starting with "_" are not routes).

const ALLOWED_ORIGINS = [/^https:\/\/smart-campus-portal[a-z0-9-]*\.vercel\.app$/, /^https:\/\/buenahh12\.github\.io$/, /^http:\/\/localhost:\d+$/];

export function cors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.some((pattern) => pattern.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Firebase-AppCheck");
}

export const bearerToken = (req) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");

// The website's App Check token, passed on when a function reads Firestore (needed once App
// Check is enforced). Only something shaped like a JWT is forwarded.
export const appCheckHeader = (req) => {
  const token = String(req.headers["x-firebase-appcheck"] || "");
  return token && token.length < 4096 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) ? { "X-Firebase-AppCheck": token } : {};
};

// The request must carry the administrator's Firebase ID token. Firebase checks the token's
// signature and expiry and tells us whose account it is; only the admin account passes.
export async function isAdmin(idToken) {
  const apiKey = (process.env.VITE_FIREBASE_API_KEY || "").trim();
  const adminEmail = (process.env.VITE_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!idToken || idToken.length > 4096 || !apiKey || !adminEmail) return false;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return false;
    const { users = [] } = await response.json();
    const user = users[0] || {};
    const byPassword = (user.providerUserInfo || []).some((item) => item.providerId === "password");
    return byPassword && !user.disabled && String(user.email || "").toLowerCase() === adminEmail;
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
