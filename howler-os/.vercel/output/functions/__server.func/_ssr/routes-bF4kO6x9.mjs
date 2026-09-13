import { r as EVIDENCE_LABEL } from "./guard-Dnnludmw.mjs";
import { v as Link, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { A as cardGlance, L as driveFileUrl, O as UNMATCHED_DRIVE_PLANS, P as contractDates, Y as heldPhasesOf, b as JR_PROCESS_REFS, i as HowlerMic, l as KF_SOURCE, s as useHowlerStore } from "./router-BiflSdL7.mjs";
import { c as StatusChip, o as Panel, s as Stat, t as Button } from "./primitives-B8uZC8yf.mjs";
import { a as TellHowler, n as Atmosphere, o as useHowlerHydrated, r as HowlerLockup } from "./hydrate-4ExAz749.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-bF4kO6x9.js
var import_jsx_runtime = require_jsx_runtime();
function DriveLibrary() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-6 space-y-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] uppercase tracking-[0.14em] text-subtle",
				children: "Drive drawing library"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-1 font-display text-[22px] font-normal",
				children: "Named sets, other addresses"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-2xl text-sm text-muted",
				children: "Visual Tradewalk and builder sets found in Drive that are not one of the seven live jobs. Recorded so they are findable. Howler will not hang them on Pratt, DeBoard, or any other live card."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-4 space-y-4",
				children: UNMATCHED_DRIVE_PLANS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "border-b border-border pb-4 last:border-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: item.kind === "TRADEWALK" ? "ok" : "neutral",
								children: EVIDENCE_LABEL[item.kind]
							}), item.issued ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[11px] text-subtle",
								children: item.issued
							}) : null]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm font-medium",
							children: item.name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted",
							children: item.address
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-subtle",
							children: item.note
						}),
						item.sheets?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 font-mono text-[11px] text-subtle",
							children: item.sheets.map((sheet) => sheet.number).join(" · ")
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
							href: driveFileUrl(item.fileId),
							target: "_blank",
							rel: "noreferrer",
							className: "mt-2 inline-flex min-h-11 items-center text-xs text-accent",
							children: "Open in Drive"
						})
					]
				}, item.fileId))
			})
		] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] uppercase tracking-[0.14em] text-subtle",
				children: "J&R"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-1 font-display text-xl font-normal",
				children: "Planning process"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-2xl text-sm text-muted",
				children: "Company visual planning docs from Drive. Process, not a job drawing."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-4 space-y-4",
				children: JR_PROCESS_REFS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "border-b border-border pb-4 last:border-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: "neutral",
								children: EVIDENCE_LABEL[item.kind]
							}), item.issued ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[11px] text-subtle",
								children: item.issued
							}) : null]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm font-medium",
							children: item.name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-muted",
							children: item.note
						}),
						item.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
							href: item.url,
							target: "_blank",
							rel: "noreferrer",
							className: "mt-2 inline-flex min-h-11 items-center text-xs text-accent",
							children: "Open in Drive"
						}) : null
					]
				}, item.id))
			})
		] })]
	});
}
var BAND_TONE = {
	GREEN: "ok",
	YELLOW: "warn",
	RED: "danger"
};
function sortPortfolio(projects) {
	const rank = (project) => project.healthBand === "RED" ? 0 : project.paused ? 1 : project.healthBand === "YELLOW" ? 2 : 3;
	return [...projects].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
function DashboardView() {
	const projectsMap = useHowlerStore((state) => state.projects);
	const restoreSeed = useHowlerStore((state) => state.restoreSeed);
	const projects = sortPortfolio(Object.values(projectsMap));
	const redJobs = projects.filter((project) => project.healthBand === "RED");
	const yellow = projects.filter((project) => project.healthBand === "YELLOW").length;
	const green = projects.filter((project) => project.healthBand === "GREEN").length;
	const redHint = redJobs[0] ? `${redJobs[0].name} — ${redJobs[0].dashboardNote?.split(/[.\n]/)[0]?.slice(0, 72) || "needs attention"}` : void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-[1120px] px-6 py-7",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "mb-5 flex flex-wrap items-center justify-between gap-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HowlerLockup, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HowlerMic, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						onClick: () => {
							if (window.confirm("This reloads the KF seed and wipes live updates on this Howler. Continue?")) restoreSeed();
						},
						children: "Restore KF portfolio"
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Atmosphere, {
				greeting: "KF Live Pilot",
				command: "Seven jobs. Confirm writes the board.",
				statement: "Hey Howler or type the job. Confirm. Phone is the field. Desk is the board. Budget only if you name money."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-6",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TellHowler, { compact: true })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "howler-metrics mt-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Active",
						value: String(projects.length)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Green",
						value: String(green)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Yellow",
						value: String(yellow)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Red",
						value: String(redJobs.length),
						hint: redHint
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-[11px] text-subtle",
				children: KF_SOURCE
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-8 text-[11px] uppercase tracking-[0.16em] text-subtle",
				children: "Index cards"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-1 font-display text-[22px] font-normal",
				children: "Live portfolio"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4 grid gap-3 sm:grid-cols-2",
				children: projects.map((project) => {
					const held = heldPhasesOf(project);
					const calendar = contractDates(project);
					const glance = cardGlance(project);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/projects/$projectId/$moduleId",
						params: {
							projectId: project.id,
							moduleId: "overview"
						},
						className: "block rounded-lg bg-surface p-4 shadow-[var(--shadow-border)] transition-[box-shadow] duration-[var(--motion-quick)] ease-[var(--ease-smooth)] hover:shadow-[var(--shadow-border-hover)]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "text-[11px] uppercase tracking-[0.12em] text-subtle",
										children: [project.clientName, project.address !== "Unknown" ? ` · ${project.address}` : ""]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
										tone: BAND_TONE[project.healthBand],
										children: project.healthBand
									}),
									project.paused ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
										tone: "warn",
										children: "Paused"
									}) : null,
									!project.paused && held.length ? held.map((phase) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(StatusChip, {
										tone: "warn",
										children: [phase, " held"]
									}, phase)) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "ml-auto font-mono text-[12px] text-muted",
										children: [glance.progress, "%"]
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "mt-1 font-display text-xl font-normal",
								children: project.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-sm text-fg",
								children: glance.now
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "howler-card-block",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
									children: "Next 14 days"
								}), glance.window.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "howler-card-list",
									children: glance.window.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-mono text-[12px] text-accent",
											children: item.when
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: item.name }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-subtle",
											children: item.mark
										})
									] }, item.id))
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-sm text-muted",
									children: glance.windowHint
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "howler-card-block howler-card-solve",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
									children: "Next call to action"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
									className: "howler-card-solve-list",
									children: glance.solve.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: item }, item))
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "howler-card-dates",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
									children: "Official start"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: `mt-1 font-mono text-[13px] ${calendar.startKnown ? "text-fg" : "text-muted"}`,
									children: calendar.officialStart
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "howler-card-finish",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
										children: "Intended finish"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: `mt-1 font-mono text-[13px] ${calendar.finishKnown ? "text-fg" : "text-muted"}`,
										children: calendar.intendedFinish
									})]
								})]
							})
						]
					}, project.id);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DriveLibrary, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
				className: "mt-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[11px] uppercase tracking-[0.14em] text-subtle",
					children: "Working loop"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 max-w-2xl text-sm text-muted",
					children: "Arm Howler. Say the name. Speak what happened. Howler shows the ripple, then waits. Gold is confirm. A target date is not a completed date."
				})]
			})
		]
	});
}
function Home() {
	useHowlerHydrated();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DashboardView, {});
}
//#endregion
export { Home as component };
