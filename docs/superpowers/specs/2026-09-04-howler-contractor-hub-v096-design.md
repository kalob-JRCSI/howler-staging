# Howler v0.9.6 Contractor Hub Design

## Status

Approved product direction. This spec defines the next architectural slice required to move Howler from a prepared-data scheduling engine into a usable contractor/PM operating hub. It intentionally preserves the existing deterministic project, event, forecast, safety, conversation, and voice machinery where it is still correct.

Implementation must not begin until this written spec is reviewed by the user and the follow-on implementation plan is approved.

## Product definition

Howler is a contractor/PM operating system whose interface is conversational and visual. It is not primarily a scheduler, dashboard, note board, or chat bot.

Core principle:

> Howler should not care how information entered the system. It should care what the information means, how reliable it is, what project it belongs to, what it changes, and what should happen next.

Primary operating loop:

> CONSUME -> ANALYZE -> EVALUATE -> PRODUCE -> VERIFY -> EVOLVE

The product must make a PM measurably more organized, informed, predictive, and productive by reducing missed information, missed dependencies, weak sequencing, fragmented project understanding, and repetitive administrative reconstruction.

Howler is the PM's coworker and support layer, not the PM's boss.

## v0.9.6 objective

Deliver one vertical slice that proves the missing product boundary:

1. Create a new project.
2. Give Howler messy natural project information through text/manual input first.
3. Howler structures that information into a proposed initial project understanding.
4. The user reviews/corrects the baseline as a whole rather than approving dozens of extracted fragments.
5. The Index Card becomes operational from that approved understanding.
6. A later project update changes the same canonical project state and, where applicable, its forecast.
7. The Penthouse reflects the updated project at portfolio level.

This slice is the minimum bar for re-entering controlled pilot mode.

## Explicitly out of scope for this slice

Do not expand this build into:

- full accounting, payroll, banking, invoicing, HR, CRM, or marketing systems;
- a deep code-enforcement or jurisdiction engine;
- advanced vendor-behavior scoring;
- universal document ingestion for every file format before text/manual Genesis works;
- a generalized autonomous agent that makes external commitments;
- a giant redesign of existing deterministic forecast/event infrastructure;
- theoretical perfection of learning behavior before pilot evidence exists.

These may become later capabilities or integrations.

## Information hierarchy

### Penthouse / main dashboard

The dashboard is the map.

Its question is:

> Where do I need to go, and why?

It must not become a dense project-management board. Detailed schedule, forecast, documents, long risk lists, and deep project data belong inside Index Cards.

Each project card should expose only concise decision intelligence:

- project/client name;
- Project Integrity score and plain-language condition;
- trend direction if meaningful;
- production Progress percentage;
- budget position: spent and available/remaining where known;
- primary exposure or blocker;
- next critical movement;
- projected completion when sufficiently grounded.

Example presentation intent:

CARVER
82 / 100 - Stable, schedule exposed
72% complete
Budget: 61% spent / 39% available
Primary exposure: electrical final not confirmed
Next: Granite -> Electrical -> Glass
Projected completion: Sep XX

This is conceptual content, not prescribed final typography.

### Dashboard visual rules

The visual bar is part of the product requirement.

- Sharp, clean, restrained, professional.
- Strong hierarchy and generous but efficient spacing.
- Compact typography; no oversized headings.
- No duplicated status information.
- No walls of text.
- No compounded project information bleeding across clients.
- Visualizations should replace prose when they communicate faster.
- Project health color is secondary visual language, not the status itself.
- The main dashboard should be understandable in seconds.

Every screen should answer one primary question.

### Index Card

The Index Card is the project.

Its question is:

> What is happening here, what does it mean, and what do I need to do?

The Index Card is the detailed operating environment for one client/project. It should become the home for:

- project identity and current state;
- baseline scope and approved additional/modified work;
- budget awareness;
- documents;
- plans and photos;
- schedule and forecast calendar;
- trades;
- materials and procurement;
- inspections;
- decisions;
- risks/exposures;
- project activity/history;
- communications assistance;
- project intelligence and next moves.

The v0.9.6 slice does not need every module to be fully mature. It must establish the architecture and first usable vertical flow so additional modules plug into one project rather than becoming disconnected mini-products.

## Progress versus Project Integrity

These are separate truths and must never be collapsed into one number.

### Progress

Progress answers:

> How much of the actual project production is complete?

It should ultimately be based on weighted real scope/work rather than money spent or elapsed calendar time alone. Exact weighting behavior may be tuned during pilot.

### Project Integrity

Project Integrity answers:

> How healthy and well-controlled is the project as a whole?

It is continuous rather than only red/yellow/green. A score such as 82/100 is paired with plain language such as "Stable, schedule exposed" and a primary reason.

Underlying factors may include:

- production position;
- schedule/forecast exposure;
- budget trajectory;
- scope/control integrity;
- procurement/material readiness;
- unresolved blockers/decisions;
- quality/closeout exposure;
- dependency readiness;
- information gaps that materially affect execution.

