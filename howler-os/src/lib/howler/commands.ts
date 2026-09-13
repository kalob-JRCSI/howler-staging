/**
 * Every manual Plans / Budget action has a Tell Howler phrase.
 * Uploads are recognized by filename against the recorded Deboard set.
 * Howler does not OCR an arbitrary PDF into geometry.
 */
import type { EvidenceKind } from "./types";

export interface CommandExample {
  phrase: string;
  does: string;
  group: "Plans" | "Issue" | "Code" | "Upload" | "Job";
}

export const COMMAND_EXAMPLES: CommandExample[] = [
  { group: "Upload", phrase: "Review the Deboard plans from my Google Drive", does: "Adopt the recorded Tradewalk set" },
  { group: "Upload", phrase: "Use the Tradewalk plans", does: "Same as dropping Deboard Tradewalk Plans.pdf" },
  { group: "Plans", phrase: "Draw the working set", does: "Generate A01–A11 + A15 from the live model" },
  { group: "Plans", phrase: "Fill conventional framing", does: "Same as the conventional button" },
  { group: "Plans", phrase: "Rooms from scope", does: "Name rooms from included scope" },
  { group: "Plans", phrase: "24 by 32 garage, 9 foot walls, 8/12 roof", does: "Record envelope (proposed, not field-measured)" },
  { group: "Plans", phrase: "Man door 2868 on the left", does: "Tag and size from the door schedule" },
  { group: "Plans", phrase: "16 by 7 overhead on the front", does: "Record an OHD only when you name the size" },
  { group: "Plans", phrase: "Face of framing", does: "Dimension datum" },
  { group: "Issue", phrase: "Mark envelope verified", does: "Field measurement, not a sketch" },
  { group: "Issue", phrase: "Mark the drawings reviewed", does: "Reviewed, not issued" },
  { group: "Issue", phrase: "Issue the drawings", does: "Issue for layout — lists unresolved" },
  { group: "Issue", phrase: "Export the PDF", does: "Print the set and queue issue" },
  { group: "Code", phrase: "What's the code basis", does: "2018 KRC / 815 KAR 7:125" },
  { group: "Code", phrase: "What's the stair code", does: "KY 8¼\" / 9\" — not IRC 7¾ / 10" },
  { group: "Code", phrase: "What's SB3621", does: "3'-6\" × 2'-1\" window tag — not a Simpson holdown" },
  { group: "Job", phrase: "Hey Howler, McMillan exterior is closing out", does: "Wake + mark released closeout in progress. Interior stays held." },
  { group: "Job", phrase: "How's McMillan", does: "Spoken brief — no mutation" },
  { group: "Job", phrase: "Add scope mini split for the office", does: "Ripple: scope + unpriced CO. Revised unchanged" },
  { group: "Job", phrase: "Footing inspection passed", does: "Inspections card — not a PE stamp" },
  { group: "Job", phrase: "Permit submitted", does: "AHJ filing, not issued" },
  { group: "Job", phrase: "Add contact Medina Plumbing plumbing", does: "Trades / vendors" },
  { group: "Job", phrase: "Photo: footing rebar before pour", does: "Photos caption only" },
];

export function recognizeEvidence(name: string): EvidenceKind {
  const n = name.toLowerCase();
  if (/yeiser/.test(n)) return "STRUCTURAL";
  if (/mcmillanporch|kitchen plans|basement plans|garrison plans|ganzel plans|plans - revised/.test(n)) {
    return "TRADEWALK";
  }
  if (/scope of work|sow/.test(n)) return "SCOPE";
  if (/deboard/.test(n) && /calc/.test(n)) return "CALCS";
  if (/stanfield|david s\.? deboard framing/.test(n)) return "FRAMING";
  if (/deboard/.test(n) && /tradewalk|plan/.test(n)) return "TRADEWALK";
  if (/tradewalk/.test(n) && /deboard/.test(n)) return "TRADEWALK";
  if (/tradewalk/.test(n)) return "TRADEWALK";
  if (/estimate|invoice/.test(n)) return "ESTIMATE";
  if (/quote/.test(n)) return "QUOTE";
  if (/site plan/.test(n)) return "SITE";
  if (/how to plan a remodel/.test(n)) return "PROCESS";
  return "UPLOAD";
}

/** Only Deboard-named Tradewalk / calcs / framing replace the Deboard working set. */
export function shouldAdoptDeboardTradewalk(name: string): boolean {
  const n = name.toLowerCase();
  if (/north|garrison|ganzel|tyler|mcmillan|ciurlizza|craven|gainesway|andover|savannah|montclair|creek rock/.test(n)) {
    return false;
  }
  return /deboard/.test(n) && /tradewalk|calc|framing|plan/.test(n);
}

export function evidenceNote(kind: EvidenceKind, name: string): string {
  if (kind === "TRADEWALK") {
    if (/deboard/i.test(name)) {
      return `${name} matches the Deboard Tradewalk Plans set. Sheets A01–A11 + A15 will redraw from that model after you confirm.`;
    }
    return `${name} is a visual Tradewalk / drawing set. Recorded as a reference on this job. Howler will not hang it on a different address and will not invent geometry from it.`;
  }
  if (kind === "CALCS") {
    return `${name} matches Deboard Calcs (Murphy LVL). Adopting the Tradewalk working set so B1/B2/B3 stay coordinated.`;
  }
  if (kind === "FRAMING") {
    return `${name} matches Stanfield / Deboard framing. Adopting the Tradewalk working set it cites.`;
  }
  if (kind === "STRUCTURAL") {
    return `${name} is recorded as structural/markup evidence. Howler did not scale it. Field-verify callouts stay field-verify.`;
  }
  if (kind === "SCOPE") {
    return `${name} is a scope document, not a floor plan. Geometry stays Unknown.`;
  }
  if (kind === "SITE") {
    return `${name} is a site / ADU narrative. Not governing geometry unless you say so.`;
  }
  if (kind === "ESTIMATE" || kind === "QUOTE") {
    return `${name} is a price file, not a drawing. Howler will not invent a total from a garbled extract.`;
  }
  if (kind === "PROCESS") {
    return `${name} is company process documentation, not a job drawing.`;
  }
  return `${name} is recorded as evidence. Howler did not scale it and did not invent a building from it. Name the dimensions it contains, or say it is the Tradewalk set.`;
}

export function parseOpeningTag(raw: string): {
  tag: string;
  prefix: string;
  suffix: string;
  widthIn: number;
  heightIn: number;
} | null {
  const match = /^([A-Z]{0,3})(\d)(\d)(\d)(\d)([A-Z]{0,3})$/i.exec(raw.trim());
  if (!match) return null;
  return {
    tag: raw.trim().toUpperCase(),
    prefix: match[1].toUpperCase(),
    suffix: match[6].toUpperCase(),
    widthIn: Number(match[2]) * 12 + Number(match[3]),
    heightIn: Number(match[4]) * 12 + Number(match[5]),
  };
}

export function sizeFromDoorTag(tag: string): { widthIn: number; heightIn: number } | null {
  const parsed = parseOpeningTag(tag);
  if (!parsed) return null;
  return { widthIn: parsed.widthIn, heightIn: parsed.heightIn };
}
