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
  type VerificationAccepted,
} from "./v1-client.js";

export interface SubmitVerificationInput {
  subjectId: string;
  documentType: DocumentType;
  now?: () => Date;
}

export interface SubmitVerificationOutput {
  account: Account;
  verification: VerificationAccepted;
}

/**
 * Submits verification and persists pending acceptance until webhook completion.
 */
export async function submitVerification(
  db: Database.Database,
  client: V1ClientOptions,
  input: SubmitVerificationInput,
): Promise<SubmitVerificationOutput> {
  const now = input.now ?? (() => new Date());
  const idempotencyKey = randomUUID();
  const verification = await createVerification(
    client,
    {
      subjectId: input.subjectId,
      documentType: input.documentType,
    },
    idempotencyKey,
  );

  const existing = getAccountBySubject(db, input.subjectId);
  const account: Account = {
    id: existing?.id ?? randomUUID(),
    subjectId: input.subjectId,
    status: "PENDING",
    lastVerificationId: verification.verificationId,
    updatedAt: (input.now ? input.now() : now()).toISOString(),
  };
  upsertAccount(db, account);

  return { account, verification };
}
