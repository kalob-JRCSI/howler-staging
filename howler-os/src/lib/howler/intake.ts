// @ts-nocheck
/** Re-export intake oracle (audited). Implementation in intake-impl.ts */
export {
  parseIntakeLocal,
  digestIntakeFromLocal,
  makeIntakeProject,
  previewAddScopeLines,
  runIntakePipeline,
  DIGEST_INTAKE_SYSTEM,
  extractClientName,
  extractAddress,
  extractVisitDate,
  extractVisitTime,
  extractRooms,
  extractWorkDetails,
  briefVisitNote,
  slugifyName,
  isCreateClientUtterance,
  looksLikeExistingJobUpdate,
} from "./intake-impl";
