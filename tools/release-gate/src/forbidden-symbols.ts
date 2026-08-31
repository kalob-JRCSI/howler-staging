// Task 17 correction: mechanically extracts every exported *value* name (function/const/class --
// never type/interface, which are erased at compile time and can never appear in runtime-embedded
// client source text) from a source file. Used to build checkNoBrowserBusinessLogic's denylist
// from the actual current exports of src/engine/*, src/domain/validation.ts, and src/operator/*,
// rather than a small hand-picked sample -- this can still miss a business-logic copy that avoids
// every one of these exact names, but it is exhaustive relative to what those modules currently
// export, not a token gesture at six names someone remembered.

/**
 * Names that are exported server-side but are also independently, legitimately declared as a
 * same-named *local* identifier inside the accepted Task 16A/16B client-embedded scripts --
 * verified harmless, not weakened matching. `REQUIRED_EFFECT_BY_KIND` in
 * `createSubmissionKernel` is a small static `Record<string,string>` object literal (an
 * intent-kind -> effect-string lookup table needed to build the outgoing request payload), not a
 * call to or reference of `src/operator/intent.ts`'s own exported constant of the same name --
 * the client script has zero import statements (it is `.toString()`-embedded), so it could never
 * literally be that export. A real business-logic leak would be a *server-only function or
 * algorithm* appearing client-side, not a same-named plain data table declared independently on
 * both sides. Keep this list short and explicit; do not use it to hide a genuine finding.
 */
export const KNOWN_HARMLESS_NAME_COLLISIONS: ReadonlySet<string> = new Set([
  "REQUIRED_EFFECT_BY_KIND",
]);

export function extractExportedValueNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(
    /export\s+(?:async\s+)?function\s+(\w+)/g,
  )) {
    if (match[1]) names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+const\s+(\w+)/g)) {
    if (match[1]) names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+class\s+(\w+)/g)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}
