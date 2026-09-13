export type MicPlatform = "windows" | "ios" | "mac" | "other";

export function micPlatform(): MicPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPod/.test(ua) || (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  if (iOS) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X/i.test(ua)) return "mac";
  return "other";
}

export function micNeedsTap(): boolean {
  return micPlatform() === "ios";
}

export function micAskingCopy(): string {
  const platform = micPlatform();
  if (platform === "windows") {
    return "Asking Chrome/Edge for the microphone. Click Allow on the prompt or the padlock by the URL. If nothing appears: Windows Settings → Privacy & security → Microphone → on, then allow this browser.";
  }
  if (platform === "ios") {
    return "Tap Allow on the iPhone/iPad prompt. If it never appears: Settings → Safari (or Chrome) → Microphone → Allow, then come back and tap Allow microphone.";
  }
  if (platform === "mac") {
    return "Click Allow on the prompt. If none: System Settings → Privacy & Security → Microphone → this browser on.";
  }
  return "Click Allow on the browser prompt. If none, turn on microphone access for this browser in the computer’s privacy settings.";
}

export function micBlockedCopy(): string {
  const platform = micPlatform();
  if (platform === "windows") {
    return "Microphone is blocked. Windows Settings → Privacy & security → Microphone → turn access on, then allow Chrome or Edge. Then padlock by this URL → Site settings → Microphone → Allow. Click Try microphone again.";
  }
  if (platform === "ios") {
    return "iPhone/iPad blocked the mic. Settings → Safari or Chrome → Microphone → Allow. Open Howler again and tap Allow microphone. Then tap the orb and speak — a website cannot listen like Siri when the phone is locked.";
  }
  if (platform === "mac") {
    return "Microphone is blocked. System Settings → Privacy & Security → Microphone → this browser on. Then the padlock by the URL → Microphone → Allow.";
  }
  return "Microphone is blocked for this site. Allow it in the browser site settings and in the computer’s privacy settings.";
}

export function micIdleCopy(): string {
  if (micNeedsTap()) {
    return "Tap Allow once, tap the orb, talk, Confirm.";
  }
  if (micPlatform() === "windows") {
    return "Allow microphone once. Then Hey Howler, the update, Confirm.";
  }
  return "Allow microphone once. Then Hey Howler, the update, Confirm.";
}

export function micReadyCopy(): string {
  return micNeedsTap() ? "Tap the orb, then speak. Confirm." : "Say Hey Howler anytime. Confirm.";
}
