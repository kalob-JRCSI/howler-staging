import { o as __toESM } from "../_runtime.mjs";
import { f as ensureBlueprint } from "./guard-Dnnludmw.mjs";
import { H as require_react, v as Link, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { Q as interpretUpload, V as envelopeComplete, a as HowlerSpeakPad, d as isPhoneHowler, g as COMMAND_EXAMPLES, o as useHowlerEar, s as useHowlerStore } from "./router-BiflSdL7.mjs";
import { a as Field, l as inputClass, n as DrawingSheet, o as Panel, t as Button } from "./primitives-B8uZC8yf.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/hydrate-4ExAz749.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function HowlerLockup({ to = "/", sub = "KF Live" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
		to,
		className: "howler-lockup",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "howler-lockup-word",
			children: "Howler"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "howler-lockup-sub",
			children: sub
		})]
	});
}
function Atmosphere({ greeting, command, statement }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "howler-atmosphere",
		"aria-label": greeting,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] uppercase tracking-[0.16em] text-subtle",
				children: greeting
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "mt-1 font-display text-[28px] font-normal leading-[1.08] tracking-[-0.02em] text-fg",
				children: command
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-[42ch] text-xs text-muted",
				children: statement
			})
		]
	});
}
function AppFrame({ rail, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "howler-app",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
			className: "howler-rail print-hide",
			children: rail
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
			className: "howler-main",
			children
		})]
	});
}
function PreviewConfirm({ preview, project, onConfirm, onCancel }) {
	const ref = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		ref.current?.scrollIntoView({
			behavior: "smooth",
			block: "nearest"
		});
	}, [preview.understood]);
	const drawn = (0, import_react.useMemo)(() => {
		if (!project || !preview.eventType.startsWith("BLUEPRINT")) return null;
		try {
			const next = preview.apply(project);
			const bp = ensureBlueprint(next);
			if (!envelopeComplete(bp)) return null;
			return next;
		} catch {
			return null;
		}
	}, [preview, project]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref,
		id: "howler-preview",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
			className: "mt-4 space-y-4 rounded-lg bg-surface-2 p-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium uppercase tracking-[0.14em] text-muted",
					children: "What I understood"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm",
					children: preview.understood
				})] }),
				preview.ripple && preview.ripple.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[11px] font-medium uppercase tracking-[0.14em] text-subtle",
					children: "How this lands on the job"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-2 divide-y divide-border",
					children: preview.ripple.filter((hop) => hop.status === "WILL_WRITE" || hop.status === "NEEDS_YOU").map((hop) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "grid grid-cols-[88px_72px_1fr] gap-2 py-2 text-xs sm:grid-cols-[110px_88px_1fr]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-medium text-fg",
								children: hop.ledger
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: hop.status === "WILL_WRITE" ? "text-accent" : hop.status === "UNCHANGED" ? "text-ok" : hop.status === "NEEDS_YOU" ? "text-warn" : "text-muted",
								children: hop.status.replaceAll("_", " ")
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted",
								children: hop.fact
							})
						]
					}, hop.ledger))
				})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium uppercase tracking-[0.14em] text-muted",
					children: "What this changes"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-1 list-disc space-y-1 pl-4 text-sm text-muted",
					children: preview.changes.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: item }, item))
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium uppercase tracking-[0.14em] text-muted",
					children: "Consequences"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-1 list-disc space-y-1 pl-4 text-sm text-muted",
					children: preview.consequences.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: item }, item))
				})] })] }),
				drawn ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-medium uppercase tracking-[0.14em] text-muted",
						children: "Drawing that will be recorded"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 overflow-hidden rounded-md",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DrawingSheet, {
							project: drawn,
							bp: ensureBlueprint(drawn),
							sheet: "L1",
							compact: true
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-xs text-subtle",
						children: "A01–A08 update from the Tradewalk facts. Confirm, then open A03 foundation, A04 elevations, A06 wall section, A07 joists. A09–A14 stay cited, not invented."
					})
				] }) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-fg",
					children: preview.nextAction
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "primary",
						onClick: onConfirm,
						children: "Confirm"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						onClick: onCancel,
						children: "Cancel"
					})]
				})
			]
		})
	});
}
var GROUPS = [
	"Upload",
	"Plans",
	"Issue",
	"Code",
	"Job"
];
function TellHowler({ project, compact = false }) {
	useHowlerStore((state) => state.projects);
	const ear = useHowlerEar();
	const [text, setText] = (0, import_react.useState)("");
	const [dragging, setDragging] = (0, import_react.useState)(false);
	const target = ear.project ?? project ?? null;
	const last = target?.events[0];
	const evidence = target ? ensureBlueprint(target).evidence ?? [] : [];
	function runTyped(raw) {
		const said = raw.trim();
		if (!said) return;
		ear.submitText(said);
		setText("");
	}
	function onFiles(files) {
		const file = files?.[0];
		if (!file) return;
		if (!target) {
			ear.setMessage("Open a job, then drop the file. Howler will not hang a PDF on the wrong address.");
			return;
		}
		ear.take(interpretUpload(target, {
			name: file.name,
			type: file.type,
			size: file.size
		}), false, target.id);
	}
	const drop = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: `inline-flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-xs text-muted shadow-[var(--shadow-border)] ${dragging ? "bg-surface-2 text-fg" : ""}`,
		onDragOver: (event) => {
			event.preventDefault();
			setDragging(true);
		},
		onDragLeave: () => setDragging(false),
		onDrop: (event) => {
			event.preventDefault();
			setDragging(false);
			onFiles(event.dataTransfer.files);
		},
		children: ["Drop file", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			type: "file",
			className: "sr-only",
			accept: ".pdf,.png,.jpg,.jpeg,.txt,.csv",
			onChange: (event) => {
				onFiles(event.target.files);
				event.currentTarget.value = "";
			}
		})]
	});
	const preview = ear.preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewConfirm, {
		preview: ear.preview,
		project: target ?? void 0,
		onConfirm: () => ear.confirmPreview(),
		onCancel: () => ear.cancelPreview()
	}) : null;
	if (compact) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "print-hide",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HowlerSpeakPad, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "mt-3 flex flex-wrap items-end gap-2",
				onSubmit: (event) => {
					event.preventDefault();
					runTyped(text);
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Howler",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							id: "howler-command",
							className: inputClass,
							value: text,
							onChange: (event) => setText(event.target.value),
							placeholder: "McMillan concrete is done. Awaiting Stanfield estimate.",
							autoComplete: "off"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "primary",
						type: "submit",
						children: "Tell Howler"
					}),
					drop
				]
			}),
			last ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 font-mono text-[11px] text-subtle",
				children: ["Rev ", last.revision]
			}) : null,
			preview
		]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex items-start justify-between gap-3",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-lg font-normal",
				children: "Tell Howler"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "Enable Howler once. Then say “Hey Howler” anytime. Type is the backup."
			})] })
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HowlerSpeakPad, {}),
		last ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-3 text-xs text-subtle",
			children: [
				"Continuing from rev ",
				last.revision,
				": ",
				last.note,
				last.recordId ? " You can refer to that record as “it.”" : ""
			]
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-2 font-mono text-[11px] text-subtle",
			children: [ear.armed ? "LISTENING" : ear.voice, ear.heard ? ` · ${ear.heard}` : ""]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
			className: `mt-4 flex min-h-24 cursor-pointer flex-col items-start justify-center rounded-md px-4 py-3 text-sm transition-colors duration-[var(--motion-quick)] ${dragging ? "bg-surface-2 text-fg" : "text-muted shadow-[var(--shadow-border)]"}`,
			onDragOver: (event) => {
				event.preventDefault();
				setDragging(true);
			},
			onDragLeave: () => setDragging(false),
			onDrop: (event) => {
				event.preventDefault();
				setDragging(false);
				onFiles(event.dataTransfer.files);
			},
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-medium text-fg",
					children: "Drop plans, calcs, or a sketch"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mt-1 text-xs",
					children: "Deboard Tradewalk Plans.pdf / Calcs / Stanfield framing adopt the recorded set. Any other file is evidence only — Howler will not scale it."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "file",
					className: "sr-only",
					accept: ".pdf,.png,.jpg,.jpeg,.txt,.csv",
					onChange: (event) => {
						onFiles(event.target.files);
						event.currentTarget.value = "";
					}
				})
			]
		}),
		evidence.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "mt-3 space-y-1 text-xs text-muted",
			children: evidence.slice(-4).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
				item.kind,
				": ",
				item.name,
				item.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [" · ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: item.url,
					target: "_blank",
					rel: "noreferrer",
					className: "text-accent",
					children: "Drive"
				})] }) : null
			] }, item.id))
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-4 space-y-3",
			children: GROUPS.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
				children: group
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-1 flex flex-wrap gap-2",
				children: COMMAND_EXAMPLES.filter((item) => item.group === group).map((example) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					title: example.does,
					className: "min-h-11 rounded-md px-3 text-left text-xs text-muted shadow-[var(--shadow-border)] transition-colors duration-[var(--motion-quick)] hover:text-fg",
					onClick: () => {
						setText(example.phrase);
						ear.setMessage(null);
						ear.setPreview(null);
					},
					children: example.phrase
				}, example.phrase))
			})] }, group))
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			className: "mt-4 space-y-3",
			onSubmit: (event) => {
				event.preventDefault();
				runTyped(text);
			},
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
				label: "What happened",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					className: `${inputClass} min-h-24 py-2`,
					value: text,
					onChange: (event) => setText(event.target.value),
					placeholder: "Press the ring, then speak. Or type the update."
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "primary",
				type: "submit",
				children: "Analyze"
			})]
		}),
		ear.message ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-3 text-sm text-muted",
			children: ear.message
		}) : null,
		preview
	] });
}
function useHowlerHydrated() {
	const hydrateFromStorage = useHowlerStore((state) => state.hydrateFromStorage);
	const pullRemote = useHowlerStore((state) => state.pullRemote);
	(0, import_react.useEffect)(() => {
		hydrateFromStorage();
		pullRemote();
		const wait = isPhoneHowler() ? 6e3 : 4e3;
		let tick = 0;
		const loop = () => {
			if (document.visibilityState === "visible") pullRemote();
		};
		tick = window.setInterval(loop, wait);
		const onVis = () => {
			if (document.visibilityState === "visible") pullRemote();
		};
		document.addEventListener("visibilitychange", onVis);
		return () => {
			window.clearInterval(tick);
			document.removeEventListener("visibilitychange", onVis);
		};
	}, [hydrateFromStorage, pullRemote]);
	return true;
}
//#endregion
export { TellHowler as a, PreviewConfirm as i, Atmosphere as n, useHowlerHydrated as o, HowlerLockup as r, AppFrame as t };
