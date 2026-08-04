# Legacy Service Runbook

## Overview

This service verifies customer identity by calling the Identity Verification API **v1**
synchronously. `submitVerification` blocks on `POST /verifications`, then updates the
local account status from the final `PASS`/`FAIL` response.

## Dependencies

- Identity Verification API v1 (`https://api.example.com/v1`)
- Local SQLite for account state

## Operations

### Submit verification

1. Caller invokes `submitVerification`.
2. Service calls v1 `createVerification` and waits for HTTP 200.
3. Account status becomes `VERIFIED` or `REJECTED` immediately.

### Alerts

- Elevated 5xx from v1 provider
- Elevated latency on `submitVerification` (synchronous coupling)

## Rollback

Restore the previous service binary. There is no pending async work in v1.

## Known limitations

- No webhook handling
- No idempotency key on provider calls
- Synchronous coupling means provider latency is user-facing
