import {
  previewAddActual,
  previewAddCommitment,
  previewAddLine,
  previewAddScope,
  previewCoLifecycle,
  previewCreateChangeOrder,
  previewDrawWorkingSet,
  previewInitialize,
  previewIssueDrawingSet,
  previewPatchActivity,
  previewPatchBlueprint,
  previewPatchChangeOrder,
  previewPatchScope,
  previewAdoptTradewalkSet,
  previewRecordEvidence,
  previewRemoveOpening,
  previewRoomsFromScope,
  previewSetBaseline,
  previewSetDrawingDatum,
  previewSetDrawingStatus,
  previewSetEnvelopeProvenance,
  previewSuggestConventionalFraming,
  previewUpsertOpening,
  previewUpsertRoom,
  previewSetInspection,
  previewSetPermit,
  previewUpsertContact,
  previewUpsertSelection,
  previewAddPhoto,
  previewCloseout,
  previewProgressUpdate,
  previewSetJobMeta,
  type BlueprintPatch,
} from "./engine";
import { matchCounty } from "./ky-code";
import { codeBasisSummary } from "./code-notes";
import { stairCodeSummary } from "./ky-stairs";
import { recognizeEvidence, sizeFromDoorTag } from "./commands";
import { citesTradewalk, sb3621Summary } from "./tradewalk";
import { ensureJob } from "./job";
import { envelopeComplete, feetToInches, parseDrawingScale } from "./layout";
import { memoryFramingPatch } from "./memory";
import { parseMoneyDecimal } from "./money";
import { matchClosedWork, matchWork, spokenBrief, splitUpdate } from "./derive";
import type {
  InspectionStatus,
  InterpretResult,
  LumberSize,
  OccupancyClass,
  OpeningKind,
  PermitStatus,
  Project,
  WallFace,
} from "./types";
import { ensureBlueprint, LUMBER_SIZES } from "./types";

