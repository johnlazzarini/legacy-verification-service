# Legacy Service Runbook

## Overview

This service verifies customer identity by calling the Identity Verification API **v2**
asynchronously. `submitVerification` sends `POST /verifications` with an `Idempotency-Key`,
accepts HTTP **202** with `VerificationAccepted` (`status: PENDING`), and persists a
`PENDING` account until a final decision arrives via webhook (deferred work).

## Dependencies

- Identity Verification API v2 (`https://api.example.com/v2`)
- Local SQLite for account state

## Operations

### Submit verification

1. Caller invokes `submitVerification`.
2. Service calls v2 `createVerification` with a generated `Idempotency-Key`.
3. On HTTP 202, account status becomes `PENDING` and `lastVerificationId` is stored.
4. Final `VERIFIED` or `REJECTED` is applied later when the verification-completed webhook
   is implemented (not in this increment).

### Alerts

- Elevated 5xx from v2 provider
- Elevated rate of HTTP 409 idempotency conflicts
- Growing backlog of accounts stuck in `PENDING` (no webhook receiver yet)

## Rollback

Keep v1 synchronous create available behind configuration until in-flight `PENDING` accounts
are drained. To roll back: disable v2 create, stop new `PENDING` records, reconcile or
manually resolve existing `PENDING` accounts, then revert client and runbook to v1 behaviour.

## Known limitations

- No webhook endpoint (`POST /webhooks/verification-completed`) — final PASS/FAIL never applied
- No webhook signature verification or event deduplication
- No polling or status GET to recover missed webhooks
- Idempotency replay semantics beyond 409 conflict are not fully specified
