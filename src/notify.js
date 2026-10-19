// Email updates for subscribers, sent through EmailJS (https://www.emailjs.com), a free
// service that delivers email from the browser without a server.
//
// Setup (once): create an EmailJS account, connect your Gmail as an Email Service, and
// create an Email Template whose "To email" is {{to_email}}, subject is {{subject}} and body
// uses {{to_name}}, {{message}} and {{site_url}}. Then add to .env.local:
//   VITE_EMAILJS_SERVICE_ID=...   VITE_EMAILJS_TEMPLATE_ID=...   VITE_EMAILJS_PUBLIC_KEY=...
import { listSubscribers } from './cms';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

export const emailConfigured = Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY);

const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Sends one email per subscriber. Returns counts so the admin sees exactly what happened.
export async function emailSubscribers({ subject, message }) {
  if (!emailConfigured) return { configured: false, total: 0, sent: 0, failed: 0 };
  const subscribers = await listSubscribers();
  let sent = 0;
  let failed = 0;
  for (const person of subscribers) {
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: SERVICE_ID,
          template_id: TEMPLATE_ID,
          user_id: PUBLIC_KEY,
          template_params: {
            to_email: person.email,
            to_name: person.name || 'there',
            subject,
            message,
            site_url: `${window.location.origin}${window.location.pathname}`,
          },
        }),
      });
      if (response.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
    // EmailJS limits how fast emails can be sent, so space them out a little.
    await pause(300);
  }
  return { configured: true, total: subscribers.length, sent, failed };
}
