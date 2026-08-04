# Legacy Service Runbook

## Overview

This service submits customer identity verification requests and persists **pending**
acceptance locally. `submitVerification` calls `POST /verifications`, treats HTTP **202**
with `VerificationAccepted` (`verificationId`, `status: PENDING`) as success, and stores
the account in `PENDING` with `lastVerificationId`. Final `VERIFIED`/`REJECTED` adjudication
is not applied synchronously from the create response.

## Dependencies

- Identity Verification API (`https://api.example.com/v1` in tests)
- Local SQLite for account state

## Lifecycle (increment 1)

1. Caller invokes `submitVerification`.
2. Service generates a per-attempt idempotency key (`randomUUID`) and calls
   `createVerification` with an `Idempotency-Key` header.
3. `createVerification` treats HTTP **202** and a `VerificationAccepted` body as success;
   HTTP 200 with a final `PASS`/`FAIL` decision is no longer the success path.
4. On acceptance, the service persists the account as **`PENDING`** with
   `lastVerificationId` from `verificationId` and returns the pending acceptance to the
   caller (`SubmitVerificationOutput.verification` is `VerificationAccepted`).
5. Final `VERIFIED`/`REJECTED` outcome is deferred to a later webhook ingestion increment;
   this increment does not apply terminal status from the create call.

On create failure, `upsertAccount` is not reached, so any existing account row is left
unchanged.

## Operations

### Submit verification

1. Caller invokes `submitVerification`.
2. Service calls `createVerification` with a per-attempt `Idempotency-Key` header;
   success requires HTTP **202** and a `VerificationAccepted` body.
3. Account status is persisted as **`PENDING`** with `lastVerificationId` set from the
   acknowledgement. The account is neither `VERIFIED` nor `REJECTED` at submit time.

### Pending records

- Valid account statuses include `UNVERIFIED`, `PENDING`, `VERIFIED`, and `REJECTED`.
- Accounts in **`PENDING`** represent in-flight verification until webhook completion
  applies a final outcome.
- `getAccountBySubject` reflects the persisted `PENDING` row and stored
  `lastVerificationId`.
- For rollback reconciliation, treat rows with `status: PENDING` and a non-null
  `lastVerificationId` as v2-accepted in-flight work.

### Webhook completion

- **Not implemented in this increment.** No handler ingests verification-completed
  webhooks; accounts left in `PENDING` will not transition to `VERIFIED` or `REJECTED`
  without a future webhook ingestion increment.
- Out of scope here: webhook endpoint registration, signature or shared-secret validation,
  `eventId` deduplication, secret rotation, outbox or exactly-once delivery, scheduled
  reconciliation for missed webhooks, and applying terminal `VERIFIED`/`REJECTED` updates
  from webhook `PASS`/`FAIL` events.
- No polling or status-query fallback when webhooks are delayed or fail.

### Alerts

- Non-202 create responses (including HTTP **409** idempotency conflicts and other
  `ProblemDetails` failures)
- Provider 5xx responses on create
- Elevated latency on `submitVerification` (blocks on create acknowledgement round-trip)

## Rollback

Maintain the ability to route to the pre-migration synchronous client and
`submitVerification` behaviour via feature flag or versioned base URL (for example,
`API_VERSION=v1` vs a v2 base URL). Before cutover, ensure no callers depend on immediate
`VERIFIED`/`REJECTED` from the create response.

To roll back after partial deployment:

1. Stop sending traffic to the v2 code path.
2. Revert the client and service changes, restore synchronous test expectations, and point
   `baseUrl` back to the v1 endpoint.
3. Drain in-flight `PENDING` accounts by waiting for manual resolution or reverting to v1
   synchronous behaviour for new submissions only; do not auto-delete `PENDING` rows.
4. Document accounts accepted under v2 (`status: PENDING`, `lastVerificationId` present) for
   operator reconciliation.

This increment does not implement feature-flag automation or drain jobs; operators execute
rollback manually. Rollback does not leave the system free of pending async work.

Do not execute feature-flag changes or traffic shifts as part of routine runbook steps
without operational approval.

## Known limitations

- **No webhook handling** — final PASS/FAIL is never applied to persisted accounts
- **No webhook signature verification** or event deduplication
- **No polling fallback** when webhooks are delayed or fail
- Create call still blocks on provider acknowledgement latency (HTTP 202 round-trip)
- Non-202 create responses parse `ProblemDetails` and throw; HTTP **409** idempotency
  conflicts surface as `IdempotencyConflictError`, other failures as
  `VerificationClientError`. Prior account state is unchanged on error
- No retry/backoff driven by ProblemDetails `retryable` hints
