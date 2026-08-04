import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  getAccountBySubject,
  upsertAccount,
  type Account,
} from "./db.js";
import {
  createVerification,
  type DocumentType,
  type V1ClientOptions,
  type VerificationResult,
} from "./v1-client.js";

export interface SubmitVerificationInput {
  subjectId: string;
  documentType: DocumentType;
  now?: () => Date;
}

export interface SubmitVerificationOutput {
  account: Account;
  verification: VerificationResult;
}

/**
 * Synchronous "call then decide" path — the seeded coupling that v2 breaks.
 * Business logic runs immediately on the v1 final response.
 */
export async function submitVerification(
  db: Database.Database,
  client: V1ClientOptions,
  input: SubmitVerificationInput,
): Promise<SubmitVerificationOutput> {
  const now = input.now ?? (() => new Date());
  const verification = await createVerification(client, {
    subjectId: input.subjectId,
    documentType: input.documentType,
  });

  // Immediate business decision from synchronous response fields.
  const status = verification.status === "PASS" ? "VERIFIED" : "REJECTED";
  const existing = getAccountBySubject(db, input.subjectId);
  const account: Account = {
    id: existing?.id ?? randomUUID(),
    subjectId: input.subjectId,
    status,
    lastVerificationId: verification.verificationId,
    updatedAt: (input.now ? input.now() : now()).toISOString(),
  };
  upsertAccount(db, account);

  return { account, verification };
}
