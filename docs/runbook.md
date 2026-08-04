# Legacy Service Runbook

## Overview

This service submits customer identity verifications to the Identity Verification API
using **v2 create acknowledgement semantics** (`src/v1-client.ts`). `submitVerification`
calls `createVerification`, treats HTTP 202 as success, and returns `VerificationAccepted`
with `status: PENDING` (`src/verification-service.ts`). The service persists in-flight
account state (`status: PENDING`, `lastVerificationId`) and does **not** map terminal
`PASS`/`FAIL` decisions on create (`src/verification-service.ts`, `src/db.ts`).

## Dependencies

- Identity Verification API v2 create endpoint (`POST /verifications`; configured via
  `IDENTITY_API_BASE_URL`, e.g. `https://api.example.com/v2`) (`src/v1-client.ts`)
- Local SQLite for account state (`src/db.ts`)

## Operations

### Submit verification

1. Caller invokes `submitVerification` (`src/verification-service.ts`).
2. Service generates a fresh `Idempotency-Key` (UUID) per call and sends it on
   `POST /verifications` (`src/verification-service.ts`, `src/v1-client.ts`).
3. On HTTP 202, the client parses `VerificationAccepted` (`verificationId`,
   `status: PENDING`) and returns it to the caller (`src/v1-client.ts`,
   `src/verification-service.ts`).
4. Account `status` is set to `PENDING` and `lastVerificationId` is persisted
   (`src/db.ts`, `src/verification-service.ts`).
5. Non-202 responses (including HTTP 409 idempotency conflict) are parsed as
   `ProblemDetails` and surfaced via `VerificationApiError`; no terminal account
   decision is applied (`src/v1-client.ts`).

### Webhook completion

**Not implemented in this increment.** Inbound `/webhooks/verification-completed`
handling, signature verification, event deduplication, and applying terminal
`PASS`/`FAIL` decisions to account status are deferred (plan exclusions). Accounts
may remain in `PENDING` until a future increment delivers webhook completion.

### Pending records

- `AccountStatus` includes `PENDING` for in-flight verifications (`src/db.ts`).
- Each successful create stores `lastVerificationId` from the 202 response
  (`src/verification-service.ts`, `src/db.ts`).
- Operators should treat `PENDING` rows as awaiting an external terminal decision;
  do not assume `VERIFIED` or `REJECTED` from `submitVerification` alone
  (`tests/verification-service.test.ts`).

### Alerts

- Elevated 5xx from the Identity Verification API provider (`src/v1-client.ts`)
- Elevated rate of `VerificationApiError` (including HTTP 409 idempotency conflicts)
  (`src/v1-client.ts`)
- Growing count of accounts stuck in `PENDING` (webhook completion not yet deployed;
  plan exclusions)

## Rollback

If v2 acknowledgement behaviour causes regressions:

1. Revert this increment's commits.
2. Route `createVerification` traffic back to the v1 base URL via configuration
   (e.g. `IDENTITY_API_BASE_URL` pointing at `/v1`) (plan `rollbackProcedure`).
3. Drain in-flight `PENDING` accounts: pause new submissions until operators confirm
   no partial state remains, or manually reconcile `lastVerificationId` rows before
   re-enabling v1 synchronous flow (plan `rollbackProcedure`, `src/db.ts`).
4. Do **not** enable webhook completion or traffic shifting as part of rollback for
   this increment (plan `rollbackProcedure`).

## Known limitations

- **No webhook handling** — terminal decisions are not applied from create; completion
  path is deferred (plan exclusions, `src/verification-service.ts`).
- **Idempotency key not persisted across retries** — a fresh UUID is generated per
  `submitVerification` call; cross-retry deduplication is deferred (plan `assumptions`,
  `src/verification-service.ts`).
- **No retry policy from `ProblemDetails.retryable`** — the field is parsed but not
  used to drive automatic retries (plan exclusions, `src/v1-client.ts`).
- **No outbox, exactly-once delivery, or scheduled reconciliation** for missed
  webhooks (plan exclusions).
- **Package exports** expose `VerificationAccepted` instead of legacy
  `VerificationResult` on the entrypoint (`src/index.ts`).
