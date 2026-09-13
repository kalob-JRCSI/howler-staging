/**
 * Howler is the product. Users buy Howler. They never buy Grok, ChatGPT, or Whisper.
 *
 * Cloud models are rented engines behind Howler’s own APIs — same as Twilio for SMS.
 * Howler holds the vendor key (or a firm BYOK later). If the vendor is down or unpaid,
 * Howler still runs: jobs, interpret, confirm, dashboard, browser mic, local spoken copy.
 *
 * Swap a vendor by changing these routes. Do not put a vendor name in the UI.
 */
export const HOWLER_CLOUD = {
  hear: "/api/transcribe",
  speak: "/api/howler-speak",
  intent: "/api/howler-intent",
} as const;
