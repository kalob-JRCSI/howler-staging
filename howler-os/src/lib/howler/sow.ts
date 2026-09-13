/**
 * Scope of Work + job rules copied from Drive (Howler copies, originals untouched).
 * Completion flags come from the SOW plus the KF dashboard — leftover punch is
 * not the whole job. Howler will not invent a dollar or a passed inspection.
 */
import type { ScopeItem } from "./types";

export const JR_SITE_RULES = [
  "Do not enter or work inside if anyone 18 or younger is present without an adult. If they arrive, leave immediately and call the office.",
  "No alcohol. No profanity. No smoking. No loud music. Clean shoes, booties, or socks only.",
  "Do not enter areas outside the scope unless the client or J&R asks.",
  "Shirt at all times. No tank tops. No vulgar slogans.",
  "Report defects, safety issues, accidents, or concerns immediately to J&R.",
  "Clean up after yourself. Never use the client's tools or supplies.",
  "End of day: clean enough for a 3-year-old to walk in.",
  "If it doesn't look right or match — do not install it. Ask first.",
  "If you spill it, clean it immediately.",
  "If protection is missing on appliances, tubs, tile, or windows — stop and tell J&R.",
  "After you install — cover for protection until the next phase.",
  "If you break or damage anything, contact J&R immediately.",
];

function item(
  id: string,
  description: string,
  phase: string,
  opts: Partial<Pick<ScopeItem, "trade" | "included" | "complete" | "activityId" | "allowanceLineId" | "notes" | "fromBaseline">> = {},
): ScopeItem {
  return {
    id,
    description,
    phase,
    trade: opts.trade ?? null,
    included: opts.included ?? true,
    complete: opts.complete ?? false,
    activityId: opts.activityId ?? null,
    allowanceLineId: opts.allowanceLineId ?? null,
    notes: opts.notes ?? null,
    fromBaseline: opts.fromBaseline ?? true,
  };
}

/** Carver/Julian SOW — two baths. Dashboard is final closeout. Remaining: electrical finals, vanities, glass. */
export function carverSowScope(): Record<string, ScopeItem> {
  return {
    "scp-mb-demo": item("scp-mb-demo", "Master bath demolition", "Demo", {
      trade: "Demo",
      complete: true,
      activityId: "act-demo",
      notes: "SOW: retain existing tub/surround and floor at curbed shower. Demo for plumbing, electrical, tile, framing only.",
    }),
    "scp-mb-frame": item("scp-mb-frame", "Master bath framing / blocking", "Framing", {
      trade: "Framing",
      complete: true,
      activityId: "act-frame",
      notes: "Curbed shower, stone-curb blocking, shower-door / grab-bar blocking, 12\"H × 28\"W Schluter niche header. master design.pdf A04.",
    }),
    "scp-mb-plumb": item("scp-mb-plumb", "Master bath plumbing", "Systems", {
      trade: "Plumbing",
      complete: true,
      activityId: "act-mech-rough",
      notes: "Shower valve/trim, vanity rehook, tub faucet rehook, bidet. Remaining closeout is electrical/vanity/glass — not a new plumbing punch on the KF dashboard.",
    }),
    "scp-mb-elec": item("scp-mb-elec", "Master bath electrical rough", "Systems", {
      trade: "Electrical",
      complete: true,
      activityId: "act-mech-rough",
      notes: "Two sconces, can over tub, can over shower, heated exhaust, towel-warmer outlet, bidet outlet, GFCI. Finals still open (Waylon, Sep 9 — not field-confirmed).",
    }),
    "scp-mb-drywall": item("scp-mb-drywall", "Master bath drywall", "Finishes", {
      trade: "Drywall",
      complete: true,
      activityId: "act-drywall",
      notes: "Moisture-resistant in wet areas. Glue and screw.",
    }),
    "scp-mb-schluter": item("scp-mb-schluter", "Master bath Schluter waterproofing", "Wet", {
      trade: "Tile",
      complete: true,
      activityId: "act-tile",
      notes: "Pan, curb, membrane, banding, corners, drain, flood test. Per manufacturer.",
    }),
    "scp-mb-tile": item("scp-mb-tile", "Master bath tile", "Finishes", {
      trade: "Tile",
      complete: true,
      activityId: "act-tile",
      notes: "Walls, floor, 12×28 niche at 48\" AFF. Power grout. Look-ahead Aug 3 was already tile finals.",
    }),
    "scp-mb-paint": item("scp-mb-paint", "Master bath painting", "Painting", {
      trade: "Painting",
      complete: true,
      activityId: "act-paint",
      notes: "Drywall touch-ups matching. Vanity paint is with Artistic, still open.",
    }),
    "scp-ub-demo-frame": item("scp-ub-demo-frame", "Upstairs bath demo + expand into closet", "Demo", {
      trade: "Framing",
      complete: true,
      activityId: "act-demo",
      notes: "Full demo. Expand into office closet. Keep vanity for reuse. hall design.pdf A02/A03.",
    }),
    "scp-ub-wet": item("scp-ub-wet", "Upstairs bath plumbing / Schluter / tile", "Finishes", {
      trade: "Tile",
      complete: true,
      activityId: "act-tile",
      notes: "New shower, toilet, bidet. Schluter system. 12×28 niche at 48\" AFF. Horizontal grab 36\" AFF.",
    }),
    "scp-ub-paint": item("scp-ub-paint", "Upstairs bath painting", "Painting", {
      trade: "Painting",
      complete: true,
      activityId: "act-paint",
      notes: "Two coats walls, two coats trim, flat ceiling.",
    }),
    "scp-elec-final": item("scp-elec-final", "Electrical finals — Waylon", "Closeout", {
      trade: "Electrical",
      complete: false,
      activityId: "act-elec",
      notes: "Scheduled Wed Sep 9. KF dashboard did not confirm complete.",
    }),
    "scp-vanity": item("scp-vanity", "Artistic vanities — both baths", "Closeout", {
      trade: "Cabinetry",
      complete: false,
      activityId: "act-vanity",
      notes: "Master: refinish existing, two coats. Upstairs: reuse original, panel open end, cabinet above toilet. Artistic Sep 9 not field-confirmed.",
    }),
    "scp-glass": item("scp-glass", "Gatsby Glass shower doors — both baths", "Closeout", {
      trade: "Glass",
      complete: false,
      activityId: "act-glass",
      notes: "Master: pull handle interior, towel bar exterior. Upstairs: glass doors. Template Wed Sep 16 8:00–9:00 a.m.",
    }),
  };
}

