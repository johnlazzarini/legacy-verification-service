# Legacy Service Runbook

## Overview

This service verifies customer identity by calling the Identity Verification API **v2**
asynchronously. `submitVerification` (`src/verification-service.ts`) sends `POST /verifications`
via `createVerification` (`src/v1-client.ts`) with an `Idempotency-Key`, accepts HTTP **202**
with `VerificationAccepted` (`status: PENDING`), and persists a `PENDING` account
(`src/db.ts`) until a final decision arrives via webhook (deferred work).

## Dependencies

- Identity Verification API v2 (`https://api.example.com/v2`)
- Local SQLite for account state (`src/db.ts`)

## Account lifecycle

Account status is stored in SQLite (`src/db.ts`). Valid values are `UNVERIFIED`, `PENDING`,
`VERIFIED`, and `REJECTED`.

| Phase | Status | How it is reached in this increment |
|-------|--------|--------------------------------------|
| Not yet submitted | `UNVERIFIED` | Default before any successful create acknowledgement |
| Accepted, awaiting decision | `PENDING` | `submitVerification` persists `PENDING` and `lastVerificationId` after HTTP 202 (`src/verification-service.ts`) |
| Approved | `VERIFIED` | Not applied in this increment — requires webhook handler (deferred) |
| Denied | `REJECTED` | Not applied in this increment — requires webhook handler (deferred) |

`submitVerification` returns `{ account, verification }` where `verification` is a
`VerificationAccepted` (`src/verification-service.ts`, `src/index.ts`). Callers must not
expect a terminal PASS/FAIL from the create response; synchronous mapping from
`verification.status` to `VERIFIED`/`REJECTED` was removed (`src/verification-service.ts`).

## Operations

### Submit verification

1. Caller invokes `submitVerification` (`src/verification-service.ts`).
2. Service generates an `Idempotency-Key` and calls v2 `createVerification`
   (`src/v1-client.ts`) with `POST /verifications`.
3. On HTTP **202**, the client parses `VerificationAccepted` (`verificationId`,
   `status: PENDING`) (`src/v1-client.ts`).
4. Account status becomes `PENDING` and `lastVerificationId` is set to the accepted
   `verificationId` (`src/verification-service.ts`, `src/db.ts`).
5. On HTTP **409**, `createVerification` throws `VerificationClientError` with
   `ProblemDetails`; no account row is written (`src/v1-client.ts`,
   `tests/verification-service.test.ts`).
6. On other non-202 responses (e.g. HTTP **400**), `VerificationClientError` is thrown
   with parsed `ProblemDetails` (`src/v1-client.ts`, `tests/verification-service.test.ts`).

Validated behaviour (`tests/verification-service.test.ts`):

- HTTP 202 → returned and persisted `PENDING`, `lastVerificationId` matches accepted
  `verificationId`, `Idempotency-Key` header sent.
- HTTP 409 → structured conflict error; account not persisted.
- HTTP 400 → structured error; no terminal status applied.

### Webhook completion (deferred — not implemented)

Final `VERIFIED` or `REJECTED` transitions are **not** applied by this increment. The
following are explicitly out of scope:

- Inbound `POST /webhooks/verification-completed` endpoint
- Webhook signature verification and `VerificationWebhookEvent` eventId deduplication
- Applying PASS/FAIL terminal account transitions from webhook events

Until webhook work lands, accounts accepted via create remain `PENDING` indefinitely.
There is no polling or status GET endpoint to recover missed webhooks.

### Pending-record operations

- **Identification:** Query SQLite for `status = 'PENDING'` (`src/db.ts`). Each row's
  `lastVerificationId` holds the v2 verification id from the accepted create
  (`src/verification-service.ts`).
- **Accumulation:** With no webhook receiver, `PENDING` accounts may grow without bound
  until webhook handling is implemented.
- **Failed creates:** HTTP 409/400 paths do not persist an account
  (`tests/verification-service.test.ts`); only successful 202 acknowledgements create or
  update `PENDING` rows.
- **Idempotency:** Safe-replay semantics beyond surfacing HTTP 409 conflict are not
  specified in the client contract (`src/v1-client.ts`).

### Alerts

Monitor for conditions that indicate create-path or backlog risk (no automated thresholds
are defined in this repository):

- Elevated 5xx from v2 provider (`src/v1-client.ts` non-202 error path)
- Elevated rate of HTTP 409 idempotency conflicts (`tests/verification-service.test.ts`)
- Growing count of accounts stuck in `PENDING` (no webhook receiver yet)

## Rollback

Procedural guidance only — no feature-flag drain automation or traffic shifting is
implemented in this increment.

Before enabling v2 create in production, confirm no callers depend on synchronous
`VERIFIED`/`REJECTED` outcomes from `submitVerification` (`src/verification-service.ts`).

To roll back after partial adoption:

1. Keep v1 synchronous create available behind configuration until in-flight `PENDING`
   accounts are drained or reconciled.
2. Disable the v2 create path; stop issuing new `PENDING` records.
3. Allow existing `PENDING` verifications to age out or be manually resolved.
4. Revert client (`src/v1-client.ts`) and this runbook to v1 synchronous behaviour.

Do not shift traffic or automate flag toggles as part of this increment.

## Known limitations

- **No webhook receiver** — final PASS/FAIL is never applied; `VERIFIED`/`REJECTED` are
  not set from create alone (`src/verification-service.ts`).
- **No webhook authenticity** — signature verification, shared secrets, and mTLS are
  unspecified and unimplemented.
- **No missed-webhook recovery** — no polling, status GET, outbox, exactly-once delivery,
  or scheduled reconciliation.
- **Idempotency gaps** — replay semantics beyond HTTP 409 conflict are not fully
  specified (`src/v1-client.ts`).
- **Secret rotation** — webhook or API credential rotation is out of scope.
- **Export contract change** — `SubmitVerificationOutput` exposes pending
  `VerificationAccepted` instead of terminal `VerificationResult` (`src/index.ts`,
  `src/verification-service.ts`); downstream callers must tolerate the pending shape.
