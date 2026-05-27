---
name: B2 Account ID Auth
description: With Backblaze B2 application keys, the accountId for b2_list_buckets must come from the b2_authorize_account response, not the B2_ACCOUNT_ID env var.
---

## Rule
When calling `b2_list_buckets` (and any other B2 API call requiring `accountId`), always use the `accountId` field returned by `b2_authorize_account` — never pass `B2_ACCOUNT_ID` directly from the environment.

**Why:** With scoped application keys, B2's `b2_authorize_account` returns an `accountId` that may differ from the master account ID. Using the master account ID in subsequent calls causes `{ "code": "bad_request", "message": "accountId invalid", "status": 400 }`.

**How to apply:** Store `authorizedAccountId = data.accountId` from the auth response. Use that variable (not `B2_ACCOUNT_ID`) in `b2_list_buckets`, and clear it in `invalidateAuth()` alongside `authToken`.
