import { p as goodShareToken } from "./guard-Dnnludmw.mjs";
import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { u as viewFromRecord } from "./drawing-share-C2JrzuM7.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/drawing-share-fns-BsIfOzTO.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
function asSnapshot(value) {
	return value;
}
function tokenOrThrow(token) {
	const next = token.trim();
	if (!goodShareToken(next)) throw new Error("Invalid share.");
	return next;
}
function snapshotSizeOk(snapshot) {
	try {
		return JSON.stringify(snapshot).length < 4e5;
	} catch {
		return false;
	}
}
async function sql() {
	const { getSql } = await import("./db-BLt1fCfV.mjs");
	return getSql();
}
var upsertDrawingShare_createServerFn_handler = createServerRpc({
	id: "e75d8acc15007fa50c1f3f3fefa2ff99b79809667c30053018d05b1f4531d616",
	name: "upsertDrawingShare",
	filename: "src/lib/howler/drawing-share-fns.ts"
}, (opts) => upsertDrawingShare.__executeServer(opts));
var upsertDrawingShare = createServerFn({ method: "POST" }).validator((input) => input).handler(upsertDrawingShare_createServerFn_handler, async ({ data }) => {
	const token = tokenOrThrow(data.token);
	if (!snapshotSizeOk(data.snapshot)) throw new Error("Share too large.");
	await (await sql()).query(`insert into drawing_shares (token, snapshot, expires_at, ended_at)
       values ($1, $2, $3, $4)
       on conflict (token) do update
         set snapshot = excluded.snapshot,
             expires_at = excluded.expires_at,
             ended_at = excluded.ended_at`, [
		token,
		JSON.stringify(data.snapshot),
		data.expiresAt,
		data.endedAt ?? null
	]);
	return viewFromRecord(token, {
		token,
		expiresAt: data.expiresAt,
		endedAt: data.endedAt ?? null,
		snapshot: data.snapshot
	});
});
var readDrawingShare_createServerFn_handler = createServerRpc({
	id: "18c2debec09a0eeb1f0f77016c8045dcef4d6b133c01bf938859b96b39e0e1c5",
	name: "readDrawingShare",
	filename: "src/lib/howler/drawing-share-fns.ts"
}, (opts) => readDrawingShare.__executeServer(opts));
var readDrawingShare = createServerFn({ method: "POST" }).validator((input) => input).handler(readDrawingShare_createServerFn_handler, async ({ data }) => {
	const token = tokenOrThrow(data.token);
	const row = (await (await sql()).query(`select token, snapshot, expires_at, ended_at from drawing_shares where token = $1`, [token]))[0];
	if (!row) return viewFromRecord(token, null);
	const record = {
		token: row.token,
		expiresAt: row.expires_at,
		endedAt: row.ended_at,
		snapshot: asSnapshot(row.snapshot)
	};
	return viewFromRecord(token, record);
});
var pushDrawingSnapshot_createServerFn_handler = createServerRpc({
	id: "75b0ea8bf3b02498fdd870a23dd5f5b323258a1fb0921feb6f7eb91519334be4",
	name: "pushDrawingSnapshot",
	filename: "src/lib/howler/drawing-share-fns.ts"
}, (opts) => pushDrawingSnapshot.__executeServer(opts));
var pushDrawingSnapshot = createServerFn({ method: "POST" }).validator((input) => input).handler(pushDrawingSnapshot_createServerFn_handler, async ({ data }) => {
	const token = tokenOrThrow(data.token);
	if (!snapshotSizeOk(data.snapshot)) throw new Error("Share too large.");
	const db = await sql();
	const row = (await db.query(`select token, snapshot, expires_at, ended_at from drawing_shares where token = $1`, [token]))[0];
	if (!row) return viewFromRecord(token, null);
	const current = viewFromRecord(token, {
		token: row.token,
		expiresAt: row.expires_at,
		endedAt: row.ended_at,
		snapshot: asSnapshot(row.snapshot)
	});
	if (current.status !== "LIVE") return current;
	await db.query(`update drawing_shares set snapshot = $2 where token = $1`, [token, JSON.stringify(data.snapshot)]);
	return {
		...current,
		snapshot: data.snapshot
	};
});
var endDrawingShare_createServerFn_handler = createServerRpc({
	id: "c3573c7a8599decedb60554e43d745a99df6ec60293f0c04fe3388cdf29e9c36",
	name: "endDrawingShare",
	filename: "src/lib/howler/drawing-share-fns.ts"
}, (opts) => endDrawingShare.__executeServer(opts));
var endDrawingShare = createServerFn({ method: "POST" }).validator((input) => input).handler(endDrawingShare_createServerFn_handler, async ({ data }) => {
	const token = tokenOrThrow(data.token);
	const db = await sql();
	const endedAt = (/* @__PURE__ */ new Date()).toISOString();
	await db.query(`update drawing_shares set ended_at = $2 where token = $1 and ended_at is null`, [token, endedAt]);
	const row = (await db.query(`select token, snapshot, expires_at, ended_at from drawing_shares where token = $1`, [token]))[0];
	if (!row) return viewFromRecord(token, null);
	return viewFromRecord(token, {
		token: row.token,
		expiresAt: row.expires_at,
		endedAt: row.ended_at ?? endedAt,
		snapshot: asSnapshot(row.snapshot)
	});
});
//#endregion
export { endDrawingShare_createServerFn_handler, pushDrawingSnapshot_createServerFn_handler, readDrawingShare_createServerFn_handler, upsertDrawingShare_createServerFn_handler };
