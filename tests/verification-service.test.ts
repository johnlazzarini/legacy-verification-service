import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { getAccountBySubject, openDb } from "../src/db.js";
import {
  createVerification,
  IdempotencyConflictError,
  VerificationClientError,
} from "../src/v1-client.js";
import { submitVerification } from "../src/verification-service.js";

function fakeFetch(result: unknown, status = 202): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(result), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

test("submitVerification persists PENDING acceptance from 202 response", async () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-svc-"));
  const db = openDb(join(dir, "test.sqlite"));
  const acceptedAt = "2026-07-30T12:00:00.000Z";

  const { account, verification } = await submitVerification(
    db,
    {
      baseUrl: "https://api.example.com/v1",
      fetchImpl: fakeFetch({
        verificationId: "ver_1",
        status: "PENDING",
      }, 202),
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
  assert.equal(getAccountBySubject(db, "sub_1")?.status, "PENDING");
  assert.equal(getAccountBySubject(db, "sub_1")?.lastVerificationId, "ver_1");
  db.close();
});

test("submitVerification does not map PENDING acceptance to REJECTED", async () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-svc-"));
  const db = openDb(join(dir, "test.sqlite"));

  const { account } = await submitVerification(
    db,
    {
      baseUrl: "https://api.example.com/v1",
      fetchImpl: fakeFetch({
        verificationId: "ver_2",
        status: "PENDING",
      }, 202),
    },
    {
      subjectId: "sub_2",
      documentType: "drivers_license",
      now: () => new Date("2026-07-30T12:00:00.000Z"),
    },
  );

  assert.notEqual(account.status, "REJECTED");
  assert.notEqual(account.status, "VERIFIED");
  assert.equal(account.status, "PENDING");
  db.close();
});

test("submitVerification sends Idempotency-Key on create request", async () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-svc-"));
  const db = openDb(join(dir, "test.sqlite"));
  let idempotencyKey: string | undefined;

  await submitVerification(
    db,
    {
      baseUrl: "https://api.example.com/v1",
      fetchImpl: (async (_url, init) => {
        const headers = init?.headers as Record<string, string>;
        idempotencyKey = headers["Idempotency-Key"];
        return new Response(
          JSON.stringify({ verificationId: "ver_3", status: "PENDING" }),
          { status: 202, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    },
    {
      subjectId: "sub_3",
      documentType: "national_id",
      now: () => new Date("2026-07-30T12:00:00.000Z"),
    },
  );

  assert.ok(idempotencyKey);
  assert.match(idempotencyKey!, /^[0-9a-f-]{36}$/);
  db.close();
});

test("createVerification throws IdempotencyConflictError on 409", async () => {
  await assert.rejects(
    () =>
      createVerification(
        {
          baseUrl: "https://api.example.com/v1",
          fetchImpl: fakeFetch(
            {
              type: "about:blank",
              title: "Conflict",
              status: 409,
              detail: "Duplicate idempotency key",
            },
            409,
          ),
        },
        { subjectId: "sub_1", documentType: "passport" },
        "idem-key",
      ),
    (err: unknown) => {
      assert.ok(err instanceof IdempotencyConflictError);
      assert.equal(err.problem.detail, "Duplicate idempotency key");
      return true;
    },
  );
});

test("createVerification throws VerificationClientError with ProblemDetails on non-202", async () => {
  await assert.rejects(
    () =>
      createVerification(
        {
          baseUrl: "https://api.example.com/v1",
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
        { subjectId: "sub_1", documentType: "passport" },
        "idem-key",
      ),
    (err: unknown) => {
      assert.ok(err instanceof VerificationClientError);
      assert.equal(err.status, 400);
      assert.equal(err.problem.detail, "Invalid document type");
      return true;
    },
  );
});
