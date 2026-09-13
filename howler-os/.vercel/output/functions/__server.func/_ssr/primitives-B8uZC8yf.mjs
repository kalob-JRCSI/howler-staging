import { o as __toESM } from "../_runtime.mjs";
import { a as OCCUPANCY_LABEL, s as SHEETS } from "./guard-Dnnludmw.mjs";
import { H as require_react, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { $ as isLFootprint, $t as provenanceSuffix, D as TRADEWALK, E as STATUS_LABEL, G as formatCodeNote, I as designCriteria, K as formatFtIn, Qt as proposedStairFromWalls, S as KY_STAIR, T as PROVENANCE_LABEL, V as envelopeComplete, _ as DATUM_LABEL, _t as planParts, cn as stairLimitRows, dn as tabulatedJoistSpanIn, en as rafterLengthIn, fn as unresolvedRegister, ft as openingLabel, gt as planLayout, h as CODE_SHORT, in as scaleLabel, j as citesTradewalk, ln as stations, lt as memberCount, p as CODE_ADOPTION, pn as wallThicknessIn, pt as openingSchedule, rn as ridgeRiseIn, sn as sheetKeynotes, st as lumberThicknessIn, tn as resolveOpenings, tt as joistSpanIn } from "./router-BiflSdL7.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/primitives-B8uZC8yf.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 min-h-11 rounded-sm px-4 text-sm font-medium transition-[opacity,transform,box-shadow] duration-[var(--motion-quick,150ms)] ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]", {
	variants: { variant: {
		primary: "bg-accent text-accent-fg hover:bg-accent-strong",
		secondary: "bg-surface-2 text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
		ghost: "text-muted hover:text-fg hover:bg-surface-2",
		danger: "bg-danger text-fg hover:opacity-90"
	} },
	defaultVariants: { variant: "secondary" }
});
function Button({ className, variant, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		className: cn(buttonVariants({ variant }), className),
		...props
	});
}
function sheetMeta(sheet) {
	return SHEETS.find((item) => item.id === sheet) ?? {
		id: sheet,
		label: sheet,
		number: sheet
	};
}
function TitleBlock({ project, bp, sheet, scale }) {
	const meta = sheetMeta(sheet);
	const trade = citesTradewalk(bp);
	const job = trade ? TRADEWALK.job : project.name.toUpperCase();
	const street = trade ? TRADEWALK.addressLine : project.address.toUpperCase();
	const city = trade ? TRADEWALK.cityLine : bp.county ? `${bp.county.toUpperCase()} COUNTY, KY` : "KENTUCKY";
	const issued = trade ? TRADEWALK.issued.toUpperCase() : "WORKING SET";
	const status = bp.drawingStatus ?? "DRAFT";
	const statusText = status === "ISSUED" ? `ISSUED FOR LAYOUT · REV ${bp.issuedRevision ?? project.revision}` : STATUS_LABEL[status] ?? "DRAFT — NOT ISSUED";
	const unresolved = unresolvedRegister(bp);
	const blocking = unresolved.filter((item) => item.blocking).length;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "708",
				y: "16",
				width: "176",
				height: "608",
				fill: "var(--color-surface)",
				stroke: "currentColor",
				strokeWidth: "1.25"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "708",
				y1: "16",
				x2: "708",
				y2: "624",
				stroke: "currentColor",
				strokeWidth: "1.25"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "796",
				y: "40",
				textAnchor: "middle",
				className: "fill-fg",
				fontSize: "11",
				fontFamily: "var(--font-display)",
				children: job
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "796",
				y: "56",
				textAnchor: "middle",
				fontSize: "8",
				children: street
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "796",
				y: "70",
				textAnchor: "middle",
				fontSize: "8",
				children: city
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "796",
				y: "86",
				textAnchor: "middle",
				fontSize: "8",
				className: "fill-fg",
				children: issued
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "720",
				y1: "96",
				x2: "872",
				y2: "96",
				stroke: "currentColor",
				strokeWidth: "0.8"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "720",
				y: "112",
				fontSize: "7",
				children: "SHEET #"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "796",
				y: "112",
				fontSize: "7",
				children: "DATE"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "720",
				y: "136",
				className: "fill-fg",
				fontSize: "22",
				fontFamily: "var(--font-display)",
				children: meta.number
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "796",
				y: "128",
				fontSize: "8",
				children: issued
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "720",
				y1: "148",
				x2: "872",
				y2: "148",
				stroke: "currentColor",
				strokeWidth: "0.8"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "796",
				y: "168",
				textAnchor: "middle",
				className: "fill-fg",
				fontSize: "9",
				fontFamily: "var(--font-display)",
				children: meta.label.toUpperCase()
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "796",
				y: "184",
				textAnchor: "middle",
				fontSize: "8",
				children: trade ? "FROM TRADEWALK SET" : project.projectType
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "720",
				y1: "196",
				x2: "872",
				y2: "196",
				stroke: "currentColor",
				strokeWidth: "0.8"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
				x: "720",
				y: "214",
				fontSize: "8",
				className: "fill-fg",
				children: ["Scale ", scale]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
				x: "720",
				y: "228",
				fontSize: "8",
				children: [
					"Rev ",
					project.revision,
					" · ",
					bp.county ? `${bp.county} Co.` : "County Unknown"
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
				x: "720",
				y: "242",
				fontSize: "8",
				children: [
					"Snow ",
					bp.groundSnowLoadPsf ?? "—",
					" psf · Vult ",
					bp.windSpeedMph
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "720",
				y: "256",
				fontSize: "8",
				children: bp.occupancy ? OCCUPANCY_LABEL[bp.occupancy] : "Occupancy Unknown"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "720",
				y1: "268",
				x2: "872",
				y2: "268",
				stroke: "currentColor",
				strokeWidth: "0.8"
			}),
			trade ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "286",
					fontSize: "8",
					className: "fill-fg",
					children: "THIS SET"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "300",
					fontSize: "7",
					children: "A01–A11 drawn · A15 wall framing"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "314",
					fontSize: "7",
					children: "A12–A14 3D — see Tradewalk PDF"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "336",
					fontSize: "8",
					className: "fill-fg",
					children: [
						bp.studSize,
						" @ ",
						bp.studSpacingIn,
						"\" OC studs"
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "350",
					fontSize: "8",
					children: [
						bp.joistSize,
						" @ ",
						bp.joistSpacingIn,
						"\" joists"
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "364",
					fontSize: "8",
					children: [
						bp.rafterSize,
						" @ ",
						bp.rafterSpacingIn,
						"\" rafters"
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "378",
					fontSize: "8",
					children: [
						"Pitch ",
						bp.roofRise,
						"/",
						bp.roofRun,
						" · eave ",
						formatFtIn(bp.eaveHeightIn)
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
					x1: "720",
					y1: "392",
					x2: "872",
					y2: "392",
					stroke: "currentColor",
					strokeWidth: "0.8"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "412",
					fontSize: "8",
					className: status === "ISSUED" ? "fill-fg" : "fill-warn",
					children: statusText
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "426",
					fontSize: "8",
					className: "fill-warn",
					children: "NOT A SEALED SET"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "444",
					fontSize: "7",
					children: [
						CODE_SHORT,
						" · ",
						CODE_ADOPTION
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "458",
					fontSize: "7",
					children: ["DIM ", DATUM_LABEL[bp.dimDatum ?? "FACE_FRAMING"]]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "472",
					fontSize: "7",
					children: ["ENVELOPE ", PROVENANCE_LABEL[bp.envelopeProvenance ?? "UNKNOWN"]]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "486",
					fontSize: "7",
					className: blocking ? "fill-warn" : void 0,
					children: blocking ? `${blocking} BLOCKING UNRESOLVED` : `${unresolved.length} ON REGISTER`
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "504",
					fontSize: "7",
					children: unresolved[0] ? `${unresolved[0].title.slice(0, 28)}${unresolved[0].title.length > 28 ? "…" : ""}` : "Murphy LVL B1–B3 PASSED"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "518",
					fontSize: "7",
					children: "Tags resolve to A01 schedule"
				})
			] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "286",
					fontSize: "8",
					children: bp.studSize ? `${bp.studSize} @ ${bp.studSpacingIn ?? "—"}" OC` : "Framing Unknown"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "300",
					fontSize: "8",
					children: [
						"Joists ",
						bp.joistSize ?? "—",
						" ",
						bp.joistSpacingIn ? `@ ${bp.joistSpacingIn}"` : ""
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "314",
					fontSize: "8",
					children: [
						"Rafters ",
						bp.rafterSize ?? "—",
						" ",
						bp.rafterSpacingIn ? `@ ${bp.rafterSpacingIn}"` : ""
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "328",
					fontSize: "8",
					children: ["Pitch ", bp.roofRise && bp.roofRun ? `${bp.roofRise}/${bp.roofRun}` : "Unknown"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
					x1: "720",
					y1: "340",
					x2: "872",
					y2: "340",
					stroke: "currentColor",
					strokeWidth: "0.8"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "360",
					fontSize: "8",
					className: status === "ISSUED" ? "fill-fg" : "fill-warn",
					children: statusText
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "374",
					fontSize: "8",
					className: "fill-warn",
					children: "NOT A SEALED"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "720",
					y: "388",
					fontSize: "8",
					className: "fill-warn",
					children: "ENGINEERING SET"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "408",
					fontSize: "8",
					children: ["DIM ", DATUM_LABEL[bp.dimDatum ?? "FACE_FRAMING"]]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "422",
					fontSize: "8",
					children: ["ENVELOPE ", PROVENANCE_LABEL[bp.envelopeProvenance ?? "UNKNOWN"]]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: "720",
					y: "436",
					fontSize: "8",
					children: [CODE_SHORT, ". Confirm every size."]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "720",
				y1: "520",
				x2: "872",
				y2: "520",
				stroke: "currentColor",
				strokeWidth: "0.8"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "796",
				y: "548",
				textAnchor: "middle",
				className: "fill-fg",
				fontSize: "12",
				fontFamily: "var(--font-display)",
				children: "HOWLER"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "796",
				y: "564",
				textAnchor: "middle",
				fontSize: "8",
				children: "Construction documents"
			})
		]
	});
}
function GraphicScaleBar({ s, x, y, maxFeet }) {
	const perFoot = s * 12;
	const ticks = [
		0,
		4,
		8
	];
	if (maxFeet >= 16) ticks.push(16);
	if (maxFeet >= 24) ticks.push(24);
	const end = ticks[ticks.length - 1] ?? 8;
	const width = end * perFoot;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		"aria-label": `Graphic scale, ${end} feet`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: x,
				y1: y,
				x2: x + width,
				y2: y,
				stroke: "currentColor",
				strokeWidth: "1.25"
			}),
			ticks.map((feet, index) => {
				const tx = x + feet * perFoot;
				const filled = index % 2 === 1;
				const prev = ticks[index - 1] ?? 0;
				const seg = (feet - prev) * perFoot;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
					index > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
						x: x + prev * perFoot,
						y: y - 6,
						width: seg,
						height: 6,
						fill: filled ? "currentColor" : "none",
						stroke: "currentColor",
						strokeWidth: "0.75"
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
						x1: tx,
						y1: y - 8,
						x2: tx,
						y2: y + 4,
						stroke: "currentColor",
						strokeWidth: "0.75"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
						x: tx,
						y: y + 14,
						textAnchor: "middle",
						fontSize: "8",
						fontFamily: "var(--font-mono)",
						className: "fill-fg",
						children: feet === 0 ? "0" : `${feet}'`
					})
				] }, feet);
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x,
				y: y - 12,
				fontSize: "8",
				className: "fill-fg",
				children: "GRAPHIC SCALE"
			})
		]
	});
}
function NorthArrow({ x, y }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		transform: `translate(${x}, ${y})`,
		className: "text-muted",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "0",
				cy: "8",
				r: "16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("polygon", {
				points: "0,-10 6,14 -6,14",
				className: "fill-fg"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "0",
				y: "-16",
				textAnchor: "middle",
				fontSize: "10",
				className: "fill-fg",
				children: "N"
			})
		]
	});
}
function HatchDefs({ sheet }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("defs", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pattern", {
			id: `slab-${sheet}`,
			width: "8",
			height: "8",
			patternUnits: "userSpaceOnUse",
			patternTransform: "rotate(45)",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "0",
				y1: "0",
				x2: "0",
				y2: "8",
				stroke: "currentColor",
				strokeWidth: "0.6",
				opacity: "0.35"
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pattern", {
			id: `siding-${sheet}`,
			width: "6",
			height: "6",
			patternUnits: "userSpaceOnUse",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "0",
				y1: "6",
				x2: "6",
				y2: "6",
				stroke: "currentColor",
				strokeWidth: "0.5",
				opacity: "0.4"
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pattern", {
			id: `earth-${sheet}`,
			width: "10",
			height: "6",
			patternUnits: "userSpaceOnUse",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M0 3 Q 2.5 0 5 3 T 10 3",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "0.6",
				opacity: "0.45"
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("pattern", {
			id: `brick-${sheet}`,
			width: "10",
			height: "6",
			patternUnits: "userSpaceOnUse",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				width: "10",
				height: "6",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "0.4",
				opacity: "0.5"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "5",
				y1: "0",
				x2: "5",
				y2: "6",
				stroke: "currentColor",
				strokeWidth: "0.4",
				opacity: "0.5"
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pattern", {
			id: `cmu-${sheet}`,
			width: "12",
			height: "8",
			patternUnits: "userSpaceOnUse",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				width: "12",
				height: "8",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "0.5",
				opacity: "0.55"
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("pattern", {
			id: `gravel-${sheet}`,
			width: "6",
			height: "6",
			patternUnits: "userSpaceOnUse",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "2",
				cy: "2",
				r: "0.7",
				fill: "currentColor",
				opacity: "0.45"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "5",
				cy: "4",
				r: "0.6",
				fill: "currentColor",
				opacity: "0.4"
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pattern", {
			id: `batt-${sheet}`,
			width: "8",
			height: "8",
			patternUnits: "userSpaceOnUse",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M0 4 Q 2 1 4 4 T 8 4",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "0.5",
				opacity: "0.5"
			})
		})
	] });
}
function KeyBubble({ n, x, y }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
		cx: x,
		cy: y,
		r: "7",
		fill: "var(--color-bg)",
		stroke: "currentColor",
		strokeWidth: "1.15"
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
		x,
		y: y + 3,
		textAnchor: "middle",
		fontSize: "8",
		className: "fill-fg",
		fontFamily: "var(--font-mono)",
		children: n
	})] });
}
function Leader({ n, ax, ay, lx, ly }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: ax,
			y1: ay,
			x2: lx,
			y2: ly,
			stroke: "currentColor",
			strokeWidth: "0.75"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyBubble, {
			n,
			x: lx,
			y: ly
		})]
	});
}
function wrapNote(text, width = 44) {
	if (text.length <= width) return [text];
	const words = text.split(" ");
	const lines = [];
	let current = "";
	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if (next.length > width && current) {
			lines.push(current);
			current = word;
		} else current = next;
	}
	if (current) lines.push(current);
	return lines;
}
function KeynoteLegend({ items, x, y, title = "KEYNOTES — 2018 KRC / 2015 IRC" }) {
	let cursor = y + 16;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x,
			y,
			fontSize: "8",
			className: "fill-fg",
			children: title
		}), items.map((item, index) => {
			const lines = wrapNote(item);
			const top = cursor;
			cursor += 4 + lines.length * 10;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyBubble, {
				n: index + 1,
				x: x + 8,
				y: top
			}), lines.map((line, lineIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: x + 20,
				y: top + 3 + lineIndex * 10,
				fontSize: "6.5",
				children: line
			}, lineIndex))] }, `${index}-${item}`);
		})]
	});
}
function StairLimitsBlock({ bp, x, y }) {
	const rows = stairLimitRows(bp);
	const proposal = proposedStairFromWalls(bp);
	const s = 2.15;
	const riser = KY_STAIR.maxRiserIn * s;
	const tread = KY_STAIR.minTreadIn * s;
	const steps = 6;
	const ox = x + 10;
	const oy = 430;
	const points = [`${ox},${oy}`];
	let px = ox;
	let py = oy;
	for (let i = 0; i < steps; i++) {
		py -= riser;
		points.push(`${px},${py}`);
		px += tread;
		points.push(`${px},${py}`);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		"aria-label": "Kentucky stair limits R311.7",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x,
				y,
				fontSize: "8",
				className: "fill-fg",
				children: "KY STAIR — 2018 KRC, NOT VANILLA IRC"
			}),
			rows.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
				x,
				y: y + 12 + index * 11,
				fontSize: "6.5",
				children: [
					row.label,
					"  ",
					row.value,
					"  · ",
					row.code
				]
			}, row.label)),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", {
				points: points.join(" "),
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.4"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: ox + 4,
				y: oy - riser * 2 - 4,
				fontSize: "6.5",
				className: "fill-fg",
				children: "8¼\" MAX R"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: ox + tread * 2,
				y: 442,
				fontSize: "6.5",
				className: "fill-fg",
				children: "9\" MIN T"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x,
				y: 456,
				fontSize: "6.5",
				children: "Limit diagram — not this job's stringer"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x,
				y: 468,
				fontSize: "6.5",
				children: proposal ? `${proposal.note}. Going ≥ ${formatFtIn(proposal.minGoingIn)} PROP.` : "Floor-to-floor Unknown. Howler will not invent a run."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x,
				y: 480,
				fontSize: "6.5",
				children: "Garage top landing not required if door does not swing over stairs · R311.7.6"
			})
		]
	});
}
function DesignCriteriaBlock({ bp, x, y }) {
	const rows = designCriteria(bp);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		"aria-label": "Design criteria Table R301.2(1)",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x,
			y,
			fontSize: "8",
			className: "fill-fg",
			children: "DESIGN CRITERIA — TABLE R301.2(1)"
		}), rows.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x,
			y: y + 12 + index * 11,
			fontSize: "6.5",
			children: [
				row.label,
				"  ",
				row.value,
				"  · ",
				row.code
			]
		}, row.label))]
	});
}
function sheetNotes(bp, sheet) {
	return sheetKeynotes(bp, sheet).map(formatCodeNote);
}
var SHEET_HOWTO = {
	L1: "HOW TO READ A01 — overall to stated datum, schedule, markers. Callouts cite 2018 KRC. Solid = verified. PROP/UNK stay unresolved.",
	L2: "HOW TO READ A02 — attic follows the L. Stairwell is named; run stays Unknown. KY stairs: 8¼\" max riser / 9\" min tread (R311.7).",
	FDN: "HOW TO READ A03 — slab, 12x24 footing (dashed), LVL pier. Frost Unknown unless entered (R403.1.4).",
	EL: "HOW TO READ A04 — four faces. Brick veneer R703.8. Match existing. Shed height for grade.",
	SEC: "HOW TO READ A05 — 10' walls. KY stair: 8¼\" max riser / 9\" min tread (not IRC 7¾ / 10). Run Unknown. Not a PE stamp.",
	WALL: "HOW TO READ A06 — evidence sheet. Follow numbered layers. Each layer cites the code it satisfies.",
	JOIST: "HOW TO READ A07 — each line is a joist at recorded O.C. Table R502.3.1(2). LVL is separate calc, not this stamp.",
	ROOF: "HOW TO READ A08 — rafters at recorded O.C. Table R802.5.1(1). Truss package R802.10 if used.",
	ELEC: "HOW TO READ A09 — GFCI E3902.2, bay receptacle E3901.9. No panel invented. Openers R309.4 / UL 325.",
	ELEC2: "HOW TO READ A10 — attic lighting E3903. Stair 3-way E3903.3. Unfinished ≠ sleeping (R314 / R310).",
	PLUMB: "HOW TO READ A11 — half bath is an option. No fixture schedule. If a lav: GFCI E3902.1.",
	STUD: "HOW TO READ A15 — Table R602.3(5). Each tick is a stud. King/jacks wait on OHD leaf width (R602.7)."
};
function HowToBanner({ sheet }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
		x: "24",
		y: "28",
		fontSize: "8",
		className: "fill-fg",
		children: SHEET_HOWTO[sheet]
	});
}
function NextSheetHint({ sheet }) {
	const index = SHEETS.findIndex((item) => item.id === sheet);
	const next = SHEETS[index + 1];
	if (!next) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
		x: "24",
		y: "618",
		fontSize: "8",
		className: "text-muted",
		children: "END OF SET · A12–A14 3D stay on the Tradewalk PDF"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
		x: "24",
		y: "618",
		fontSize: "8",
		className: "text-muted",
		children: [
			"NEXT ",
			next.number,
			" ",
			next.label.toUpperCase(),
			" →"
		]
	});
}
function TagBubble({ mark, x, y }) {
	const w = Math.max(28, mark.length * 5.2 + 8);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: x - w / 2,
			y: y - 7,
			width: w,
			height: "14",
			rx: "2",
			fill: "var(--color-bg)",
			stroke: "currentColor",
			strokeWidth: "1"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x,
			y: y + 3,
			textAnchor: "middle",
			fontSize: "7",
			className: "fill-fg",
			fontFamily: "var(--font-mono)",
			children: mark
		})]
	});
}
function SectionMarker({ x, y1, y2, mark, sheet }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: x,
				y1,
				x2: x,
				y2,
				stroke: "currentColor",
				strokeWidth: "1.1",
				strokeDasharray: "5 3"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("polygon", {
				points: `${x - 8},${y1} ${x + 8},${y1} ${x},${y1 + 12}`,
				className: "fill-fg"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("polygon", {
				points: `${x - 8},${y2} ${x + 8},${y2} ${x},${y2 - 12}`,
				className: "fill-fg"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: x,
				cy: y1 - 12,
				r: "9",
				fill: "var(--color-bg)",
				stroke: "currentColor",
				strokeWidth: "1.1"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x,
				y: y1 - 9,
				textAnchor: "middle",
				fontSize: "8",
				className: "fill-fg",
				fontFamily: "var(--font-mono)",
				children: mark
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: x + 14,
				y: y1 - 8,
				fontSize: "7",
				className: "fill-fg",
				children: sheet
			})
		]
	});
}
function ElevMarker({ x, y, face, sheet }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: x - 12,
				y: y - 10,
				width: "24",
				height: "16",
				fill: "var(--color-bg)",
				stroke: "currentColor"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("polygon", {
				points: `${x - 6},${y + 6} ${x + 6},${y + 6} ${x},${y + 14}`,
				className: "fill-fg"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x,
				y: y + 2,
				textAnchor: "middle",
				fontSize: "7",
				className: "fill-fg",
				fontFamily: "var(--font-mono)",
				children: face
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x,
				y: y - 14,
				textAnchor: "middle",
				fontSize: "6",
				className: "fill-fg",
				children: sheet
			})
		]
	});
}
function OpeningScheduleTable({ bp, x, y }) {
	const rows = openingSchedule(bp);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x,
				y,
				fontSize: "8",
				className: "fill-fg",
				children: "OPENING SCHEDULE — TAGS ON THIS SHEET RESOLVE HERE"
			}),
			[
				"MK",
				"TYPE",
				"W",
				"H",
				"WALL",
				"OFFSET",
				"SRC"
			].map((col, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: x + [
					0,
					52,
					108,
					150,
					196,
					250,
					318
				][index],
				y: y + 14,
				fontSize: "6",
				className: "fill-fg",
				children: col
			}, col)),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: x,
				y1: y + 18,
				x2: x + 380,
				y2: y + 18,
				stroke: "currentColor",
				strokeWidth: "0.6"
			}),
			rows.map((row, index) => {
				const yy = y + 30 + index * 12;
				const cells = [
					row.mark,
					row.kind,
					row.size,
					row.height,
					row.wall,
					`${row.offset}${provenanceSuffix(row.offsetProvenance)}`,
					row.missing ? "UNKNOWN" : PROVENANCE_LABEL[row.provenance]
				];
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("g", { children: cells.map((cell, ci) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: x + [
						0,
						52,
						108,
						150,
						196,
						250,
						318
					][ci],
					y: yy,
					fontSize: "6.5",
					className: row.missing || row.provenance === "UNKNOWN" ? "fill-warn" : void 0,
					fontFamily: "var(--font-mono)",
					children: cell
				}, `${row.id}-${ci}`)) }, row.id);
			})
		]
	});
}
function Receptacle({ x, y, gfi }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		transform: `translate(${x},${y})`,
		className: "text-muted",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				r: "5.5",
				fill: "var(--color-bg)",
				stroke: "currentColor",
				strokeWidth: "1.1"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "-2.4",
				y1: "-2.2",
				x2: "-2.4",
				y2: "2.2",
				stroke: "currentColor",
				strokeWidth: "1.1"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "2.4",
				y1: "-2.2",
				x2: "2.4",
				y2: "2.2",
				stroke: "currentColor",
				strokeWidth: "1.1"
			}),
			gfi ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "0",
				y: "14",
				textAnchor: "middle",
				fontSize: "6",
				className: "fill-fg",
				children: "GFI"
			}) : null
		]
	});
}
function CeilingLight({ x, y }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		transform: `translate(${x},${y})`,
		className: "text-muted",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				r: "6",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "-9",
				y1: "0",
				x2: "9",
				y2: "0",
				stroke: "currentColor",
				strokeWidth: "0.8"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "0",
				y1: "-9",
				x2: "0",
				y2: "9",
				stroke: "currentColor",
				strokeWidth: "0.8"
			})
		]
	});
}
function OpenerMark({ x, y }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: x - 11,
			y: y - 7,
			width: "22",
			height: "14",
			fill: "var(--color-bg)",
			stroke: "currentColor"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x,
			y: y + 3,
			textAnchor: "middle",
			fontSize: "7",
			className: "fill-fg",
			children: "GO"
		})]
	});
}
function SwitchMark({ x, y, label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
		x,
		y,
		fontSize: "9",
		className: "fill-fg",
		fontFamily: "var(--font-mono)",
		children: label
	});
}
function pointerSvg(event, node) {
	const svg = "ownerSVGElement" in node ? node.ownerSVGElement : null;
	if (!svg) return {
		x: event.clientX,
		y: event.clientY
	};
	const ctm = svg.getScreenCTM();
	if (!ctm) return {
		x: event.clientX,
		y: event.clientY
	};
	const pt = svg.createSVGPoint();
	pt.x = event.clientX;
	pt.y = event.clientY;
	const mapped = pt.matrixTransform(ctm.inverse());
	return {
		x: mapped.x,
		y: mapped.y
	};
}
function EmptySheet({ label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "48",
				y: "48",
				width: "620",
				height: "500",
				fill: "none",
				stroke: "currentColor",
				strokeDasharray: "6 4"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "358",
				y: "250",
				textAnchor: "middle",
				fontSize: "16",
				className: "fill-fg",
				fontFamily: "var(--font-display)",
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "358",
				y: "276",
				textAnchor: "middle",
				fontSize: "12",
				children: "Howler will not invent a size. Tell it the envelope, or enter width × depth."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "358",
				y: "298",
				textAnchor: "middle",
				fontSize: "11",
				children: "Or: Use the Tradewalk plans"
			})
		]
	});
}
function dimTone(provenance) {
	if (provenance === "UNKNOWN") return {
		dash: "4 2",
		warn: true,
		suffix: provenanceSuffix(provenance)
	};
	if (provenance === "PROPOSED") return {
		dash: "3 2",
		warn: false,
		suffix: provenanceSuffix(provenance)
	};
	if (provenance === "INFERRED") return {
		suffix: provenanceSuffix(provenance),
		warn: false
	};
	return {
		suffix: "",
		warn: false
	};
}
function dimHorizontal(x1, x2, y, fromY, label, onClick, provenance) {
	const mid = (x1 + x2) / 2;
	const tone = dimTone(provenance);
	const text = `${label}${tone.suffix}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: onClick ? "text-muted cursor-pointer" : "text-muted",
		onClick,
		role: onClick ? "button" : void 0,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1,
				y1: fromY,
				x2: x1,
				y2: y,
				stroke: "currentColor",
				strokeWidth: "0.6",
				strokeDasharray: tone.dash
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: x2,
				y1: fromY,
				x2,
				y2: y,
				stroke: "currentColor",
				strokeWidth: "0.6",
				strokeDasharray: tone.dash
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1,
				y1: y,
				x2,
				y2: y,
				stroke: "currentColor",
				strokeWidth: "0.9",
				strokeDasharray: tone.dash
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: x1 - 3,
				y1: y - 3,
				x2: x1 + 3,
				y2: y + 3,
				stroke: "currentColor",
				strokeWidth: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: x2 - 3,
				y1: y - 3,
				x2: x2 + 3,
				y2: y + 3,
				stroke: "currentColor",
				strokeWidth: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: mid - 42,
				y: y - 9,
				width: "84",
				height: "12",
				fill: "var(--color-bg)"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: mid,
				y: y + 3,
				textAnchor: "middle",
				fontSize: "10",
				className: tone.warn ? "fill-warn" : "fill-fg",
				fontFamily: "var(--font-mono)",
				children: text
			})
		]
	});
}
function dimVertical(x, y1, y2, fromX, label, onClick, provenance) {
	const mid = (y1 + y2) / 2;
	const tone = dimTone(provenance);
	const text = `${label}${tone.suffix}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: onClick ? "text-muted cursor-pointer" : "text-muted",
		onClick,
		role: onClick ? "button" : void 0,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: fromX,
				y1,
				x2: x,
				y2: y1,
				stroke: "currentColor",
				strokeWidth: "0.6",
				strokeDasharray: tone.dash
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: fromX,
				y1: y2,
				x2: x,
				y2,
				stroke: "currentColor",
				strokeWidth: "0.6",
				strokeDasharray: tone.dash
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: x,
				y1,
				x2: x,
				y2,
				stroke: "currentColor",
				strokeWidth: "0.9",
				strokeDasharray: tone.dash
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: x - 3,
				y1: y1 - 3,
				x2: x + 3,
				y2: y1 + 3,
				stroke: "currentColor",
				strokeWidth: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: x - 3,
				y1: y2 - 3,
				x2: x + 3,
				y2: y2 + 3,
				stroke: "currentColor",
				strokeWidth: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: x - 8,
				y: mid,
				textAnchor: "middle",
				fontSize: "10",
				className: tone.warn ? "fill-warn" : "fill-fg",
				fontFamily: "var(--font-mono)",
				transform: `rotate(-90 ${x - 8} ${mid})`,
				children: text
			})
		]
	});
}
function openingOnWall(wall, opening, box, s, t) {
	const { x, y, w, d } = box;
	if (wall === "FRONT") {
		const ox = x + opening.offsetIn * s;
		const ow = opening.widthIn * s;
		return {
			x1: ox,
			y1: y + d - t,
			x2: ox + ow,
			y2: y + d,
			cx: ox + ow / 2,
			cy: y + d
		};
	}
	if (wall === "BACK") {
		const ox = x + opening.offsetIn * s;
		const ow = opening.widthIn * s;
		return {
			x1: ox,
			y1: y,
			x2: ox + ow,
			y2: y + t,
			cx: ox + ow / 2,
			cy: y
		};
	}
	if (wall === "LEFT") {
		const oy = y + opening.offsetIn * s;
		const oh = opening.widthIn * s;
		return {
			x1: x,
			y1: oy,
			x2: x + t,
			y2: oy + oh,
			cx: x,
			cy: oy + oh / 2
		};
	}
	const oy = y + opening.offsetIn * s;
	const oh = opening.widthIn * s;
	return {
		x1: x + w - t,
		y1: oy,
		x2: x + w,
		y2: oy + oh,
		cx: x + w,
		cy: oy + oh / 2
	};
}
function OpeningMark({ opening, box, s, t, mark }) {
	const geom = openingOnWall(opening.wall, opening, box, s, t);
	const isHoriz = opening.wall === "FRONT" || opening.wall === "BACK";
	const bg = "var(--color-bg)";
	const tag = mark ?? opening.tag ?? openingLabel(opening);
	const tagX = geom.cx;
	const tagY = isHoriz ? opening.wall === "FRONT" ? geom.cy + 22 : geom.cy - 16 : geom.cy + (opening.wall === "LEFT" ? 0 : 0);
	const tagShiftX = isHoriz ? 0 : opening.wall === "LEFT" ? -18 : 18;
	if (opening.kind === "OHD") {
		const track = opening.wall === "FRONT" ? `M ${geom.x1} ${geom.y1} L ${geom.x1} ${geom.y1 - 18} L ${geom.x2} ${geom.y1 - 18} L ${geom.x2} ${geom.y1}` : opening.wall === "BACK" ? `M ${geom.x1} ${geom.y2} L ${geom.x1} ${geom.y2 + 18} L ${geom.x2} ${geom.y2 + 18} L ${geom.x2} ${geom.y2}` : "";
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
			className: "text-muted",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: geom.x1,
					y: geom.y1,
					width: geom.x2 - geom.x1,
					height: geom.y2 - geom.y1,
					fill: bg
				}),
				track ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
					d: track,
					fill: "none",
					stroke: "currentColor",
					strokeDasharray: "3 2",
					strokeWidth: "1"
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: geom.cx,
					y: opening.wall === "FRONT" ? geom.cy + 14 : geom.cy - 8,
					textAnchor: "middle",
					fontSize: "9",
					className: "fill-fg",
					fontFamily: "var(--font-mono)",
					children: openingLabel(opening)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TagBubble, {
					mark: tag,
					x: tagX + tagShiftX,
					y: tagY
				})
			]
		});
	}
	if (opening.kind === "MAN") {
		const swing = isHoriz ? `M ${geom.x1} ${opening.wall === "FRONT" ? geom.y1 : geom.y2} A ${opening.widthIn * s} ${opening.widthIn * s} 0 0 ${opening.wall === "FRONT" ? 0 : 1} ${geom.x1} ${opening.wall === "FRONT" ? geom.y1 - opening.widthIn * s : geom.y2 + opening.widthIn * s}` : `M ${opening.wall === "LEFT" ? geom.x2 : geom.x1} ${geom.y1} A ${opening.widthIn * s} ${opening.widthIn * s} 0 0 ${opening.wall === "LEFT" ? 1 : 0} ${opening.wall === "LEFT" ? geom.x2 + opening.widthIn * s : geom.x1 - opening.widthIn * s} ${geom.y1}`;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
			className: "text-muted",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: geom.x1,
					y: geom.y1,
					width: Math.max(2, geom.x2 - geom.x1),
					height: Math.max(2, geom.y2 - geom.y1),
					fill: bg
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
					d: swing,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "0.9"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TagBubble, {
					mark: tag,
					x: tagX + tagShiftX,
					y: tagY
				})
			]
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: geom.x1,
				y: geom.y1,
				width: Math.max(2, geom.x2 - geom.x1),
				height: Math.max(2, geom.y2 - geom.y1),
				fill: bg
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: geom.x1 + 1,
				y: geom.y1 + 1,
				width: Math.max(1, geom.x2 - geom.x1 - 2),
				height: Math.max(1, geom.y2 - geom.y1 - 2),
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "0.75"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TagBubble, {
				mark: tag,
				x: tagX + tagShiftX,
				y: isHoriz ? tagY : geom.cy
			})
		]
	});
}
function NotesColumn({ bp, x, y }) {
	const trade = citesTradewalk(bp);
	const openings = resolveOpenings(bp);
	const ohd = openings.filter((item) => item.kind === "OHD");
	const lines = trade ? [
		"GENERAL NOTES — TRADEWALK",
		"1. Working drawing citing A01–A08. Not PE-sealed.",
		"2. Dimensions govern. Do not scale the sheet.",
		`3. L-shape ${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)} (A01).`,
		`4. Mower shed ${formatFtIn(TRADEWALK.shedWidthIn)} × ${formatFtIn(TRADEWALK.shedDepthIn)}.`,
		"5. 2x4 walls, brick veneer, 1\" air, Tyvek (A06).",
		"6. 2x12 joists @ 16\" O.C. — LVL splits span (A07).",
		"7. 2x8 rafters @ 16\" O.C., 8/12 (A08).",
		"8. 12x24 footing, brick-ledge CMU (A03/A06).",
		"9. Murphy 1.75×20 LVL B1/B2/B3 PASSED.",
		ohd.length ? `10. ${ohd.length} OHD recorded.` : "10. Two OHD on A09 — leaf widths Unknown.",
		"11. A09 EV charger option · outlets per code.",
		"12. A11 half bath is an option — size Unknown.",
		"13. A01 tags SB3621 twice — 3'-6\"×2'-1\" window, wall Unknown. Not Simpson SSTB36."
	] : [
		"GENERAL NOTES",
		"1. Working drawing for field layout. Not PE-sealed.",
		"2. Dimensions govern. Do not scale the sheet.",
		`3. Walls drawn ${bp.studSize ? bp.studSize : "2x6 conven."} + sheathing.`,
		`4. Studs ${bp.studSize ?? "size Unknown"} @ ${bp.studSpacingIn ?? "—"}" O.C.`,
		`5. Joists ${bp.joistSize ?? "Unknown"} @ ${bp.joistSpacingIn ?? "—"}" O.C.`,
		`6. Roof ${bp.roofStyle ?? "gable"} ${bp.roofRise && bp.roofRun ? `${bp.roofRise}/${bp.roofRun}` : "pitch Unknown"}.`,
		`7. Overhang ${formatFtIn(bp.overhangIn)}.`,
		"8. Frost / footing per AHJ. Do not guess.",
		openings.length ? `9. ${openings.length} opening(s) recorded.` : "9. No openings recorded yet."
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("g", {
		className: "text-muted",
		children: lines.map((line, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x,
			y: y + index * 12,
			fontSize: index === 0 ? 9 : 7.5,
			className: index === 0 ? "fill-fg" : void 0,
			children: line
		}, line))
	});
}
function partBox(originX, originY, s, part) {
	return {
		x: originX + part.xIn * s,
		y: originY + part.yIn * s,
		w: part.wIn * s,
		d: part.dIn * s
	};
}
function wallHost(parts, wall) {
	if (parts.length === 0) return {
		id: "envelope",
		name: "",
		xIn: 0,
		yIn: 0,
		wIn: 0,
		dIn: 0
	};
	if (wall === "FRONT") return parts.reduce((a, b) => a.yIn + a.dIn >= b.yIn + b.dIn ? a : b);
	if (wall === "BACK") return parts.reduce((a, b) => a.yIn <= b.yIn ? a : b);
	if (wall === "LEFT") return parts.reduce((a, b) => a.xIn <= b.xIn ? a : b);
	return parts.reduce((a, b) => a.xIn + a.wIn >= b.xIn + b.wIn ? a : b);
}
function DoubleRect({ x, y, w, d, t, hatch }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
		d: `M ${x} ${y} h ${w} v ${d} h ${-w} z M ${x + t} ${y + t} h ${w - 2 * t} v ${d - 2 * t} h ${-(w - 2 * t)} z`,
		fill: "currentColor",
		fillOpacity: "0.16",
		fillRule: "evenodd",
		stroke: "currentColor",
		strokeWidth: "1.6"
	}), hatch ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
		x: x + t,
		y: y + t,
		width: Math.max(0, w - 2 * t),
		height: Math.max(0, d - 2 * t),
		fill: hatch,
		className: "text-subtle"
	}) : null] });
}
function PlanView({ bp, level, scaleId, editable, onSelectDim, onRoomDrag, compact }) {
	if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: `Level ${level} — envelope Unknown` });
	const width = bp.widthIn;
	const depth = bp.depthIn;
	const { x, y, w, d, s, fits } = planLayout(width, depth, scaleId, {
		x: 56,
		y: 36,
		w: compact ? 600 : 430,
		h: compact ? 460 : 400
	});
	const t = wallThicknessIn(bp) * s;
	const parts = planParts(bp, level);
	const lShape = isLFootprint(bp, level);
	const rooms = Object.values(bp.rooms).filter((room) => room.level === level);
	const openings = resolveOpenings(bp).filter((item) => level === 1 ? true : item.kind === "WINDOW");
	const trade = citesTradewalk(bp);
	const hasOhd = openings.some((item) => item.kind === "OHD");
	const schedule = openingSchedule(bp);
	const markById = new Map(schedule.filter((row) => !row.missing).map((row) => [row.id, row.mark]));
	const envelopeProv = bp.envelopeProvenance ?? "UNKNOWN";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		!fits ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x: "56",
			y: "24",
			fontSize: "10",
			className: "fill-warn",
			children: [
				"Envelope does not fit at ",
				scaleLabel(scaleId),
				". Switch scale or use Fit to sheet."
			]
		}) : null,
		lShape ? parts.map((part) => {
			const box = partBox(x, y, s, part);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DoubleRect, {
					x: box.x,
					y: box.y,
					w: box.w,
					d: box.d,
					t,
					hatch: `url(#slab-L${level})`
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: box.x + box.w / 2,
					y: box.y + box.d / 2 - 6,
					textAnchor: "middle",
					fontSize: "12",
					className: "fill-fg",
					fontFamily: "var(--font-display)",
					children: part.name.toUpperCase()
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: box.x + box.w / 2,
					y: box.y + box.d / 2 + 10,
					textAnchor: "middle",
					fontSize: "9",
					fontFamily: "var(--font-mono)",
					className: "text-muted",
					children: [
						formatFtIn(part.wIn),
						" × ",
						formatFtIn(part.dIn)
					]
				})
			] }, part.id);
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DoubleRect, {
			x,
			y,
			w,
			d,
			t,
			hatch: `url(#slab-L${level})`
		}),
		openings.map((opening) => {
			const host = wallHost(parts, opening.wall);
			const box = partBox(x, y, s, host);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpeningMark, {
				opening,
				box,
				s,
				t,
				mark: markById.get(opening.id)
			}, opening.id);
		}),
		lShape ? null : rooms.map((room) => {
			if (room.widthIn && room.depthIn && room.originXIn != null && room.originYIn != null) {
				if (room.originXIn === 0 && room.originYIn === 0 && room.widthIn === width && room.depthIn === depth) return null;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoomShape, {
					roomId: room.id,
					name: room.name,
					x: x + room.originXIn * s,
					y: y + room.originYIn * s,
					w: room.widthIn * s,
					d: room.depthIn * s,
					s,
					originXIn: room.originXIn,
					originYIn: room.originYIn,
					widthIn: room.widthIn,
					depthIn: room.depthIn,
					envelope: {
						x,
						y,
						w,
						d,
						widthIn: width,
						depthIn: depth
					},
					editable,
					onSelectDim,
					onRoomDrag
				}, room.id);
			}
			return null;
		}),
		!lShape ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: x + w / 2,
			y: y + d / 2 - 6,
			textAnchor: "middle",
			fontSize: "13",
			className: "fill-fg",
			fontFamily: "var(--font-display)",
			children: rooms.find((room) => room.widthIn && room.depthIn)?.name ?? (level === 1 ? "GARAGE" : "LEVEL 2")
		}) : null,
		rooms.filter((room) => !(room.widthIn && room.depthIn)).length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x: x + t + 8,
			y: y + d - t - 8,
			fontSize: "9",
			className: "fill-warn",
			children: [
				"Size Unknown:",
				" ",
				rooms.filter((room) => !(room.widthIn && room.depthIn)).map((room) => room.name).join(" · ")
			]
		}) : null,
		trade && !hasOhd && level === 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("g", {
			className: "text-muted",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: x + w * .35,
				y: y + d - 10,
				textAnchor: "middle",
				fontSize: "7",
				className: "fill-warn",
				children: "2 GARAGE DOOR OPENERS (A09) — leaf widths Unknown"
			})
		}) : null,
		trade && level === 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
			className: "text-muted",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: x - 70,
					y: y + 8,
					width: "62",
					height: d * .42,
					fill: "none",
					stroke: "currentColor",
					strokeDasharray: "5 3"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: x - 39,
					y: y + d * .22,
					textAnchor: "middle",
					fontSize: "7",
					children: "EXISTING"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: x - 39,
					y: y + d * .22 + 10,
					textAnchor: "middle",
					fontSize: "7",
					children: "HOUSE"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: x - 39,
					y: y + d * .22 + 20,
					textAnchor: "middle",
					fontSize: "6",
					children: "size not on set"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: x - 70,
					y: y + d * .52,
					width: "62",
					height: d * .28,
					fill: "none",
					stroke: "currentColor",
					strokeDasharray: "5 3"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: x - 39,
					y: y + d * .64,
					textAnchor: "middle",
					fontSize: "7",
					children: "EXISTING"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: x - 39,
					y: y + d * .64 + 10,
					textAnchor: "middle",
					fontSize: "7",
					children: "GARAGE"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: x + 14,
					y: y + 18,
					fontSize: "8",
					className: "fill-warn",
					children: "STAIRWELL DN — run Unknown"
				})
			]
		}) : null,
		dimHorizontal(x, x + w, y + d + 28, y + d, formatFtIn(width), editable ? () => onSelectDim?.({ kind: "width" }) : void 0, envelopeProv),
		dimVertical(x - 28, y, y + d, x, formatFtIn(depth), editable ? () => onSelectDim?.({ kind: "depth" }) : void 0, envelopeProv),
		lShape ? parts.map((part) => {
			if (part.xIn === 0 && part.yIn === 0) return null;
			const box = partBox(x, y, s, part);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [dimHorizontal(box.x, box.x + box.w, box.y - 16, box.y, formatFtIn(part.wIn), void 0, "VERIFIED"), dimVertical(box.x + box.w + 16, box.y, box.y + box.d, box.x + box.w, formatFtIn(part.dIn), void 0, "VERIFIED")] }, `dim-${part.id}`);
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x,
			y: y + d + 42,
			fontSize: "7",
			className: "fill-fg",
			children: [
				"OVERALL ",
				DATUM_LABEL[bp.dimDatum ?? "FACE_FRAMING"],
				" · ",
				PROVENANCE_LABEL[envelopeProv]
			]
		}),
		trade ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x,
			y: y + d + 54,
			fontSize: "6.5",
			className: "text-muted",
			children: [
				"FRAMING ",
				formatFtIn(TRADEWALK.framingOuterWidthIn),
				" × ",
				formatFtIn(TRADEWALK.framingOuterDepthIn),
				" TO FACE OF FRAMING (A07)"
			]
		}) : null,
		!compact && level === 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionMarker, {
				x: x + w * .38,
				y1: y - 6,
				y2: y + d + 6,
				mark: "A",
				sheet: "A05"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ElevMarker, {
				x: x + w * .72,
				y: y + d + 6,
				face: "S",
				sheet: "A04"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ElevMarker, {
				x: x + w * .72,
				y: y - 6,
				face: "N",
				sheet: "A04"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ElevMarker, {
				x: x - 20,
				y: y + d * .22,
				face: "W",
				sheet: "A04"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ElevMarker, {
				x: x + w + 22,
				y: y + d * .22,
				face: "E",
				sheet: "A04"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 8,
				ax: x + 10,
				ay: y + 20,
				lx: x + 36,
				ly: y - 18
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: x + 44,
				y: y - 16,
				fontSize: "6.5",
				className: "fill-fg",
				children: "TYP WALL A06"
			})
		] }) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NorthArrow, {
			x: Math.min(x + w + 22, 470),
			y: y + 14
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GraphicScaleBar, {
			s,
			x,
			y: Math.min(y + d + 66, 548),
			maxFeet: Math.max(8, Math.round(width / 12))
		}),
		compact || trade ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NotesColumn, {
			bp,
			x: 520,
			y: 40
		}),
		!compact && trade && lShape && parts[0] && parts[1] && level === 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 1,
				ax: partBox(x, y, s, parts[0]).x + partBox(x, y, s, parts[0]).w / 2,
				ay: partBox(x, y, s, parts[0]).y + 24,
				lx: 500,
				ly: 58
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 2,
				ax: partBox(x, y, s, parts[1]).x + partBox(x, y, s, parts[1]).w / 2,
				ay: partBox(x, y, s, parts[1]).y + 18,
				lx: 500,
				ly: 72
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 3,
				ax: x + w * .35,
				ay: y + d,
				lx: 500,
				ly: 86
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 6,
				ax: x + 28,
				ay: y + d * .4,
				lx: 500,
				ly: 128
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeynoteLegend, {
				x: 488,
				y: 44,
				items: sheetNotes(bp, "L1")
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DesignCriteriaBlock, {
				bp,
				x: 488,
				y: 260
			})
		] }) : null,
		!compact && trade && level === 2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeynoteLegend, {
			x: 488,
			y: 44,
			items: sheetNotes(bp, "L2")
		}) : null,
		!compact && level === 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpeningScheduleTable, {
			bp,
			x: 24,
			y: Math.min(y + d + 82, 500)
		}) : null
	] });
}
function RoomShape({ roomId, name, x, y, w, d, s, originXIn, originYIn, widthIn, depthIn, envelope, editable, onSelectDim, onRoomDrag }) {
	const [live, setLive] = (0, import_react.useState)(null);
	const draw = live ?? {
		x,
		y,
		w,
		d
	};
	function start(kind, event) {
		if (!editable || !onRoomDrag) return;
		const commit = onRoomDrag;
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		const origin = pointerSvg(event, event.currentTarget);
		function move(ev) {
			const now = pointerSvg(ev, event.currentTarget);
			const dInX = (now.x - origin.x) / s;
			const dInY = (now.y - origin.y) / s;
			if (kind === "move") {
				const ox = Math.max(0, Math.min(envelope.widthIn - widthIn, originXIn + dInX));
				const oy = Math.max(0, Math.min(envelope.depthIn - depthIn, originYIn + dInY));
				setLive({
					x: envelope.x + ox * s,
					y: envelope.y + oy * s,
					w,
					d
				});
			} else {
				const nw = Math.max(24, Math.min(envelope.widthIn - originXIn, widthIn + dInX));
				const nd = Math.max(24, Math.min(envelope.depthIn - originYIn, depthIn + dInY));
				setLive({
					x,
					y,
					w: nw * s,
					d: nd * s
				});
			}
		}
		function up(ev) {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			const now = pointerSvg(ev, event.currentTarget);
			const dInX = (now.x - origin.x) / s;
			const dInY = (now.y - origin.y) / s;
			if (Math.hypot(dInX, dInY) < .75) {
				setLive(null);
				return;
			}
			if (kind === "move") {
				const ox = Math.round(Math.max(0, Math.min(envelope.widthIn - widthIn, originXIn + dInX)));
				const oy = Math.round(Math.max(0, Math.min(envelope.depthIn - depthIn, originYIn + dInY)));
				commit({
					roomId,
					originXIn: ox,
					originYIn: oy
				});
			} else {
				const nw = Math.round(Math.max(24, Math.min(envelope.widthIn - originXIn, widthIn + dInX)));
				const nd = Math.round(Math.max(24, Math.min(envelope.depthIn - originYIn, depthIn + dInY)));
				commit({
					roomId,
					originXIn,
					originYIn,
					widthIn: nw,
					depthIn: nd
				});
			}
			setLive(null);
		}
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: draw.x,
				y: draw.y,
				width: draw.w,
				height: draw.d,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1",
				strokeDasharray: "4 3",
				className: editable ? "cursor-grab" : void 0,
				onPointerDown: (event) => start("move", event)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: draw.x + draw.w / 2,
				y: draw.y + draw.d / 2,
				textAnchor: "middle",
				fontSize: "11",
				className: "fill-fg cursor-pointer",
				onClick: () => onSelectDim?.({
					kind: "room",
					roomId,
					field: "name"
				}),
				children: name
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
				x: draw.x + draw.w / 2,
				y: draw.y + draw.d / 2 + 14,
				textAnchor: "middle",
				fontSize: "9",
				className: editable ? "cursor-pointer fill-fg" : void 0,
				onClick: () => onSelectDim?.({
					kind: "room",
					roomId,
					field: "width"
				}),
				children: [
					formatFtIn(widthIn),
					" × ",
					formatFtIn(depthIn)
				]
			}),
			editable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: draw.x + draw.w - 8,
				y: draw.y + draw.d - 8,
				width: "10",
				height: "10",
				className: "fill-fg cursor-nwse-resize",
				onPointerDown: (event) => start("resize", event)
			}) : null
		]
	});
}
function MiniElevation({ bp, face, x, y, w, h }) {
	if (!bp.widthIn || !bp.depthIn || !bp.eaveHeightIn || !bp.roofRise || !bp.roofRun) return null;
	const span = face === "FRONT" || face === "BACK" ? bp.widthIn : bp.depthIn;
	const eave = bp.eaveHeightIn;
	const ridge = eave + (ridgeRiseIn(bp) ?? 0);
	const overhang = bp.overhangIn ?? 0;
	const used = Math.min(w / (span + 2 * overhang), (h - 28) / (ridge + 24));
	const wallW = span * used;
	const wall = eave * used;
	const peak = ridge * used;
	const oh = overhang * used;
	const gx = x + (w - wallW) / 2;
	const ground = y + h - 18;
	const eaveY = ground - wall;
	const peakY = ground - peak;
	const mid = gx + wallW / 2;
	const openings = resolveOpenings(bp).filter((item) => item.wall === face);
	const labels = {
		FRONT: "FRONT",
		BACK: "BACK",
		LEFT: "LEFT SIDE",
		RIGHT: "RIGHT SIDE"
	};
	const trade = citesTradewalk(bp);
	const matchNote = trade && (face === "FRONT" || face === "RIGHT" || face === "BACK" || face === "LEFT") ? face === "FRONT" || face === "RIGHT" ? "SOLDIER COURSE · QUOINS · EAVE RETURN TO MATCH EXISTING" : "SOLDIER COURSE · QUOINS TO MATCH EXISTING HOUSE" : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: x + w / 2,
			y: y + 12,
			textAnchor: "middle",
			fontSize: "9",
			className: "fill-fg",
			children: labels[face]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: x + 8,
			y1: ground,
			x2: x + w - 8,
			y2: ground,
			stroke: "currentColor",
			strokeWidth: "1.2"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("polygon", {
			points: `${gx - oh},${eaveY} ${mid},${peakY} ${gx + wallW + oh},${eaveY} ${gx + wallW},${eaveY} ${gx + wallW},${ground} ${gx},${ground} ${gx},${eaveY}`,
			fill: "color-mix(in oklab, var(--color-accent) 8%, transparent)",
			stroke: "currentColor",
			strokeWidth: "1.2"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: gx,
			y: eaveY,
			width: wallW,
			height: wall,
			fill: trade ? `url(#brick-EL)` : `url(#siding-EL)`,
			className: "text-subtle"
		}),
		trade ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
			className: "text-muted",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: gx,
					y: eaveY,
					width: wallW,
					height: Math.max(3, 8 * used),
					fill: "currentColor",
					fillOpacity: "0.35"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: gx,
					y: eaveY,
					width: Math.max(4, 6 * used),
					height: wall,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "0.7"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: gx + wallW - Math.max(4, 6 * used),
					y: eaveY,
					width: Math.max(4, 6 * used),
					height: wall,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "0.7"
				})
			]
		}) : null,
		openings.map((opening) => {
			const ox = gx + opening.offsetIn * used;
			const ow = opening.widthIn * used;
			const ohgt = (opening.heightIn ?? 84) * used;
			const sill = (opening.sillIn ?? 0) * used;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: ox,
				y: ground - sill - ohgt,
				width: ow,
				height: ohgt,
				fill: "var(--color-bg)",
				stroke: "currentColor",
				strokeWidth: "1"
			}, opening.id);
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: x + 10,
			y: eaveY + 12,
			fontSize: "7",
			className: "text-muted",
			children: formatFtIn(eave)
		}),
		matchNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: x + w / 2,
			y: ground + 12,
			textAnchor: "middle",
			fontSize: "6",
			className: "text-muted",
			children: matchNote
		}) : null
	] });
}
function ElevationView({ bp, scaleId, editable, onSelectDim }) {
	if (!envelopeComplete(bp) || bp.widthIn == null || !bp.eaveHeightIn || !bp.roofRise || !bp.roofRun) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: !bp.widthIn ? "Elevation — envelope Unknown" : !bp.eaveHeightIn ? "Wall height Unknown" : "Roof pitch Unknown — enter rise over run (8/12)" });
	const trade = citesTradewalk(bp);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniElevation, {
			bp,
			face: "FRONT",
			x: 40,
			y: 24,
			w: 320,
			h: 250
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniElevation, {
			bp,
			face: "RIGHT",
			x: 360,
			y: 24,
			w: 320,
			h: 250
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniElevation, {
			bp,
			face: "BACK",
			x: 40,
			y: 280,
			w: 320,
			h: 250
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniElevation, {
			bp,
			face: "LEFT",
			x: 360,
			y: 280,
			w: 320,
			h: 250
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
			className: "text-muted",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: "40",
				y: "548",
				fontSize: "8",
				children: trade ? "A04: soldier course, quoins, eave return to match existing. Brick veneer R703.8. Adjust shed height for grade." : `Scale ${scaleLabel(scaleId)} · click eave on Plans to edit ${formatFtIn(bp.eaveHeightIn)}.`
			}), editable ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
				x: "40",
				y: "562",
				fontSize: "8",
				className: "fill-fg cursor-pointer",
				onClick: () => onSelectDim?.({ kind: "eave" }),
				children: [
					"EAVE ",
					formatFtIn(bp.eaveHeightIn),
					" — click to edit"
				]
			}) : null]
		})
	] });
}
function FoundationView({ bp, scaleId }) {
	if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: "Foundation — envelope Unknown" });
	const width = bp.widthIn;
	const depth = bp.depthIn;
	const { x, y, w, d, s } = planLayout(width, depth, scaleId, {
		x: 56,
		y: 40,
		w: 430,
		h: 400
	});
	const parts = planParts(bp, 1);
	const lShape = isLFootprint(bp, 1);
	const trade = citesTradewalk(bp);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		(lShape ? parts : [{
			id: "env",
			name: "SLAB",
			xIn: 0,
			yIn: 0,
			wIn: width,
			dIn: depth
		}]).map((part) => {
			const box = partBox(x, y, s, part);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: box.x - 6,
					y: box.y - 6,
					width: box.w + 12,
					height: box.d + 12,
					fill: "none",
					stroke: "currentColor",
					strokeDasharray: "4 3",
					strokeWidth: "1"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: box.x,
					y: box.y,
					width: box.w,
					height: box.d,
					fill: `url(#slab-FDN)`,
					className: "text-subtle",
					stroke: "currentColor",
					strokeWidth: "1.4"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: box.x + box.w / 2,
					y: box.y + box.d / 2,
					textAnchor: "middle",
					fontSize: "11",
					className: "fill-fg",
					children: "SLAB"
				})
			] }, part.id);
		}),
		trade ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
			className: "text-muted",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: x + w * .42,
					y: y + d * .38,
					width: 24 * s,
					height: 24 * s,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "1.4"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: x + w * .42 + 12 * s,
					y: y + d * .38 - 6,
					textAnchor: "middle",
					fontSize: "8",
					className: "fill-fg",
					children: "2'×2'×2' PIER TO SUPPORT LVL (A03)"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: x + 8,
					y: y + d * .55,
					width: w * .18,
					height: "10",
					fill: "currentColor",
					fillOpacity: "0.2",
					stroke: "currentColor"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: x + 12,
					y: y + d * .55 + 22,
					fontSize: "8",
					children: "THICKEN PAD FOR WALL SUPPORTING FLOOR JOISTS (A03)"
				})
			]
		}) : null,
		dimHorizontal(x, x + w, y + d + 28, y + d, formatFtIn(width)),
		dimVertical(x - 28, y, y + d, x, formatFtIn(depth)),
		trade ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeynoteLegend, {
			x: 488,
			y: 48,
			items: sheetNotes(bp, "FDN")
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NotesColumn, {
			bp,
			x: 520,
			y: 40
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "56",
			y: "24",
			fontSize: "10",
			className: "fill-fg",
			children: trade ? "A03 FOUNDATION — 12x24 footing (dashed), slab, LVL pier. Place the pier on the recorded CL." : "Foundation — footing dashed. Frost Unknown unless entered."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GraphicScaleBar, {
			s,
			x,
			y: Math.min(y + d + 50, 540),
			maxFeet: Math.max(8, Math.round(width / 12))
		})
	] });
}
function BuildingSectionView({ bp }) {
	if (!envelopeComplete(bp) || bp.widthIn == null || !bp.eaveHeightIn || !bp.roofRise || !bp.roofRun) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: "Building section — envelope or pitch Unknown" });
	const span = bp.widthIn;
	const eave = bp.eaveHeightIn;
	const ridge = eave + (ridgeRiseIn(bp) ?? 0);
	const used = Math.min(560 / span, 360 / (ridge + 48));
	const x = 70;
	const ground = 500;
	const w = span * used;
	const wall = eave * used;
	const peak = ridge * used;
	const eaveY = ground - wall;
	const peakY = ground - peak;
	const mid = x + w / 2;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "40",
			y: ground,
			width: "620",
			height: "40",
			fill: `url(#earth-SEC)`,
			className: "text-subtle"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: "40",
			y1: ground,
			x2: "660",
			y2: ground,
			stroke: "currentColor",
			strokeWidth: "1.5"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x,
			y: eaveY,
			width: "10",
			height: wall,
			fill: `url(#cmu-SEC)`,
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: x + w - 10,
			y: eaveY,
			width: "10",
			height: wall,
			fill: `url(#cmu-SEC)`,
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x,
			y: 492,
			width: w,
			height: "8",
			fill: "currentColor",
			fillOpacity: "0.2"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: x,
			y1: eaveY,
			x2: mid,
			y2: peakY,
			stroke: "currentColor",
			strokeWidth: "1.6"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: x + w,
			y1: eaveY,
			x2: mid,
			y2: peakY,
			stroke: "currentColor",
			strokeWidth: "1.6"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: 80,
			y1: eaveY + 8,
			x2: x + w - 10,
			y2: eaveY + 8,
			stroke: "currentColor",
			strokeWidth: "2.2"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x: mid,
			y: eaveY + 22,
			textAnchor: "middle",
			fontSize: "9",
			className: "fill-fg",
			children: [
				bp.joistSize ?? "JOISTS",
				" @ ",
				bp.joistSpacingIn ?? "—",
				"\" O.C."
			]
		}),
		dimVertical(46, ground, eaveY, x, `EAVE ${formatFtIn(eave)}`),
		dimVertical(22, ground, peakY, x, `RIDGE ${formatFtIn(ridge)}`),
		dimHorizontal(x, x + w, 522, ground, formatFtIn(span)),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x: "70",
			y: "36",
			fontSize: "11",
			className: "fill-fg",
			children: [
				"BUILDING SECTION — ",
				bp.roofRise,
				"/",
				bp.roofRun,
				" · ",
				bp.studSize ?? "studs Unknown",
				" · working drawing"
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "70",
			y: "52",
			fontSize: "9",
			className: "text-muted",
			children: citesTradewalk(bp) ? "A05: 10'-0\" first-floor walls (Stanfield + A05). 2x12 floor, 2x8 rafters. Not a PE stamp." : "Cut through the envelope. AHJ governs frost and footing."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StairLimitsBlock, {
			bp,
			x: 488,
			y: 48
		})
	] });
}
function WallSectionView({ bp }) {
	const trade = citesTradewalk(bp);
	const ground = 430;
	const eave = 250;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x: "48",
			y: "32",
			fontSize: "12",
			className: "fill-fg",
			fontFamily: "var(--font-display)",
			children: ["WALL SECTION DETAIL ", trade ? "— A06 RECORDED ASSEMBLY" : ""]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "48",
			y: "48",
			fontSize: "9",
			className: "text-muted",
			children: "NTS (detail). Layers from the Tradewalk wall section — not guessed."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "40",
			y: ground,
			width: "280",
			height: "90",
			fill: `url(#earth-WALL)`,
			className: "text-subtle"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: "40",
			y1: ground,
			x2: "360",
			y2: ground,
			stroke: "currentColor",
			strokeWidth: "1.4"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "110",
			y: 438,
			width: "72",
			height: "36",
			fill: "currentColor",
			fillOpacity: "0.18",
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "146",
			y: 460,
			textAnchor: "middle",
			fontSize: "8",
			className: "fill-fg",
			children: "12x24 FTNG"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "122",
			y: 378,
			width: "36",
			height: "60",
			fill: `url(#cmu-WALL)`,
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "158",
			y: 378,
			width: "16",
			height: "22",
			fill: `url(#cmu-WALL)`,
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "190",
			y: 400,
			fontSize: "8",
			children: "12\" BLOCK BRICK LEDGE + 8\" TOP"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "70",
			y: 422,
			width: "52",
			height: "8",
			fill: "currentColor",
			fillOpacity: "0.25"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "70",
			y: ground,
			width: "52",
			height: "10",
			fill: `url(#gravel-WALL)`
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "48",
			y: 458,
			fontSize: "7",
			children: "4\" GRAVEL · VAPOR · SLAB"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "96",
			cy: 448,
			r: "5",
			fill: "none",
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "48",
			y: 478,
			fontSize: "7",
			children: "4\" HDPE DRAIN + FABRIC"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "148",
			y: eave,
			width: "8",
			height: 128,
			fill: `url(#brick-WALL)`,
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "140",
			y: eave,
			width: "8",
			height: 128,
			fill: "none",
			stroke: "currentColor",
			strokeDasharray: "2 2"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "132",
			y: eave,
			width: "8",
			height: 128,
			fill: `url(#batt-WALL)`,
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "118",
			y: eave,
			width: "14",
			height: 128,
			fill: "currentColor",
			fillOpacity: "0.12",
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "118",
			y: eave,
			width: "38",
			height: "8",
			fill: "currentColor",
			fillOpacity: "0.35"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "190",
			y: 270,
			fontSize: "8",
			children: "DBL TOP PLATE"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "190",
			y: 286,
			fontSize: "8",
			children: "2x4 EXTERIOR WALL · R-13 MIN."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "190",
			y: 300,
			fontSize: "8",
			children: "SHEATHING · TYVEK · 1\" AIR GAP"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "190",
			y: 314,
			fontSize: "8",
			children: "BRICK + METAL TIES 16\" V / 16\" H"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: "80",
			y1: 260,
			x2: "250",
			y2: 260,
			stroke: "currentColor",
			strokeWidth: "2"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "190",
			y: eave,
			fontSize: "8",
			className: "fill-fg",
			children: "2x12 FLOOR JOISTS 16\" O.C. · R-19 MIN."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: "118",
			y1: eave,
			x2: "210",
			y2: 160,
			stroke: "currentColor",
			strokeWidth: "1.5"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "220",
			y: 176,
			fontSize: "8",
			children: "2x8 RAFTERS 16\" O.C. · 8/12 · R-38 MIN."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "190",
			y: 370,
			fontSize: "8",
			children: "TREATED SILL · CAST-IN-PLACE AB"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: "190",
			y: 384,
			fontSize: "8",
			children: "VERT. REBAR IN GROUT-FILLED CORE"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 1,
			ax: 146,
			ay: 450,
			lx: 400,
			ly: 86
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 2,
			ax: 96,
			ay: 448,
			lx: 400,
			ly: 100
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 3,
			ax: 140,
			ay: 390,
			lx: 400,
			ly: 114
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 4,
			ax: 125,
			ay: 314,
			lx: 400,
			ly: 128
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 5,
			ax: 144,
			ay: 314,
			lx: 400,
			ly: 142
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 6,
			ax: 152,
			ay: 270,
			lx: 400,
			ly: 156
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 7,
			ax: 160,
			ay: 258,
			lx: 400,
			ly: 170
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 8,
			ax: 200,
			ay: 168,
			lx: 400,
			ly: 184
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeynoteLegend, {
			x: 388,
			y: 72,
			title: "A06 ASSEMBLY — FOLLOW THE LAYERS",
			items: sheetNotes(bp, "WALL")
		})
	] });
}
function RoofView({ bp, scaleId }) {
	if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: "Roof plan — envelope Unknown" });
	if (!bp.roofRise || !bp.roofRun) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: "Roof plan — pitch Unknown. Enter rise over run (8/12)." });
	const width = bp.widthIn;
	const depth = bp.depthIn;
	const oh = bp.overhangIn ?? 0;
	const { x, y, w, d, s } = planLayout(width + 2 * oh, depth + 2 * oh, scaleId, {
		x: 56,
		y: 40,
		w: 430,
		h: 360
	});
	const inner = {
		x: x + oh * s,
		y: y + oh * s,
		w: width * s,
		d: depth * s
	};
	const spacing = bp.rafterSpacingIn ?? 24;
	const marks = stations(depth, spacing);
	const ridgeY = inner.y + inner.d / 2;
	const parts = planParts(bp, 1);
	const lShape = isLFootprint(bp, 1);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x,
			y,
			width: w,
			height: d,
			fill: "none",
			stroke: "currentColor",
			strokeDasharray: "4 3",
			strokeWidth: "1"
		}),
		lShape ? parts.map((part) => {
			const box = partBox(inner.x, inner.y, s, part);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: box.x,
				y: box.y,
				width: box.w,
				height: box.d,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.5"
			}, part.id);
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: inner.x,
			y: inner.y,
			width: inner.w,
			height: inner.d,
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "1.5"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: inner.x,
			y1: ridgeY,
			x2: inner.x + inner.w,
			y2: ridgeY,
			stroke: "currentColor",
			strokeWidth: "2"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x: inner.x + inner.w / 2,
			y: ridgeY - 6,
			textAnchor: "middle",
			fontSize: "10",
			className: "fill-fg",
			children: [
				"RIDGE · rise ",
				formatFtIn(ridgeRiseIn(bp)),
				" · ",
				bp.roofRise,
				"/",
				bp.roofRun
			]
		}),
		marks.map((station, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: inner.x,
			y1: inner.y + station * s,
			x2: inner.x + inner.w,
			y2: inner.y + station * s,
			stroke: "currentColor",
			strokeWidth: "0.7",
			className: "text-muted"
		}, index)),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x: inner.x + 8,
			y: inner.y + 16,
			fontSize: "9",
			className: "fill-fg",
			children: [
				"Rafters ",
				bp.rafterSize ?? "size Unknown",
				" @ ",
				spacing,
				"\" O.C. · ",
				memberCount(depth, spacing),
				" each slope"
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
			x: inner.x + 8,
			y: inner.y + inner.d - 10,
			fontSize: "9",
			className: "text-muted",
			children: [
				"Overhang ",
				formatFtIn(oh),
				" (dashed) · slope length ",
				formatFtIn(rafterLengthIn(bp)),
				citesTradewalk(bp) ? " · A04: adjust shed height for grade" : ""
			]
		}),
		dimHorizontal(inner.x, inner.x + inner.w, inner.y + inner.d + 36, inner.y + inner.d, formatFtIn(width)),
		dimVertical(inner.x - 28, inner.y, inner.y + inner.d, inner.x, formatFtIn(depth)),
		citesTradewalk(bp) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeynoteLegend, {
			x: 488,
			y: 48,
			items: sheetNotes(bp, "ROOF")
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NotesColumn, {
			bp,
			x: 520,
			y: 40
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GraphicScaleBar, {
			s,
			x: 56,
			y: 520,
			maxFeet: Math.max(8, Math.round(width / 12))
		})
	] });
}
function JoistView({ bp, scaleId }) {
	if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: "Joist layout — envelope Unknown" });
	const span = joistSpanIn(bp);
	const spacing = bp.joistSpacingIn;
	const { x, y, w, d, s } = planLayout(bp.widthIn, bp.depthIn, scaleId, {
		x: 40,
		y: 52,
		w: 420,
		h: 360
	});
	const allowedJoist = bp.joistSize && bp.joistSpacingIn ? tabulatedJoistSpanIn(bp.joistSize, bp.joistSpacingIn) : null;
	const over = span != null && allowedJoist != null && span > allowedJoist;
	const thick = Math.max(1.3, lumberThicknessIn() * s);
	const parts = planParts(bp, 1);
	const lShape = isLFootprint(bp, 1);
	const trade = citesTradewalk(bp);
	const alongDepth = bp.joistDirection !== "DEPTH";
	const bodies = lShape ? parts : [{
		id: "env",
		name: "JOISTS",
		xIn: 0,
		yIn: 0,
		wIn: bp.widthIn,
		dIn: bp.depthIn
	}];
	const first = bodies[0];
	const firstBox = first ? partBox(x, y, s, first) : null;
	const firstMarks = first && spacing ? stations(alongDepth ? first.dIn : first.wIn, spacing) : [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		bodies.map((part) => {
			const box = partBox(x, y, s, part);
			const run = alongDepth ? part.dIn : part.wIn;
			const marks = spacing ? stations(run, spacing) : [];
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: box.x,
					y: box.y,
					width: box.w,
					height: box.d,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2"
				}),
				marks.map((station, index) => alongDepth ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: box.x,
					y: box.y + station * s - thick / 2,
					width: box.w,
					height: thick,
					fill: "currentColor",
					fillOpacity: "0.82"
				}, index) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: box.x + station * s - thick / 2,
					y: box.y,
					width: thick,
					height: box.d,
					fill: "currentColor",
					fillOpacity: "0.82"
				}, index)),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
					x: box.x + 8,
					y: box.y + 14,
					fontSize: "8",
					className: "fill-fg",
					children: [
						part.name.toUpperCase(),
						" · ",
						marks.length,
						" ",
						bp.joistSize ?? "joists"
					]
				})
			] }, part.id);
		}),
		spacing && firstBox && firstMarks.length >= 2 ? dimVertical(firstBox.x - 22, firstBox.y + firstMarks[0] * s, firstBox.y + firstMarks[1] * s, firstBox.x, `${spacing}" O.C. TYP.`) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: x + w / 2,
			y: y + d / 2,
			textAnchor: "middle",
			fontSize: "12",
			className: "fill-warn",
			children: "Joist spacing Unknown — enter 16 on center"
		}),
		trade && firstBox ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
			className: "text-muted",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
					x1: firstBox.x + firstBox.w * .42,
					y1: firstBox.y,
					x2: firstBox.x + firstBox.w * .42,
					y2: firstBox.y + firstBox.d,
					stroke: "currentColor",
					strokeWidth: "3.2"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
					n: 1,
					ax: firstBox.x + firstBox.w * .42,
					ay: firstBox.y + 24,
					lx: 500,
					ly: 70
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
					n: 2,
					ax: firstBox.x + firstBox.w * .42,
					ay: firstBox.y + firstBox.d * .55,
					lx: 500,
					ly: 84
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
					cx: firstBox.x + firstBox.w * .42,
					cy: firstBox.y + firstBox.d * .72,
					r: "7",
					fill: "none",
					stroke: "currentColor",
					strokeDasharray: "3 2"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
					n: 3,
					ax: firstBox.x + firstBox.w * .42,
					ay: firstBox.y + firstBox.d * .72,
					lx: 500,
					ly: 98
				})
			]
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeynoteLegend, {
			x: 488,
			y: 56,
			items: [...sheetNotes(bp, "JOIST"), over ? `Unsplit ${formatFtIn(span)} exceeds table ${formatFtIn(allowedJoist)} · Table R502.3.1(2)` : `Unsplit ${formatFtIn(span)} vs table ${formatFtIn(allowedJoist)} · Table R502.3.1(2)`]
		}),
		dimHorizontal(x, x + w, y + d + 28, y + d, formatFtIn(bp.widthIn)),
		dimVertical(x - 36, y, y + d, x, formatFtIn(bp.depthIn)),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GraphicScaleBar, {
			s,
			x,
			y: Math.min(y + d + 50, 560),
			maxFeet: Math.max(8, Math.round(bp.widthIn / 12))
		})
	] });
}
function wallStudTicks(box, s, spacing, t) {
	const top = stations(box.w / s, spacing);
	const side = stations(box.d / s, spacing);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
		className: "text-muted",
		children: [
			top.map((st, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: box.x + st * s,
				y1: box.y,
				x2: box.x + st * s,
				y2: box.y + t,
				stroke: "currentColor",
				strokeWidth: "1.15"
			}, `t${index}`)),
			top.map((st, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: box.x + st * s,
				y1: box.y + box.d,
				x2: box.x + st * s,
				y2: box.y + box.d - t,
				stroke: "currentColor",
				strokeWidth: "1.15"
			}, `b${index}`)),
			side.map((st, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: box.x,
				y1: box.y + st * s,
				x2: box.x + t,
				y2: box.y + st * s,
				stroke: "currentColor",
				strokeWidth: "1.15"
			}, `l${index}`)),
			side.map((st, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: box.x + box.w,
				y1: box.y + st * s,
				x2: box.x + box.w - t,
				y2: box.y + st * s,
				stroke: "currentColor",
				strokeWidth: "1.15"
			}, `r${index}`))
		]
	});
}
function StudView({ bp, scaleId }) {
	if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: "Wall framing — envelope Unknown" });
	if (!bp.studSpacingIn) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: "Stud spacing Unknown — enter 16 on center" });
	const spacing = bp.studSpacingIn;
	const { x, y, s } = planLayout(bp.widthIn, bp.depthIn, scaleId, {
		x: 40,
		y: 52,
		w: 420,
		h: 360
	});
	const parts = planParts(bp, 1);
	const t = Math.max(6, wallThicknessIn(bp) * s);
	const first = parts[0];
	const firstBox = first ? partBox(x, y, s, first) : null;
	const firstMarks = first ? stations(first.wIn, spacing) : [];
	const schedule = parts.map((part) => {
		const long = memberCount(part.wIn, spacing);
		const short = memberCount(part.dIn, spacing);
		return `${part.name.toUpperCase()}  ${formatFtIn(part.wIn)} × ${formatFtIn(part.dIn)}  ${bp.studSize ?? "studs"} @ ${spacing}"  ${long} / ${short}`;
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		parts.map((part) => {
			const box = partBox(x, y, s, part);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DoubleRect, {
					x: box.x,
					y: box.y,
					w: box.w,
					d: box.d,
					t
				}),
				wallStudTicks(box, s, spacing, t),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: box.x + box.w / 2,
					y: box.y + box.d / 2,
					textAnchor: "middle",
					fontSize: "10",
					className: "fill-fg",
					children: part.name.toUpperCase()
				})
			] }, part.id);
		}),
		firstBox && firstMarks.length >= 2 ? dimHorizontal(firstBox.x + firstMarks[0] * s, firstBox.x + firstMarks[1] * s, firstBox.y - 14, firstBox.y, `${spacing}" O.C. TYP.`) : null,
		firstBox ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 1,
			ax: firstBox.x + 8,
			ay: firstBox.y + 8,
			lx: 500,
			ly: 70
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeynoteLegend, {
			x: 488,
			y: 56,
			items: [...sheetNotes(bp, "STUD"), ...schedule]
		}),
		dimHorizontal(x, x + bp.widthIn * s, y + bp.depthIn * s + 28, y + bp.depthIn * s, formatFtIn(bp.widthIn))
	] });
}
function ElectricView({ bp, scaleId, level }) {
	if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: "Electric — envelope Unknown" });
	const { x, y, s } = planLayout(bp.widthIn, bp.depthIn, scaleId, {
		x: 40,
		y: 52,
		w: 420,
		h: 360
	});
	const parts = planParts(bp, level === "garage" ? 1 : 2);
	const garage = parts[0] ? partBox(x, y, s, parts[0]) : {
		x,
		y,
		w: 100,
		d: 100
	};
	const shed = parts[1] ? partBox(x, y, s, parts[1]) : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		parts.map((part) => {
			const box = partBox(x, y, s, part);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: box.x,
				y: box.y,
				width: box.w,
				height: box.d,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.6"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: box.x + 8,
				y: box.y + 14,
				fontSize: "8",
				className: "fill-fg",
				children: part.name.toUpperCase()
			})] }, part.id);
		}),
		level === "garage" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Receptacle, {
				x: garage.x + 16,
				y: garage.y + garage.d * .3,
				gfi: true
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Receptacle, {
				x: garage.x + 16,
				y: garage.y + garage.d * .7,
				gfi: true
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Receptacle, {
				x: garage.x + garage.w - 16,
				y: garage.y + garage.d * .45,
				gfi: true
			}),
			shed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Receptacle, {
				x: shed.x + shed.w - 14,
				y: shed.y + shed.d * .5,
				gfi: true
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpenerMark, {
				x: garage.x + garage.w * .32,
				y: garage.y + garage.d - 14
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpenerMark, {
				x: garage.x + garage.w * .68,
				y: garage.y + garage.d - 14
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: garage.x + garage.w - 36,
				y: garage.y + 10,
				width: "24",
				height: "16",
				fill: "none",
				stroke: "currentColor",
				strokeDasharray: "3 2"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: garage.x + garage.w - 24,
				y: garage.y + 21,
				textAnchor: "middle",
				fontSize: "6",
				children: "EV"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SwitchMark, {
				x: garage.x + 20,
				y: garage.y + 18,
				label: "S"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 1,
				ax: garage.x + garage.w * .32,
				ay: garage.y + garage.d - 14,
				lx: 500,
				ly: 70
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 2,
				ax: garage.x + 16,
				ay: garage.y + garage.d * .3,
				lx: 500,
				ly: 84
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 3,
				ax: garage.x + garage.w - 24,
				ay: garage.y + 18,
				lx: 500,
				ly: 98
			})
		] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
			[
				.25,
				.5,
				.75
			].flatMap((fx) => [
				.28,
				.55,
				.78
			].map((fy) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CeilingLight, {
				x: garage.x + garage.w * fx,
				y: garage.y + garage.d * fy
			}, `${fx}-${fy}`))),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SwitchMark, {
				x: garage.x + 18,
				y: garage.y + garage.d - 16,
				label: "S3"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SwitchMark, {
				x: garage.x + 48,
				y: garage.y + garage.d - 16,
				label: "S3"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: garage.x + garage.w - 40,
				y: garage.y + 12,
				width: "28",
				height: "18",
				fill: "none",
				stroke: "currentColor",
				strokeDasharray: "3 2"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: garage.x + garage.w - 26,
				y: garage.y + 24,
				textAnchor: "middle",
				fontSize: "6",
				children: "MS"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 1,
				ax: garage.x + garage.w * .5,
				ay: garage.y + garage.d * .28,
				lx: 500,
				ly: 70
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 2,
				ax: garage.x + 18,
				ay: garage.y + garage.d - 16,
				lx: 500,
				ly: 84
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
				n: 3,
				ax: garage.x + garage.w - 26,
				ay: garage.y + 21,
				lx: 500,
				ly: 98
			})
		] }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
			className: "text-muted",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Receptacle, {
					x: 56,
					y: 530,
					gfi: true
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "70",
					y: "534",
					fontSize: "7",
					children: "GFI · E3902.2"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpenerMark, {
					x: 67,
					y: 552
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "84",
					y: "556",
					fontSize: "7",
					children: "Garage-door opener"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CeilingLight, {
					x: 62,
					y: 574
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					x: "74",
					y: "578",
					fontSize: "7",
					children: "Can / ceiling light · S / S3 3-way · dashed = not placed"
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeynoteLegend, {
			x: 488,
			y: 56,
			items: sheetNotes(bp, level === "garage" ? "ELEC" : "ELEC2")
		})
	] });
}
function PlumbingView({ bp, scaleId }) {
	if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptySheet, { label: "Plumbing — envelope Unknown" });
	const { x, y, s } = planLayout(bp.widthIn, bp.depthIn, scaleId, {
		x: 40,
		y: 52,
		w: 420,
		h: 360
	});
	const parts = planParts(bp, 1);
	const garage = parts[0] ? partBox(x, y, s, parts[0]) : {
		x,
		y,
		w: 120,
		d: 120
	};
	const opt = {
		x: garage.x + garage.w - 90,
		y: garage.y + garage.d - 80,
		w: 70,
		d: 54
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
		parts.map((part) => {
			const box = partBox(x, y, s, part);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: box.x,
				y: box.y,
				width: box.w,
				height: box.d,
				fill: `url(#slab-PLUMB)`,
				className: "text-subtle",
				stroke: "currentColor",
				strokeWidth: "1.6"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
				x: box.x + box.w / 2,
				y: box.y + 16,
				textAnchor: "middle",
				fontSize: "10",
				className: "fill-fg",
				children: part.name.toUpperCase()
			})] }, part.id);
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: opt.x,
			y: opt.y,
			width: opt.w,
			height: opt.d,
			fill: "none",
			stroke: "currentColor",
			strokeDasharray: "4 3"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: opt.x + opt.w / 2,
			y: opt.y + 14,
			textAnchor: "middle",
			fontSize: "7",
			className: "fill-warn",
			children: "HALF BATH OPTION"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ellipse", {
			cx: opt.x + 18,
			cy: opt.y + 34,
			rx: "8",
			ry: "10",
			fill: "none",
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: opt.x + 18,
			y: opt.y + 38,
			textAnchor: "middle",
			fontSize: "6",
			children: "WC"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: opt.x + 38,
			y: opt.y + 26,
			width: "22",
			height: "12",
			fill: "none",
			stroke: "currentColor"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: opt.x + 49,
			y: opt.y + 35,
			textAnchor: "middle",
			fontSize: "6",
			children: "LAV"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 1,
			ax: opt.x + opt.w / 2,
			ay: opt.y,
			lx: 500,
			ly: 70
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leader, {
			n: 2,
			ax: garage.x + garage.w * .4,
			ay: garage.y + 40,
			lx: 500,
			ly: 84
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeynoteLegend, {
			x: 488,
			y: 56,
			items: sheetNotes(bp, "PLUMB")
		})
	] });
}
function DrawingSheet({ project, bp, sheet, scaleId, editable, compact, onSelectDim, onRoomDrag }) {
	const svgRef = (0, import_react.useRef)(null);
	const scale = scaleId ?? bp.drawingScale ?? "FIT";
	const scaleText = scale === "FIT" ? bp.widthIn && bp.depthIn ? "FIT to sheet (not plotted)" : "n/a" : scaleLabel(scale);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		ref: svgRef,
		viewBox: "0 0 900 640",
		className: "howler-sheet h-auto w-full rounded-lg bg-bg text-fg shadow-[var(--shadow-border)]",
		role: "img",
		"aria-label": `${sheetMeta(sheet).number} ${sheetMeta(sheet).label} ${bp.drawingStatus ?? "DRAFT"} drawing`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HatchDefs, { sheet }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "8",
				y: "8",
				width: "884",
				height: "624",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.75"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "12",
				y: "12",
				width: "876",
				height: "616",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "0.6"
			}),
			compact ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HowToBanner, { sheet }),
			sheet === "L1" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlanView, {
				bp,
				level: 1,
				scaleId: scale,
				editable,
				compact,
				onSelectDim,
				onRoomDrag
			}) : null,
			sheet === "L2" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlanView, {
				bp,
				level: 2,
				scaleId: scale,
				editable,
				compact,
				onSelectDim,
				onRoomDrag
			}) : null,
			sheet === "FDN" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FoundationView, {
				bp,
				scaleId: scale
			}) : null,
			sheet === "EL" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ElevationView, {
				bp,
				scaleId: scale,
				editable,
				onSelectDim
			}) : null,
			sheet === "SEC" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BuildingSectionView, { bp }) : null,
			sheet === "WALL" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WallSectionView, { bp }) : null,
			sheet === "ROOF" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoofView, {
				bp,
				scaleId: scale
			}) : null,
			sheet === "JOIST" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(JoistView, {
				bp,
				scaleId: scale
			}) : null,
			sheet === "ELEC" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ElectricView, {
				bp,
				scaleId: scale,
				level: "garage"
			}) : null,
			sheet === "ELEC2" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ElectricView, {
				bp,
				scaleId: scale,
				level: "attic"
			}) : null,
			sheet === "PLUMB" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlumbingView, {
				bp,
				scaleId: scale
			}) : null,
			sheet === "STUD" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StudView, {
				bp,
				scaleId: scale
			}) : null,
			compact ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NextSheetHint, { sheet }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TitleBlock, {
				project,
				bp,
				sheet,
				scale: scaleText
			})
		]
	});
}
function Panel({ className, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
		className: cn("rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]", className),
		children
	});
}
function Stat({ label, value, hint }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-w-0",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[10px] font-medium uppercase tracking-[0.14em] text-subtle",
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 font-mono text-[15px] tabular-nums text-fg",
				children: value
			}),
			hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-xs text-subtle",
				children: hint
			}) : null
		]
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "flex min-w-0 flex-col gap-1.5 text-sm",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xs font-medium text-muted",
			children: label
		}), children]
	});
}
var inputClass = "min-h-11 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle transition-[box-shadow] duration-[var(--motion-quick)] ease-[var(--ease-smooth)] focus-visible:shadow-[var(--shadow-border-hover)]";
function Empty({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-sm text-muted",
		children
	});
}
function StatusChip({ tone, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("text-xs font-medium uppercase tracking-[0.12em]", {
			ok: "text-ok",
			warn: "text-warn",
			danger: "text-danger",
			neutral: "text-muted"
		}[tone]),
		children
	});
}
function Expandable({ title, meta, open, onToggle, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg bg-surface-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "flex min-h-11 w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors duration-[var(--motion-quick)] hover:bg-surface",
			onClick: onToggle,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [title, meta]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "shrink-0 pt-0.5 text-xs uppercase tracking-[0.12em] text-muted",
				children: open ? "Close" : "Edit"
			})]
		}), open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "border-t border-border px-4 pb-4 pt-3",
			children
		}) : null]
	});
}
//#endregion
export { Field as a, StatusChip as c, Expandable as i, inputClass as l, DrawingSheet as n, Panel as o, Empty as r, Stat as s, Button as t };
