# Legacy Service Runbook

## Overview

This service verifies customer identity by calling the Identity Verification API
asynchronously. `submitVerification` sends `POST /verifications` with an
`Idempotency-Key`, accepts only HTTP **202** with a `VerificationAccepted` body
(`verificationId`, `status: "PENDING"`), persists the account as **PENDING**, and
returns the pending acknowledgement. It does **not** set terminal `VERIFIED` or
`REJECTED` status from the create response alone.

Evidence: `src/v1-client.ts`, `src/verification-service.ts`, `src/db.ts`.

## Dependencies

- Identity Verification API (v2 acknowledgement contract; `baseUrl` is configured
  externally — no in-repo selector defines v1 versus v2 at runtime)
- Local SQLite for account state (`src/db.ts`)

## Operations

### Submit verification

1. Caller invokes `submitVerification` (`src/verification-service.ts`).
2. Service generates an `Idempotency-Key` per attempt and calls
   `createVerification` (`src/v1-client.ts`).
3. Client sends `POST /verifications` with the idempotency header and expects
   HTTP **202** plus `VerificationAccepted`. Non-202 success responses (including
   legacy HTTP **200**) are rejected.
4. On success, account `status` is set to **PENDING**, `lastVerificationId` is
   populated from `verificationId`, and the pending acknowledgement is returned
   (`src/verification-service.ts`, `src/db.ts`).
5. Error responses may include structured `ProblemDetails`. HTTP **409**
   idempotency conflicts surface as `VerificationClientError` without blind retry
   (`src/v1-client.ts`).

### Pending records

Accounts may remain in **PENDING** between create acknowledgement and a future
terminal outcome. `AccountStatus` includes `PENDING` alongside `UNVERIFIED`,
`VERIFIED`, and `REJECTED` (`src/db.ts`). Operators should treat `PENDING` as
in-flight work that requires reconciliation before rollback or cutback.

### Webhook completion (deferred)

The following are **not implemented** in this increment:

- Webhook receiver at `POST /webhooks/verification-completed`
- Signature verification and `eventId` deduplication
- Transitioning `PENDING` → `VERIFIED`/`REJECTED` on webhook receipt

Terminal account transitions driven by webhook delivery remain deferred.
Evidence: plan exclusions; no webhook handler in changed files.

### Alerts

- Elevated 5xx or structured error rates from the verification provider
  (`ProblemDetails` parsing in `src/v1-client.ts`)
- Elevated **409** idempotency conflicts on create
- Growing count of accounts stuck in **PENDING** (no webhook completion path yet)

## Rollback

Before rolling back to the prior synchronous v1 behaviour:

1. Stop sending new v2 create requests.
2. Allow in-flight **PENDING** accounts to drain or be manually reconciled.
3. Point `baseUrl` back to v1 and redeploy the prior synchronous code path.

Do not enable v2 traffic until webhook completion is implemented in a follow-on
increment. No feature-flag or drain automation is implemented in this increment.

Evidence: plan `rollbackProcedure`.

## Known limitations

- No webhook handling; `PENDING` accounts do not auto-transition to terminal status
- Idempotency key is generated per `submitVerification` attempt
  (`src/verification-service.ts`); **409** conflicts are surfaced, not retried
  blindly (`src/v1-client.ts`)
- Create path returns pending acknowledgement only; tests assert no terminal
  `VERIFIED`/`REJECTED` from create alone (`tests/verification-service.test.ts`)
- Secret rotation, outbox/exactly-once delivery, and scheduled reconciliation for
  missed webhooks are deferred

## Validation

Typecheck (`tsc --noEmit`) passes. Tests in `tests/verification-service.test.ts`
were rewritten for pending-only create behaviour. Control-plane verification should
run `npm test` in a Linux environment with native build support for
`better-sqlite3`.
