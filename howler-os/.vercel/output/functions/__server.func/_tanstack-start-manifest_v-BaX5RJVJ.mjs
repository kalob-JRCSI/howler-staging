//#region node_modules/.nitro/vite/services/ssr/assets/_tanstack-start-manifest_v-BaX5RJVJ.js
var tsrStartManifest = () => ({ routes: {
	__root__: {
		filePath: "/workspace/src/routes/__root.tsx",
		children: [
			"/",
			"/howler-mic",
			"/api/howler-intent",
			"/api/howler-speak",
			"/api/howler-state",
			"/api/howler-trace",
			"/api/rtc",
			"/api/transcribe",
			"/draw/$token",
			"/projects/$projectId/$moduleId",
			"/projects/$projectId/"
		],
		preloads: ["/assets/index-Dzpl1n16.js", "/assets/interpret-CTd7WE8c.js"],
		scripts: [{ attrs: {
			type: "module",
			async: !0,
			src: "/assets/index-Dzpl1n16.js"
		} }]
	},
	"/": {
		filePath: "/workspace/src/routes/index.tsx",
		children: void 0,
		preloads: [
			"/assets/routes-Cmxw_wfX.js",
			"/assets/primitives-CfBr93bv.js",
			"/assets/hydrate-py3Moeh2.js"
		]
	},
	"/draw/$token": {
		filePath: "/workspace/src/routes/draw.$token.tsx",
		children: void 0,
		preloads: [
			"/assets/draw._token-3vToV2LJ.js",
			"/assets/use-drawing-session-Be5B6_xF.js",
			"/assets/primitives-CfBr93bv.js"
		]
	},
	"/projects/$projectId/$moduleId": {
		filePath: "/workspace/src/routes/projects.$projectId.$moduleId.tsx",
		children: void 0,
		preloads: [
			"/assets/projects._projectId._moduleId-CHKqd5od.js",
			"/assets/use-drawing-session-Be5B6_xF.js",
			"/assets/primitives-CfBr93bv.js",
			"/assets/hydrate-py3Moeh2.js"
		]
	},
	"/projects/$projectId/": {
		filePath: "/workspace/src/routes/projects.$projectId.index.tsx",
		children: void 0,
		preloads: ["/assets/projects._projectId.index-DJ7LAi8J.js"]
	}
} });
//#endregion
export { tsrStartManifest };