/** Deboard garage SOW — full contracted build. Foundation is underway; the rest is still ahead. */
export function deboardSowScope(): Record<string, ScopeItem> {
  return {
    "scp-site": item("scp-site", "Site preparation / layout / pad", "Site", {
      trade: "Site",
      complete: true,
      activityId: "act-footer",
      notes: "SOW: layout, excavate, compact pad, drainage, rough grade. Footer and block are in — pad is behind them.",
    }),
    "scp-footer": item("scp-footer", "Reinforced footings", "Foundation", {
      trade: "Concrete",
      complete: true,
      activityId: "act-footer",
      notes: "Stair-stepped as required. Complete.",
    }),
    "scp-masonry": item("scp-masonry", "CMU stem walls", "Foundation", {
      trade: "Masonry",
      complete: true,
      activityId: "act-block",
      notes: "Fully slushed, anchor bolts. Brick veneer / soldier course / quoins are later.",
    }),
    "scp-slab": item("scp-slab", "Garage + mower-storage slab", "Foundation", {
      trade: "Concrete",
      complete: false,
      activityId: "act-concrete",
      notes: "SOW order: Footer, Block, Framing dried in, then poured concrete. KF: Sam expected complete Sat Sep 12 — not marked complete from a target.",
    }),
    "scp-garage": item("scp-garage", "Detached garage structure", "Structure", {
      trade: "Framing",
      complete: false,
      activityId: "act-framing",
      notes: "Two-car garage, mower storage, stairwell, second-floor office/flex, half bath, attic storage. John Marr unconfirmed after pads.",
    }),
    "scp-brick": item("scp-brick", "Full brick veneer to match house", "Envelope", {
      trade: "Masonry",
      complete: false,
      notes: "Soldier courses, quoins, ties, flashing. After dry-in.",
    }),
    "scp-roof": item("scp-roof", "Roofing / weatherproofing", "Envelope", {
      trade: "Roofing",
      complete: false,
      activityId: "act-roof",
      notes: "Ice/water, underlayment, shingles, flashing, ridge vent, soffit, fascia, gutters, downspouts.",
    }),
    "scp-openings": item("scp-openings", "Windows, service door, overhead doors", "Envelope", {
      trade: "Openings",
      complete: false,
      notes: "Energy-efficient windows at office. One double OHD + one single OHD at mower storage. Leaf widths Unknown.",
    }),
    "scp-bath": item("scp-bath", "Half bath", "Systems", {
      trade: "Plumbing",
      complete: false,
      activityId: "act-mech",
      allowanceLineId: "line-fixtures",
      notes: "Second-floor half bath. Option on A11 — in or out not decided.",
    }),
    "scp-office": item("scp-office", "Conditioned second-floor office / flex", "Finishes", {
      trade: "Interior",
      complete: false,
      notes: "Mini-split HVAC, insulation, drywall, paint, flooring. Added after baseline walk.",
      fromBaseline: false,
    }),
    "scp-hvac": item("scp-hvac", "Mini-split HVAC — second floor", "Systems", {
      trade: "HVAC",
      complete: false,
      activityId: "act-mech",
      notes: "Serving finished office/flex only.",
    }),
    "scp-electrical": item("scp-electrical", "Electrical service, rough, lighting", "Systems", {
      trade: "Electrical",
      complete: false,
      activityId: "act-mech",
      notes: "Jason Bonham follow-on unconfirmed. Panel location Unknown.",
    }),
    "scp-cabinetry": item("scp-cabinetry", "Office cabinetry", "Finishes", {
      trade: "Cabinetry",
      complete: false,
      activityId: "act-cabinetry",
    }),
    "scp-final": item("scp-final", "Final grade, cleanup, inspections, walkthrough", "Closeout", {
      trade: null,
      complete: false,
    }),
  };
}

