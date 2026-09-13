import { o as __toESM } from "../_runtime.mjs";
import { a as OCCUPANCY_LABEL, c as WALL_FACES, f as ensureBlueprint, i as LUMBER_SIZES, n as DRAWING_SCALES, o as OPENING_KINDS, r as EVIDENCE_LABEL, s as SHEETS, t as DIM_DATUMS } from "./guard-Dnnludmw.mjs";
import { H as require_react, v as Link, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { At as previewIssueDrawingSet, B as ensureJob, Bt as previewSetBaseline, C as LIFECYCLE, Ct as previewAddPhoto, Dt as previewCreateChangeOrder, E as STATUS_LABEL, Et as previewCoLifecycle, F as describeEnvelope, Ft as previewPatchScope, Gt as previewSetPermit, H as financialSummary, Ht as previewSetDrawingStatus, I as designCriteria, It as previewRemoveOpening, J as framingTakeoff, Jt as previewUpsertOpening, K as formatFtIn, Kt as previewSuggestConventionalFraming, L as driveFileUrl, Lt as previewRemoveRoom, M as computeFindings, Mt as previewPatchBlueprint, N as computePlanFindings, Nt as previewPatchChangeOrder, Ot as previewDrawWorkingSet, P as contractDates, Pt as previewPatchLine, Rt as previewReplaceBlueprint, St as previewAddLine, T as PROVENANCE_LABEL, Tt as previewAdoptTradewalkSet, U as findingNextAction, Ut as previewSetEnvelopeProvenance, V as envelopeComplete, Vt as previewSetDrawingDatum, W as forecastActivity, Wt as previewSetInspection, X as integrity, Xt as priorityActions, Y as heldPhasesOf, Yt as previewUpsertRoom, Zt as progressPercent, _ as DATUM_LABEL, an as scopeStatus, at as liveFacts, bt as previewAddCategory, c as useProject, ct as materialTakeoff, dt as nextMovement, et as jobBrief, f as CARVER_WORKING_PREVIEWS, fn as unresolvedRegister, ft as openingLabel, h as CODE_SHORT, ht as pitchDegrees, i as HowlerMic, in as scaleLabel, it as lineRevised, jt as previewPatchActivity, k as annotatePreview, kt as previewInitialize, m as CODE_BASIS, mn as zero, mt as parseMoneyDecimal, n as Route, nn as ridgeHeightIn, nt as lineActual, on as sharePacketLines, ot as livesIn, p as CODE_ADOPTION, pt as openingSchedule, q as formatMoney, qt as previewUpsertContact, rt as lineCommitted, s as useHowlerStore, tn as resolveOpenings, u as placeLine, un as submittalChecklist, ut as memorySummary, v as DEBOARD_WORKING_PREVIEWS, vt as plansStatusLine, w as PERMIT_LABEL, wt as previewAddScope, x as KY_COUNTIES, xt as previewAddCommitment, y as INSPECTION_STATUSES, yt as previewAddActual, z as engineerRequired, zt as previewRoomsFromScope } from "./router-BiflSdL7.mjs";
import { a as Field, c as StatusChip, i as Expandable, l as inputClass, n as DrawingSheet, o as Panel, r as Empty, s as Stat, t as Button } from "./primitives-B8uZC8yf.mjs";
import { c as shareUrl, i as localListLive, l as snapshotFromProject, o as newShareToken, t as formatRemaining } from "./drawing-share-C2JrzuM7.mjs";
import { t as useDrawingSession } from "./use-drawing-session-CjFQZJre.mjs";
import { a as TellHowler, i as PreviewConfirm, o as useHowlerHydrated, r as HowlerLockup, t as AppFrame } from "./hydrate-4ExAz749.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/projects._projectId._moduleId-K738oaoP.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ActivityModule({ project }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
			className: "font-display text-xl",
			children: "History"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 text-sm text-muted",
			children: "Append-only. Approved evidence is not rewritten. Clerical edits still leave a record."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
			className: "mt-5 space-y-4",
			children: [project.events.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No events yet." }) : null, project.events.map((event) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "border-b border-border pb-4 last:border-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: event.clerical ? "neutral" : "warn",
								children: event.clerical ? "Clerical" : "Consequential"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono text-xs text-muted",
								children: ["rev ", event.revision]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-xs text-subtle",
								children: new Date(event.occurredAt).toLocaleString()
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm font-medium",
						children: event.type.replaceAll("_", " ")
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted",
						children: event.note
					})
				]
			}, event.id))]
		})
	] });
}
function runOrPreview(projectId, preview, applyPreview, setPreview) {
	if (preview.clerical) applyPreview(projectId, preview);
	else setPreview(preview);
}
function BudgetModule({ project }) {
	const applyPreview = useHowlerStore((state) => state.applyPreview);
	const [preview, setPreview] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [openLineId, setOpenLineId] = (0, import_react.useState)(null);
	const summary = financialSummary(project);
	const findings = computeFindings(project);
	const fin = project.financials;
	if (!fin) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-5",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Budget"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted",
				children: "Financials are not initialized. That is Unknown, not $0."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				className: "mt-4",
				variant: "primary",
				onClick: () => setPreview(previewInitialize("USD")),
				children: "Initialize financials"
			}),
			preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewConfirm, {
				preview,
				onConfirm: () => {
					applyPreview(project.id, preview);
					setPreview(null);
				},
				onCancel: () => setPreview(null)
			}) : null
		] })
	});
	const categories = Object.values(fin.categories).filter((category) => category.active).sort((a, b) => a.sortOrder - b.sortOrder);
	const lines = Object.values(fin.lines).filter((line) => line.active);
	const currency = fin.currency;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Original",
						value: formatMoney(summary?.baseline ?? null)
					}) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Approved changes",
						value: formatMoney(summary?.approvedChangeOrderTotal ?? null)
					}) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Revised",
						value: formatMoney(summary?.revisedBudget ?? null),
						hint: `Pending ${formatMoney(summary?.pendingChangeOrderTotal ?? null)} stays out`
					}) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Committed / actual",
						value: `${formatMoney(summary?.committedTotal ?? null)} / ${formatMoney(summary?.actualTotal ?? null)}`,
						hint: `Remaining ${formatMoney(summary?.remaining ?? null)}`
					}) })
				]
			}),
			findings.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Findings"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 space-y-2 text-sm text-muted",
				children: findings.map((finding) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: finding.message }, `${finding.kind}-${finding.budgetLineId}-${finding.scopeItemId}-${finding.changeOrderId}`))
			})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No financial findings on this revision." }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Original budget"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "mt-3 flex flex-wrap items-end gap-3",
				onSubmit: (event) => {
					event.preventDefault();
					const amount = parseMoneyDecimal(String(new FormData(event.currentTarget).get("baseline") ?? ""), currency);
					if (!amount) {
						setError("Enter a valid amount with at most two decimals.");
						return;
					}
					setError(null);
					setPreview(previewSetBaseline(amount));
				},
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: `Amount (${currency})`,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						name: "baseline",
						className: inputClass,
						placeholder: "400000.00"
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "primary",
					type: "submit",
					children: "Review"
				})]
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Categories"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 flex flex-wrap gap-2",
					children: categories.map((category) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						className: "rounded-sm bg-surface-2 px-3 py-2 text-sm text-muted",
						children: category.name
					}, category.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "mt-4 flex flex-wrap items-end gap-3",
					onSubmit: (event) => {
						event.preventDefault();
						const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
						if (!name) return;
						applyPreview(project.id, previewAddCategory(name));
						event.currentTarget.reset();
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "New category",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "name",
							className: inputClass,
							required: true
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "submit",
						children: "Add"
					})]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Lines"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-3 overflow-x-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full min-w-[760px] text-left text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "text-xs uppercase tracking-[0.12em] text-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "py-2",
									children: "Line"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Lives in" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Baseline" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Revised" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Committed" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Actual" })
							] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: lines.map((line) => {
							const category = fin.categories[line.categoryId];
							const place = placeLine(project, line);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-t border-border align-top",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										className: "py-3",
										children: [
											line.description,
											" ",
											line.isAllowance ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
												tone: "warn",
												children: "Allowance"
											}) : null,
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "text-xs text-muted",
												children: [category?.name, line.costCode ? ` · ${line.costCode}` : ""]
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										className: "py-3 text-xs text-muted",
										children: [[
											place.trade,
											place.vendor,
											place.activityName
										].filter(Boolean).join(" · ") || "Unplaced", place.conflict ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-1 text-warn",
											children: place.conflict
										}) : null]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-3 font-mono tabular-nums",
										children: formatMoney(line.baselineAmount)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-3 font-mono tabular-nums",
										children: formatMoney(lineRevised(project, line.id))
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-3 font-mono tabular-nums",
										children: formatMoney(lineCommitted(project, line.id))
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-3 font-mono tabular-nums",
										children: formatMoney(lineActual(project, line.id))
									})
								]
							}, line.id);
						}) })]
					})
				}),
				lines.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Expandable, {
						open: openLineId === line.id,
						onToggle: () => setOpenLineId(openLineId === line.id ? null : line.id),
						title: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "font-medium",
							children: [
								line.description,
								" ",
								line.isAllowance ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
									tone: "warn",
									children: "Allowance"
								}) : null
							]
						}),
						meta: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-xs text-muted",
							children: [formatMoney(line.baselineAmount), " baseline · edit to change description, amount, scope, trade, or notes"]
						}),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
							className: "grid gap-3 md:grid-cols-2",
							onSubmit: (event) => {
								event.preventDefault();
								const data = new FormData(event.currentTarget);
								const baseline = parseMoneyDecimal(String(data.get("baseline") ?? ""), currency);
								const next = previewPatchLine(line.id, {
									description: String(data.get("description")),
									notes: String(data.get("notes") || "") || null,
									trade: String(data.get("trade") || "") || null,
									costCode: String(data.get("costCode") || "") || null,
									vendorRef: String(data.get("vendorRef") || "") || null,
									categoryId: String(data.get("categoryId")),
									isAllowance: data.get("isAllowance") === "on",
									baselineAmount: String(data.get("baseline") || "") === "" ? null : baseline,
									scopeItemIds: data.getAll("scopeItemIds").map(String).filter(Boolean)
								});
								runOrPreview(project.id, next, applyPreview, setPreview);
							},
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Description",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "description",
										className: inputClass,
										defaultValue: line.description,
										required: true
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Baseline amount",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "baseline",
										className: inputClass,
										defaultValue: line.baselineAmount ? (line.baselineAmount.amountMinor / 100).toFixed(2) : "",
										placeholder: "Unknown if blank"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Category",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
										name: "categoryId",
										className: inputClass,
										defaultValue: line.categoryId,
										children: categories.map((category) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: category.id,
											children: category.name
										}, category.id))
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Trade",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "trade",
										className: inputClass,
										defaultValue: line.trade ?? ""
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Cost code",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "costCode",
										className: inputClass,
										defaultValue: line.costCode ?? ""
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Vendor",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "vendorRef",
										className: inputClass,
										defaultValue: line.vendorRef ?? ""
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Associated scope",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
										name: "scopeItemIds",
										multiple: true,
										className: `${inputClass} min-h-24 py-2`,
										defaultValue: line.scopeItemIds,
										children: Object.values(project.scopeItems).filter((item) => item.included).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: item.id,
											children: item.description
										}, item.id))
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Notes",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "notes",
										className: inputClass,
										defaultValue: line.notes ?? ""
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "flex min-h-11 items-center gap-2 text-sm text-muted",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										type: "checkbox",
										name: "isAllowance",
										defaultChecked: line.isAllowance
									}), "Allowance"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										type: "submit",
										children: "Review"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										type: "button",
										variant: "ghost",
										onClick: () => setPreview(previewPatchLine(line.id, { active: false })),
										children: "Remove"
									})]
								})
							]
						})
					})
				}, `edit-${line.id}`)),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "mt-6 grid gap-3 border-t border-border pt-4 md:grid-cols-2",
					onSubmit: (event) => {
						event.preventDefault();
						const data = new FormData(event.currentTarget);
						const amount = parseMoneyDecimal(String(data.get("baseline") ?? ""), currency);
						const next = previewAddLine({
							categoryId: String(data.get("categoryId")),
							description: String(data.get("description")),
							baselineAmount: String(data.get("baseline") || "") === "" ? null : amount,
							isAllowance: data.get("isAllowance") === "on",
							trade: String(data.get("trade") || "") || void 0,
							scopeItemIds: data.getAll("scopeItemIds").map(String).filter(Boolean)
						});
						runOrPreview(project.id, next, applyPreview, setPreview);
						event.currentTarget.reset();
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
							className: "md:col-span-2 text-sm font-medium",
							children: "Add line"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Description",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								name: "description",
								className: inputClass,
								required: true
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Category",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								name: "categoryId",
								className: inputClass,
								required: true,
								children: categories.map((category) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: category.id,
									children: category.name
								}, category.id))
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Baseline",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								name: "baseline",
								className: inputClass,
								placeholder: "optional"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Scope",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								name: "scopeItemIds",
								multiple: true,
								className: `${inputClass} min-h-24 py-2`,
								children: Object.values(project.scopeItems).filter((item) => item.included).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: item.id,
									children: item.description
								}, item.id))
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex items-center gap-2 text-sm text-muted",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "checkbox",
								name: "isAllowance"
							}), " Allowance"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "primary",
							type: "submit",
							children: "Review"
						}) })
					]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Commitments"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 space-y-2 text-sm",
					children: Object.values(fin.commitments).filter((item) => item.status === "ACTIVE").map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
						formatMoney(item.amount),
						" · ",
						item.vendorRef ?? "No vendor",
						" ·",
						" ",
						item.reference ?? "No PO"
					] }, item.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "mt-4 grid gap-3 md:grid-cols-2",
					onSubmit: (event) => {
						event.preventDefault();
						const data = new FormData(event.currentTarget);
						const amount = parseMoneyDecimal(String(data.get("amount") ?? ""), currency);
						if (!amount) {
							setError("Enter a valid commitment amount.");
							return;
						}
						setPreview(previewAddCommitment({
							amount,
							vendorRef: String(data.get("vendorRef") ?? ""),
							budgetLineId: String(data.get("budgetLineId")),
							reference: String(data.get("reference") || "") || void 0
						}));
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Amount",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								name: "amount",
								className: inputClass,
								required: true
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Vendor",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								name: "vendorRef",
								className: inputClass
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Budget line",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								name: "budgetLineId",
								className: inputClass,
								required: true,
								children: lines.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: line.id,
									children: line.description
								}, line.id))
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "PO / reference",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								name: "reference",
								className: inputClass
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "primary",
							type: "submit",
							children: "Review"
						}) })
					]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Actual recorded"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 space-y-2 text-sm",
					children: Object.values(fin.actualCosts).filter((item) => item.status === "RECORDED").map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
						formatMoney(item.amount),
						" · ",
						item.date,
						" · ",
						item.description
					] }, item.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "mt-4 grid gap-3 md:grid-cols-2",
					onSubmit: (event) => {
						event.preventDefault();
						const data = new FormData(event.currentTarget);
						const amount = parseMoneyDecimal(String(data.get("amount") ?? ""), currency);
						if (!amount) {
							setError("Enter a valid actual amount.");
							return;
						}
						setPreview(previewAddActual({
							amount,
							date: String(data.get("date")),
							description: String(data.get("description")),
							budgetLineId: String(data.get("budgetLineId"))
						}));
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Amount",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								name: "amount",
								className: inputClass,
								required: true
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Date",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								name: "date",
								type: "date",
								className: inputClass,
								defaultValue: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
								required: true
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Description",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								name: "description",
								className: inputClass,
								required: true
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Budget line",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								name: "budgetLineId",
								className: inputClass,
								required: true,
								children: lines.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: line.id,
									children: line.description
								}, line.id))
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "primary",
							type: "submit",
							children: "Review"
						}) })
					]
				})
			] }),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-danger",
				children: error
			}) : null,
			preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewConfirm, {
				preview,
				onConfirm: () => {
					applyPreview(project.id, preview);
					setPreview(null);
				},
				onCancel: () => setPreview(null)
			}) : null
		]
	});
}
var STATUS_TONE = {
	DRAFT: "neutral",
	PROPOSED: "warn",
	PENDING_APPROVAL: "warn",
	APPROVED: "ok",
	REJECTED: "danger",
	VOID: "neutral"
};
var NEXT_ACTION = {
	DRAFT: "PROPOSE",
	PROPOSED: "SUBMIT_FOR_APPROVAL",
	PENDING_APPROVAL: "APPROVE"
};
function ChangeOrdersModule({ project }) {
	const applyPreview = useHowlerStore((state) => state.applyPreview);
	const [preview, setPreview] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [openId, setOpenId] = (0, import_react.useState)(null);
	const summary = financialSummary(project);
	const fin = project.financials;
	if (!fin) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
		className: "font-display text-xl",
		children: "Change Orders"
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "Initialize Budget before recording Change Orders." })] });
	const show = (next) => setPreview(annotatePreview(project, next));
	const orders = Object.values(fin.changeOrders);
	const currency = fin.currency;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4 sm:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Original",
						value: formatMoney(summary?.baseline ?? null)
					}) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Revised (approved only)",
						value: formatMoney(summary?.revisedBudget ?? null)
					}) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Pending exposure",
						value: formatMoney(summary?.pendingChangeOrderTotal ?? null),
						hint: "Never added into revised budget"
					}) })
				]
			}),
			orders.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No change orders yet." }) : null,
			orders.map((co) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Expandable, {
				open: openId === co.id,
				onToggle: () => setOpenId(openId === co.id ? null : co.id),
				title: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted",
							children: co.number
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-medium",
							children: co.title
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
							tone: STATUS_TONE[co.status],
							children: co.status.replaceAll("_", " ")
						})
					]
				}),
				meta: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 text-xs text-muted",
					children: [
						formatMoney(co.cost),
						co.declaredScheduleDays != null ? ` · +${co.declaredScheduleDays} days declared` : "",
						livesIn(project, "co", co.id).length ? ` · ${livesIn(project, "co", co.id).join(" · ")}` : ""
					]
				}),
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-3 text-sm text-muted",
						children: co.description
					}),
					co.declaredScheduleDays ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mb-3 text-xs text-subtle",
						children: [
							"Declared +",
							co.declaredScheduleDays,
							" days does not rewrite Schedule. Use the Schedule module for date changes."
						]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "grid gap-3 md:grid-cols-2",
						onSubmit: (event) => {
							event.preventDefault();
							const data = new FormData(event.currentTarget);
							const cost = parseMoneyDecimal(String(data.get("cost") ?? ""), currency);
							const daysRaw = String(data.get("declaredScheduleDays") ?? "");
							try {
								const next = previewPatchChangeOrder(co.id, {
									title: String(data.get("title")),
									description: String(data.get("description")),
									reason: String(data.get("reason")),
									notes: String(data.get("notes") || "") || null,
									cost: cost ?? co.cost,
									declaredScheduleDays: daysRaw === "" ? null : Number(daysRaw),
									scopeItemIds: data.getAll("scopeItemIds").map(String).filter(Boolean)
								});
								if (next.clerical) applyPreview(project.id, next);
								else show(next);
							} catch (caught) {
								setError(caught instanceof Error ? caught.message : "Could not update.");
							}
						},
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Title",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "title",
									className: inputClass,
									defaultValue: co.title
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Cost",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "cost",
									className: inputClass,
									defaultValue: (co.cost.amountMinor / 100).toFixed(2)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Description",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "description",
									className: inputClass,
									defaultValue: co.description
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Reason",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "reason",
									className: inputClass,
									defaultValue: co.reason
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Declared schedule days",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "declaredScheduleDays",
									className: inputClass,
									defaultValue: co.declaredScheduleDays ?? ""
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Scope",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									name: "scopeItemIds",
									multiple: true,
									className: `${inputClass} min-h-24 py-2`,
									defaultValue: co.scopeItemIds,
									children: Object.values(project.scopeItems).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: item.id,
										children: item.description
									}, item.id))
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap gap-2 md:col-span-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										type: "submit",
										children: "Review edit"
									}),
									NEXT_ACTION[co.status] ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										type: "button",
										variant: "primary",
										onClick: () => show(previewCoLifecycle(co.id, NEXT_ACTION[co.status])),
										children: LIFECYCLE[NEXT_ACTION[co.status]].label
									}) : null,
									co.status === "PENDING_APPROVAL" || co.status === "PROPOSED" || co.status === "DRAFT" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										type: "button",
										variant: "danger",
										onClick: () => show(previewCoLifecycle(co.id, "REJECT")),
										children: "Reject"
									}) : null,
									co.status !== "VOID" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										type: "button",
										variant: "ghost",
										onClick: () => show(previewCoLifecycle(co.id, "VOID")),
										children: "Void"
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										type: "button",
										variant: "ghost",
										onClick: () => show(previewCoLifecycle(co.id, "REOPEN")),
										children: "Reopen"
									})
								]
							})
						]
					})
				]
			}, co.id)),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "New Change Order"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "mt-4 grid gap-3 md:grid-cols-2",
				onSubmit: (event) => {
					event.preventDefault();
					const data = new FormData(event.currentTarget);
					const cost = parseMoneyDecimal(String(data.get("cost") ?? ""), currency) ?? {
						amountMinor: 0,
						currency
					};
					const daysRaw = String(data.get("declaredScheduleDays") ?? "");
					show(previewCreateChangeOrder({
						title: String(data.get("title")),
						description: String(data.get("description")),
						reason: String(data.get("reason") || "PM-reported"),
						cost,
						declaredScheduleDays: daysRaw === "" ? null : Number(daysRaw),
						scopeItemIds: data.getAll("scopeItemIds").map(String).filter(Boolean),
						activityIds: data.getAll("activityIds").map(String).filter(Boolean),
						budgetLineId: String(data.get("budgetLineId") || "") || null
					}));
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Title",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "title",
							className: inputClass,
							required: true
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Cost",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "cost",
							className: inputClass,
							placeholder: "0.00 if unpriced"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Description",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "description",
							className: inputClass,
							required: true
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Reason",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "reason",
							className: inputClass
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Declared +days",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "declaredScheduleDays",
							className: inputClass
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Allocate to budget line",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							name: "budgetLineId",
							className: inputClass,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "Unallocated"
							}), Object.values(fin.lines).filter((line) => line.active).map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: line.id,
								children: line.description
							}, line.id))]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Scope",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
							name: "scopeItemIds",
							multiple: true,
							className: `${inputClass} min-h-24 py-2`,
							children: Object.values(project.scopeItems).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: item.id,
								children: item.description
							}, item.id))
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "md:col-span-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "primary",
							type: "submit",
							children: "Review draft"
						})
					})
				]
			})] }),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-danger",
				children: error
			}) : null,
			preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewConfirm, {
				preview,
				onConfirm: () => {
					try {
						applyPreview(project.id, preview);
						setPreview(null);
						setError(null);
					} catch (caught) {
						setError(caught instanceof Error ? caught.message : "Apply failed.");
					}
				},
				onCancel: () => setPreview(null)
			}) : null
		]
	});
}
function documentationNeeds(project) {
	const bp = ensureBlueprint(project);
	const summary = financialSummary(project);
	const findings = computeFindings(project);
	const planFindings = computePlanFindings(project);
	const engineer = engineerRequired(project);
	const issued = project.events.some((event) => event.type === "BLUEPRINT_SET_ISSUED");
	const job = ensureJob(project);
	const inspectionsPassed = Object.values(job.inspections).filter((item) => item.status === "PASSED").length;
	const scopeIncluded = Object.values(project.scopeItems).filter((item) => item.included);
	const unscoped = scopeIncluded.filter((item) => !item.activityId);
	const unpriced = findings.filter((finding) => finding.kind === "DRAFT_CO_UNPRICED" || finding.kind === "PENDING_CO_UNPRICED");
	const committedSchedule = Object.values(project.activities).filter((activity) => activity.committedStart && activity.committedFinish);
	return [
		{
			id: "scope",
			title: "Scope of work",
			why: "A job cannot close on a notepad. Included work has to be named so budget, schedule, and drawings point at the same thing.",
			next: scopeIncluded.length ? unscoped.length ? `Tie ${unscoped.length} included item${unscoped.length === 1 ? "" : "s"} to a schedule activity.` : "Scope is named. Keep it current when the field changes." : "Record included work on Scope.",
			status: scopeIncluded.length === 0 ? "MISSING" : unscoped.length ? "WATCH" : "READY",
			moduleId: "scope"
		},
		{
			id: "budget",
			title: "Budget baseline",
			why: "Unknown is allowed. Zero is a lie. Original / approved / revised have to exist before a number can move.",
			next: summary?.baseline ? "Baseline is recorded. Price COs before they inflate Revised." : "Initialize Budget and set the original baseline.",
			status: summary?.baseline ? "READY" : "MISSING",
			moduleId: "budget"
		},
		{
			id: "schedule",
			title: "Committed schedule",
			why: "Forecast is derived. Committed dates are the contract with the field.",
			next: committedSchedule.length >= 3 ? "Committed dates are in. Protect in-progress work." : "Commit start/finish on the remaining activities.",
			status: committedSchedule.length >= 3 ? "READY" : committedSchedule.length ? "WATCH" : "MISSING",
			moduleId: "schedule"
		},
		{
			id: "drawings",
			title: "Source drawings on Drive",
			why: "A job needs the visual Tradewalk / structural set named, not a notepad sketch. Howler records the file. It does not invent a size from it.",
			next: (ensureBlueprint(project).evidence ?? []).some((item) => item.kind === "TRADEWALK" || item.kind === "STRUCTURAL") ? "Named drawing set is on Documents. Open the Drive file to read the sheets." : "No Tradewalk or structural PDF named for this job was in Drive.",
			status: (ensureBlueprint(project).evidence ?? []).some((item) => item.kind === "TRADEWALK" || item.kind === "STRUCTURAL") ? "READY" : "WATCH",
			moduleId: "documents"
		},
		{
			id: "envelope",
			title: "Building envelope",
			why: "Working drawings cannot invent a 24×32. Width, depth, wall height, and pitch are field facts.",
			next: envelopeComplete(bp) ? bp.eaveHeightIn && bp.roofRise ? "Envelope is recorded." : "Record wall height and rise over run." : "Enter width by depth. Howler will not guess.",
			status: envelopeComplete(bp) && bp.eaveHeightIn && bp.roofRise ? "READY" : envelopeComplete(bp) ? "WATCH" : "MISSING",
			moduleId: "plans"
		},
		{
			id: "jurisdiction",
			title: "Kentucky jurisdiction",
			why: "Snow, wind, and weathering come from KRC Table R301.2(1) by county. Street address is not a county.",
			next: bp.county ? `${bp.county} County · ${bp.groundSnowLoadPsf ?? "?"} psf ground snow.` : "Name the county. Do not guess it from the street.",
			status: bp.county ? "READY" : "MISSING",
			moduleId: "plans"
		},
		{
			id: "framing",
			title: "Framing layout",
			why: "Stud and joist spacing is how the field lays out plates. Empty stays Unknown.",
			next: bp.studSize && bp.studSpacingIn ? `${bp.studSize} @ ${bp.studSpacingIn}" · joists ${bp.joistSize ?? "Unknown"}.` : "Enter stud size and on-center, or ask Howler for conventional fill of empty fields only.",
			status: bp.studSize && bp.studSpacingIn ? "READY" : "WATCH",
			moduleId: "plans"
		},
		{
			id: "engineer",
			title: "Engineer-plan needs",
			why: "KRC R301.1.3: conventional tables are not a stamp. Exceeding a span or R327 post-frame limits is an engineer conversation.",
			next: engineer.length ? engineer.map((finding) => finding.title).join(" · ") : planFindings.some((finding) => finding.severity === "WATCH") ? "Watch items remain on Plans. AHJ still governs." : "No tabulated exceedance on the recorded envelope.",
			status: engineer.length ? "WATCH" : "READY",
			moduleId: "plans"
		},
		{
			id: "permit",
			title: "Permit / inspections",
			why: "The AHJ card is separate from the working set. Howler will not mark an inspection passed unless you said it passed.",
			next: job.permitStatus === "ISSUED" ? `Permit issued${job.permitNumber ? ` ${job.permitNumber}` : ""}. ${inspectionsPassed}/${Object.keys(job.inspections).length} inspections passed.` : job.permitStatus === "SUBMITTED" ? "Permit submitted. Record the number when the AHJ issues it." : "Permit not filed. R106 package still missing a site plan.",
			status: job.permitStatus === "ISSUED" ? "READY" : job.permitStatus === "SUBMITTED" ? "WATCH" : "MISSING",
			moduleId: "inspections"
		},
		{
			id: "changes",
			title: "Change orders priced",
			why: "An unpriced draft is a conversation, not money. Pending never inflates Revised.",
			next: unpriced.length ? `Price or void ${unpriced.length} open change order${unpriced.length === 1 ? "" : "s"}.` : "No unpriced COs.",
			status: unpriced.length ? "WATCH" : "READY",
			moduleId: "change-orders"
		},
		{
			id: "issued",
			title: "Working-drawing set issued",
			why: "A PDF / share link is how the field and the designer look at the same sheet. Guests never enter Howler.",
			next: issued ? "A set has been issued. Re-issue when the envelope changes." : "Export PDF or open a drawing session when the sheets are ready to leave the office.",
			status: issued ? "READY" : envelopeComplete(bp) ? "WATCH" : "MISSING",
			moduleId: "plans"
		}
	];
}
function closeoutLine(project) {
	const items = documentationNeeds(project);
	const missing = items.filter((item) => item.status === "MISSING").length;
	const watch = items.filter((item) => item.status === "WATCH").length;
	if (missing === 0 && watch === 0) return "Documentation is complete enough to move. AHJ and PE still govern stamps.";
	if (missing === 0) return `${watch} documentation item${watch === 1 ? "" : "s"} still need a home before closeout.`;
	return `${missing} required document${missing === 1 ? "" : "s"} missing · ${watch} watch. Howler will not pretend this is a notepad.`;
}
function DocsWizard({ project, compact = false }) {
	const items = documentationNeeds(project);
	const line = closeoutLine(project);
	const memory = memorySummary();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-start justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: compact ? "Closeout documents" : "Documentation wizard"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 max-w-2xl text-sm text-muted",
				children: line
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(StatusChip, {
				tone: items.some((item) => item.status === "MISSING") ? "warn" : "ok",
				children: [
					items.filter((item) => item.status === "READY").length,
					"/",
					items.length,
					" ready"
				]
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-3 text-xs text-subtle",
			children: memory
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
			className: "mt-4 space-y-3",
			children: [items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "Nothing to document." }) : null, items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "border-b border-border pb-3 last:border-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
							tone: item.status === "READY" ? "ok" : item.status === "WATCH" ? "warn" : "danger",
							children: item.status
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm font-medium",
							children: item.title
						})]
					}),
					compact ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted",
						children: item.why
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm",
						children: item.next
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/projects/$projectId/$moduleId",
						params: {
							projectId: project.id,
							moduleId: item.moduleId
						},
						className: "mt-2 inline-flex min-h-11 items-center text-xs text-accent",
						children: ["Open ", item.moduleId.replace("-", " ")]
					})
				]
			}, item.id))]
		})
	] });
}
function OverviewModule({ project }) {
	const summary = financialSummary(project);
	const findings = computeFindings(project);
	const actions = priorityActions(project);
	const facts = liveFacts(project);
	const job = ensureJob(project);
	const included = Object.values(project.scopeItems).filter((item) => item.included);
	const complete = included.filter((item) => item.complete).length;
	const brief = jobBrief(project);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[11px] font-medium uppercase tracking-[0.16em] text-accent",
					children: "Project status"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-lg leading-snug",
					children: brief.now
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 grid gap-4 sm:grid-cols-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
						children: "Last week"
					}), brief.last.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-2 space-y-2",
						children: brief.last.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "text-sm",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[12px] text-accent",
								children: item.when
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mt-0.5 block text-muted",
								children: item.text
							})]
						}, `${item.when}-${item.text.slice(0, 24)}`))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted",
						children: "No field updates recorded in the last seven days."
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
						children: "Next call to action"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
						className: "mt-2 list-decimal space-y-1 pl-4 text-sm",
						children: brief.next.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: item }, item))
					})] })]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "howler-card-dates rounded-lg bg-surface px-4 py-3 shadow-[var(--shadow-border)]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
						children: "Official start"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: `mt-1 font-mono text-[15px] ${contractDates(project).startKnown ? "text-fg" : "text-muted"}`,
						children: contractDates(project).officialStart
					}),
					contractDates(project).startKnown ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-subtle",
						children: "Not on the contract record"
					})
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "howler-card-finish",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
							children: "Intended finish"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: `mt-1 font-mono text-[15px] ${contractDates(project).finishKnown ? "text-fg" : "text-muted"}`,
							children: contractDates(project).intendedFinish
						}),
						contractDates(project).finishKnown ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-subtle",
							children: "A trade target is not this date"
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "howler-metrics",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Original budget",
						value: summary ? formatMoney(summary.baseline) : "Unknown"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Approved changes",
						value: summary ? formatMoney(summary.approvedChangeOrderTotal) : "Unknown"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Revised budget",
						value: summary ? formatMoney(summary.revisedBudget) : "Unknown",
						hint: summary ? `Pending exposure ${formatMoney(summary.pendingChangeOrderTotal)}` : "Budget not initialized"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Committed / actual",
						value: summary ? `${formatMoney(summary.committedTotal)} / ${formatMoney(summary.actualTotal)}` : "Unknown"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4 lg:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Priority actions"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "mt-4 space-y-3",
					children: [actions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No priority actions identified." }) : null, actions.map((action) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "border-b border-border pb-3 last:border-0",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: action.priority === "CRITICAL" ? "danger" : "warn",
								children: action.priority
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm",
								children: action.action
							}),
							action.requiredBy ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-1 text-xs text-muted",
								children: ["Required by ", action.requiredBy]
							}) : null
						]
					}, action.id))]
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl",
						children: "Live facts"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted",
						children: "One index. A change in the command bar is supposed to land here everywhere it belongs — not only in the module you were looking at."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-4",
						children: facts.map((fact) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "grid grid-cols-[88px_1fr] gap-2 border-b border-border py-2 last:border-0 sm:grid-cols-[110px_1fr]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/projects/$projectId/$moduleId",
								params: {
									projectId: project.id,
									moduleId: fact.moduleId
								},
								className: "text-[11px] uppercase tracking-[0.08em] text-subtle hover:text-fg",
								children: fact.ledger
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: fact.tone,
								children: fact.label
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm",
								children: fact.value
							})] })]
						}, fact.id))
					}),
					findings.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-xs text-muted",
						children: [
							findings[0]?.message,
							" ",
							findingNextAction(findings[0])
						]
					}) : null
				] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DocsWizard, { project }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Contracted scope"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 text-sm text-muted",
					children: [
						"Progress is released contracted scope. Complete counts full, in-progress closeout counts half, held interior is excluded. ",
						complete,
						" of ",
						included.length,
						" marked complete · ",
						progressPercent(project),
						"%."
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-4 space-y-2",
					children: included.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 text-sm last:border-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [item.description, item.trade ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-muted",
							children: [" · ", item.trade]
						}) : null] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
							tone: scopeStatus(project, item).tone,
							children: scopeStatus(project, item).label
						})]
					}, item.id))
				})
			] }),
			job.rules.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Job rules"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted",
					children: "Copied from this job's Scope of Work and Rules. Drive original not deleted."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
					className: "mt-4 list-decimal space-y-2 pl-5 text-sm text-muted",
					children: job.rules.map((rule) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: rule }, rule.slice(0, 40)))
				})
			] }) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Plans"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm",
					children: plansStatusLine(project)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-2 text-xs text-muted",
					children: [
						"Working drawings, not a sealed set. Source PDFs from Drive are on",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							className: "text-accent",
							to: "/projects/$projectId/$moduleId",
							params: {
								projectId: project.id,
								moduleId: "documents"
							},
							children: "Documents"
						}),
						".",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							className: "text-accent",
							to: "/projects/$projectId/$moduleId",
							params: {
								projectId: project.id,
								moduleId: "plans"
							},
							children: "Open Plans"
						})
					]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Live path"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "mt-4 space-y-2",
				children: Object.values(project.activities).map((activity) => {
					const forecast = forecastActivity(project, activity);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex flex-wrap items-baseline justify-between gap-2 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
							activity.name,
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-muted",
								children: ["· ", activity.state.replace("_", " ").toLowerCase()]
							})
						] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "font-mono text-xs tabular-nums text-muted",
							children: [
								forecast.start ?? "—",
								" → ",
								forecast.finish ?? "—"
							]
						})]
					}, activity.id);
				})
			})] })
		]
	});
}
function ShareDrawing({ project }) {
	const applyPreview = useHowlerStore((state) => state.applyPreview);
	const [hours, setHours] = (0, import_react.useState)(4);
	const [token, setToken] = (0, import_react.useState)(() => localListLive(project.id)[0]?.token ?? null);
	const [copied, setCopied] = (0, import_react.useState)(false);
	const lastBp = (0, import_react.useRef)("");
	const session = useDrawingSession({
		token,
		name: "host",
		enabled: Boolean(token),
		onRemote: (snapshot) => {
			if (snapshot.hostProjectId !== project.id) return;
			const encoded = JSON.stringify(snapshot.blueprint);
			if (encoded === JSON.stringify(project.blueprint)) return;
			lastBp.current = encoded;
			applyPreview(project.id, previewReplaceBlueprint(snapshot.blueprint, "Drawing session updated the sheets."));
		}
	});
	(0, import_react.useEffect)(() => {
		if (!token) return;
		const snap = snapshotFromProject(project);
		const encoded = JSON.stringify(snap.blueprint);
		if (encoded === lastBp.current) return;
		lastBp.current = encoded;
		session.publish(snap);
	}, [project.blueprint, token]);
	const url = token ? shareUrl(token) : "";
	const mail = (0, import_react.useMemo)(() => {
		if (!url) return "";
		return `mailto:?subject=${encodeURIComponent(`Working drawing — ${project.name}`)}&body=${encodeURIComponent(`Working drawing session (not Howler — access ends when the host closes it):\n${url}\n\n${sharePacketLines(project).join("\n")}\n`)}`;
	}, [url, project]);
	const sms = (0, import_react.useMemo)(() => {
		if (!url) return "";
		return `sms:?&body=${encodeURIComponent(`Drawing session (not Howler): ${url}`)}`;
	}, [url]);
	async function openSession() {
		const next = newShareToken();
		setToken(next);
		await session.open({
			token: next,
			hours,
			snapshot: snapshotFromProject(project)
		});
	}
	async function copyLink() {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
		className: "print-hide",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-start justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
				className: "font-display text-lg",
				children: "Drawing session"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 max-w-xl text-sm text-muted",
				children: "Invite edits the sheets only — never Howler, never money. When you end the session the link dies. PDF is how the set leaves the job for good."
			})] }), token && session.view?.status === "LIVE" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(StatusChip, {
				tone: "ok",
				children: ["Live · ", session.remainingLabel]
			}) : null]
		}), token && session.view?.status === "LIVE" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-4 space-y-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "break-all font-mono text-xs text-muted",
					children: url
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-xs text-subtle",
					children: [session.peers.length ? `${session.peers.length} guest${session.peers.length === 1 ? "" : "s"} on the sheet.` : "Waiting for a guest. Same-phone preview works in another tab.", session.view.expiresAt ? ` · ends ${formatRemaining(session.view.remainingMs)}` : ""]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "primary",
							type: "button",
							onClick: () => void copyLink(),
							children: copied ? "Copied" : "Copy link"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "secondary",
							type: "button",
							onClick: () => window.open(mail),
							children: "Email"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "secondary",
							type: "button",
							onClick: () => window.open(sms),
							children: "Text"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "ghost",
							type: "button",
							onClick: () => void session.end().then(() => setToken(null)),
							children: "End session"
						})
					]
				})
			]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			className: "mt-4 flex flex-wrap items-end gap-3",
			onSubmit: (event) => {
				event.preventDefault();
				openSession();
			},
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
				label: "Session length",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
					className: inputClass,
					value: hours,
					onChange: (event) => setHours(Number(event.target.value)),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: 1,
							children: "1 hour"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: 4,
							children: "4 hours"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: 8,
							children: "8 hours"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: 24,
							children: "Until I end it (24h cap)"
						})
					]
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "primary",
				type: "submit",
				children: "Open drawing session"
			})]
		})]
	});
}
var KIND_TONE = {
	TRADEWALK: "ok",
	STRUCTURAL: "warn",
	CALCS: "ok",
	FRAMING: "ok",
	SCOPE: "neutral",
	SITE: "warn",
	ESTIMATE: "neutral",
	QUOTE: "neutral",
	PROCESS: "neutral",
	UPLOAD: "neutral"
};
function EvidenceCard({ item, showPreview = true }) {
	const href = item.url ?? (item.fileId ? driveFileUrl(item.fileId) : null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
		className: "howler-doc-card",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex min-w-0 flex-1 flex-col gap-1",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
						tone: KIND_TONE[item.kind],
						children: EVIDENCE_LABEL[item.kind]
					}), item.issued ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[11px] text-subtle",
						children: item.issued
					}) : null]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm font-medium leading-snug",
					children: item.name
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs text-muted",
					children: item.note
				}),
				item.sheets?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
					className: "mt-2 grid gap-1 text-[11px] text-subtle sm:grid-cols-2",
					children: item.sheets.map((sheet) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono text-fg",
							children: sheet.number
						}),
						" ",
						sheet.title
					] }, `${item.id}-${sheet.number}`))
				}) : null,
				href ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href,
					target: "_blank",
					rel: "noreferrer",
					className: "mt-2 inline-flex min-h-11 items-center text-xs text-accent",
					children: "Drive original"
				}) : null,
				item.storedSrc ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: item.storedSrc,
					target: "_blank",
					rel: "noreferrer",
					className: "mt-1 inline-flex min-h-11 items-center text-xs text-accent",
					children: "Howler copy"
				}) : null
			]
		}), showPreview && item.previewSrc ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
			href: href ?? item.previewSrc,
			target: "_blank",
			rel: "noreferrer",
			className: "howler-doc-thumb",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: item.previewSrc,
				alt: `${item.name} preview`,
				className: "h-full w-full object-cover object-top"
			})
		}) : null]
	});
}
function SourceDrawings({ project, previews = false }) {
	const evidence = ensureBlueprint(project).evidence ?? [];
	const drawings = evidence.filter((item) => item.kind === "TRADEWALK" || item.kind === "STRUCTURAL" || item.kind === "SITE" || item.kind === "FRAMING" || item.kind === "CALCS");
	const files = evidence.filter((item) => !drawings.includes(item));
	const isDeboard = project.id === "deboard-v091";
	const isCarver = project.id === "carver";
	const working = isDeboard ? DEBOARD_WORKING_PREVIEWS : isCarver ? CARVER_WORKING_PREVIEWS : [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Source drawings"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 max-w-2xl text-sm text-muted",
					children: "Named files copied from Drive into Howler. The Drive original stays where it is — Howler keeps a working copy. A visual Tradewalk is a reference. Howler will not invent a size from it. Working drawings are not PE-stamped."
				}),
				drawings.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No drawing files named for this job were in Drive." })
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-4 space-y-4",
					children: drawings.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceCard, { item }, item.id))
				})
			] }),
			working.length > 0 && previews ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Working sheets"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted",
					children: isDeboard ? "Howler sheets drawn from Deboard Tradewalk Plans.pdf. Open Plans to print the live set. Design 2 34×36 / 10:12 ADU is not governing." : "Copied from hall design.pdf and master design.pdf. Existing house — envelope not adopted."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4",
					children: working.map((sheet) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", {
						className: "overflow-hidden rounded-md bg-surface-2 shadow-[var(--shadow-border)]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: sheet.src,
							alt: `${sheet.number} ${sheet.title}`,
							className: "aspect-[4/3] w-full object-cover object-top"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", {
							className: "px-2 py-2 text-[11px] text-muted",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-fg",
									children: sheet.number
								}),
								" ",
								sheet.title
							]
						})]
					}, sheet.number))
				})
			] }) : null,
			files.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Other Drive files"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted",
					children: "Estimates, quotes, and scope. Not drawings."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-4 space-y-4",
					children: files.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceCard, {
						item,
						showPreview: false
					}, item.id))
				})
			] }) : null
		]
	});
}
function DocumentsModule({ project }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SourceDrawings, {
			project,
			previews: true
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DocsWizard, { project })]
	});
}
function inchesToFeetInput(inches) {
	if (inches == null) return "";
	const feet = inches / 12;
	return Number.isInteger(feet) ? String(feet) : String(Math.round(feet * 100) / 100);
}
function feetInput(raw) {
	const text = String(raw ?? "").trim();
	if (!text) return null;
	const value = Number(text);
	if (!Number.isFinite(value) || value <= 0) return null;
	return Math.round(value * 12);
}
function intInput(raw) {
	const text = String(raw ?? "").trim();
	if (!text) return null;
	const value = Number(text);
	if (!Number.isFinite(value) || value <= 0) return null;
	return value;
}
function lumberInput(raw) {
	const text = String(raw ?? "");
	return LUMBER_SIZES.includes(text) ? text : null;
}
function downloadSvg(filename) {
	const svg = document.querySelector(".howler-sheet");
	if (!svg) return;
	const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`], { type: "image/svg+xml;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
function PlansModule({ project }) {
	const applyPreview = useHowlerStore((state) => state.applyPreview);
	const bp = ensureBlueprint(project);
	const [preview, setPreview] = (0, import_react.useState)(null);
	const [sheet, setSheet] = (0, import_react.useState)("L1");
	const [openRoom, setOpenRoom] = (0, import_react.useState)(null);
	const [printAll, setPrintAll] = (0, import_react.useState)(false);
	const [dim, setDim] = (0, import_react.useState)(null);
	const printArmed = (0, import_react.useRef)(false);
	const findings = (0, import_react.useMemo)(() => computePlanFindings(project), [project]);
	const takeoff = (0, import_react.useMemo)(() => framingTakeoff(bp), [bp]);
	const rooms = Object.values(bp.rooms);
	const openings = resolveOpenings(bp);
	const schedule = openingSchedule(bp);
	const unresolved = unresolvedRegister(bp);
	const blocking = unresolved.filter((item) => item.blocking);
	const criteria = (0, import_react.useMemo)(() => designCriteria(bp), [bp]);
	const submittal = (0, import_react.useMemo)(() => submittalChecklist(bp), [bp]);
	const packet = (0, import_react.useMemo)(() => sharePacketLines(project), [project]);
	const status = bp.drawingStatus ?? "DRAFT";
	function queue(next) {
		const annotated = annotatePreview(project, next);
		if (annotated.clerical) applyPreview(project.id, annotated);
		else setPreview(annotated);
	}
	function exportPdf() {
		printArmed.current = true;
		setPrintAll(true);
		window.setTimeout(() => {
			window.print();
			printArmed.current = false;
			setPrintAll(false);
			queue(previewIssueDrawingSet(project));
		}, 80);
	}
	(0, import_react.useEffect)(() => {
		const onExport = () => exportPdf();
		const onPrint = () => window.print();
		window.addEventListener("howler-export-set", onExport);
		window.addEventListener("howler-print-sheet", onPrint);
		return () => {
			window.removeEventListener("howler-export-set", onExport);
			window.removeEventListener("howler-print-sheet", onPrint);
		};
	});
	function onRoomDrag(drag) {
		const room = bp.rooms[drag.roomId];
		if (!room) return;
		queue(previewUpsertRoom({
			id: room.id,
			name: room.name,
			level: room.level,
			widthIn: drag.widthIn ?? room.widthIn,
			depthIn: drag.depthIn ?? room.depthIn,
			originXIn: drag.originXIn,
			originYIn: drag.originYIn,
			scopeItemIds: room.scopeItemIds,
			notes: room.notes
		}));
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-start justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl",
						children: "Plans"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 max-w-2xl text-sm text-muted",
						children: [
							"Coordinated construction documents from one building model. Callouts cite ",
							CODE_SHORT,
							" — the section, not just the instruction. Tags resolve to the opening schedule. Dimensions state what they are to. Unresolved items stay visible — Howler will not invent a size. Not a PE-stamped permit set."
						]
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
						tone: status === "ISSUED" ? "ok" : "warn",
						children: STATUS_LABEL[status] ?? "Draft — not issued"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-xs text-subtle",
					children: plansStatusLine(project)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 grid gap-4 sm:grid-cols-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Envelope",
							value: bp.widthIn && bp.depthIn ? `${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)}` : "Unknown"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Pitch",
							value: bp.roofRise && bp.roofRun ? `${bp.roofRise}/${bp.roofRun}` : "Unknown",
							hint: pitchDegrees(bp) != null ? `${pitchDegrees(bp)?.toFixed(1)}° · ridge ${formatFtIn(ridgeHeightIn(bp))}` : "Enter rise over run"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "County / snow",
							value: bp.county ? bp.county : "Unknown",
							hint: bp.groundSnowLoadPsf != null ? `${bp.groundSnowLoadPsf} psf · 115 mph` : "Do not guess from the street"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Plotted scale",
							value: scaleLabel(bp.drawingScale ?? "FIT"),
							hint: bp.studSize && bp.studSpacingIn ? `${bp.studSize} @ ${bp.studSpacingIn}"` : "Framing Unknown"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-3 text-xs text-muted",
					children: [
						DATUM_LABEL[bp.dimDatum ?? "FACE_FRAMING"],
						" · envelope",
						" ",
						PROVENANCE_LABEL[bp.envelopeProvenance ?? "UNKNOWN"],
						blocking.length ? ` · ${blocking.length} blocking unresolved` : ` · ${unresolved.length} on the register`
					]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "print-hide",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SourceDrawings, {
					project,
					previews: true
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "print-hide grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
						className: "text-xs font-medium uppercase tracking-[0.14em] text-muted",
						children: "Envelope"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted",
						children: describeEnvelope(bp)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "mt-4 grid gap-3 sm:grid-cols-2",
						onSubmit: (event) => {
							event.preventDefault();
							const data = new FormData(event.currentTarget);
							queue(previewPatchBlueprint({
								widthIn: feetInput(data.get("widthFt")),
								depthIn: feetInput(data.get("depthFt")),
								eaveHeightIn: feetInput(data.get("eaveFt")),
								roofRise: intInput(data.get("rise")),
								roofRun: intInput(data.get("rise")) ? intInput(data.get("run")) ?? 12 : void 0,
								overhangIn: feetInput(data.get("overhangFt")),
								occupancy: String(data.get("occupancy") || "") || null,
								stories: intInput(data.get("stories")),
								county: String(data.get("county") || "") || null,
								frostDepthIn: intInput(data.get("frostIn")),
								overheadDoorWidthIn: feetInput(data.get("doorW")),
								overheadDoorHeightIn: feetInput(data.get("doorH")),
								drawingScale: String(data.get("scale") || "") || void 0,
								notes: String(data.get("notes") || "") || null
							}));
						},
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Width (ft)",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "widthFt",
									className: inputClass,
									inputMode: "decimal",
									placeholder: "Unknown",
									defaultValue: inchesToFeetInput(bp.widthIn)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Depth (ft)",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "depthFt",
									className: inputClass,
									inputMode: "decimal",
									placeholder: "Unknown",
									defaultValue: inchesToFeetInput(bp.depthIn)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Wall / eave height (ft)",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "eaveFt",
									className: inputClass,
									inputMode: "decimal",
									placeholder: "Unknown",
									defaultValue: inchesToFeetInput(bp.eaveHeightIn)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Stories",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "stories",
									className: inputClass,
									inputMode: "numeric",
									placeholder: "Unknown",
									defaultValue: bp.stories ?? ""
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Roof rise",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "rise",
									className: inputClass,
									inputMode: "numeric",
									placeholder: "8",
									defaultValue: bp.roofRise ?? ""
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Roof run",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "run",
									className: inputClass,
									inputMode: "numeric",
									placeholder: "12",
									defaultValue: bp.roofRun ?? ""
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Overhang (ft)",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "overhangFt",
									className: inputClass,
									inputMode: "decimal",
									placeholder: "Unknown",
									defaultValue: inchesToFeetInput(bp.overhangIn)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Occupancy",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									name: "occupancy",
									className: inputClass,
									defaultValue: bp.occupancy ?? "",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "",
										children: "Unknown"
									}), Object.keys(OCCUPANCY_LABEL).map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: key,
										children: OCCUPANCY_LABEL[key]
									}, key))]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Kentucky county",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									name: "county",
									className: inputClass,
									defaultValue: bp.county ?? "",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "",
										children: "Unknown — do not guess"
									}), KY_COUNTIES.map((county) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: county,
										children: county
									}, county))]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Frost depth (in)",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "frostIn",
									className: inputClass,
									inputMode: "numeric",
									placeholder: "Unknown",
									defaultValue: bp.frostDepthIn ?? ""
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Overhead door width (ft)",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "doorW",
									className: inputClass,
									inputMode: "decimal",
									placeholder: "Unknown",
									defaultValue: inchesToFeetInput(bp.overheadDoorWidthIn)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Overhead door height (ft)",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "doorH",
									className: inputClass,
									inputMode: "decimal",
									placeholder: "Unknown",
									defaultValue: inchesToFeetInput(bp.overheadDoorHeightIn)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Plotted scale",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									name: "scale",
									className: inputClass,
									defaultValue: bp.drawingScale ?? "FIT",
									children: DRAWING_SCALES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: item.id,
										children: item.label
									}, item.id))
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Notes",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "notes",
									className: inputClass,
									defaultValue: bp.notes ?? ""
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "sm:col-span-2",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "primary",
									type: "submit",
									children: "Review envelope"
								})
							})
						]
					}, `env-${project.revision}`)
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
						className: "text-xs font-medium uppercase tracking-[0.14em] text-muted",
						children: "Framing"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted",
						children: "Empty fields stay Unknown. Conventional fill only writes blanks."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "mt-4 grid gap-3",
						onSubmit: (event) => {
							event.preventDefault();
							const data = new FormData(event.currentTarget);
							queue(previewPatchBlueprint({
								studSize: lumberInput(data.get("studSize")),
								studSpacingIn: intInput(data.get("studOc")),
								joistSize: lumberInput(data.get("joistSize")),
								joistSpacingIn: intInput(data.get("joistOc")),
								joistDirection: String(data.get("joistDir")) === "DEPTH" ? "DEPTH" : "WIDTH",
								rafterSize: lumberInput(data.get("rafterSize")),
								rafterSpacingIn: intInput(data.get("rafterOc")),
								roofStyle: String(data.get("roofStyle") || "GABLE") || "GABLE"
							}));
						},
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Studs",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid grid-cols-2 gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										name: "studSize",
										className: inputClass,
										defaultValue: bp.studSize ?? "",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "",
											children: "Unknown"
										}), LUMBER_SIZES.map((size) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: size,
											children: size
										}, size))]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										name: "studOc",
										className: inputClass,
										defaultValue: bp.studSpacingIn ?? "",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "",
												children: "O.C. Unknown"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "12",
												children: "12\" O.C."
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "16",
												children: "16\" O.C."
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "24",
												children: "24\" O.C."
											})
										]
									})]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Floor joists",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid grid-cols-2 gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										name: "joistSize",
										className: inputClass,
										defaultValue: bp.joistSize ?? "",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "",
											children: "Unknown"
										}), LUMBER_SIZES.filter((size) => size !== "2x4").map((size) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: size,
											children: size
										}, size))]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										name: "joistOc",
										className: inputClass,
										defaultValue: bp.joistSpacingIn ?? "",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "",
												children: "O.C. Unknown"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "12",
												children: "12\" O.C."
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "16",
												children: "16\" O.C."
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "19.2",
												children: "19.2\" O.C."
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "24",
												children: "24\" O.C."
											})
										]
									})]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Joists span",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									name: "joistDir",
									className: inputClass,
									defaultValue: bp.joistDirection,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "WIDTH",
										children: "The width"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "DEPTH",
										children: "The depth"
									})]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Rafters",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid grid-cols-2 gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										name: "rafterSize",
										className: inputClass,
										defaultValue: bp.rafterSize ?? "",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "",
											children: "Unknown / trusses"
										}), LUMBER_SIZES.filter((size) => size !== "2x4").map((size) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: size,
											children: size
										}, size))]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										name: "rafterOc",
										className: inputClass,
										defaultValue: bp.rafterSpacingIn ?? "",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "",
												children: "O.C. Unknown"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "12",
												children: "12\" O.C."
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "16",
												children: "16\" O.C."
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "24",
												children: "24\" O.C."
											})
										]
									})]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Roof style",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									name: "roofStyle",
									className: inputClass,
									defaultValue: bp.roofStyle ?? "GABLE",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "GABLE",
											children: "Gable"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "HIP",
											children: "Hip"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "SHED",
											children: "Shed"
										})
									]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "primary",
								type: "submit",
								children: "Review framing"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "secondary",
								type: "button",
								onClick: () => queue(previewSuggestConventionalFraming()),
								children: "Fill empty with conventional"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "secondary",
								type: "button",
								onClick: () => queue(previewAdoptTradewalkSet()),
								children: "Adopt Tradewalk set"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "secondary",
								type: "button",
								onClick: () => queue(previewDrawWorkingSet(project)),
								children: "Lay out typical garage"
							})
						]
					}, `frm-${project.revision}`)
				] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
				className: "print-hide",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-start justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
							className: "text-xs font-medium uppercase tracking-[0.14em] text-muted",
							children: "Issue / coordination"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: "Validate before a contractor works from this revision. Issue lists unresolved items on the title block. It does not become a PE stamp."
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap gap-2",
							children: [
								status !== "ISSUED" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "secondary",
									type: "button",
									onClick: () => queue(previewSetDrawingStatus("REVIEWED")),
									children: "Mark reviewed"
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "secondary",
									type: "button",
									onClick: () => queue(previewSetEnvelopeProvenance("VERIFIED")),
									children: "Mark envelope verified"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "primary",
									type: "button",
									onClick: () => queue(previewIssueDrawingSet(project)),
									children: "Issue for layout"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 grid gap-3 sm:grid-cols-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Dimension datum",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									className: inputClass,
									value: bp.dimDatum ?? "FACE_FRAMING",
									onChange: (event) => queue(previewSetDrawingDatum(event.target.value)),
									children: DIM_DATUMS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: item.id,
										children: item.label
									}, item.id))
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
								label: "Envelope source",
								value: PROVENANCE_LABEL[bp.envelopeProvenance ?? "UNKNOWN"],
								hint: bp.issuedRevision ? `Last issued rev ${bp.issuedRevision}` : "Not issued"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
								label: "Unresolved",
								value: String(unresolved.length),
								hint: blocking.length ? `${blocking.length} blocking` : "None blocking"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
						className: "mt-4 space-y-2",
						children: [unresolved.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "Nothing on the register." }) : null, unresolved.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-sm",
								children: [item.title, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "ml-2 text-xs uppercase tracking-[0.12em] text-muted",
									children: item.sheet
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 text-xs text-muted",
								children: item.message
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: item.blocking ? "danger" : "warn",
								children: item.blocking ? "Blocking" : "Open"
							})]
						}, item.id))]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
				className: "print-hide",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
						className: "text-xs font-medium uppercase tracking-[0.14em] text-muted",
						children: "Code basis / AHJ packet"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-sm text-muted",
						children: [
							CODE_BASIS,
							", adopted by ",
							CODE_ADOPTION,
							". Every callout on the sheets cites the section it satisfies. Passing a check is not a stamp."
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4 grid gap-2 sm:grid-cols-2",
						children: criteria.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-baseline justify-between gap-3 border-b border-border pb-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs uppercase tracking-[0.12em] text-muted",
								children: row.label
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 text-sm",
								children: row.value
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "shrink-0 font-mono text-xs text-muted",
								children: row.code
							})]
						}, row.label))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h5", {
						className: "mt-6 text-xs font-medium uppercase tracking-[0.14em] text-muted",
						children: "R106 construction documents"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted",
						children: "DHBC / IRC R106.1.1 — sufficient clarity to show location, nature, and extent. Missing stays missing. Site survey is not invented."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-3 space-y-2",
						children: submittal.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-sm",
								children: [item.title, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "ml-2 font-mono text-xs text-muted",
									children: item.code
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 text-xs text-muted",
								children: item.note
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: item.status === "ON_SET" ? "ok" : item.status === "PARTIAL" ? "warn" : item.status === "NA" ? "neutral" : "danger",
								children: item.status === "ON_SET" ? "On set" : item.status === "PARTIAL" ? "Partial" : item.status === "NA" ? "n/a" : "Missing"
							})]
						}, item.id))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h5", {
						className: "mt-6 text-xs font-medium uppercase tracking-[0.14em] text-muted",
						children: "When you share this set"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
						className: "mt-2 list-decimal space-y-1 pl-5 text-sm text-muted",
						children: packet.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: line }, line))
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				id: "howler-sheet",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
					className: "howler-print-root",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "print-hide flex flex-wrap items-center gap-2",
							children: [
								SHEETS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setSheet(item.id),
									className: `inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors duration-[var(--motion-quick)] ${sheet === item.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`,
									children: item.number
								}, item.id)),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "px-2 text-sm text-muted",
									children: SHEETS.find((item) => item.id === sheet)?.label
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "ghost",
									type: "button",
									onClick: () => downloadSvg(`${project.name}-${sheet}.svg`),
									children: "Download SVG"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "ghost",
									type: "button",
									className: "ml-auto",
									onClick: () => window.print(),
									children: "Print this sheet"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "primary",
									type: "button",
									onClick: exportPdf,
									children: "Export set (PDF)"
								})
							]
						}),
						printAll ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "howler-print-set mt-4 space-y-6",
							children: SHEETS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DrawingSheet, {
								project,
								bp,
								sheet: item.id,
								scaleId: bp.drawingScale
							}, item.id))
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
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
							className: "print-hide mt-4 grid gap-3 rounded-lg bg-surface-2 p-4 sm:grid-cols-[1fr_auto]",
							onSubmit: (event) => {
								event.preventDefault();
								const data = new FormData(event.currentTarget);
								const inches = feetInput(data.get("feet"));
								const name = String(data.get("name") ?? "").trim();
								if (dim.kind === "width" && inches) queue(previewPatchBlueprint({ widthIn: inches }));
								if (dim.kind === "depth" && inches) queue(previewPatchBlueprint({ depthIn: inches }));
								if (dim.kind === "eave" && inches) queue(previewPatchBlueprint({ eaveHeightIn: inches }));
								if (dim.kind === "room") {
									const room = bp.rooms[dim.roomId];
									if (room) queue(previewUpsertRoom({
										id: room.id,
										name: name || room.name,
										level: room.level,
										widthIn: dim.field === "width" && inches ? inches : room.widthIn,
										depthIn: dim.field === "depth" && inches ? inches : room.depthIn,
										originXIn: room.originXIn,
										originYIn: room.originYIn,
										scopeItemIds: room.scopeItemIds,
										notes: room.notes
									}));
								}
								setDim(null);
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: dim.kind === "room" ? dim.field === "name" ? "Room name" : `Room ${dim.field} (ft)` : `Edit ${dim.kind} (ft)`,
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
									defaultValue: dim.kind === "width" ? inchesToFeetInput(bp.widthIn) : dim.kind === "depth" ? inchesToFeetInput(bp.depthIn) : dim.kind === "eave" ? inchesToFeetInput(bp.eaveHeightIn) : dim.kind === "room" ? inchesToFeetInput(dim.field === "width" ? bp.rooms[dim.roomId]?.widthIn ?? null : bp.rooms[dim.roomId]?.depthIn ?? null) : "",
									required: true
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-end gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "primary",
									type: "submit",
									children: "Review"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "ghost",
									type: "button",
									onClick: () => setDim(null),
									children: "Cancel"
								})]
							})]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "print-hide mt-3 text-xs text-subtle",
							children: "Click a dimension, drag a room, or pull the corner handle. Review still runs before sizes save."
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShareDrawing, { project }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "print-hide grid gap-5 lg:grid-cols-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
							className: "font-display text-lg",
							children: "Opening schedule"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: "Tags on A01 resolve here. Size source and offset source stay visible. Typical sizes are suggestions — change any of them."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-4 overflow-x-auto",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
								className: "w-full min-w-[36rem] text-left text-xs",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
									className: "text-muted",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "pb-2 font-medium",
											children: "Mark"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "pb-2 font-medium",
											children: "Type"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "pb-2 font-medium",
											children: "W × H"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "pb-2 font-medium",
											children: "Wall"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "pb-2 font-medium",
											children: "Offset"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "pb-2 font-medium",
											children: "Size"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "pb-2 font-medium",
											children: "Offset src"
										})
									] })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [schedule.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 7,
									className: "py-2 text-muted",
									children: "No openings recorded."
								}) }) : null, schedule.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-2 font-mono",
											children: row.mark
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-2",
											children: row.kind
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
											className: "py-2 font-mono",
											children: [
												row.size,
												" × ",
												row.height
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-2",
											children: row.wall.toLowerCase()
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-2 font-mono",
											children: row.offset
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-2",
											children: PROVENANCE_LABEL[row.provenance]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-2",
											children: PROVENANCE_LABEL[row.offsetProvenance]
										})
									]
								}, row.id))] })]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "mt-4 space-y-3",
							children: [openings.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No openings recorded." }) : null, openings.map((opening) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm font-medium",
									children: openingLabel(opening)
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-xs text-muted",
									children: [
										opening.wall.toLowerCase(),
										" wall · offset ",
										formatFtIn(opening.offsetIn),
										opening.headerSize ? ` · header ${opening.headerSize}` : ""
									]
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "ghost",
									type: "button",
									onClick: () => queue(previewRemoveOpening(opening.id)),
									children: "Remove"
								})]
							}, opening.id))]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
							className: "mt-4 grid gap-3 sm:grid-cols-2",
							onSubmit: (event) => {
								event.preventDefault();
								const data = new FormData(event.currentTarget);
								const kind = String(data.get("kind") || "OHD");
								const wall = String(data.get("wall") || "FRONT");
								const widthIn = feetInput(data.get("widthFt"));
								const heightIn = feetInput(data.get("heightFt"));
								if (widthIn == null) return;
								queue(previewUpsertOpening({
									id: "",
									kind,
									wall,
									widthIn,
									heightIn,
									offsetIn: feetInput(data.get("offsetFt")) ?? 0,
									sillIn: kind === "WINDOW" ? 36 : 0,
									headerSize: null,
									tag: String(data.get("tag") || "") || null,
									provenance: "PROPOSED",
									offsetProvenance: "PROPOSED",
									datum: bp.dimDatum ?? "FACE_FRAMING",
									notes: String(data.get("notes") || "") || null
								}));
								event.currentTarget.reset();
							},
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Kind",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
										name: "kind",
										className: inputClass,
										defaultValue: "OHD",
										children: OPENING_KINDS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: item.id,
											children: item.label
										}, item.id))
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Wall",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
										name: "wall",
										className: inputClass,
										defaultValue: "FRONT",
										children: WALL_FACES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: item.id,
											children: item.label
										}, item.id))
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Width (ft)",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "widthFt",
										className: inputClass,
										inputMode: "decimal",
										placeholder: "16"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Height (ft)",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "heightFt",
										className: inputClass,
										inputMode: "decimal",
										placeholder: "7"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Offset from wall start (ft)",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "offsetFt",
										className: inputClass,
										inputMode: "decimal",
										placeholder: "0"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Schedule tag",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "tag",
										className: inputClass,
										placeholder: "2868"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Notes",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										name: "notes",
										className: inputClass
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "sm:col-span-2",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "primary",
										type: "submit",
										children: "Review opening"
									})
								})
							]
						})
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
								className: "font-display text-lg",
								children: "Rooms from Scope"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "secondary",
								type: "button",
								onClick: () => queue(previewRoomsFromScope(project)),
								children: "Name from Scope"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: "A named room without size stays Unknown. Howler will not invent a 6×8 bath."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "mt-4 space-y-3",
							children: [rooms.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No rooms recorded." }) : null, rooms.map((room) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Expandable, {
								open: openRoom === room.id,
								onToggle: () => setOpenRoom(openRoom === room.id ? null : room.id),
								title: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "font-medium",
									children: room.name
								}),
								meta: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-xs text-muted",
									children: [
										"L",
										room.level,
										room.widthIn && room.depthIn ? ` · ${formatFtIn(room.widthIn)} × ${formatFtIn(room.depthIn)}` : " · size Unknown"
									]
								}),
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
									className: "grid gap-3 sm:grid-cols-2",
									onSubmit: (event) => {
										event.preventDefault();
										const data = new FormData(event.currentTarget);
										queue(previewUpsertRoom({
											id: room.id,
											name: String(data.get("name")),
											level: intInput(data.get("level")) ?? 1,
											widthIn: feetInput(data.get("widthFt")),
											depthIn: feetInput(data.get("depthFt")),
											originXIn: feetInput(data.get("xFt")),
											originYIn: feetInput(data.get("yFt")),
											scopeItemIds: room.scopeItemIds,
											notes: String(data.get("notes") || "") || null
										}));
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Name",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												name: "name",
												className: inputClass,
												defaultValue: room.name,
												required: true
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Level",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												name: "level",
												className: inputClass,
												defaultValue: room.level
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Width (ft)",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												name: "widthFt",
												className: inputClass,
												defaultValue: inchesToFeetInput(room.widthIn)
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Depth (ft)",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												name: "depthFt",
												className: inputClass,
												defaultValue: inchesToFeetInput(room.depthIn)
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Origin X (ft from corner)",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												name: "xFt",
												className: inputClass,
												defaultValue: inchesToFeetInput(room.originXIn)
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Origin Y (ft)",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												name: "yFt",
												className: inputClass,
												defaultValue: inchesToFeetInput(room.originYIn)
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Notes",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												name: "notes",
												className: inputClass,
												defaultValue: room.notes ?? ""
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex flex-wrap gap-2 sm:col-span-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												variant: "primary",
												type: "submit",
												children: "Review room"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												variant: "ghost",
												type: "button",
												onClick: () => queue(previewRemoveRoom(room.id)),
												children: "Remove"
											})]
										})
									]
								}, `${room.id}-${project.revision}`)
							}) }, room.id))]
						})
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
							className: "font-display text-lg",
							children: "Cut list (derived)"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: "Field count from the envelope. Add waste. Trusses replace rafters when used."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-4 space-y-3",
							children: takeoff.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "border-b border-border pb-3 last:border-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-sm",
									children: [line.label, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "ml-2 font-mono text-muted",
										children: [
											line.count == null ? "Unknown" : `× ${line.count}`,
											" · ",
											line.size,
											" · ",
											line.lengthEach
										]
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-xs text-subtle",
									children: line.notes
								})]
							}, line.id))
						})
					] })
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
				className: "print-hide",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
						className: "font-display text-lg",
						children: "Kentucky code / engineer-plan needs"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-sm text-muted",
						children: [
							"Checks against ",
							CODE_SHORT,
							" conventional construction. Each finding cites the section. Passing a check is not a stamp."
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-4 space-y-3",
						children: findings.map((finding) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "border-b border-border pb-3 last:border-0",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex flex-wrap items-center gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
										tone: finding.severity === "REQUIRED" ? "danger" : finding.severity === "WATCH" ? "warn" : "neutral",
										children: finding.engineerLikely ? "Engineer likely" : finding.severity
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-xs uppercase tracking-[0.12em] text-muted",
										children: finding.code
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-sm",
									children: finding.title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-xs text-muted",
									children: finding.message
								})
							]
						}, finding.id))
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "print-hide",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DocsWizard, {
					project,
					compact: true
				})
			}),
			preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "print-hide",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewConfirm, {
					preview,
					project,
					onConfirm: () => {
						applyPreview(project.id, preview);
						setPreview(null);
						window.setTimeout(() => {
							document.getElementById("howler-sheet")?.scrollIntoView({
								behavior: "smooth",
								block: "start"
							});
						}, 50);
					},
					onCancel: () => setPreview(null)
				})
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "print-hide" })
		]
	});
}
function ScheduleModule({ project }) {
	const applyPreview = useHowlerStore((state) => state.applyPreview);
	const [openId, setOpenId] = (0, import_react.useState)(null);
	const [preview, setPreview] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	function submit(activity, data) {
		try {
			const next = previewPatchActivity(activity.id, {
				name: String(data.get("name")),
				phase: String(data.get("phase")),
				trade: String(data.get("trade") || "") || null,
				state: String(data.get("state")),
				committedStart: String(data.get("committedStart") || "") || null,
				committedFinish: String(data.get("committedFinish") || "") || null,
				actualStart: String(data.get("actualStart") || "") || null,
				actualFinish: String(data.get("actualFinish") || "") || null,
				notes: String(data.get("notes") || "") || null,
				durationLikely: Number(data.get("durationLikely") || activity.durationLikely),
				predecessorId: String(data.get("predecessorId") || "") || null,
				locked: data.get("locked") === "on"
			});
			setError(null);
			if (next.clerical) applyPreview(project.id, next);
			else setPreview(annotatePreview(project, next));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not update.");
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-5",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Schedule"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "Select a row to edit every field. Forecast is derived. Declared Change Order days do not rewrite these dates."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4 overflow-x-auto",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
					className: "w-full min-w-[720px] text-left text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
						className: "text-xs uppercase tracking-[0.12em] text-muted",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "py-2",
								children: "Activity"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "State" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Committed" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Forecast" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Pred" })
						] })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: Object.values(project.activities).map((activity) => {
						const forecast = forecastActivity(project, activity);
						const pred = activity.predecessorId ? project.activities[activity.predecessorId]?.name : "—";
						const selected = openId === activity.id;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: `border-t border-border align-top ${selected ? "bg-surface-2" : ""}`,
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "py-2",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "min-h-11 w-full py-2 text-left text-fg",
										onClick: () => setOpenId(selected ? null : activity.id),
										children: [activity.name, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "text-xs text-muted",
											children: [
												activity.phase,
												activity.trade ? ` · ${activity.trade}` : "",
												activity.locked ? " · locked" : ""
											]
										})]
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "py-3",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
										tone: activity.state === "COMPLETE" ? "ok" : activity.state === "IN_PROGRESS" ? "warn" : "neutral",
										children: activity.state.replace("_", " ")
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
									className: "py-3 font-mono text-xs tabular-nums",
									children: [
										activity.committedStart ?? "—",
										" → ",
										activity.committedFinish ?? "—"
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
									className: "py-3 font-mono text-xs tabular-nums",
									children: [
										forecast.start ?? "—",
										" → ",
										forecast.finish ?? "—"
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "py-3 text-muted",
									children: pred
								})
							]
						}, activity.id);
					}) })]
				})
			}),
			openId && project.activities[openId] ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "mt-4 grid gap-3 rounded-lg bg-surface-2 p-4 md:grid-cols-2",
				onSubmit: (event) => {
					event.preventDefault();
					submit(project.activities[openId], new FormData(event.currentTarget));
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Name",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "name",
							className: inputClass,
							defaultValue: project.activities[openId].name,
							required: true
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Phase",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "phase",
							className: inputClass,
							defaultValue: project.activities[openId].phase
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Trade",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "trade",
							className: inputClass,
							defaultValue: project.activities[openId].trade ?? ""
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "State",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							name: "state",
							className: inputClass,
							defaultValue: project.activities[openId].state,
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "NOT_STARTED",
									children: "Not started"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "IN_PROGRESS",
									children: "In progress"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "COMPLETE",
									children: "Complete"
								})
							]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Likely duration (workdays)",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "durationLikely",
							className: inputClass,
							type: "number",
							min: 1,
							defaultValue: project.activities[openId].durationLikely
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Predecessor",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							name: "predecessorId",
							className: inputClass,
							defaultValue: project.activities[openId].predecessorId ?? "",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "None"
							}), Object.values(project.activities).filter((activity) => activity.id !== openId).map((activity) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: activity.id,
								children: activity.name
							}, activity.id))]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Committed start",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "committedStart",
							type: "date",
							className: inputClass,
							defaultValue: project.activities[openId].committedStart ?? ""
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Committed finish",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "committedFinish",
							type: "date",
							className: inputClass,
							defaultValue: project.activities[openId].committedFinish ?? ""
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Actual start",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "actualStart",
							type: "date",
							className: inputClass,
							defaultValue: project.activities[openId].actualStart ?? ""
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Actual finish",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "actualFinish",
							type: "date",
							className: inputClass,
							defaultValue: project.activities[openId].actualFinish ?? ""
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "md:col-span-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Notes",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								name: "notes",
								className: inputClass,
								defaultValue: project.activities[openId].notes ?? ""
							})
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex min-h-11 items-center gap-2 text-sm text-muted",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "checkbox",
							name: "locked",
							defaultChecked: project.activities[openId].locked
						}), "Lock committed dates"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex gap-2 md:col-span-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "primary",
							type: "submit",
							children: "Review"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "ghost",
							onClick: () => setOpenId(null),
							children: "Close"
						})]
					})
				]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "Select an activity to edit." }),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm text-danger",
				children: error
			}) : null,
			preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewConfirm, {
				preview,
				onConfirm: () => {
					try {
						applyPreview(project.id, preview);
						setPreview(null);
						setError(null);
					} catch (caught) {
						setError(caught instanceof Error ? caught.message : "Apply failed.");
					}
				},
				onCancel: () => setPreview(null)
			}) : null
		] })
	});
}
function ScopeModule({ project }) {
	const applyPreview = useHowlerStore((state) => state.applyPreview);
	const [preview, setPreview] = (0, import_react.useState)(null);
	const [openId, setOpenId] = (0, import_react.useState)(null);
	const lines = Object.values(project.financials?.lines ?? {}).filter((line) => line.active);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-5",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Scope"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "Every item is editable. Baseline items stay marked. Open a row to change it; Draft Change Order starts unpriced."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-4 space-y-3",
				children: Object.values(project.scopeItems).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Expandable, {
					open: openId === item.id,
					onToggle: () => setOpenId(openId === item.id ? null : item.id),
					title: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-medium",
								children: item.description
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: item.fromBaseline ? "neutral" : "warn",
								children: item.fromBaseline ? "Baseline" : "Added after baseline"
							}),
							item.complete ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: "ok",
								children: "Complete"
							}) : null,
							!item.included ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: "danger",
								children: "Excluded"
							}) : null
						]
					}),
					meta: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-xs text-muted",
						children: [
							item.phase,
							item.trade ? ` · ${item.trade}` : "",
							livesIn(project, "scope", item.id).length ? ` · ${livesIn(project, "scope", item.id).join(" · ")}` : " · no linked ledger"
						]
					}),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "grid gap-3 md:grid-cols-2",
						onSubmit: (event) => {
							event.preventDefault();
							const data = new FormData(event.currentTarget);
							const next = previewPatchScope(item.id, {
								description: String(data.get("description")),
								phase: String(data.get("phase")),
								trade: String(data.get("trade") || "") || null,
								notes: String(data.get("notes") || "") || null,
								complete: data.get("complete") === "on",
								included: data.get("included") === "on",
								activityId: String(data.get("activityId") || "") || null,
								allowanceLineId: String(data.get("allowanceLineId") || "") || null
							});
							if (next.clerical) applyPreview(project.id, next);
							else setPreview(next);
						},
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Description",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "description",
									className: inputClass,
									defaultValue: item.description,
									required: true
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Phase",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "phase",
									className: inputClass,
									defaultValue: item.phase
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Trade",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "trade",
									className: inputClass,
									defaultValue: item.trade ?? ""
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Schedule activity",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									name: "activityId",
									className: inputClass,
									defaultValue: item.activityId ?? "",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "",
										children: "None"
									}), Object.values(project.activities).map((activity) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: activity.id,
										children: activity.name
									}, activity.id))]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Allowance / budget line",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									name: "allowanceLineId",
									className: inputClass,
									defaultValue: item.allowanceLineId ?? "",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "",
										children: "None (coverage unknown)"
									}), lines.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: line.id,
										children: line.description
									}, line.id))]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Notes",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									name: "notes",
									className: inputClass,
									defaultValue: item.notes ?? ""
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex min-h-11 items-center gap-2 text-sm text-muted",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "checkbox",
									name: "included",
									defaultChecked: item.included
								}), "Included in current scope"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex min-h-11 items-center gap-2 text-sm text-muted",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "checkbox",
									name: "complete",
									defaultChecked: item.complete
								}), "Complete"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap gap-2 md:col-span-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "secondary",
									type: "submit",
									children: "Review"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "ghost",
									onClick: () => {
										if (!project.financials) return;
										setPreview(previewCreateChangeOrder({
											title: `Scope change: ${item.description}`,
											description: `DRAFT originated from Scope "${item.description}". Price unknown.`,
											reason: "Scope-originated",
											cost: zero(project.financials.currency),
											declaredScheduleDays: null,
											scopeItemIds: [item.id],
											activityIds: item.activityId ? [item.activityId] : []
										}));
									},
									children: "Draft Change Order"
								})]
							})
						]
					})
				}) }, item.id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "mt-6 grid gap-3 border-t border-border pt-4 md:grid-cols-2",
				onSubmit: (event) => {
					event.preventDefault();
					const data = new FormData(event.currentTarget);
					const next = previewAddScope({
						description: String(data.get("description")),
						phase: String(data.get("phase") || "General"),
						trade: String(data.get("trade") || "") || void 0
					}, project);
					setPreview(next);
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
						className: "md:col-span-2 text-sm font-medium",
						children: "Add scope item"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Description",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "description",
							className: inputClass,
							required: true
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Phase",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "phase",
							className: inputClass,
							defaultValue: "General"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Trade",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							name: "trade",
							className: inputClass
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex items-end",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "primary",
							type: "submit",
							children: "Add"
						})
					})
				]
			}),
			preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewConfirm, {
				preview,
				onConfirm: () => {
					applyPreview(project.id, preview);
					setPreview(null);
				},
				onCancel: () => setPreview(null)
			}) : null
		] })
	});
}
function useQueue(project) {
	const applyPreview = useHowlerStore((state) => state.applyPreview);
	const [preview, setPreview] = (0, import_react.useState)(null);
	return {
		preview,
		queue: (next) => setPreview(annotatePreview(project, next)),
		confirm: preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewConfirm, {
			preview,
			project,
			onConfirm: () => {
				applyPreview(project.id, preview);
				setPreview(null);
			},
			onCancel: () => setPreview(null)
		}) : null
	};
}
function toneForInspection(status) {
	if (status === "PASSED") return "ok";
	if (status === "FAILED") return "danger";
	if (status === "SCHEDULED" || status === "READY") return "warn";
	return "neutral";
}
function InspectionsModule({ project }) {
	const job = ensureJob(project);
	const { queue, confirm } = useQueue(project);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-5",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Inspections / Permits"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "Madison County / 2018 KRC sequence. A pass is only recorded when you say it passed. This is not a PE stamp."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 grid gap-3 sm:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Permit",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
						className: inputClass,
						value: job.permitStatus,
						onChange: (event) => queue(previewSetPermit(event.target.value, job.permitNumber)),
						children: Object.keys(PERMIT_LABEL).map((id) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: id,
							children: PERMIT_LABEL[id]
						}, id))
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
					label: "Permit number",
					value: job.permitNumber ?? "Unknown"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "mt-5 space-y-3",
				children: Object.values(job.inspections).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "border-b border-border pb-3 last:border-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
									tone: toneForInspection(item.status),
									children: item.status.replace("_", " ")
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm font-medium",
									children: item.name
								}),
								item.code ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs text-subtle",
									children: item.code
								}) : null
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-muted",
							children: item.notes
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
							className: `${inputClass} mt-2 max-w-xs`,
							value: item.status,
							onChange: (event) => queue(previewSetInspection(item.id, { status: event.target.value })),
							children: INSPECTION_STATUSES.map((status) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: status.id,
								children: status.label
							}, status.id))
						})
					]
				}, item.id))
			}),
			confirm
		] })
	});
}
function TradesModule({ project }) {
	const job = ensureJob(project);
	const { confirm, queue } = useQueue(project);
	const [name, setName] = (0, import_react.useState)("");
	const [trade, setTrade] = (0, import_react.useState)("Framing");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-5",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Trades / Vendors / Contacts"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "A name is not a contract. Kentucky trades (electrical, plumbing, HVAC) are licensed; Howler does not track licenses."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "mt-4 space-y-3",
				children: [Object.values(job.contacts).length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No contacts recorded." }) : null, Object.values(job.contacts).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "border-b border-border pb-3 last:border-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm font-medium",
							children: item.name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xs text-muted",
							children: [item.trade, item.phone ? ` · ${item.phone}` : ""]
						}),
						item.notes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-subtle",
							children: item.notes
						}) : null
					]
				}, item.id))]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "mt-4 grid gap-3 sm:grid-cols-3",
				onSubmit: (event) => {
					event.preventDefault();
					if (!name.trim()) return;
					queue(previewUpsertContact({
						name: name.trim(),
						trade
					}));
					setName("");
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Name",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							value: name,
							onChange: (event) => setName(event.target.value),
							required: true
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Trade",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							value: trade,
							onChange: (event) => setTrade(event.target.value)
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex items-end",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							variant: "secondary",
							children: "Review contact"
						})
					})
				]
			}),
			confirm
		] })
	});
}
function MaterialsModule({ project }) {
	const lines = materialTakeoff(project);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-5",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Materials / Procurement"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "Takeoff from the live model. Unknown stays Unknown. LVL sizes are from Deboard Calcs, not a Howler stamp."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-4 space-y-3",
				children: lines.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "border-b border-border pb-3 last:border-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: line.status === "UNKNOWN" ? "warn" : "ok",
								children: line.status === "UNKNOWN" ? "Unknown" : "From model"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-xs text-subtle",
								children: line.trade
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm font-medium",
							children: line.item
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-sm",
							children: line.qty
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-muted",
							children: line.notes
						})
					]
				}, line.id))
			})
		] })
	});
}
function PhotosModule({ project }) {
	const job = ensureJob(project);
	const evidence = ensureBlueprint(project).evidence ?? [];
	const { confirm, queue } = useQueue(project);
	const [caption, setCaption] = (0, import_react.useState)("");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-5",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Photos"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "Field notes. Images stay on your device or Drive — Howler records the caption, not the pixels. Drawing PDFs live on Documents."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
				className: "mt-4 text-xs font-medium uppercase tracking-[0.14em] text-muted",
				children: "Drive files on this job"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "mt-2 space-y-2 text-sm",
				children: [evidence.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No files recorded. Drop a PDF on Tell Howler." }) : null, evidence.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex flex-wrap items-baseline gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs text-subtle",
						children: EVIDENCE_LABEL[item.kind]
					}), item.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: item.url,
						target: "_blank",
						rel: "noreferrer",
						className: "text-accent",
						children: item.name
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: item.name })]
				}, item.id))]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
				className: "mt-5 text-xs font-medium uppercase tracking-[0.14em] text-muted",
				children: "Field notes"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "mt-2 space-y-3",
				children: [Object.values(job.photos).length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No photo notes yet." }) : null, Object.values(job.photos).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "border-b border-border pb-3 last:border-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm",
						children: item.caption
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs text-subtle",
						children: [item.takenAt, item.evidenceName ? ` · ${item.evidenceName}` : ""]
					})]
				}, item.id))]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "mt-4 space-y-3",
				onSubmit: (event) => {
					event.preventDefault();
					if (!caption.trim()) return;
					queue(previewAddPhoto(caption.trim(), evidence.at(-1)?.name ?? null));
					setCaption("");
				},
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Caption",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass,
						value: caption,
						onChange: (event) => setCaption(event.target.value),
						placeholder: "Photo: footing rebar before pour",
						required: true
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "submit",
					variant: "secondary",
					children: "Review note"
				})]
			}),
			confirm
		] })
	});
}
function SelectionsModule({ project }) {
	const job = ensureJob(project);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-5",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Selections"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "Match-existing is a field fact. Unknown stays Unknown. Tell Howler “brick to match existing.”"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "mt-4 space-y-3",
				children: [Object.values(job.selections).length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: "No selections recorded." }) : null, Object.values(job.selections).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "border-b border-border pb-3 last:border-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								tone: item.status === "UNKNOWN" ? "warn" : "ok",
								children: item.status.replace("_", " ")
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm font-medium",
								children: item.name
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm",
							children: item.value ?? "Unknown"
						}),
						item.notes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-muted",
							children: item.notes
						}) : null
					]
				}, item.id))]
			})
		] })
	});
}
var MODULES = [
	{
		id: "overview",
		label: "Overview"
	},
	{
		id: "schedule",
		label: "Schedule"
	},
	{
		id: "scope",
		label: "Scope"
	},
	{
		id: "plans",
		label: "Plans"
	},
	{
		id: "photos",
		label: "Photos"
	},
	{
		id: "budget",
		label: "Budget"
	},
	{
		id: "documents",
		label: "Documents"
	},
	{
		id: "change-orders",
		label: "COs"
	},
	{
		id: "selections",
		label: "Selections"
	},
	{
		id: "trades",
		label: "Trades"
	},
	{
		id: "materials",
		label: "Materials"
	},
	{
		id: "inspections",
		label: "Inspections"
	},
	{
		id: "activity",
		label: "History"
	}
];
function ProjectShell({ projectId, moduleId }) {
	const project = useProject(projectId);
	if (!project) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "howler-main",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HowlerLockup, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Empty, { children: [
			"Could not load this project.",
			" ",
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: "/",
				className: "text-accent",
				children: "Return to portfolio"
			}),
			"."
		] })]
	});
	const health = integrity(project);
	const summary = financialSummary(project);
	const active = MODULES.some((module) => module.id === moduleId) ? moduleId : "overview";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AppFrame, {
		rail: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HowlerLockup, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "howler-rail-meta min-w-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "truncate text-[11px] uppercase tracking-[0.14em] text-subtle",
					children: project.clientName
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 truncate font-display text-lg leading-tight",
					children: project.name
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "flex min-w-0 flex-1 flex-col gap-0.5",
				children: MODULES.map((module) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/projects/$projectId/$moduleId",
					params: {
						projectId,
						moduleId: module.id
					},
					className: "howler-rail-link",
					"data-active": module.id === active,
					children: module.label
				}, module.id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "howler-rail-meta mt-auto space-y-2 border-t border-border pt-3 text-[11px] text-muted",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
						"Integrity ",
						health.score,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-subtle",
							children: " / 100"
						})
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
						"Progress ",
						progressPercent(project),
						"%"
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-fg",
						children: summary ? formatMoney(summary.revisedBudget) : "Unknown"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-subtle",
						children: ["Rev ", project.revision]
					})
				]
			})
		] }),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "mb-6 flex flex-wrap items-end justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[11px] uppercase tracking-[0.16em] text-subtle",
						children: [
							project.clientName,
							" · ",
							project.address
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-1 font-display text-[32px] font-normal leading-none tracking-[-0.03em]",
						children: project.name
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 max-w-2xl text-sm text-muted",
						children: project.projectType
					}),
					heldPhasesOf(project).length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 flex flex-wrap gap-2",
						children: heldPhasesOf(project).map((phase) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(StatusChip, {
							tone: "warn",
							children: [phase, " held"]
						}, phase))
					}) : null
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HowlerMic, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs text-muted",
						children: ["Next: ", nextMovement(project)]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-6",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TellHowler, {
					project,
					compact: true
				})
			}),
			active === "overview" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewModule, { project }) : null,
			active === "schedule" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScheduleModule, { project }) : null,
			active === "scope" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScopeModule, { project }) : null,
			active === "plans" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlansModule, { project }) : null,
			active === "budget" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BudgetModule, { project }) : null,
			active === "change-orders" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChangeOrdersModule, { project }) : null,
			active === "activity" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActivityModule, { project }) : null,
			active === "documents" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DocumentsModule, { project }) : null,
			active === "photos" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PhotosModule, { project }) : null,
			active === "selections" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectionsModule, { project }) : null,
			active === "trades" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TradesModule, { project }) : null,
			active === "materials" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MaterialsModule, { project }) : null,
			active === "inspections" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InspectionsModule, { project }) : null
		]
	});
}
function ProjectModule() {
	const { projectId, moduleId } = Route.useParams();
	useHowlerHydrated();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectShell, {
		projectId,
		moduleId
	});
}
//#endregion
export { ProjectModule as component };
