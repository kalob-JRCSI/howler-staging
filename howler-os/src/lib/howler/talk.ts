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

export function talkClarify(message: string): string {
  if (/which job|name the job/i.test(message)) {
    return "Which job is this — McMillan, DeBoard, Ciurlizza?";
  }
  const first = message.split(". ").filter(Boolean)[0];
  return first ? `${first.replace(/\.$/, "")}?` : "Say that again for me?";
}

export function talkWake(): string {
  return "I'm here.";
}
