import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { getAccountBySubject, openDb } from "../src/db.js";
import { submitVerification } from "../src/verification-service.js";

function fakeFetch(result: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(result), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

test("submitVerification applies PASS decision synchronously", async () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-svc-"));
  const db = openDb(join(dir, "test.sqlite"));
  const decidedAt = "2026-07-30T12:00:00.000Z";

  const { account, verification } = await submitVerification(
    db,
    {
      baseUrl: "https://api.example.com/v1",
      fetchImpl: fakeFetch({
        verificationId: "ver_1",
        status: "PASS",
        decidedAt,
      }),
    },
    {
      subjectId: "sub_1",
      documentType: "passport",
      now: () => new Date(decidedAt),
    },
  );

  assert.equal(verification.status, "PASS");
  assert.equal(account.status, "VERIFIED");
  assert.equal(getAccountBySubject(db, "sub_1")?.status, "VERIFIED");
  db.close();
});

test("submitVerification applies FAIL decision synchronously", async () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-svc-"));
  const db = openDb(join(dir, "test.sqlite"));

  const { account } = await submitVerification(
    db,
    {
      baseUrl: "https://api.example.com/v1",
      fetchImpl: fakeFetch({
        verificationId: "ver_2",
        status: "FAIL",
        decidedAt: "2026-07-30T12:00:00.000Z",
        reasonCode: "DOCUMENT_MISMATCH",
      }),
    },
    {
      subjectId: "sub_2",
      documentType: "drivers_license",
      now: () => new Date("2026-07-30T12:00:00.000Z"),
    },
  );

  assert.equal(account.status, "REJECTED");
  db.close();
});