Color may support the visual treatment but must not be the meaning.

If integrity changes materially, Howler should be able to explain the main driver in normal language.

## Schedule and forecast model

Detailed forecasting belongs primarily inside the Index Card as a calendar/timeline experience.

Howler must distinguish:

- committed dates: confirmed with a trade, vendor, client, inspection office, etc.;
- forecast dates: Howler's current projection from known project conditions and dependencies.

Forecast dates may move automatically when accepted project facts imply a change.

Committed external promises must not be silently rewritten merely because a forecast changed.

Example:

- Electrical final - committed Friday
- Glass install - forecast Monday
- Projected completion - forecast Wednesday

## Howler authority model

Howler uses graduated authority.

### Observe

Routine accepted facts can be absorbed into project state.

Example: "Drywall finished today."

### Reason

Howler may automatically perform logical internal consequences that follow from an accepted fact, such as updating progress, forecast, dependency readiness, project integrity, and next-move intelligence.

Example: a confirmed delivery moves from Wednesday to Friday; Howler shifts affected forecast work and then tells the user concisely what changed.

### Act / commit

External or consequential commitments require the appropriate level of user authority.

Examples:

- sending a client/vendor message;
- making a contractual budget commitment;
- approving a change order;
- rescheduling an external party;
- creating a new external promise.

Howler should present such proposed actions clearly and concisely for approval.

## Change over time and supersession

Howler must understand that project truth evolves.

A new fact does not erase history. The system should preserve enough history to understand:

- the prior commitment/state;
- the new fact or correction;
- source/evidence when important;
- what was superseded;
- what downstream project intelligence changed.

The original baseline scope remains intact. New, removed, or modified work should be represented as additional/changed work rather than pretending the original project was wholly redefined.

Only affected project elements should change.

## Ambiguity and clarification behavior

Howler should infer when confidence is strong and ask when ambiguity matters.

Examples:

- A PDF clearly titled "Carver Scope of Work" should not trigger a question asking what project it belongs to.
- An unlabeled photo or generic vendor quote that could belong to multiple projects may require clarification.
- If project sequencing or history has a meaningful gap, Howler should surface the gap in the correct temporal context rather than blindly treating it as an upcoming task.

Howler should not question every small uncertainty. Questions should be prioritized by likely project impact.

## Construction baseline

Howler should not start from zero construction knowledge.

It needs a practical baseline understanding of construction terminology, normal sequencing, common trade dependencies, inspections, procurement relationships, and common failure points sufficient to reason like a helpful construction PM coworker.

This baseline is supportive, not supervisory. It must not constantly lecture experienced users or act like a code-enforcement officer.

Deep jurisdiction/code intelligence is not a v0.9.6 requirement.

Future maintenance of the knowledge baseline should be periodic and evidence-based, but exact update cadence and jurisdiction detail are deferred until pilot use proves the need.

## Learning philosophy

Howler should become more useful through continued use, but v0.9.6 will not attempt to perfect the learning system.

Long-term learning can include:

- project history;
- company operating patterns;
- user working preferences;
- construction-domain knowledge;
- limited vendor/trade tendencies as secondary signals.

Vendor tendencies must not dominate project reasoning.

Learned patterns must never silently become verified project facts.

The exact rules for how corrections generalize from project-specific to company-wide behavior are pilot-tunable and intentionally not hard-coded in this slice.

## Project Genesis

Project Genesis is the main missing product capability for v0.9.6.

### User experience

The user can create a project and then dump project information in natural language without first building a schema.

Example:

"Create Smith Residence. 2,800-square-foot remodel. Budget is $310,000. Kitchen, primary bath, flooring, windows, electrical service upgrade, HVAC modifications. Demo starts September 14. We already selected Wayland for electrical. Cabinets are still being priced."

Howler should consume first and interrogate second.

It should return one proposed initial understanding containing, where available:

- project/client identity;
- baseline scope summary;
- budget/commercial facts;
- current status;
- major work packages/activities;
- known trades;
- known materials/procurement items;
- committed dates;
- forecast assumptions;
- major dependencies;
- risks/exposures;
- missing critical information;
- contradictions;
- proposed initial schedule/forecast.

The user verifies/corrects the baseline as a coherent project understanding rather than approving every extracted atom.

After approval, the Index Card becomes operational.

### Genesis architecture

Project Genesis must not become a second canonical engine.

Flow:

INPUT (text/manual first; voice/doc later)
-> capture request/evidence
-> semantic extraction / project synthesis
-> proposed baseline project understanding
-> deterministic validation against canonical schemas/rules
-> user review/correction
-> canonical project creation
-> existing event/project state machinery
-> existing forecast/recovery services
-> Penthouse + Index Card views

The existing project/event/forecast kernel remains authoritative after project creation.

## Unified project truth

Every UI surface and input mode must operate on the same canonical project.

There must not be one truth for voice, another for the dashboard, another for forecasting, and another for documents.

A project event should be understood once, then only the relevant dependent project intelligence should update.

Example:

A confirmed cabinet delivery delay may affect:

