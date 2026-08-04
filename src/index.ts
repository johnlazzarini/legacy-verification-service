export { openDb, getAccountBySubject, upsertAccount } from "./db.js";
export {
  createVerification,
  VerificationClientError,
  type VerificationAccepted,
  type ProblemDetails,
} from "./v1-client.js";
export { submitVerification } from "./verification-service.js";
