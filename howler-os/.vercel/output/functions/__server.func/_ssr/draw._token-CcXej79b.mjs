import { o as __toESM } from "../_runtime.mjs";
import { d as emptyBlueprint, n as DRAWING_SCALES, s as SHEETS } from "./guard-Dnnludmw.mjs";
import { H as require_react, v as Link, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { K as formatFtIn, Mt as previewPatchBlueprint, R as emptyJob, Yt as previewUpsertRoom, Z as interpretFinancial, r as Route$2 } from "./router-BiflSdL7.mjs";
import { a as Field, c as StatusChip, l as inputClass, n as DrawingSheet, o as Panel, t as Button } from "./primitives-B8uZC8yf.mjs";
import { t as useDrawingSession } from "./use-drawing-session-CjFQZJre.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/draw._token-CcXej79b.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function stubProject(snapshot, token) {
	return {
		id: `draw-${token}`,
		name: snapshot.jobTitle,
		clientName: snapshot.clientLabel,
		address: snapshot.siteLine,
		projectType: "Working drawing session",
		timezone: "America/New_York",
		revision: snapshot.projectRevision,
		healthBand: "YELLOW",
		paused: false,
		heldPhases: [],
		dashboardNote: null,
		officialStart: null,
		intendedFinish: null,
		sourceLabel: "Shared drawing session",
		activities: {},
		scopeItems: {},
		financials: null,
		blueprint: snapshot.blueprint,
		job: emptyJob(),
		events: []
	};
}
function feetToInches(raw) {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return null;
	return Math.round(value * 12);
}
function DrawingSessionPage({ token }) {
	const [sheet, setSheet] = (0, import_react.useState)("L1");
	const [local, setLocal] = (0, import_react.useState)(null);
	const [dim, setDim] = (0, import_react.useState)(null);
	const [talk, setTalk] = (0, import_react.useState)("");
	const [talkMsg, setTalkMsg] = (0, import_react.useState)(null);
	const session = useDrawingSession({
		token,
		name: "guest",
		onRemote: (snapshot) => {
			setLocal((current) => {
				if (current && snapshot.rev <= current.rev) return current;
				return snapshot;
			});
		}
	});
	const snapshot = local ?? session.view?.snapshot ?? null;
	const status = session.view?.status ?? "MISSING";
	function commitBlueprint(blueprint, note) {
		if (!snapshot) return;
		const next = {
			...snapshot,
			rev: Date.now(),
			updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
			blueprint,
			scale: blueprint.drawingScale ?? snapshot.scale
		};
		setLocal(next);
		session.publish(next);
	}
	function applyPatch(patch) {
		if (!snapshot) return;
		const preview = previewPatchBlueprint(patch);
		const fake = stubProject(snapshot, token);
		commitBlueprint(preview.apply(fake).blueprint, preview.understood);
	}
	if (status === "ENDED" || status === "EXPIRED" || status === "MISSING" && !snapshot) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs uppercase tracking-[0.14em] text-muted",
				children: "Drawing session"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "mt-2 font-display text-3xl",
				children: "This session is closed."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm text-muted",
				children: "The host ended access, the timer ran out, or this link is not live. It does not open Howler, and it will not open the drawing again. Ask the host to issue a PDF or start a new session."
			})
		]
	});
	if (!snapshot) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mx-auto max-w-lg px-4 py-16",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted",
			children: "Opening drawing session…"
		})
	});
	const project = stubProject(snapshot, token);
	const bp = snapshot.blueprint ?? emptyBlueprint();
	function onRoomDrag(drag) {
		const room = bp.rooms[drag.roomId];
		if (!room) return;
		const preview = previewUpsertRoom({
			id: room.id,
			name: room.name,
			level: room.level,
			widthIn: drag.widthIn ?? room.widthIn,
			depthIn: drag.depthIn ?? room.depthIn,
			originXIn: drag.originXIn,
			originYIn: drag.originYIn,
			scopeItemIds: room.scopeItemIds,
			notes: room.notes
		});
		commitBlueprint(preview.apply(project).blueprint, preview.understood);
	}
	function submitDim(event) {
		event.preventDefault();
		if (!dim) return;
		const data = new FormData(event.currentTarget);
		const inches = feetToInches(String(data.get("feet") ?? ""));
		const name = String(data.get("name") ?? "").trim();
		if (dim.kind === "width" && inches) applyPatch({ widthIn: inches });
		if (dim.kind === "depth" && inches) applyPatch({ depthIn: inches });
		if (dim.kind === "eave" && inches) applyPatch({ eaveHeightIn: inches });
		if (dim.kind === "room") {
			const room = bp.rooms[dim.roomId];
			if (room) {
				const preview = previewUpsertRoom({
					id: room.id,
					name: name || room.name,
					level: room.level,
					widthIn: dim.field === "width" && inches ? inches : room.widthIn,
					depthIn: dim.field === "depth" && inches ? inches : room.depthIn,
					originXIn: room.originXIn,
					originYIn: room.originYIn,
					scopeItemIds: room.scopeItemIds,
					notes: room.notes
				});
				commitBlueprint(preview.apply(project).blueprint, preview.understood);
			}
		}
		setDim(null);
	}
	function describeBuilding(event) {
		event.preventDefault();
		const result = interpretFinancial(project, talk);
		if (result.outcome === "CLARIFICATION") {
			setTalkMsg(result.message);
			return;
		}
		if (result.outcome === "ACTION") {
			if (result.action === "PRINT") window.print();
			setTalkMsg(result.message);
			setTalk("");
			return;
		}
		commitBlueprint(result.preview.apply(project).blueprint, result.preview.understood);
		setTalkMsg(`Recorded: ${result.preview.understood}`);
		setTalk("");
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-[1120px] px-6 py-7",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex flex-wrap items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "howler-lockup mb-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "howler-lockup-word",
							children: "Howler"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "howler-lockup-sub",
							children: "Drawing"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "font-display text-[28px] font-normal tracking-[-0.03em]",
						children: snapshot.jobTitle
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-sm text-muted",
						children: [
							snapshot.siteLine,
							" · ",
							snapshot.clientLabel
						]
					})
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(StatusChip, {
					tone: "warn",
					children: ["Not Howler · access ", session.remainingLabel]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 max-w-2xl text-sm text-muted",
				children: "You can edit this drawing. You cannot see budget, schedule, or the rest of the job. When the host ends the session, this link dies."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-5 flex flex-wrap items-center gap-2 print-hide",
				children: [SHEETS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setSheet(item.id),
					className: `inline-flex min-h-11 items-center rounded-md px-3 text-sm ${sheet === item.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`,
					children: item.number
				}, item.id)), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "ml-auto flex min-h-11 items-center gap-2 text-xs text-muted",
					children: ["Scale", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
						className: `${inputClass} w-auto min-w-40`,
						value: bp.drawingScale ?? "FIT",
						onChange: (event) => applyPatch({ drawingScale: event.target.value }),
						children: DRAWING_SCALES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: item.id,
							children: item.label
						}, item.id))
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DrawingSheet, {
					project,
					bp,
					sheet,
					scaleId: bp.drawingScale,
					editable: true,
					onSelectDim: setDim,
					onRoomDrag
				})
			}),
			dim ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "print-hide mt-4 grid gap-3 rounded-xl bg-surface p-4 sm:grid-cols-[1fr_auto]",
				onSubmit: submitDim,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: dim.kind === "room" ? dim.field === "name" ? "Room name" : `Room ${dim.field} (ft)` : `${dim.kind} (ft)`,
					children: dim.kind === "room" && dim.field === "name" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						name: "name",
						className: inputClass,
						defaultValue: bp.rooms[dim.roomId]?.name ?? "",
						required: true
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						name: "feet",
						className: inputClass,
						inputMode: "decimal",
						placeholder: "feet",
						required: true
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "primary",
						type: "submit",
						children: "Save on drawing"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						type: "button",
						onClick: () => setDim(null),
						children: "Cancel"
					})]
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "print-hide mt-5 space-y-3 rounded-xl bg-surface p-4",
				onSubmit: describeBuilding,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Describe the building",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							className: `${inputClass} min-h-20 py-2`,
							value: talk,
							onChange: (event) => setTalk(event.target.value),
							placeholder: "24 by 32, 9 foot walls, 8/12 roof"
						})
					}),
					talkMsg ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: talkMsg
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						type: "submit",
						children: "Update drawing"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "print-hide mt-5 grid gap-3 sm:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs uppercase tracking-[0.14em] text-muted",
						children: "Envelope"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 font-mono",
						children: bp.widthIn && bp.depthIn ? `${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)}` : "Unknown"
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs uppercase tracking-[0.14em] text-muted",
						children: "Pitch"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 font-mono",
						children: bp.roofRise && bp.roofRun ? `${bp.roofRise}/${bp.roofRun}` : "Unknown"
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs uppercase tracking-[0.14em] text-muted",
						children: "Guests"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-sm",
						children: [session.peers.length, " connected"]
					})] })
				]
			})
		]
	});
}
function DrawRoute() {
	const { token } = Route$2.useParams();
	if (!/^[a-zA-Z0-9_-]{1,64}$/.test(token)) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-lg px-4 py-16",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "font-display text-2xl",
			children: "This drawing link is not valid."
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/",
			className: "mt-4 inline-flex min-h-11 items-center text-sm text-accent",
			children: "Leave"
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DrawingSessionPage, { token });
}
//#endregion
export { DrawRoute as component };
