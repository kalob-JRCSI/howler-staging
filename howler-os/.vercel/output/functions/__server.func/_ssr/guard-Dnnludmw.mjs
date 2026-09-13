//#region node_modules/.nitro/vite/services/ssr/assets/guard-Dnnludmw.js
var EVIDENCE_LABEL = {
	TRADEWALK: "Tradewalk",
	CALCS: "Calcs",
	FRAMING: "Framing",
	STRUCTURAL: "Structural",
	SCOPE: "Scope",
	UPLOAD: "File",
	SITE: "Site",
	ESTIMATE: "Estimate",
	QUOTE: "Quote",
	PROCESS: "Process"
};
var LUMBER_SIZES = [
	"2x4",
	"2x6",
	"2x8",
	"2x10",
	"2x12"
];
var DRAWING_SCALES = [
	{
		id: "FIT",
		label: "Fit to sheet (not a plotted scale)",
		inchesPerFoot: null
	},
	{
		id: "1/4",
		label: "1/4\" = 1'-0\"",
		inchesPerFoot: .25
	},
	{
		id: "3/16",
		label: "3/16\" = 1'-0\"",
		inchesPerFoot: .1875
	},
	{
		id: "1/8",
		label: "1/8\" = 1'-0\"",
		inchesPerFoot: .125
	},
	{
		id: "1/16",
		label: "1/16\" = 1'-0\"",
		inchesPerFoot: .0625
	}
];
var SHEETS = [
	{
		id: "L1",
		label: "Proposed 1st floor plan",
		number: "A01"
	},
	{
		id: "L2",
		label: "Proposed attic plan",
		number: "A02"
	},
	{
		id: "FDN",
		label: "Foundation plan",
		number: "A03"
	},
	{
		id: "EL",
		label: "Elevations",
		number: "A04"
	},
	{
		id: "SEC",
		label: "Building section",
		number: "A05"
	},
	{
		id: "WALL",
		label: "Wall section detail",
		number: "A06"
	},
	{
		id: "JOIST",
		label: "Attic floor framing",
		number: "A07"
	},
	{
		id: "ROOF",
		label: "Roof framing plan",
		number: "A08"
	},
	{
		id: "ELEC",
		label: "Electric plan (garage)",
		number: "A09"
	},
	{
		id: "ELEC2",
		label: "Electric plan (attic)",
		number: "A10"
	},
	{
		id: "PLUMB",
		label: "Plumbing plan",
		number: "A11"
	},
	{
		id: "STUD",
		label: "Wall framing",
		number: "A15"
	}
];
var WALL_FACES = [
	{
		id: "FRONT",
		label: "Front"
	},
	{
		id: "BACK",
		label: "Back"
	},
	{
		id: "LEFT",
		label: "Left"
	},
	{
		id: "RIGHT",
		label: "Right"
	}
];
var OPENING_KINDS = [
	{
		id: "OHD",
		label: "Overhead door"
	},
	{
		id: "MAN",
		label: "Man / walk door"
	},
	{
		id: "WINDOW",
		label: "Window"
	}
];
var DIM_DATUMS = [
	{
		id: "FACE_FRAMING",
		label: "Face of framing"
	},
	{
		id: "FACE_FINISH",
		label: "Finished face (brick)"
	},
	{
		id: "CENTERLINE",
		label: "Centerline"
	}
];
var OCCUPANCY_LABEL = {
	DETACHED_GARAGE: "Detached garage (no habitable above)",
	GARAGE_WITH_HABITABLE: "Garage with habitable space above",
	DWELLING: "Dwelling",
	POST_AND_FRAME: "Post-and-frame (KRC R327)",
	OTHER: "Other / not classified"
};
function emptyBlueprint() {
	return {
		jurisdiction: "KENTUCKY",
		codeEdition: "KRC_2018",
		county: null,
		groundSnowLoadPsf: null,
		windSpeedMph: 115,
		weathering: "SEVERE",
		frostDepthIn: null,
		occupancy: null,
		stories: null,
		widthIn: null,
		depthIn: null,
		eaveHeightIn: null,
		roofRise: null,
		roofRun: null,
		roofStyle: "GABLE",
		overhangIn: null,
		studSize: null,
		studSpacingIn: null,
		joistSize: null,
		joistSpacingIn: null,
		joistSpecies: "SPF_2",
		joistDirection: "WIDTH",
		rafterSize: null,
		rafterSpacingIn: null,
		overheadDoorWidthIn: null,
		overheadDoorHeightIn: null,
		drawingScale: "FIT",
		drawingStatus: "DRAFT",
		dimDatum: "FACE_FRAMING",
		envelopeProvenance: "UNKNOWN",
		issuedRevision: null,
		rooms: {},
		openings: [],
		evidence: [],
		notes: null
	};
}
function ensureBlueprint(project) {
	const bp = project.blueprint ?? emptyBlueprint();
	return {
		...emptyBlueprint(),
		...bp,
		rooms: bp.rooms ?? {},
		openings: Array.isArray(bp.openings) ? bp.openings : [],
		evidence: Array.isArray(bp.evidence) ? bp.evidence : [],
		drawingScale: bp.drawingScale ?? "FIT",
		drawingStatus: bp.drawingStatus ?? "DRAFT",
		dimDatum: bp.dimDatum ?? "FACE_FRAMING",
		envelopeProvenance: bp.envelopeProvenance ?? (bp.widthIn != null && bp.depthIn != null ? "PROPOSED" : "UNKNOWN"),
		issuedRevision: bp.issuedRevision ?? null
	};
}
var hits = /* @__PURE__ */ new Map();
function clientKey(request) {
	return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("cf-connecting-ip") || "local";
}
function rateLimited(key, max, windowMs) {
	const now = Date.now();
	const next = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
	next.push(now);
	hits.set(key, next);
	return next.length > max;
}
var SHARE_TOKEN_RE = /^d[a-z0-9]{8,32}$/i;
function goodShareToken(token) {
	return SHARE_TOKEN_RE.test(token.trim());
}
function clampUpdatedAt(incoming, current) {
	const now = Date.now();
	const stamped = Math.min(Math.max(0, typeof incoming === "number" && Number.isFinite(incoming) ? incoming : now), now + 5e3);
	if (current && stamped < current) return current;
	return stamped;
}
//#endregion
export { OCCUPANCY_LABEL as a, WALL_FACES as c, emptyBlueprint as d, ensureBlueprint as f, LUMBER_SIZES as i, clampUpdatedAt as l, rateLimited as m, DRAWING_SCALES as n, OPENING_KINDS as o, goodShareToken as p, EVIDENCE_LABEL as r, SHEETS as s, DIM_DATUMS as t, clientKey as u };