- cabinet procurement state;
- dependent countertop forecast;
- project completion forecast;
- integrity score;
- next recommended move.

It should not arbitrarily rewrite unrelated scope, cost, trades, or history.

## Fast path versus deep reasoning path

Speed and operating cost are architectural requirements.

Howler must not require an expensive, high-latency AI call for every ordinary PM update.

### Fast path

Use deterministic logic, cached/current canonical state, lightweight extraction/classification, and existing project relationships for routine actions where possible.

Examples:

- task completed;
- known delivery rescheduled;
- known event confirmed;
- simple project note/update;
- status/progress refresh;
- straightforward forecast consequence.

### Deep path

Use more expensive reasoning only when justified by complexity or user request.

Examples:

- initial Project Genesis synthesis;
- conflicting evidence;
- ambiguous project ownership;
- complex schedule recovery;
- multi-document reconciliation;
- high-impact contradiction;
- explicit deep project analysis.

Target principle:

> Expensive intelligence cannot block basic operation of Howler.

Exact latency and cost thresholds should be measured in pilot rather than guessed in advance.

## Dashboard/Index Card navigation contract

Penthouse and Index Card must be connected as one product, not separate demos.

- Clicking/selecting a portfolio project opens that project's Index Card.
- Index Card state comes from the same canonical project state represented in Penthouse.
- A project update made from the Index Card should be visible in Penthouse once the derived summary changes.
- Detailed forecast calendar remains in Index Card.
- Portfolio should never duplicate the full forecast calendar.
- Portfolio should show only the next movement/exposure needed for navigation.

## Required v0.9.6 pilot slice

The implementation is successful only if this real end-to-end scenario works:

1. From Penthouse, create a new project.
2. Enter a messy but realistic project description through text/manual input.
3. Howler produces an initial project understanding without requiring the user to hand-build JSON or database records.
4. User reviews and corrects the synthesis.
5. User approves the baseline.
6. A clean Index Card is created from canonical state.
7. The Index Card visibly contains the project's core identity, scope summary, budget awareness, schedule/forecast area, current progress/integrity summary, primary exposure, and next movement.
8. User enters a normal project update in natural language.
9. The existing canonical mutation/forecast machinery updates only the affected state.
10. Index Card reflects the change.
11. Penthouse summary reflects the changed project position.
12. No unrelated project changes.
13. No external commitment is made without appropriate authority.

## Pilot acceptance posture

Passing tests is not field readiness.

After this slice is implemented and verified, the correct claim is:

> Cleared the safety gate and ready for controlled field testing.

Then Howler returns to controlled pilot mode with real project interactions.

Pilot should record:

- what the PM said;
- what Howler understood;
- what changed;
- what forecast changed;
- whether that change was useful/correct;
- whether Howler asked an unnecessary question;
- whether Howler was too slow;
- whether Howler used an expensive path unnecessarily;
- whether presentation helped or hindered navigation.

Pilot evidence should drive tuning of learning, interruption frequency, confidence thresholds, project-integrity weighting, progress weighting, and deep-reasoning triggers.

## Safety and integrity requirements carried forward

The following existing principles remain mandatory:

- accuracy before fluency;
- facts, commitments, assumptions, forecasts, and unknowns remain distinguishable;
- important facts retain evidence/provenance where appropriate;
- no wrong-project mutation;
- no silent stale overwrite;
- no duplicate apply;
- consequential external actions require authority;
- ambiguous meaning never executes as a guessed mutation;
- deterministic canonical state remains authoritative;
- voice, text, documents, integrations, Penthouse, and Index Cards are interfaces to the same core;
- learning cannot silently mutate truth.

## Implementation strategy

Recommended implementation strategy is hybrid product rebuild around the existing kernel.

Preserve:

- canonical project/event state;
- deterministic Apply behavior;
- existing safety/confirmation boundaries where still relevant;
- existing forecast/recovery engine;
- existing conversational claim/mutation work that can serve updates after project creation;
- voice transport as an input adapter;
- current Penthouse/Index Card foundation where it accelerates the new UX.

Rebuild/extend:

- project creation UX;
- Project Genesis synthesis/verification flow;
- canonical project initialization from user-understandable input;
- Penthouse information hierarchy and visual sharpness;
- Index Card as the actual project hub;
- clear Progress versus Project Integrity presentation;
- committed versus forecast schedule representation;
- fast-path/deep-path routing.

Do not rewrite stable deterministic infrastructure merely to make the architecture look cleaner.

## One-session implementation intent

The next implementation plan should be optimized for one focused build/editing session that gets Howler back to controlled pilot, not for a weeks-long platform rewrite.

That means:

- prioritize the end-to-end vertical slice over broad feature completeness;
- reuse current kernel aggressively;
- avoid speculative integrations;
- avoid advanced learning/code features;
- deliver the dashboard/Index Card hierarchy discussed above in the same slice;
- run focused tests, full regression, and staging verification before pilot activation.

If a nonessential feature threatens this goal, defer it to post-pilot unless it is necessary for correctness or safety.
