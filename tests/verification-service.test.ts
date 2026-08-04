import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { getAccountBySubject, openDb } from "../src/db.js";
import { VerificationClientError } from "../src/v1-client.js";
import { submitVerification } from "../src/verification-service.js";

function fakeFetch(
  result: unknown,
  status = 202,
  options?: { captureRequest?: (request: Request) => void },
): typeof fetch {
  return (async (input, init) => {
    const request = new Request(input, init);
    options?.captureRequest?.(request);
    return new Response(JSON.stringify(result), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("submitVerification persists PENDING acknowledgement on HTTP 202", async () => {
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
        {
          captureRequest: (request) => {
            capturedIdempotencyKey = request.headers.get("Idempotency-Key");
          },
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

test("submitVerification returns acknowledgement with PENDING for another document type", async () => {
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
  assert.equal(account.status, "PENDING");
  assert.equal(account.lastVerificationId, "ver_2");
  db.close();
});

test("submitVerification throws structured error on HTTP 409 conflict", async () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-svc-"));
  const db = openDb(join(dir, "test.sqlite"));

  await assert.rejects(
    () =>
      submitVerification(
        db,
        {
          baseUrl: "https://api.example.com/v2",
          fetchImpl: fakeFetch(
            {
              type: "about:blank",
              title: "Conflict",
              status: 409,
              detail: "Idempotency key reused with different payload",
            },
            409,
          ),
        },
        {
          subjectId: "sub_3",
          documentType: "national_id",
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof VerificationClientError);
      assert.equal(error.status, 409);
      assert.equal(error.problem?.detail, "Idempotency key reused with different payload");
      return true;
    },
  );

  assert.equal(getAccountBySubject(db, "sub_3"), undefined);
  db.close();
});

test("submitVerification throws structured error on non-202 failure", async () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-svc-"));
  const db = openDb(join(dir, "test.sqlite"));

  await assert.rejects(
    () =>
      submitVerification(
        db,
        {
          baseUrl: "https://api.example.com/v2",
          fetchImpl: fakeFetch(
            {
              type: "about:blank",
              title: "Bad Request",
              status: 400,
              detail: "Invalid document type",
            },
            400,
          ),
        },
        {
          subjectId: "sub_4",
          documentType: "passport",
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof VerificationClientError);
      assert.equal(error.status, 400);
      return true;
    },
  );

  db.close();
});
