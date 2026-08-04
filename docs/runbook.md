# Legacy Service Runbook

## Overview

This service verifies customer identity by calling the Identity Verification API **v2**
acknowledge contract. `submitVerification` calls `POST /verifications` with an
**Idempotency-Key**, accepts HTTP **202** with status **PENDING**, and persists a
**PENDING** account until a terminal outcome arrives via webhook (deferred).

## Dependencies

- Identity Verification API v2 (`https://api.example.com/v2`) — base URL is configured outside this service
- Local SQLite for account state

## Operations

### Submit verification

1. Caller invokes `submitVerification`.
2. Service generates an Idempotency-Key and calls provider `createVerification`.
3. Provider returns HTTP **202** with a `VerificationAccepted` body (`verificationId`, status `PENDING`).
4. Account status is persisted as **PENDING** with `lastVerificationId` set.
5. Returned output reflects the pending acknowledgement — not a terminal VERIFIED/REJECTED decision.

Do **not** expect HTTP 200 or immediate VERIFIED/REJECTED account status on submit.

### Deferred to later increments

The following are **not** implemented in the acknowledge-first increment:

- Webhook endpoint (`/webhooks/verification-completed`)
- Webhook signature or authentication verification
- `eventId` deduplication and exactly-once terminal status application
- Secret rotation automation
- Outbox or exactly-once delivery infrastructure
- Scheduled reconciliation of stuck PENDING verifications
- Feature-flag drain automation
- Deployment or traffic-shifting execution

Terminal PASS/FAIL account transitions require webhook ingestion in a follow-on increment.

### Alerts

- Elevated 5xx from provider
- Elevated HTTP 409 (idempotency conflicts) on create
- Growing volume of accounts stuck in PENDING (reconciliation deferred)

## Rollback

Before reverting provider traffic to v1 synchronous behaviour:

1. **Stop new submits** to prevent additional PENDING accounts.
2. **Drain in-flight work**: identify accounts in **PENDING** status and either wait for manual resolution or accept that v1 rollback will not replay missing webhook completions.
3. Do not cut back until PENDING volume is acceptable — this increment does not automate drain or flag-based routing.
4. Re-deploy the prior service binary that expects synchronous HTTP 200 if provider v1 remains available.

## Known limitations

- No webhook handling in this increment
- No terminal VERIFIED/REJECTED updates on the create path
- PENDING accounts require follow-on webhook ingestion or manual operator resolution