function nextSaturday(from = new Date()): string {
	const date = new Date(from);
	const delta = (6 - date.getDay() + 7) % 7 || 7;
	date.setDate(date.getDate() + delta);
	return date.toISOString().slice(0, 10);
}
function scoreName(text: string, name: string): number {
	const t = text.toLowerCase();
	const n = name.toLowerCase().trim();
	if (!n) return 0;
	if (t.includes(n)) return n.length + 12;
	const parts = n.split(/[^a-z0-9]+/).filter((part) => part.length >= 3);
	let score = 0;
	for (const part of parts) if (t.includes(part)) score += part.length;
	return score;
}
function pickNamed<T>(items: T[], text: string, label: (item: T) => string): { hit: T | null; names: string[] } {
	const ranked = items.map((item) => ({
		item,
		score: scoreName(text, label(item)),
		name: label(item)
	})).filter((row) => row.score > 0).sort((a, b) => b.score - a.score);
	const names = ranked.map((row) => row.name);
	if (ranked.length === 0) return {
		hit: null,
		names
	};
	if (ranked.length === 1) return {
		hit: ranked[0].item,
		names
	};
	if (ranked[0].score >= ranked[1].score + 4) return {
		hit: ranked[0].item,
		names
	};
	return {
		hit: null,
		names
	};
}
function extractMoney(text: string, currency: string) {
	const dollar = /\$\s*([\d,]+(?:\.\d{1,2})?)/.exec(text);
	if (dollar) return parseMoneyDecimal(dollar[1].replace(/,/g, ""), currency);
	if (!/\b(price|priced|cost|invoice|invoiced|spent|paid|budget|allowance|commit(?:ment|ted)?|change order|\bco\b)\b/i.test(text)) return null;
	const match = /(?:^|[^\d])([\d,]+(?:\.\d{1,2})?)(?:\b)/.exec(text);
	if (!match) return null;
	return parseMoneyDecimal(match[1].replace(/,/g, ""), currency);
}
function extractDate(text: string): string | null {
	const iso = /\d{4}-\d{2}-\d{2}/.exec(text)?.[0];
	if (iso) return iso;
	const named =
		/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b/i.exec(
			text,
		);
	if (named) {
		const months: Record<string, string> = {
			jan: "01",
			feb: "02",
			mar: "03",
			apr: "04",
			may: "05",
			jun: "06",
			jul: "07",
			aug: "08",
			sep: "09",
			oct: "10",
			nov: "11",
			dec: "12",
		};
		const month = months[named[1].slice(0, 3).toLowerCase()];
		const day = named[2].padStart(2, "0");
		if (month) return `${named[3]}-${month}-${day}`;
	}
	if (/\bsaturday\b/i.test(text)) return nextSaturday();
	return null;
}
function clarify(message: string): InterpretResult {
	return {
		outcome: "CLARIFICATION",
		message
	};
}
function whichOf(kind: string, names: string[]): InterpretResult {
	if (names.length === 0) return clarify(`Which ${kind}? Name it exactly. I will not guess.`);
	return clarify(`Which ${kind}: ${names.slice(0, 5).join("; ")}?`);
}
function parseFeet(raw: string): number | null {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return null;
	return feetToInches(value);
}
function extractEnvelope(text: string): { widthIn: number; depthIn: number } | null {
	const stripped = text.replace(/\b2\s*[x×]\s*(?:4|6|8|10|12)\b/gi, " ");
	const match = /(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)?\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)?/i.exec(stripped);
	if (!match || match.index == null) return null;
	const around = stripped.slice(Math.max(0, match.index - 16), match.index + match[0].length + 28);
	if (/\b(door|ohd|overhead)\b/i.test(around) && !/\b(building|envelope|footprint|garage(?!\s+door)|shop|barn)\b/i.test(text)) return null;
	if (/\b(room|office|bath|flex|storage)\b/i.test(around) && !/\b(building|envelope|garage|shop|barn)\b/i.test(text)) return null;
	const widthIn = parseFeet(match[1]);
	const depthIn = parseFeet(match[2]);
	if (!widthIn || !depthIn) return null;
	if (widthIn < 96 || depthIn < 96) return null;
	return {
		widthIn,
		depthIn
	};
}
function extractPitch(text: string): { roofRise: number; roofRun: number } | null {
	const match = /(\d+(?:\.\d+)?)\s*(?:\/|over|:|-|on)\s*(12)\b|\b(\d+(?:\.\d+)?)\s+and\s+(12)\b|\bpitch\s+(\d+(?:\.\d+)?)\b/i.exec(text);
	if (!match) return null;
	const rise = Number(match[1] ?? match[3] ?? match[5]);
	const run = Number(match[2] ?? match[4] ?? 12);
	if (!Number.isFinite(rise) || rise <= 0) return null;
	return {
		roofRise: rise,
		roofRun: run
	};
}
function extractSpacing(text: string, kind: "stud" | "joist" | "rafter" | "any"): number | null {
	const kindRe = kind === "any" ? "" : kind === "stud" ? "(?:studs?|wall)[^.]{0,24}" : kind === "joist" ? "(?:joists?|floor)[^.]{0,24}" : "(?:rafters?|roof)[^.]{0,24}";
	const match = new RegExp(`${kindRe}(\\d+)\\s*(?:\"|in(?:ch(?:es)?)?)?\\s*(?:o\\.?c\\.?|on\\s*center)|(\\d+)\\s*(?:\"|in(?:ch(?:es)?)?)?\\s*(?:o\\.?c\\.?|on\\s*center)[^.]{0,18}${kind === "any" ? "" : kindRe}`, "i").exec(text);
	if (match) {
		const value = Number(match[1] ?? match[2]);
		if (value === 19) return 19.2;
		if (![
			12,
			16,
			19.2,
			24
		].includes(value)) return null;
		return value;
	}
	if (kind !== "any") {
		const generic = /(\d+)\s*(?:"|in(?:ch(?:es)?)?)?\s*(?:o\.?c\.?|on\s*center)/i.exec(text);
		if (generic && new RegExp(kind, "i").test(text)) return Number(generic[1]);
	}
	return null;
}
function extractLumber(text: string, kind: "stud" | "joist" | "rafter" | "any"): LumberSize | null {
	const window = kind === "any" ? text : new RegExp(`(.{0,28}${kind}s?.{0,28}|${kind}s?.{0,40})`, "i").exec(text)?.[0] ?? "";
	const match = /2\s*[x×by]\s*(4|6|8|10|12)/i.exec(window || text);
	if (!match) return null;
	const size = `2x${match[1]}` as LumberSize;
	return LUMBER_SIZES.includes(size) ? size : null;
}
function extractHeight(text: string): number | null {
	const match = /(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)?\s*(?:walls?|eaves?|plate|wall height|eave height)|(?:walls?|eaves?|plate|height)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i.exec(text);
	if (!match) return null;
	return parseFeet(match[1] ?? match[2]);
}
function extractWall(text: string): WallFace | null {
	const lower = text.toLowerCase();
	if (/\b(front|street|approach|south)\b/.test(lower)) return "FRONT";
	if (/\b(back|rear|north)\b/.test(lower)) return "BACK";
	if (/\b(left|west)\b/.test(lower)) return "LEFT";
	if (/\b(right|east)\b/.test(lower)) return "RIGHT";
	return null;
}
function extractDoor(text: string): { widthIn?: number; heightIn?: number } | null {
	const labeled = /(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)?\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)?\s*(?:garage door|overhead(?:\s+door)?|\bohd\b)/i.exec(text) ?? /(?:garage door|overhead(?:\s+door)?|\bohd\b)\s*(?:is\s*|at\s*)?(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)?(?:\s*(?:x|by|×)\s*(\d+(?:\.\d+)?))?/i.exec(text);
	if (!labeled) return null;
	return {
		widthIn: parseFeet(labeled[1]) ?? void 0,
		heightIn: labeled[2] ? parseFeet(labeled[2]) ?? void 0 : void 0
	};
}
function extractOccupancy(text: string): OccupancyClass | null {
	const lower = text.toLowerCase();
	if (/\b(post[-\s]?and[-\s]?frame|pole barn|post frame)\b/.test(lower)) return "POST_AND_FRAME";
	if (/\b(office|flex|habitable|second floor|2nd floor|living)\b/.test(lower) && /\bgarage\b/.test(lower)) return "GARAGE_WITH_HABITABLE";
	if (/\b(house|dwelling|residence)\b/.test(lower) && !/\bgarage\b/.test(lower)) return "DWELLING";
	if (/\bdetached garage\b/.test(lower) || /\bgarage\b/.test(lower) && !/\b(office|flex|second|habitable)\b/.test(lower)) return "DETACHED_GARAGE";
	return null;
}
function extractStories(text: string): number | null {
	if (/\b(two|2)[-\s]?stor(?:y|ies)|second floor|2nd floor\b/i.test(text)) return 2;
	if (/\b(one|1)[-\s]?stor(?:y|ies)|single stor/i.test(text)) return 1;
	if (/\b(three|3)[-\s]?stor/i.test(text)) return 3;
	return null;
}
function extractOverhang(text: string): number | null {
	const match = /(\d+(?:\.\d+)?)\s*(?:\"|in|inch|inches|'|ft|foot|feet)?\s*overhang/i.exec(text);
	if (!match) return null;
	const value = Number(match[1]);
	if (/"|in|inch/.test(match[0]) && !/ft|feet|foot|'/.test(match[0])) return Math.round(value);
	return parseFeet(match[1]);
}
function extractFrost(text: string): number | null {
	const match = /frost(?:\s*depth)?\s*(?:of\s*)?(\d+)/i.exec(text);
	if (!match) return null;
	const value = Number(match[1]);
	return value <= 48 ? value : feetToInches(value);
}
function isBlueprintTalk(lower: string): boolean {
	return /\b(blueprint|plans?|drawing|envelope|dimension|studs?|joists?|rafters?|pitch|rise over run|roof run|on center|o\.?c\.?|eave|gable|span|building code|truss|overhang|frost|occupancy|drawing scale|tradewalk|working set)\b/.test(lower) || /\b\d+\s*(x|by|×)\s*\d+\b/.test(lower) || /\b\d+\s*\/\s*12\b/.test(lower) || /\b2\s*[x×]\s*(4|6|8|10|12)\b/.test(lower);
}

function isFieldUpdate(lower: string): boolean {
  return /\b(update|done|complete|completed|finished|closed|poured|wrapped|signed off|awaiting|waiting on|waiting for|on site|lined up|mobilized|punch|light pole|how's|status|next call)\b/.test(
    lower,
  );
}
function interpretBlueprint(project: Project, text: string, lower: string): InterpretResult | null {
	if (/\b(code basis|what(?:'s| is) the code|which code|cite the code|kentucky residential code|krc 2018|2018 krc)\b/.test(lower) && !/\bstair/.test(lower)) return {
		outcome: "CLARIFICATION",
		message: codeBasisSummary(ensureBlueprint(project))
	};
	if (/\b(stair code|kentucky stair|krc stair|stair (?:limits?|geometry|riser|tread)|what(?:'s| is) the stair)\b/.test(lower)) return {
		outcome: "CLARIFICATION",
		message: stairCodeSummary(ensureBlueprint(project))
	};
	if (/\bsb3621\b/.test(lower) && !extractWall(text) && !/\b(place|put|on the)\b/.test(lower)) return {
		outcome: "CLARIFICATION",
		message: sb3621Summary()
	};
	if (/\b(issue (the |this )?(drawings?|set|plans|working set)|issue for layout|mark (the )?(set|drawings?) issued)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewIssueDrawingSet(project)
	};
	if (/\b(mark (the )?(drawings?|set) reviewed|reviewed for issue)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetDrawingStatus("REVIEWED")
	};
	if (/\b(return (the )?(set|drawings?) to draft|mark (the )?draft)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetDrawingStatus("DRAFT")
	};
	if (/\b(mark (the )?envelope verified|verified (field )?measurement|measured in the field|envelope is verified)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetEnvelopeProvenance("VERIFIED")
	};
	if (/\b(face of framing|to framing|to studs|to outside of framing)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetDrawingDatum("FACE_FRAMING")
	};
	if (/\b(finished face|to brick|face of brick|to veneer|to finished face)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetDrawingDatum("FACE_FINISH")
	};
	if (/\b(to centerline|on (the )?centerline|centerline datum)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetDrawingDatum("CENTERLINE")
	};
	if (/\b(export (the )?(pdf|set|drawings?|plans)|download (the )?(pdf|set)|print (the )?(set|drawings?|plans|pdf))\b/.test(lower)) return {
		outcome: "ACTION",
		action: /\bprint\b/.test(lower) && !/\bpdf\b/.test(lower) ? "PRINT" : "EXPORT_PDF",
		message: "Same as the Plans export button. Print dialog first, then Howler will queue Issue so the revision matches what the contractor holds."
	};
	if (/\b(produce|generate|draw|make|lay out|layout)\b/.test(lower) && /\b(working set|documents?|sheets?|construction (docs?|documents)|drawing set)\b/.test(lower)) {
		const live = ensureBlueprint(project);
		if (citesTradewalk(live) || envelopeComplete(live)) return {
			outcome: "RESOLVED",
			preview: previewDrawWorkingSet(project)
		};
		return clarify("No envelope yet. Drop the Tradewalk PDF, say “use the Tradewalk plans”, or give width by depth. I will not invent a building.");
	}
	if (/\b(tradewalk|from the plans|use the plans|adopt the plans|deboard plans|sheet a0|from a01|google drive|from (?:my )?drive|deboard tradewalk|look at the plans)\b/.test(lower) || /\b(read|load|use|adopt|pull|review)\b/.test(lower) && /\b(drive|plans?|drawings?|tradewalk|deboard)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewAdoptTradewalkSet()
	};
	if (/\b(this (file|upload|pdf) is (the )?tradewalk|that (file|upload) is (the )?tradewalk)\b/.test(lower)) {
		const last = ensureBlueprint(project).evidence?.at(-1)?.name;
		return {
			outcome: "RESOLVED",
			preview: previewAdoptTradewalkSet(last)
		};
	}
	const bp = ensureBlueprint(project);
	const envelope = extractEnvelope(text);
	const pitch = extractPitch(text);
	const height = extractHeight(text);
	const county = matchCounty(text);
	const occupancy = extractOccupancy(text);
	const stories = extractStories(text);
	const door = extractDoor(text);
	const overhang = extractOverhang(text);
	const frost = extractFrost(text);
	const drawingScale = parseDrawingScale(text);
	const studSize = extractLumber(text, "stud") ?? (/\bstuds?\b/.test(lower) ? extractLumber(text, "any") : null);
	const joistSize = extractLumber(text, "joist") ?? (/\bjoists?\b/.test(lower) ? extractLumber(text, "any") : null);
	const rafterSize = extractLumber(text, "rafter") ?? (/\brafters?\b/.test(lower) ? extractLumber(text, "any") : null);
	const studSpacing = extractSpacing(text, "stud") ?? (/\bstuds?\b/.test(lower) ? extractSpacing(text, "any") : null);
	const joistSpacing = extractSpacing(text, "joist") ?? (/\bjoists?\b/.test(lower) ? extractSpacing(text, "any") : null);
	const rafterSpacing = extractSpacing(text, "rafter") ?? (/\brafters?\b/.test(lower) ? extractSpacing(text, "any") : null);
	const roomHit = /(?:room|office|bath(?:room)?|flex|shop|storage|stair(?:well)?)\s+(?:is\s+)?(\d+(?:\.\d+)?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)/i.exec(text);
	if (roomHit) {
		const nameMatch = /((?:half\s+)?(?:bath(?:room)?|office(?:\s*\/\s*flex)?|flex|shop|storage|garage|stair(?:well)?))/i.exec(text);
		const widthIn = parseFeet(roomHit[1]);
		const depthIn = parseFeet(roomHit[2]);
		const level = /\b(second|2nd|upper|l2)\b/i.test(text) ? 2 : 1;
		const existing = pickNamed(Object.values(bp.rooms), text, (room) => room.name);
		return {
			outcome: "RESOLVED",
			preview: previewUpsertRoom({
				id: existing.hit?.id,
				name: existing.hit?.name ?? nameMatch?.[1] ?? "Room",
				level,
				widthIn,
				depthIn,
				originXIn: existing.hit?.originXIn ?? null,
				originYIn: existing.hit?.originYIn ?? null,
				scopeItemIds: existing.hit?.scopeItemIds ?? [],
				notes: existing.hit?.notes ?? null
			})
		};
	}
	if (/\b(rooms? from scope|place rooms|name rooms from scope)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewRoomsFromScope(project)
	};
	if (/\b(remove|delete|clear)\b/.test(lower) && /\b(opening|door|window|ohd)\b/.test(lower)) {
		const openings = bp.openings ?? [];
		const named = pickNamed(openings, text, (item) => `${item.tag ?? ""} ${item.kind} ${item.wall}`);
		if (named.hit) return {
			outcome: "RESOLVED",
			preview: previewRemoveOpening(named.hit.id)
		};
		if (openings.length === 1) return {
			outcome: "RESOLVED",
			preview: previewRemoveOpening(openings[0].id)
		};
		return whichOf("opening", openings.map((item) => item.tag ?? `${item.kind} ${item.wall}`));
	}
	const tag = /\b((?:SB|SH|AW|HO|FX|SL)?\d{4}(?:DH|SH|AW|HO)?)\b/i.exec(text)?.[1]?.toUpperCase() ?? null;
	const taggedSize = tag ? sizeFromDoorTag(tag) : null;
	const manTalk = /\b(man door|walk door|entry door|service door|personnel door)\b/.test(lower);
	const windowTalk = /\bwindows?\b/.test(lower) || /^SB/i.test(tag ?? "");
	const ohdTalk = /\b(overhead(?:\s+door)?|garage door|\bohd\b)\b/.test(lower);
	if (manTalk || windowTalk && !ohdTalk || ohdTalk) {
		const kind = ohdTalk ? "OHD" : manTalk ? "MAN" : "WINDOW";
		if (kind === "OHD" && !door) return clarify("Overhead leaf width is Unknown. Say the size (16 by 7 overhead on the front) or leave it Unknown. I will not invent 16 feet.");
		if ((kind === "MAN" || kind === "WINDOW") && !door && !taggedSize) return clarify(kind === "MAN" ? "Man door size? Say a tag (2868) or a width by height. I will not invent a leaf." : "Window size? Say a tag (2840DH) or a width by height. I will not invent a unit.");
		const wall = extractWall(text) ?? (kind === "OHD" ? "FRONT" : kind === "MAN" ? "LEFT" : "RIGHT");
		const existing = (bp.openings ?? []).find((item) => item.kind === kind && item.wall === wall);
		const widthIn = door?.widthIn ?? taggedSize?.widthIn ?? existing?.widthIn ?? null;
		const heightIn = door?.heightIn ?? taggedSize?.heightIn ?? existing?.heightIn ?? null;
		if (widthIn == null) return clarify("Opening width is Unknown. I will not invent it.");
		const wallLen = wall === "FRONT" || wall === "BACK" ? bp.widthIn : bp.depthIn;
		const offsetIn = existing?.offsetIn ?? (kind === "OHD" && wallLen ? Math.max(0, (wallLen - widthIn) / 2) : 48);
		return {
			outcome: "RESOLVED",
			preview: previewUpsertOpening({
				id: existing?.id ?? "",
				kind,
				wall,
				widthIn,
				heightIn,
				offsetIn,
				sillIn: kind === "WINDOW" ? 36 : 0,
				headerSize: kind === "OHD" ? "2x12" : "2x10",
				tag: tag ?? existing?.tag ?? null,
				provenance: taggedSize ? "INFERRED" : door ? "PROPOSED" : "INFERRED",
				offsetProvenance: existing?.offsetProvenance ?? "PROPOSED",
				datum: bp.dimDatum ?? "FACE_FRAMING",
				notes: taggedSize ? `Tag ${tag}` : existing?.notes ?? "Confirm size"
			})
		};
	}
	if (/\b(same as last time|same as usual|how we always frame|usual county|usual framing)\b/.test(lower)) {
		const remembered = memoryFramingPatch();
		const patch: BlueprintPatch = {};
		const wantCounty = /\bcounty\b/.test(lower) || /\bsame as last time\b/.test(lower) || /\bsame as usual\b/.test(lower);
		const wantFraming = /\b(fram|stud|joist|rafter|same as last time|same as usual|how we always)\b/.test(lower);
		if (wantCounty && remembered.county) patch.county = remembered.county;
		if (wantFraming) {
			if (remembered.studSize) patch.studSize = remembered.studSize;
			if (remembered.studSpacingIn) patch.studSpacingIn = remembered.studSpacingIn;
			if (remembered.joistSize) patch.joistSize = remembered.joistSize;
			if (remembered.joistSpacingIn) patch.joistSpacingIn = remembered.joistSpacingIn;
			if (remembered.rafterSize) patch.rafterSize = remembered.rafterSize;
			if (remembered.rafterSpacingIn) patch.rafterSpacingIn = remembered.rafterSpacingIn;
		}
		if (Object.keys(patch).length === 0) return clarify("I have not learned a usual framing or county from you yet. Confirm a drawing once, then “same as last time” will reuse it. I still will not invent a building size.");
		return {
			outcome: "RESOLVED",
			preview: previewPatchBlueprint(patch)
		};
	}
	if (/\b(conventional framing|typical framing|fill framing|suggest framing)\b/.test(lower)) {
		if (!envelopeComplete(bp) && !envelope) return clarify("Envelope is Unknown. Give width by depth, then I can suggest conventional stud/joist/rafter layout. I will not invent a building size.");
		return {
			outcome: "RESOLVED",
			preview: previewSuggestConventionalFraming()
		};
	}
	const patch: BlueprintPatch = {};
	if (envelope) {
		patch.widthIn = envelope.widthIn;
		patch.depthIn = envelope.depthIn;
		patch.envelopeProvenance = /\b(measured|verified|field)\b/.test(lower) ? "VERIFIED" : "PROPOSED";
	}
	if (pitch) {
		patch.roofRise = pitch.roofRise;
		patch.roofRun = pitch.roofRun;
	}
	if (height) patch.eaveHeightIn = height;
	if (county) patch.county = county;
	if (occupancy && !bp.occupancy) patch.occupancy = occupancy;
	else if (occupancy && /\b(occupancy|use|classified|this is)\b/.test(lower)) patch.occupancy = occupancy;
	if (stories) patch.stories = stories;
	if (studSize) patch.studSize = studSize;
	if (studSpacing) patch.studSpacingIn = studSpacing;
	if (joistSize) patch.joistSize = joistSize;
	if (joistSpacing) patch.joistSpacingIn = joistSpacing;
	if (rafterSize) patch.rafterSize = rafterSize;
	if (rafterSpacing) patch.rafterSpacingIn = rafterSpacing;
	if (door?.widthIn) patch.overheadDoorWidthIn = door.widthIn;
	if (door?.heightIn) patch.overheadDoorHeightIn = door.heightIn;
	if (overhang != null) patch.overhangIn = overhang;
	if (frost != null) patch.frostDepthIn = frost;
	if (drawingScale) patch.drawingScale = drawingScale;
	if (/\bjoists?\s+(span|run|along)\s+(the\s+)?depth\b/.test(lower)) patch.joistDirection = "DEPTH";
	if (/\bjoists?\s+(span|run|along)\s+(the\s+)?width\b/.test(lower)) patch.joistDirection = "WIDTH";
	if (/\bhip\s+roof\b/.test(lower)) patch.roofStyle = "HIP";
	if (/\bshed\s+roof\b/.test(lower)) patch.roofStyle = "SHED";
	if (/\bgable\b/.test(lower)) patch.roofStyle = "GABLE";
	if (/\b(draw|generate|render|make|show|lay out|layout)\b/.test(lower) && /\b(plan|blueprint|drawing|sheet|garage|typical)\b/.test(lower)) {
		if (!envelopeComplete(bp) && !envelope) return clarify("Envelope is Unknown. Give width by depth in feet, wall height, and roof pitch as rise over run (example: 24 by 32 garage, 9 foot walls, 8/12). I will not invent dimensions.");
		return {
			outcome: "RESOLVED",
			preview: previewDrawWorkingSet(project, patch)
		};
	}
	const garageTalk = /\bgarage\b/.test(lower) || occupancy === "DETACHED_GARAGE" || occupancy === "GARAGE_WITH_HABITABLE";
	if (Object.keys(patch).length > 0 && envelope && garageTalk) return {
		outcome: "RESOLVED",
		preview: previewDrawWorkingSet(project, patch)
	};
	if (Object.keys(patch).length > 0) return {
		outcome: "RESOLVED",
		preview: previewPatchBlueprint(patch)
	};
	if (isBlueprintTalk(lower) && !/\b(budget|change order|\bco\b|invoice|commit)/.test(lower)) return clarify("For Plans I need a named fact: width by depth (24 by 32), rise over run (8/12), wall height, county, lumber (2x10 joists 16 on center), or a door (16 foot overhead door). I will not invent a size.");
	if (/\b(make it bigger|make it smaller|bigger|smaller)\b/.test(lower)) return clarify("Give the size in feet. I will not guess bigger.");
	return null;
}
function interpretJob(project: Project, text: string, lower: string): InterpretResult | null {
	if (!/\b(inspection|permit|contact|vendor|\bsub\b|photo|pics?|selection|match existing brick)\b/.test(lower)) return null;
	const job = ensureJob(project);
	const date = extractDate(text);
	if (/\bpermit\b/.test(lower) && /\b(issued|submitted|filed|not filed)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetPermit(/\bissued\b/.test(lower) ? "ISSUED" : /\bsubmitted|filed\b/.test(lower) ? "SUBMITTED" : "NOT_FILED", /\b(?:#|no\.?|number)\s*([A-Z0-9-]+)\b/i.exec(text)?.[1] ?? null)
	};
	const inspMatch = /\b(footing|footer|foundation|slab|framing|rough electric|rough plumbing|insulation|final)\s+inspection\b/i.exec(lower);
	if (inspMatch) {
		const token = inspMatch[1];
		const found = Object.values(job.inspections).find((item) => {
			const n = item.name.toLowerCase();
			if (token === "footer" || token === "footing") return /footing/.test(n);
			if (token === "slab" || token === "foundation") return /foundation|slab/.test(n);
			if (token === "rough electric") return /electrical/.test(n);
			if (token === "rough plumbing") return /plumbing/.test(n);
			return n.includes(token);
		});
		if (!found) return clarify("Which inspection: footing, slab, framing, rough electric, rough plumbing, insulation, or final?");
		let status = found.status;
		if (/\bpass(ed)?\b/.test(lower)) status = "PASSED";
		else if (/\bfail(ed)?\b/.test(lower)) status = "FAILED";
		else if (/\bschedule/.test(lower)) status = "SCHEDULED";
		else if (/\bready\b/.test(lower)) status = "READY";
		else return clarify(`Say what happened to the ${found.name} inspection: passed, failed, scheduled, or ready.`);
		return {
			outcome: "RESOLVED",
			preview: previewSetInspection(found.id, {
				status,
				date: date ?? found.date,
				notes: found.notes
			})
		};
	}
	const contact = /(?:add |new )?(?:contact|vendor|sub)\s+([A-Za-z][A-Za-z .'-]+?)(?:\s*[,·-]\s*|\s+)(framing|plumbing|electrical|concrete|masonry|roofing|hvac|follow-up)/i.exec(text);
	if (contact) return {
		outcome: "RESOLVED",
		preview: previewUpsertContact({
			name: contact[1].trim(),
			trade: contact[2]
		})
	};
	if (/^(photo|pics?)[:\s]/i.test(text) || /\bphoto note\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewAddPhoto(text.replace(/^(photo|pics?)[:\s]+/i, "").trim() || text, ensureBlueprint(project).evidence?.at(-1)?.name ?? null)
	};
	if (/\b(brick (?:to )?match existing|match existing brick)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewUpsertSelection({
			id: "sel-brick",
			name: "Brick veneer",
			value: "Match existing house",
			status: "MATCH_EXISTING"
		})
	};
	return null;
}
export function interpretFinancial(project: Project, raw: string): InterpretResult {
	const text = raw.trim();
	if (!text) return clarify("Say what happened on this project.");
	const currency = project.financials?.currency ?? "USD";
	const lower = text.toLowerCase();
	const job = interpretJob(project, text, lower);
	if (job) return job;
	if (!isFieldUpdate(lower)) {
		const blueprint = interpretBlueprint(project, text, lower);
		if (blueprint) return blueprint;
	}

	if (
		/\b(how'?s (?:this |the )?job|status|what'?s going on|brief me|where are we)\b/.test(lower) &&
		!/\b(budget|change order|scope|finish|start)\b/.test(lower)
	) {
		return { outcome: "CLARIFICATION", message: spokenBrief(project) };
	}

	if (/\bclos(?:e|ing)\s*out\b/.test(lower)) {
		const closeout = Object.values(project.activities).filter((item) => {
			if (item.state === "COMPLETE") return false;
			const hay = `${item.phase} ${item.name}`;
			return /closeout|exterior|porch|concrete|sidewalk|punch|column|ceiling/i.test(hay);
		});
		if (closeout.length === 0) {
			return clarify("Which activity is closing out? Name it. I will not guess.");
		}
		return {
			outcome: "RESOLVED",
			preview: previewCloseout(
				closeout.map((item) => item.id),
				text,
			),
		};
	}

	if (/\b(hold|pause)\b/.test(lower) && /\binterior\b/.test(lower)) {
		return {
			outcome: "RESOLVED",
			preview: previewSetJobMeta({
				paused: false,
				heldPhases: Array.from(new Set([...(project.heldPhases ?? []), "Interior"])),
				dashboardNote: `${project.dashboardNote ?? project.projectType} Interior held. Live work continues.`.slice(0, 280),
			}),
		};
	}

	if (/\b(release|unpause|resume)\b/.test(lower) && /\binterior\b/.test(lower)) {
		return {
			outcome: "RESOLVED",
			preview: previewSetJobMeta({
				paused: false,
				heldPhases: (project.heldPhases ?? []).filter((phase) => !/interior/i.test(phase)),
				dashboardNote: "Interior released. Confirm the comparison is done before issuing interior work.",
			}),
		};
	}

	const calendarDate = extractDate(text);
	if (/\bofficial start\b/.test(lower)) {
		if (!calendarDate) return clarify("Name the official start date. I will not guess it from the first trade.");
		return {
			outcome: "RESOLVED",
			preview: previewSetJobMeta({ officialStart: calendarDate }),
		};
	}
	if (/\bintended finish\b/.test(lower)) {
		if (!calendarDate) return clarify("Name the intended finish date. A trade target is not the job finish.");
		return {
			outcome: "RESOLVED",
			preview: previewSetJobMeta({ intendedFinish: calendarDate }),
		};
	}

	const amount = extractMoney(text, currency);
	const date = extractDate(text);
	const last = project.events[0];
	const activities = Object.values(project.activities);
	const scopeItems = Object.values(project.scopeItems);
	const lines = Object.values(project.financials?.lines ?? {}).filter((line) => line.active);
	const orders = Object.values(project.financials?.changeOrders ?? {});
	const activityPick = pickNamed(activities, text, (item) => item.name);
	const scopePick = pickNamed(scopeItems, text, (item) => item.description);
	const linePick = pickNamed(lines, text, (item) => `${item.description} ${item.trade ?? ""}`);
	const coPick = pickNamed(orders, text, (item) => `${item.number} ${item.title}`);
	if (last?.recordId) {
		const lastCo = project.financials?.changeOrders[last.recordId];
		const lastActivity = project.activities[last.recordId];
		const lastScope = project.scopeItems[last.recordId];
		const pronoun = /\b(it|that|this|the draft|the change order)\b/.test(lower);
		if (lastCo && (pronoun || coPick.hit?.id === lastCo.id)) {
			if (/\b(approve|approved)\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewCoLifecycle(lastCo.id, "APPROVE")
			};
			if (/\bpropose\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewCoLifecycle(lastCo.id, "PROPOSE")
			};
			if (/\bsubmit\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewCoLifecycle(lastCo.id, "SUBMIT_FOR_APPROVAL")
			};
			if (/\breject\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewCoLifecycle(lastCo.id, "REJECT")
			};
			if (/\bvoid\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewCoLifecycle(lastCo.id, "VOID")
			};
			if (amount && /\b(price|priced|cost|set)\b/.test(lower) && !/\b(add|create|draft|new)\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewPatchChangeOrder(lastCo.id, { cost: amount })
			};
		}
		if (lastActivity && pronoun && /\b(start|started|begin)\b/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewPatchActivity(lastActivity.id, {
				state: "IN_PROGRESS",
				actualStart: date ?? lastActivity.actualStart ?? (new Date()).toISOString().slice(0, 10)
			})
		};
		if (lastScope && pronoun && /\b(complete|completed|done)\b/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewPatchScope(lastScope.id, { complete: true })
		};
	}
	if (/\b(init|initialize|open)\b/.test(lower) && /\b(budget|financial)/.test(lower)) {
		if (project.financials) return clarify("Budget is already initialized. Set the original amount, or edit a line.");
		return {
			outcome: "RESOLVED",
			preview: previewInitialize("USD")
		};
	}
	if (/\b(original|baseline)\b/.test(lower) && /\bbudget\b/.test(lower)) {
		if (!amount) return clarify("What original budget amount should I record?");
		if (!project.financials) return clarify("Initialize Budget on this project first.");
		return {
			outcome: "RESOLVED",
			preview: previewSetBaseline(amount)
		};
	}
	if (/\b(approve|approved|propose|submit|reject|void)\b/.test(lower) && /\b(co|change order)\b/.test(lower)) {
		const target = coPick.hit ?? (orders.length === 1 ? orders[0] : null);
		if (!target) return whichOf("Change Order", coPick.names.length ? coPick.names : orders.map((co) => `${co.number} ${co.title}`));
		if (/\bapprove/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewCoLifecycle(target.id, "APPROVE")
		};
		if (/\bpropose/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewCoLifecycle(target.id, "PROPOSE")
		};
		if (/\bsubmit/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewCoLifecycle(target.id, "SUBMIT_FOR_APPROVAL")
		};
		if (/\bvoid/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewCoLifecycle(target.id, "VOID")
		};
		return {
			outcome: "RESOLVED",
			preview: previewCoLifecycle(target.id, "REJECT")
		};
	}
	if (/\b(price|priced|cost)\b/.test(lower) && /\b(co|change order|draft)\b/.test(lower) && amount) {
		const target = coPick.hit;
		if (!target) return whichOf("Change Order to price", coPick.names);
		return {
			outcome: "RESOLVED",
			preview: previewPatchChangeOrder(target.id, { cost: amount })
		};
	}
	if (/\b(add|create|draft|new|originate)\b/.test(lower) && /\b(change order|\bco\b)/.test(lower)) {
		const daysMatch = /(\+?\d+)\s*days?/.exec(lower);
		const titleMatch = /(?:for|titled|called)\s+([^.$]+)/i.exec(text);
		const title = scopePick.hit ? `Scope change: ${scopePick.hit.description}` : titleMatch?.[1]?.trim() ?? null;
		if (!title) return clarify("Which Scope item is this Change Order for? Unknown price is allowed. I will not invent a cost.");
		return {
			outcome: "RESOLVED",
			preview: previewCreateChangeOrder({
				title,
				description: text,
				reason: "PM-reported change",
				cost: amount ?? {
					amountMinor: 0,
					currency
				},
				declaredScheduleDays: daysMatch ? Number(daysMatch[1]) : null,
				scopeItemIds: scopePick.hit ? [scopePick.hit.id] : [],
				activityIds: scopePick.hit?.activityId ? [scopePick.hit.activityId] : []
			})
		};
	}
	if (/\b(po|purchase order|commitment|contract awarded)\b/.test(lower) || /\bcommit(ment|ted)\b/.test(lower) && amount) {
		if (!amount) return clarify("What commitment amount, and which Budget line?");
		const line = linePick.hit;
		if (!line) return whichOf("Budget line for the commitment", linePick.names);
		return {
			outcome: "RESOLVED",
			preview: previewAddCommitment({
				amount,
				vendorRef: /(?:from|with|to)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/.exec(text)?.[1] ?? "Unknown vendor",
				budgetLineId: line.id,
				notes: text
			})
		};
	}
	if (/\b(actual|invoice|invoiced|spent|paid)\b/.test(lower)) {
		if (!amount) return clarify("What actual amount, and which Budget line?");
		const line = linePick.hit;
		if (!line) return whichOf("Budget line for this actual", linePick.names);
		return {
			outcome: "RESOLVED",
			preview: previewAddActual({
				amount,
				date: date ?? (new Date()).toISOString().slice(0, 10),
				description: text.slice(0, 80),
				budgetLineId: line.id
			})
		};
	}
	if (/\b(add|new)\b/.test(lower) && /\b(budget line|line item)\b/.test(lower)) {
		if (!project.financials) return clarify("Initialize Budget first.");
		const category = Object.values(project.financials.categories).find((item) => lower.includes(item.name.toLowerCase()));
		if (!category) return clarify("Which category should the new line live in?");
		return {
			outcome: "RESOLVED",
			preview: previewAddLine({
				categoryId: category.id,
				description: text.slice(0, 80),
				baselineAmount: amount,
				isAllowance: /\ballowance\b/.test(lower),
				scopeItemIds: scopePick.hit ? [scopePick.hit.id] : []
			})
		};
	}
	const closing = /\b(finish|finished|complete|completed|done|closed|poured|wrapped|signed off)\b/.test(lower);
	if (!closing && /\b(start|started|begin|began|in progress)\b/.test(lower) && activityPick.hit) return {
		outcome: "RESOLVED",
		preview: previewPatchActivity(activityPick.hit.id, {
			state: "IN_PROGRESS",
			actualStart: date ?? activityPick.hit.actualStart ?? (new Date()).toISOString().slice(0, 10)
		})
	};
	if (closing) {
		const split = splitUpdate(text);
		const work = matchClosedWork(project, split.body);
		if (work.activityIds.length || work.scopeIds.length || split.nextSaid) {
			return { outcome: "RESOLVED", preview: previewProgressUpdate(split.body, { ...work, nextSaid: split.nextSaid }) };
		}
	}
	if (/\b(add|new)\b/.test(lower) && /\bscope\b/.test(lower)) {
		const description = /scope(?: item)?(?: for| called| titled)?\s+(.+)$/i.exec(text)?.[1]?.trim() ?? text.replace(/^.*scope(?: item)?\s+/i, "").trim();
		if (!description || description.length < 3) return clarify("What Scope item should I add? Give a short description.");
		return {
			outcome: "RESOLVED",
			preview: previewAddScope({
				description,
				phase: /phase\s+([A-Za-z]+)/i.exec(text)?.[1] ?? "General"
			}, project)
		};
	}
	if (scopePick.hit && /\b(complete|completed|done)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewPatchScope(scopePick.hit.id, { complete: true })
	};
	if (scopePick.hit && /\b(exclude|excluded|not included)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewPatchScope(scopePick.hit.id, { included: false })
	};
	if (activityPick.hit && (/\b(note|follow up|follow-up|lined up|lining up)\b/.test(lower) || /\b(john marr|jason bonham)\b/.test(lower))) return {
		outcome: "RESOLVED",
		preview: previewPatchActivity(activityPick.hit.id, { notes: text })
	};
	const named = [
		activityPick.names[0] ? `activity “${activityPick.names[0]}”` : null,
		scopePick.names[0] ? `scope “${scopePick.names[0]}”` : null,
		coPick.names[0] ? `change order ${coPick.names[0]}` : null,
		linePick.names[0] ? `budget line “${linePick.names[0]}”` : null
	].filter(Boolean);
	if (/\b(change order|\bco\b)\b/.test(lower) && !amount) {
		return clarify("If this is a change order, name it and the amount. If this is just a progress update, say what is happening on site — budget stays put.");
	}
	const leftover = splitUpdate(text);
	const leftoverWork = matchClosedWork(project, leftover.body);
	return {
		outcome: "RESOLVED",
		preview: previewProgressUpdate(leftover.body, { ...leftoverWork, nextSaid: leftover.nextSaid }),
	};
}
export function interpretUpload(
  project: Project,
  file: { name: string; type?: string; size?: number },
): InterpretResult {
	return {
		outcome: "RESOLVED",
		preview: previewRecordEvidence({
			name: file.name,
			kind: recognizeEvidence(file.name)
		})
	};
}
