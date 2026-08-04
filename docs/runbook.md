# Legacy Service Runbook

## Overview

This service verifies customer identity by calling the Identity Verification API **v2**
acknowledge contract. `submitVerification` calls `POST /verifications` with an
**Idempotency-Key**, accepts HTTP **202** with status **PENDING**, and persists a
**PENDING** account until a terminal outcome arrives via webhook (deferred).

## Dependencies

- Identity Verification API v2 (`https://api.example.com/v2`) — base URL is configured outside this service (`src/v1-client.ts`)
- Local SQLite for account state (`src/db.ts`)

## Verification lifecycle

This increment implements the **acknowledge-first** portion of the lifecycle only:

1. **Submit** — caller invokes `submitVerification` (`src/verification-service.ts`).
2. **Create** — service generates one `Idempotency-Key` per invocation and calls provider `createVerification` (`src/verification-service.ts`, `src/v1-client.ts`).
3. **Acknowledge** — on HTTP **202**, provider returns `VerificationAccepted` with `verificationId` and status `PENDING` (`src/v1-client.ts`).
4. **Persist** — account status is written as **PENDING** with `lastVerificationId` set (`src/verification-service.ts`, `src/db.ts`).
5. **Return** — caller receives the pending acknowledgement; no terminal VERIFIED/REJECTED decision is derived from the create response (`src/verification-service.ts`).
6. **Complete** — terminal PASS/FAIL account transitions are **deferred** to webhook ingestion in a follow-on increment (not implemented here).

Do **not** expect HTTP 200 or immediate VERIFIED/REJECTED account status on submit.

## Operations

### Submit verification

1. Caller invokes `submitVerification`.
2. Service generates an Idempotency-Key (`randomUUID`) and calls provider `createVerification` (`src/verification-service.ts`).
3. Provider returns HTTP **202** with a `VerificationAccepted` body (`verificationId`, status `PENDING`) (`src/v1-client.ts`).
4. Account status is persisted as **PENDING** with `lastVerificationId` set (`src/verification-service.ts`, `src/db.ts`).
5. Returned output reflects the pending acknowledgement — not a terminal VERIFIED/REJECTED decision (`src/verification-service.ts`).

### Create-call error handling

- **HTTP 409** (idempotency conflict) — `createVerification` throws `VerificationClientError` with `ProblemDetails`; no account row is written (`src/v1-client.ts`, `tests/verification-service.test.ts`).
- **Other non-202 responses** — `createVerification` throws `VerificationClientError` with parsed `ProblemDetails` when available (`src/v1-client.ts`, `tests/verification-service.test.ts`).

Operators should treat repeated 409s as a signal to inspect idempotency-key reuse or payload mismatches at the caller boundary.

## Pending records

After a successful HTTP **202** acknowledge:

| Field | Value | Source |
|-------|-------|--------|
| `status` | `PENDING` | `src/db.ts`, `src/verification-service.ts` |
| `lastVerificationId` | provider `verificationId` from `VerificationAccepted` | `src/verification-service.ts` |
| `updatedAt` | ISO timestamp from submit invocation | `src/verification-service.ts` |

`AccountStatus` also supports `UNVERIFIED`, `VERIFIED`, and `REJECTED`, but this increment does **not** set VERIFIED or REJECTED on the create path (`src/db.ts`, `src/verification-service.ts`).

If `createVerification` fails (409 or other non-202), no account is persisted for that subject (`tests/verification-service.test.ts`).

PENDING accounts remain in SQLite until webhook ingestion or manual operator resolution in a later increment.

## Webhook operations (deferred)

The following webhook-related capabilities are **not** implemented in the acknowledge-first increment:

- Webhook endpoint (`/webhooks/verification-completed`)
- Webhook signature or authentication verification
- `eventId` deduplication and exactly-once terminal status application
- Secret rotation automation
- Outbox or exactly-once delivery infrastructure
- Scheduled reconciliation of stuck PENDING verifications
- Feature-flag drain automation
- Deployment or traffic-shifting execution

Terminal PASS/FAIL account transitions require webhook ingestion in a follow-on increment. Until then, operators cannot rely on this service to apply VERIFIED/REJECTED from provider callbacks.

### Alerts

- Elevated 5xx from provider
- Elevated HTTP 409 (idempotency conflicts) on create (`src/v1-client.ts`)
- Growing volume of accounts stuck in PENDING (reconciliation deferred)

## Rollback

Before reverting provider traffic to v1 synchronous behaviour:

1. **Stop new submits** to prevent additional PENDING accounts.
2. **Drain in-flight work**: identify accounts in **PENDING** status (`src/db.ts`) and either wait for manual resolution or accept that v1 rollback will not replay missing webhook completions.
3. Do not cut back until PENDING volume is acceptable — this increment does not automate drain or flag-based routing.
4. Re-deploy the prior service binary that expects synchronous HTTP 200 if provider v1 remains available.

Because webhook completion was never deployed in this increment, rolling back leaves any in-flight PENDING accounts without an automated terminal transition path.

## Known limitations

- No webhook handling in this increment
- No terminal VERIFIED/REJECTED updates on the create path (`src/verification-service.ts`)
- PENDING accounts require follow-on webhook ingestion or manual operator resolution
- Idempotency-Key is generated once per `submitVerification` call; explicit client-side retry replay of the same key is outside this increment's scope (`src/verification-service.ts`)
- Provider base URL targeting `/v2` is a configuration change outside this increment's code scope (`src/v1-client.ts`)
