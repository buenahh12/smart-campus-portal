// Email updates for subscribers. The emails are sent by our Vercel function
// (api/email-subscribers.mjs) through EmailJS, so no email keys are in the website: the
// function checks that the caller is the administrator and keeps the EmailJS keys on the server.
// Setup steps are at the top of that file.
import { auth } from './firebase';

const EMAIL_ENDPOINT = import.meta.env.VITE_EMAIL_ENDPOINT || 'https://smart-campus-portal-one.vercel.app/api/email-subscribers';

// Returns counts so the admin sees exactly what happened; configured is false until the
// EmailJS keys are added in Vercel.
export async function emailSubscribers({ subject, message }) {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error('Sign in again as the administrator to send email updates.');
  const response = await fetch(EMAIL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ subject, message }),
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 503 && result.configured === false) return result;
  if (!response.ok) throw new Error(result.error || 'The email updates could not be sent.');
  return result;
}
