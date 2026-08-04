import Database from "better-sqlite3";

export type AccountStatus = "UNVERIFIED" | "VERIFIED" | "REJECTED";

export interface Account {
  id: string;
  subjectId: string;
  status: AccountStatus;
  lastVerificationId: string | null;
  updatedAt: string;
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      last_verification_id TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export function upsertAccount(
  db: Database.Database,
  account: Account,
): void {
  db.prepare(
    `INSERT INTO accounts (id, subject_id, status, last_verification_id, updated_at)
     VALUES (@id, @subjectId, @status, @lastVerificationId, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       last_verification_id = excluded.last_verification_id,
       updated_at = excluded.updated_at`,
  ).run(account);
}

export function getAccountBySubject(
  db: Database.Database,
  subjectId: string,
): Account | undefined {
  const row = db
    .prepare(
      `SELECT id, subject_id as subjectId, status,
              last_verification_id as lastVerificationId,
              updated_at as updatedAt
       FROM accounts WHERE subject_id = ?`,
    )
    .get(subjectId) as Account | undefined;
  return row;
}
