export function talkReadback(job: string, picture: string): string {
  const next = /Next call:\s*(.+)$/i.exec(picture)?.[1]?.trim();
  const status = picture
    .replace(/Next call:\s*.+$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");
  const head = status ? `${job}. ${status}.` : `${job}.`;
  if (next) return `${head} Next, ${next.replace(/^Next call:\s*/i, "")}. Confirm?`;
  return `${head} Confirm?`;
}

/** True when clarify text is a full status brief (not a one-shot question). */
export function isStatusBrief(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  if (/\b\d{1,3}\s*percent\b/i.test(t)) return true;
  if (/\b(YELLOW|RED|GREEN|HOLD|PAUSED)\b/.test(t) && t.includes(". ")) return true;
  if (/\bNext:\s*/i.test(t) && t.includes(". ")) return true;
  return false;
}

export function talkClarify(message: string): string {
  if (/which job|name the job/i.test(message)) {
    return "Which job is this — McMillan, DeBoard, Ciurlizza?";
  }
  // Status briefs must be spoken in full — never truncate to the job name.
  if (isStatusBrief(message)) {
    return message.replace(/\s+/g, " ").trim().slice(0, 600);
  }
  const first = message.split(". ").filter(Boolean)[0];
  return first ? `${first.replace(/\.$/, "")}?` : "Say that again for me?";
}

export function talkWake(): string {
  return "I'm here.";
}
