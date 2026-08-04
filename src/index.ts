export { openDb, getAccountBySubject, upsertAccount } from "./db.js";
export type { Account, AccountStatus } from "./db.js";
export {
  createVerification,
  VerificationApiError,
} from "./v1-client.js";
export type {
  DocumentType,
  ProblemDetails,
  V1ClientOptions,
  VerificationAccepted,
  VerificationRequest,
} from "./v1-client.js";
export { submitVerification } from "./verification-service.js";
export type {
  SubmitVerificationInput,
  SubmitVerificationOutput,
} from "./verification-service.js";
