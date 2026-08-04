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

## Operations

### Submit verification

1. Caller invokes `submitVerification`.
2. Service calls `createVerification` with a per-attempt `Idempotency-Key` header;
   success requires HTTP **202** and a `VerificationAccepted` body. HTTP 200 with a final
   `PASS`/`FAIL` decision is no longer the success path.
3. Account status is persisted as **`PENDING`** with `lastVerificationId` set from the
   acknowledgement. The account is neither `VERIFIED` nor `REJECTED` at submit time.

### Pending records

- Accounts in **`PENDING`** represent in-flight verification until webhook completion
  applies a final outcome.
- `getAccountBySubject` reflects the persisted `PENDING` row and stored
  `lastVerificationId`.

### Webhook completion

- **Not implemented in this increment.** No handler ingests verification-completed
  webhooks; accounts left in `PENDING` will not transition to `VERIFIED` or `REJECTED`
  without a future webhook ingestion increment.

### Alerts

- Elevated 5xx or non-202 responses from the verification provider
- Elevated latency on `submitVerification` (blocks on create acknowledgement round-trip)

## Rollback

Maintain the ability to route to the pre-migration synchronous client and
`submitVerification` behaviour via feature flag or versioned base URL. Before cutover,
ensure no callers depend on immediate `VERIFIED`/`REJECTED` from the create response.

Rolling back after partial deployment: revert the client and service changes, restore
synchronous test expectations, and point `baseUrl` back to the v1 endpoint. Accounts left
in `PENDING` during rollback require manual or follow-up reconciliation; rollback does
not leave the system free of pending async work.

Do not execute feature-flag changes or traffic shifts as part of routine runbook steps
without operational approval.

## Known limitations

- **No webhook handling** — final PASS/FAIL is never applied to persisted accounts
- **No webhook signature verification** or event deduplication
- Create call still blocks on provider acknowledgement latency (HTTP 202 round-trip)
- Non-202 create responses parse `ProblemDetails` and throw; HTTP **409** idempotency
  conflicts surface as `IdempotencyConflictError`, other failures as
  `VerificationClientError`. Prior account state is unchanged on error
- No retry/backoff driven by ProblemDetails `retryable` hints
