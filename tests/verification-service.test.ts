import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { getAccountBySubject, openDb } from "../src/db.js";
import { submitVerification } from "../src/verification-service.js";

function fakeFetch(
  result: unknown,
  status = 202,
  onInit?: (init?: RequestInit) => void,
): typeof fetch {
  return (async (_input, init) => {
    onInit?.(init);
    return new Response(JSON.stringify(result), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("submitVerification returns PENDING acknowledgement and persists in-flight state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-svc-"));
  const db = openDb(join(dir, "test.sqlite"));
  const acceptedAt = "2026-07-30T12:00:00.000Z";
  let capturedIdempotencyKey: string | null = null;

  const { account, verification } = await submitVerification(
    db,
    {
      baseUrl: "https://api.example.com/v2",
      fetchImpl: fakeFetch(
        {
          verificationId: "ver_1",
          status: "PENDING",
        },
        202,
        (init) => {
          const headers = new Headers(init?.headers);
          capturedIdempotencyKey = headers.get("Idempotency-Key");
        },
      ),
    },
    {
      subjectId: "sub_1",
      documentType: "passport",
      now: () => new Date(acceptedAt),
    },
  );

  assert.equal(verification.status, "PENDING");
  assert.equal(verification.verificationId, "ver_1");
  assert.equal(account.status, "PENDING");
  assert.equal(account.lastVerificationId, "ver_1");
  assert.ok(capturedIdempotencyKey);
  assert.match(capturedIdempotencyKey!, /^[0-9a-f-]{36}$/i);

  const persisted = getAccountBySubject(db, "sub_1");
  assert.equal(persisted?.status, "PENDING");
  assert.equal(persisted?.lastVerificationId, "ver_1");
  db.close();
});

test("submitVerification leaves account pending for another subject", async () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-svc-"));
  const db = openDb(join(dir, "test.sqlite"));

  const { account, verification } = await submitVerification(
    db,
    {
      baseUrl: "https://api.example.com/v2",
      fetchImpl: fakeFetch({
        verificationId: "ver_2",
        status: "PENDING",
      }),
    },
    {
      subjectId: "sub_2",
      documentType: "drivers_license",
      now: () => new Date("2026-07-30T12:00:00.000Z"),
    },
  );

  assert.equal(verification.status, "PENDING");
  assert.equal(verification.verificationId, "ver_2");
  assert.equal(account.status, "PENDING");
  assert.equal(account.lastVerificationId, "ver_2");
  assert.notEqual(account.status, "VERIFIED");
  assert.notEqual(account.status, "REJECTED");
  db.close();
});