/** Ciurlizza basement SOW + kitchen/basement Tradewalk items. Failed Fayette inspection is the live gate. */
export function ciurlizzaSowScope(): Record<string, ScopeItem> {
  return {
    "scp-demo": item("scp-demo", "Basement leftover demo / debris", "Demo", {
      trade: "Demo",
      complete: true,
      notes: "SOW: remove leftover construction materials. Framing exists to fail inspection.",
    }),
    "scp-frame": item("scp-frame", "Basement 2x4 / 2x6 walls, soffits, chases", "Framing", {
      trade: "Framing",
      complete: true,
      notes: "Built. Fayette County failed — not a passed framing card. Fire stop, LVL docs, 2x4 strapping still required.",
    }),
    "scp-correct": item("scp-correct", "Failed inspection corrections", "Corrections", {
      complete: false,
      notes: "31-W fire stop Tue Sep 15. LVL specs from Marcus / 84 Lumber. 2x4 wall strapping. Reinspection Thu Sep 17.",
    }),
    "scp-fire": item("scp-fire", "31-W fire stop", "Corrections", {
      trade: "Firestopping",
      complete: false,
      activityId: "act-firestop",
    }),
    "scp-lvl": item("scp-lvl", "LVL specifications / documentation", "Corrections", {
      trade: "Lumber",
      complete: false,
      activityId: "act-lvl",
      notes: "Marcus at 84 Lumber. Howler will not invent sizes.",
    }),
    "scp-strap": item("scp-strap", "2x4 wall strapping", "Corrections", {
      trade: "Framing",
      complete: false,
      activityId: "act-strap",
    }),
    "scp-plumb": item("scp-plumb", "Basement full-bath plumbing rough", "Systems", {
      trade: "Plumbing",
      complete: false,
      notes: "Shower, toilet, single vanity. Locations confirmed at plumber walk-thru. Option: whole-house filtration.",
    }),
    "scp-elec": item("scp-elec", "Basement electrical — 21 cans + bath", "Systems", {
      trade: "Electrical",
      complete: false,
      notes: "21 can lights, TV backlighting, surround, mechanical lighting, 2 vanity pendants, exhaust, flush mount.",
    }),
    "scp-hvac": item("scp-hvac", "Basement HVAC supplies/returns + bath vent", "Systems", {
      trade: "HVAC",
      complete: false,
    }),
    "scp-insul": item("scp-insul", "Batt insulation — new walls and bathroom", "Envelope", {
      trade: "Insulation",
      complete: false,
      notes: "Blocked until reinspection passes.",
    }),
    "scp-drywall": item("scp-drywall", "Basement drywall", "Finishes", {
      trade: "Drywall",
      complete: false,
      activityId: "act-antle",
      notes: "Material Fri Sep 18. Antle Mon Sep 21. Contingent on county clearance.",
    }),
    "scp-tile": item("scp-tile", "Onyx shower + bath floor tile", "Finishes", {
      trade: "Tile",
      complete: false,
      notes: "Onyx shower system per basement SOW.",
    }),
    "scp-windows": item("scp-windows", "Bay and egress windows (Builders First Choice)", "Envelope", {
      complete: false,
      notes: "Verify with Colin that both are ordered. Secondary to inspection. Kitchen + basement Tradewalk.",
    }),
    "scp-pocket": item("scp-pocket", "Frosted pocket door (Cox Interiors)", "Finishes", {
      complete: false,
      notes: "Approved order — track. Kitchen Tradewalk callout.",
    }),
    "scp-kitchen-beam": item("scp-kitchen-beam", "Kitchen beam as needed for removed posts", "Framing", {
      trade: "Framing",
      complete: false,
      notes: "KITCHEN PLANS 4.29 A04 + Yeiser LVL 5.25×16. Existing steel FIELD VERIFY.",
    }),
  };
}

export const CARVER_RULES = JR_SITE_RULES;
export const DEBOARD_RULES = JR_SITE_RULES;
export const CIURLIZZA_RULES = JR_SITE_RULES;
