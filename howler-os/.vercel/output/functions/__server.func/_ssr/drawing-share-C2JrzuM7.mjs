import { f as ensureBlueprint } from "./guard-Dnnludmw.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/drawing-share-C2JrzuM7.js
var SHARE_LOCAL_KEY = "howler-drawing-shares-v1";
var SHARE_PAYLOAD_PREFIX = "howler-drawing-share:";
function newShareToken() {
	return `d${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}
function snapshotFromProject(project) {
	const blueprint = ensureBlueprint(project);
	return {
		rev: Date.now(),
		updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		jobTitle: project.name,
		siteLine: project.address,
		clientLabel: project.clientName,
		projectRevision: project.revision,
		scale: blueprint.drawingScale ?? "FIT",
		blueprint,
		hostProjectId: project.id
	};
}
function shareChannelName(token) {
	return `howler-draw-${token}`;
}
function readBag() {
	if (typeof window === "undefined") return { shares: {} };
	try {
		const raw = window.localStorage.getItem(SHARE_LOCAL_KEY);
		if (!raw) return { shares: {} };
		return JSON.parse(raw);
	} catch {
		return { shares: {} };
	}
}
function writeBag(bag) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(SHARE_LOCAL_KEY, JSON.stringify(bag));
}
function localPutShare(record) {
	const bag = readBag();
	bag.shares[record.token] = record;
	writeBag(bag);
	if (typeof window !== "undefined") window.localStorage.setItem(SHARE_PAYLOAD_PREFIX + record.token, JSON.stringify(record));
}
function localGetShare(token) {
	const bag = readBag();
	if (bag.shares[token]) return bag.shares[token];
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(SHARE_PAYLOAD_PREFIX + token);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}
function localEndShare(token) {
	const bag = readBag();
	const existing = bag.shares[token];
	if (existing) {
		bag.shares[token] = {
			...existing,
			endedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		writeBag(bag);
	}
	if (typeof window !== "undefined") window.localStorage.removeItem(SHARE_PAYLOAD_PREFIX + token);
}
function localListLive(projectId) {
	const now = Date.now();
	return Object.values(readBag().shares).filter((share) => {
		if (share.snapshot.hostProjectId !== projectId) return false;
		if (share.endedAt) return false;
		return new Date(share.expiresAt).getTime() > now;
	});
}
function viewFromRecord(token, record) {
	if (!record) return {
		status: "MISSING",
		token,
		expiresAt: null,
		remainingMs: 0,
		snapshot: null
	};
	const now = Date.now();
	const expires = new Date(record.expiresAt).getTime();
	if (record.endedAt) return {
		status: "ENDED",
		token,
		expiresAt: record.expiresAt,
		remainingMs: 0,
		snapshot: null
	};
	if (expires <= now) return {
		status: "EXPIRED",
		token,
		expiresAt: record.expiresAt,
		remainingMs: 0,
		snapshot: null
	};
	return {
		status: "LIVE",
		token,
		expiresAt: record.expiresAt,
		remainingMs: expires - now,
		snapshot: record.snapshot
	};
}
function formatRemaining(ms) {
	if (ms <= 0) return "ended";
	const minutes = Math.ceil(ms / 6e4);
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
function shareUrl(token) {
	if (typeof window === "undefined") return `/draw/${token}`;
	return `${window.location.origin}/draw/${token}`;
}
//#endregion
export { localPutShare as a, shareUrl as c, localListLive as i, snapshotFromProject as l, localEndShare as n, newShareToken as o, localGetShare as r, shareChannelName as s, formatRemaining as t, viewFromRecord as u };
