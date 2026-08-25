# ConsentGuard — Complete System Architecture

**Two services. One source of truth for consent. Real enforcement, not a checkbox.**

---

## 1. System Overview

ConsentGuard is made of exactly two deployable services:

| Service               | Role                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **ConsentGuard Core** | Owns all consent data. Node.js + Express + MongoDB REST API. The only service that reads/writes consent state.                        |
| **Hospital Portal**   | Reference consumer application. Next.js app with **zero embedded permission logic** — every consent-dependent action asks Core first. |

The whole point of the project is visible in one sentence: **the portal cannot decide anything about consent on its own; it can only ask Core and obey the answer.** Every design decision below exists to make that statement literally true, not aspirational.

### 1.1 High-level diagram

```
                         ┌─────────────────────────────┐
                         │        Hospital Portal        │
                         │        (Next.js, SSR)         │
                         │                                │
   Patient / Staff  ───▶ │  Pages (no permission logic)  │
                         │        │                       │
                         │        ▼                       │
                         │  consentGuard.js middleware     │
                         │  (cache + fail-closed default)  │
                         └───────────┬─────────┬──────────┘
                                     │         │
                       REST (API key)│         │ SSE stream (push, non-authoritative)
                                     ▼         ▼
                         ┌─────────────────────────────┐
                         │      ConsentGuard Core         │
                         │  ┌───────────────────────┐  │
                         │  │ auth      purposes      │  │
                         │  │ consents  policies      │  │
                         │  │ check     applications  │  │
                         │  │ audit     health/ready  │  │
                         │  └───────────────────────┘  │
                         └───────────────┬─────────────┘
                                         ▼
                                    MongoDB
                       (ConsentRecord current-state + append-only AuditLog)
```

### 1.2 Design principles (non-negotiable across both services)

1. The database is always the source of truth. Real-time push is a convenience notification, never authoritative (see §10).
2. Core defaults to **deny** whenever it cannot positively confirm consent — unreachable, DB error, malformed data (see §12).
3. The portal never stores or evaluates a consent flag itself. It renders whatever Core's `/check` says, every time.
4. Every mutation is idempotent, attributable (actor + timestamp), and produces an audit record before it's considered complete.

---

## 2. Tenancy Model

`ConsumerApplication` is the tenancy boundary for everything that defines _what consent means_.

```
ConsumerApplication  (e.g. "Hospital Portal")
      └── ConsentPurpose        (e.g. "MARKETING_COMMS", scoped to this app)
              └── PolicyVersion  (e.g. v1, v2 — immutable once published)

A ConsentRecord represents the current consent state for a User × Application × Purpose,
and stores the PolicyVersion actually accepted.
```

This means:

- Two different consumer apps can each define their own "Marketing" purpose with completely different policy text — they never collide.
- A user's consent state is per application. Withdrawing Marketing consent inside the Hospital Portal has no effect on any other (hypothetical) consumer app.
- Uniqueness is enforced at each level independently (see §3 indexes).

---

## 3. Data Model

MongoDB via Mongoose. All timestamps are ISO 8601 / UTC internally.

### 3.1 `User`

```
_id            ObjectId
email          String   (unique, lowercased)
passwordHash   String   (bcrypt/Argon2)
role           Enum[ 'USER', 'ADMIN' ]
createdAt      Date
updatedAt      Date
```

### 3.2 `ConsumerApplication`

```
_id                 ObjectId
name                String   (unique)
status              Enum[ 'ACTIVE', 'SUSPENDED' ]
apiKeyHash          String   (HMAC-SHA256 of current key — never bcrypt, see §7.2)
previousKeyHash     String | null   (grace-period key during rotation)
previousKeyExpiresAt Date | null
scopes              [String]   (e.g. 'consent:check', 'consent:stream', 'audit:read')
createdAt           Date
lastUsedAt          Date | null
```

### 3.3 `ConsentPurpose`

```
_id            ObjectId
applicationId  ObjectId  (ref ConsumerApplication)
code           String    (e.g. 'MARKETING_COMMS')
name           String
description    String
required       Boolean   (true = cannot be withdrawn via normal UI)
active         Boolean
createdAt      Date

unique index: (applicationId, code)
```

### 3.4 `PolicyVersion`

```
_id                ObjectId
purposeId          ObjectId  (ref ConsentPurpose)
version            String    (e.g. '2.1')
content            String    (policy text shown to user)
status             Enum[ 'DRAFT', 'PUBLISHED' ]
requiresReconsent  Boolean   (set at publish time)
createdAt          Date
publishedAt        Date | null

unique index: (purposeId, version)
```

Published versions are immutable — no update endpoint touches `content` after `status: PUBLISHED`.

### 3.5 `ConsentRecord` — current state for User × Application × Purpose

```
_id             ObjectId
userId          ObjectId  (ref User)
applicationId   ObjectId  (ref ConsumerApplication)
purposeId       ObjectId  (ref ConsentPurpose)
policyVersionId ObjectId  (ref PolicyVersion — version actually agreed to)
status          Enum[ 'NOT_GRANTED', 'GRANTED', 'WITHDRAWN' ]
version         Number    (optimistic concurrency counter)
grantedAt       Date | null
withdrawnAt     Date | null
updatedAt       Date

unique index: (userId, applicationId, purposeId)
index:        (applicationId, purposeId, status)   -- hot path for /check
```

History of _prior_ grants is not stored as extra rows here — it lives in `AuditLog`. This is the "current state + append-only audit" model, not a naive overwrite.

### 3.6 `AuditLog` — append-only

```
_id            ObjectId
actorId        ObjectId | null   (user or admin who caused this)
actorType      Enum[ 'USER', 'ADMIN', 'SYSTEM' ]
applicationId  ObjectId
purposeId      ObjectId | null
action         String    (e.g. 'CONSENT_GRANTED', 'POLICY_PUBLISHED', 'KEY_ROTATED')
previousState  String | null
newState       String | null
metadata       Object    (request IP, user-agent — never tokens/passwords)
createdAt      Date

index: (applicationId, createdAt)
index: (actorId, createdAt)
```

Written through a DB credential with **insert-only** grants (no UPDATE/DELETE) — enforced at the database layer, not just the application layer.

### 3.7 `RefreshToken`

```
_id            ObjectId
userId         ObjectId  (ref User)
tokenHash      String    (hash of the refresh token — raw token is never stored)
expiresAt      Date
revokedAt      Date | null
createdAt      Date

unique index: (tokenHash)
index:        (userId)
```

Refresh is rotate-on-use: each `/api/auth/refresh` call marks the presented token's `revokedAt` and issues a new row. Logout sets `revokedAt` on the current token. A stolen-and-replayed old token is therefore rejected once the legitimate client has rotated past it.

### 3.8 `IdempotencyKey`

```
_id             ObjectId
applicationId   ObjectId    (or userId, depending on which API surface)
key             String      (client-supplied, e.g. UUID)
requestHash     String      (hash of the request body)
responseSnapshot Object     (the response returned the first time)
createdAt       Date

unique index: (applicationId, key)
```

---

## 4. Consent State Machine

```
NOT_GRANTED ──grant──▶ GRANTED ──withdraw──▶ WITHDRAWN ──grant(re-consent)──▶ GRANTED
```

Rules:

- Only these three states are ever persisted on `ConsentRecord.status`. `RECONSENT_REQUIRED` is **never persisted** — it's a `/check`-time computed reason code only (see §5, rule 6). Persisting it would let the stored state and the computed state disagree.
- Invalid transitions are rejected explicitly, not silently accepted:

| Attempted operation | Current status                           | Result                                                       |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Withdraw            | `WITHDRAWN`                              | `409` — `ALREADY_WITHDRAWN`                                  |
| Withdraw            | `NOT_GRANTED`                            | `409` — `NOTHING_TO_WITHDRAW`                                |
| Withdraw            | required purpose                         | `403` — `PURPOSE_NOT_WITHDRAWABLE`                           |
| Grant               | already `GRANTED` at same policy version | `200` — no-op, returns current record (idempotent by nature) |

- Every transition is guarded by the `version` optimistic-concurrency field: a write that doesn't match the expected version is rejected with `409 CONFLICT`, forcing the client to re-fetch and retry — this is what actually prevents the double-click/race problem, on top of idempotency keys.
- **Required purposes are never left `NOT_GRANTED`.** A `ConsentRecord` with `status: GRANTED` is created automatically for every `required: true` purpose at the moment a user first interacts with that application (account creation on the portal, or first login). This is a deliberate default, not an omission — a required purpose represents "the service cannot function without this," so its consent record exists in the granted state from the start; the withdraw endpoint then rejects any attempt to change it (see `PURPOSE_NOT_WITHDRAWABLE` above).

---

## 5. The Decision Engine (`/check`)

Evaluated top to bottom. First match wins.

| #   | Condition                                                                                                                                      | Result      | Reason code           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------- |
| 1   | Purpose doesn't exist or `active: false`                                                                                                       | denied      | `PURPOSE_NOT_FOUND`   |
| 2   | Purpose's `applicationId` doesn't match the application resolved from the caller's API key (see below), or key lacks `consent:check` scope     | denied      | `NOT_SCOPED`          |
| 3   | No `ConsentRecord` exists for this user under this `applicationId` for **any** purpose — i.e. the user was never onboarded to this application | denied      | `USER_NOT_ASSOCIATED` |
| 4   | No `ConsentRecord` exists for user+app+**this** purpose                                                                                        | denied      | `NO_CONSENT`          |
| 5   | `ConsentRecord.status == WITHDRAWN`                                                                                                            | denied      | `CONSENT_WITHDRAWN`   |
| 6   | `status == GRANTED` but `policyVersionId` ≠ purpose's active published version **and** that active version has `requiresReconsent: true`       | denied      | `RECONSENT_REQUIRED`  |
| 7   | `status == GRANTED`, version check passes or reconsent isn't required                                                                          | **allowed** | `OK`                  |
| —   | Core unreachable / DB error at any point in evaluation                                                                                         | denied      | `SERVICE_UNAVAILABLE` |

Rule 6 is evaluated lazily at read time — publishing a new policy version never triggers a bulk write across existing `ConsentRecord` rows. It just changes what future `/check` calls compare against.

**Rule 3 exists to close an enumeration gap.** Deriving `applicationId` from the API key (rule 2) proves _which application_ is asking, but on its own it doesn't stop that application from asking about an arbitrary `userId` it has no relationship with — a valid key holder could otherwise probe many user IDs and infer, from the difference between `USER_NOT_ASSOCIATED`-shaped responses and real ones, which IDs belong to actual patients. The integration assumption that closes this: **a consumer application may only check consent for users it has actually onboarded** — established by the required-purpose `ConsentRecord` created automatically at first interaction (§4). Rule 3 checks for the _existence_ of any `ConsentRecord` for that user+application pair before rule 4 even looks at the specific purpose requested. This is deliberately lightweight — an authorization rule reusing data the system already has, not a separate identity-federation layer. A production multi-tenant deployment would likely want a dedicated `ApplicationUser` link table instead of inferring association from `ConsentRecord` existence, but that's out of scope here.

**`applicationId` is never a client-supplied parameter to `/check`.** The caller cannot be trusted to declare which application it represents — that would let one app query or spoof another's consent state simply by passing a different ID. Instead, Core resolves it server-side:

```
API Key (from Authorization header) → ConsumerApplication lookup → applicationId
```

The resolved `applicationId` is what rules 2 and 3 check the request against. This is why `/check` only takes `userId` and `purpose` on the wire (see §6.5) — the application identity comes from _who is asking_, not from what they claim.

---

## 6. Core API — Complete Endpoint Set

### 6.1 Auth

| Method | Path                 | Auth          | Notes                                            |
| ------ | -------------------- | ------------- | ------------------------------------------------ |
| POST   | `/api/auth/register` | Public        | hashes password, creates `USER` role             |
| POST   | `/api/auth/login`    | Public        | returns short-lived access token + refresh token |
| POST   | `/api/auth/refresh`  | Refresh token | rotates refresh token                            |
| POST   | `/api/auth/logout`   | User          | invalidates refresh token                        |

### 6.2 Consumer application management (admin)

| Method | Path                                     | Notes                                                           |
| ------ | ---------------------------------------- | --------------------------------------------------------------- |
| POST   | `/api/admin/applications`                | creates app, returns **raw** key once (never retrievable again) |
| GET    | `/api/admin/applications`                | list, keys never returned — hash only                           |
| PATCH  | `/api/admin/applications/:id`            | update scopes / status                                          |
| POST   | `/api/admin/applications/:id/rotate-key` | issues new key, old key valid for grace window                  |
| POST   | `/api/admin/applications/:id/revoke`     | immediate, no grace period                                      |

### 6.3 Purposes & policies (admin, scoped per application)

| Method | Path                                       | Notes                                      |
| ------ | ------------------------------------------ | ------------------------------------------ |
| POST   | `/api/admin/applications/:appId/purposes`  | create purpose                             |
| PATCH  | `/api/admin/purposes/:id`                  | activate/deactivate                        |
| GET    | `/api/applications/:appId/purposes`        | public — used to render the consent screen |
| POST   | `/api/admin/purposes/:purposeId/policies`  | create draft policy version                |
| POST   | `/api/admin/policies/:id/publish`          | publish, set `requiresReconsent`           |
| GET    | `/api/purposes/:purposeId/policies/active` | current published version                  |

### 6.4 Consents (user-facing)

| Method | Path                                   | Auth | Notes                                     |
| ------ | -------------------------------------- | ---- | ----------------------------------------- |
| GET    | `/api/consents?applicationId=`         | User | current state for all purposes of one app |
| POST   | `/api/consents/grant`                  | User | requires `Idempotency-Key` header         |
| POST   | `/api/consents/withdraw`               | User | requires `Idempotency-Key` header         |
| GET    | `/api/consents/history?applicationId=` | User | user's own chronological history          |

### 6.5 Consent check (service-to-service — the core value proposition)

| Method | Path                                   | Auth                                                                                                               |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/consents/check?userId=&purpose=` | Consumer app API key, `consent:check` scope — `applicationId` resolved from the key, never accepted as a parameter |

Response:

```json
{
  "allowed": false,
  "reason": "CONSENT_WITHDRAWN",
  "purpose": "MARKETING_COMMS",
  "policyVersion": "2.1",
  "checkedAt": "2026-08-22T10:15:00Z",
  "cacheTtlSeconds": 30
}
```

### 6.6 Real-time

| Method    | Path                   | Auth                                                                                                   | Notes                                                |
| --------- | ---------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| GET (SSE) | `/api/consents/stream` | Consumer app API key, `consent:stream` scope — `applicationId` resolved from the key, same as `/check` | pushes `{userId, purposeId, status}` on every change |

### 6.7 Audit

| Method | Path                                                 | Auth                                     | Notes                                                                                                                                                                                                                                                                                       |
| ------ | ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/audit?applicationId=&actorId=&from=&to=` | Core `ADMIN` JWT                         | cross-application, paginated — for people administering ConsentGuard itself                                                                                                                                                                                                                 |
| GET    | `/api/consents/audit`                                | Consumer app API key, `audit:read` scope | scoped to the calling application only — `applicationId` resolved from the key exactly like `/check` (§5); no cross-app or arbitrary-`actorId` query. This is what the Hospital Portal backend calls for its Staff Audit View (§15.3), so staff never need a Core `ADMIN` credential (§7.3) |

### 6.8 Operational

| Method | Path      | Notes                                           |
| ------ | --------- | ----------------------------------------------- |
| GET    | `/health` | process is up                                   |
| GET    | `/ready`  | DB connection + dependencies actually reachable |

---

## 7. Authentication & Authorization

### 7.1 Users

- JWT access token (short-lived, ~15 min) + refresh token (longer-lived, stored server-side so it can be revoked on logout).
- Roles: `USER`, `ADMIN`. Admin routes reject non-admin tokens with `403`, not a silent empty result.
- Passwords hashed with bcrypt/Argon2 — deliberately slow, appropriate for low-entropy human input.

### 7.2 Consumer application API keys

- Keys are high-entropy random tokens (e.g. 32 bytes, base64url) generated server-side and shown to the admin **once**.
- Stored as **HMAC-SHA256** hashes, not bcrypt/Argon2 — those algorithms are intentionally slow to resist brute-forcing weak human passwords; applying that cost to every single `/check` call (which needs to be fast and will be called often) is the wrong tool for high-entropy tokens.
- Rotation: `previousKeyHash` + `previousKeyExpiresAt` allow both old and new key to authenticate during a grace window (e.g. 24h) so a rotation doesn't break every integrated app instantly.
- Revocation is immediate — no grace period, clears both current and previous key.
- Scopes gate what an app's key is allowed to call: `consent:check`, `consent:stream`, `audit:read`. A key without `consent:stream` gets `403` on the SSE endpoint even if valid.

### 7.3 Role boundary — Core roles vs. Portal roles

Core knows exactly two roles, full stop. Everything else is a portal-local concept Core has no awareness of:

```
Core ADMIN      → manages ConsentGuard itself (purposes, policies, applications, cross-app audit)
Portal Staff    → operates hospital functionality           (portal-local role, no Core role)
Portal Patient  → manages their own consent                 (Core USER role)
```

- **A Hospital Staff account is never issued, and the portal never forwards, a Core `ADMIN` JWT.** Every Core call the portal backend makes on a staff member's behalf — running a `/check`, subscribing to the SSE stream, reading this application's own audit trail (§6.7) — authenticates with the Hospital Portal's `ConsumerApplication` API key, the same credential already used everywhere else in this document. It is never proxied through a Core user account of any role.
- Whether a given staff member may view the audit page, trigger a gated action, etc. is decided entirely inside the portal's own authorization logic. Core has no concept of "staff" — that distinction doesn't cross the service boundary.
- **Patients are the one place a real Core JWT is used.** A patient authenticates directly against Core's `/api/auth/*` (Core `USER` role) so that `/api/consents/grant|withdraw|history` — which act on the patient's own record — run as that specific user, not proxied through the portal's application key. This is also why Core `ADMIN` is reserved for people actually administering ConsentGuard itself, not for anyone operating a consumer application.

---

## 8. Mutation → Audit Ordering

Design principle #4 (§1.2) — "produces an audit record before it's considered complete" — is implemented as a single MongoDB multi-document transaction (session), so a `ConsentRecord` mutation and its `AuditLog` entry are committed atomically:

```
Validate request (schema, auth, transition legality per §4, idempotency key)
        → mutate ConsentRecord (status, version, timestamps)     ┐
        → write AuditLog entry                                    ├─ same transaction
        → commit                                                  ┘
        → publish SSE event   (outside the transaction — best-effort, non-authoritative)
```

If the transaction fails at any point, neither the consent state nor the audit entry is persisted — there is never a mutation without a corresponding audit record, or vice versa. The SSE publish happens only _after_ commit succeeds, and its own failure (dropped connection, no subscribers) never rolls back the transaction or blocks the HTTP response — consistent with §10's rule that real-time push is not the source of truth.

**Implementation flag — this should be a Day-1 technical spike, not just "early."** §14 gives `AuditLog` writes an insert-only DB credential, separate from the application's normal read/write credential. Combining that with "both writes in one transaction" (this section) is the right design, but it's the one part of this architecture most likely to cause implementation friction even though the design itself is sound — worth confirming on day one that it actually works cleanly with your MongoDB driver setup. A single multi-document transaction session is normally opened against one client connection, and running the `ConsentRecord` write and the `AuditLog` write through two different credentials inside that same session may need extra plumbing (e.g. a second client authenticated for the session, or a role that can both insert into `AuditLog` and update `ConsentRecord` while application-layer code still enforces insert-only usage). This doesn't change the design — just build the spike (grant → mutate + audit-write → commit) before writing anything else, so a driver limitation surfaces on day one instead of the week before submission.

---

## 9. Idempotency

- `grant`, `withdraw` require an `Idempotency-Key` header (client-generated UUID, one per user action/click).
- On first use: request is processed, response is snapshotted into `IdempotencyKey.responseSnapshot`, keyed by `(applicationId, key)`.
- On replay with the **same** key and same request body hash: the original snapshot is returned, no new mutation, no duplicate audit entry.
- On replay with the **same** key but a **different** body hash: rejected with `409 IDEMPOTENCY_KEY_CONFLICT` — this catches accidental key reuse across different actions rather than silently applying the wrong one.

---

## 10. Real-Time Notification (SSE)

- Purpose: let the Hospital Portal reflect a consent change within ~1–2 seconds, without polling `/check` on every render — this is what makes the live-revocation demo actually visible.
- **Explicitly non-authoritative.** If the SSE connection drops, the portal keeps working correctly — it just falls back to the cache TTL from §11 and, worst case, a stale-but-safe cached `denied` (never a stale `allowed`, per §12's fail-closed rule applied to cache expiry too — see note below).
- Event payload is minimal: `{userId, applicationId, purposeId, status}` — no policy text, no PII beyond the user ID the portal already has.

---

## 11. Caching in the `consentGuard.js` middleware

**Cached authorization is never authoritative — it is only ever a shortcut for a decision Core already made, valid strictly within its TTL window.** Concretely:

- The middleware caches `/check` results in-memory for `cacheTtlSeconds` returned by Core (default 30s).
- On SSE push for a given `(userId, purposeId)`, the cache entry is invalidated immediately, regardless of remaining TTL.
- **Cache entries never survive past their TTL even without a push** — an entry that ages out is treated as absent, forcing a fresh `/check` call rather than serving stale data indefinitely.
- On expiry, on cache miss, or on any uncertainty (a `/check` call that times out, errors, or returns something unparseable while refreshing an expired entry) the middleware does **not** fall back to the old cached value — it defers to fail-closed (§12) and denies. Combined, the failure mode is always "ask again or deny," never "trust old data forever."

---

## 12. Fail-Closed Behavior

If Core cannot positively confirm `allowed: true` — because of a network failure, timeout, `5xx`, or malformed response — the middleware's default is **deny** the sensitive operation. This applies to:

- `/check` request failures
- Expired cache with no reachable Core to refresh it
- Any ambiguous or unparseable response

This is a deliberate, documented product decision (not a bug) and it's one of the strongest points to make in a viva: the system is designed so that its failure mode protects the user, not the business action.

---

## 13. Rate Limiting

| Endpoint group        | Limit basis         | Notes                                                                             |
| --------------------- | ------------------- | --------------------------------------------------------------------------------- |
| `/api/auth/login`     | per IP + per email  | stops brute force                                                                 |
| `/api/consents/check` | per `applicationId` | this endpoint gets hit constantly by design — limits protect Core, not the caller |
| `/api/admin/*`        | per admin user      | lower ceiling, sensitive surface                                                  |

All limits configurable via environment variables (`RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_CHECK_MAX`, `RATE_LIMIT_ADMIN_MAX`, plus window sizes) rather than hardcoded.

---

## 14. Security Checklist

- Passwords: bcrypt/Argon2, never plaintext, never logged.
- API keys: HMAC-SHA256, shown once, rotation with grace period, immediate revocation path.
- All request bodies validated with a schema library (Zod/Joi) — reject unknown fields, not just missing ones.
- Admin routes require both authentication and role check — verified independently, not inferred from the presence of a token.
- Secrets (JWT signing key, DB URI, HMAC key) via environment variables / secret manager, never committed.
- HTTPS enforced in production; secure, httpOnly cookies if cookie-based sessions are used anywhere.
- Audit log DB credential is insert-only at the database level.
- The client's UI state is never trusted server-side — every sensitive route re-derives consent from Core, never from a request body flag.
- Hospital Staff accounts never receive a Core `ADMIN` JWT (§7.3) — every portal-side Core call authenticates via the application's own API key, keeping Core's admin surface reachable only by people actually administering ConsentGuard.

---

## 15. Hospital Portal — Detailed Design

The portal is deliberately built with **five purposes**, **two user roles**, and **three distinct enforcement points**, so the demo shows real, varied enforcement rather than one toggle.

### 15.1 Purposes defined for this application

| Code                       | Required?                                                      | Used to gate                                |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `ESSENTIAL_SERVICE`        | Yes, non-withdrawable, auto-`GRANTED` on account creation (§4) | Core record access — always on              |
| `MARKETING_COMMS`          | No                                                             | "Send promotional SMS/email" action         |
| `LOCATION_TRACKING`        | No                                                             | "Enable bed/location tracking" action       |
| `RESEARCH_DATA_SHARING`    | No                                                             | "Share record with research partner" action |
| `TELEHEALTH_NOTIFICATIONS` | No                                                             | Appointment reminder push notifications     |

### 15.2 Roles

- **Patient** — Core `USER` role. Logs in directly against Core, sees consent dashboard, grants/withdraws each purpose, views own history.
- **Hospital Staff** — portal-local role only, with no Core role at all (§7.3). Logs in against the portal's own auth, views patient list and record, triggers the three gated actions below. Every Core call made on staff's behalf uses the portal's `ConsumerApplication` API key, never a Core JWT.

### 15.3 Pages

| Page                      | What it does                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient Consent Dashboard | Lists all 5 purposes, current status, last updated, grant/withdraw buttons (Essential shown as always-on, no withdraw control)                                                            |
| Patient Consent History   | Chronological list pulled from `/api/consents/history`                                                                                                                                    |
| Staff Patient List        | Search/select a patient                                                                                                                                                                   |
| Staff Patient Record      | Shows patient info; three action buttons, each wrapped by `requireConsent(...)`                                                                                                           |
| Staff Audit View          | Read-only view of `GET /api/consents/audit` (app-scoped, §6.7) — portal backend calls Core with its own API key, no Core `ADMIN` JWT involved; "staff-admin" is a portal-local label only |

### 15.4 The three gated actions (this is the actual proof of enforcement)

1. **Send Marketing SMS** → `requireConsent('MARKETING_COMMS')` → on deny, button shows disabled state with the reason code (`CONSENT_WITHDRAWN`, `NO_CONSENT`, etc.) surfaced in the UI, not swallowed.
2. **Enable Location Tracking** → `requireConsent('LOCATION_TRACKING')`.
3. **Share with Research Partner** → `requireConsent('RESEARCH_DATA_SHARING')` → this one also writes a portal-side log line noting the check result, to make the "downstream action actually depended on the check" argument concrete in the viva.

**Do not collapse these into a generic "Access Denied" message.** Every reason code from §5 (`NO_CONSENT`, `CONSENT_WITHDRAWN`, `RECONSENT_REQUIRED`, `NOT_SCOPED`, `SERVICE_UNAVAILABLE`) must reach the UI distinctly — this is part of the product's demonstrable behavior, not incidental detail. Whoever implements the frontend should treat the reason code as a first-class field to render, not an internal debugging value.

### 15.5 `consentGuard.js` middleware — what it actually does

```
requireConsent(purposeCode) returns an Express middleware that:
  1. Reads userId from the authenticated session.
  2. Checks local cache (§11) for (userId, purposeCode).
  3. On cache miss/expiry: calls Core's /check with the app's API key
     (userId + purpose only — applicationId is never sent, see §5).
  4. On any failure to get an affirmative "allowed: true": blocks the request (§12),
     responds 403 with the reason code, and logs it locally.
  5. On success: attaches { allowed, reason, policyVersion } to req.consent and calls next().
  6. Subscribes to the SSE stream at startup; on a push event matching a cached
     (userId, purposeCode), invalidates that cache entry immediately.
```

This is shipped as a real, separate, importable module in the portal's codebase — not inline `if` checks scattered across route handlers. That separation is what proves "zero embedded permission logic": every gated route imports the same middleware, none of them reimplement the check.

### 15.6 Live demo script (viva centerpiece)

1. Patient logs into the Consent Dashboard, `MARKETING_COMMS` is currently `GRANTED`.
2. Staff view is open side-by-side, "Send Marketing SMS" button is enabled.
3. Patient clicks Withdraw on Marketing Communications.
4. Within ~1–2 seconds (SSE push → cache invalidation), the staff view's button becomes disabled, showing `CONSENT_WITHDRAWN`.
5. Staff attempts to send anyway via a direct API call (bypassing the UI) — Core's `/check` still denies it, proving the enforcement is server-side, not just a disabled button.
6. Patient's history page shows the withdrawal event; admin audit view shows the same event with actor, timestamp, and previous/new state.

---

## 16. Deployment

- Two independently deployable services (can share a host initially, but no code-level coupling).
- All configuration via environment variables: `MONGO_URI`, `JWT_SECRET`, `HMAC_KEY`, rate-limit values, `CACHE_TTL_SECONDS`, `RECONSENT_GRACE_HOURS`.
- `/health` and `/ready` used by whatever process manager or load balancer sits in front of Core.
- MongoDB with restricted credentials — separate insert-only credential for the audit writer (§3.6).
- Structured logs (JSON) for both services; portal logs every `requireConsent` outcome, not just failures, so the demo has a visible trail.

---

## 17. Testing Strategy

| Layer           | Covers                                                                                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit            | State machine transitions, decision-engine rule table (§5), idempotency conflict logic                                                                                                                   |
| Integration/API | Every endpoint in §6, including forged/tampered request bodies                                                                                                                                           |
| End-to-end      | Login → grant → check(allowed) → withdraw → check(denied) → re-grant → check(allowed)                                                                                                                    |
| Security        | Non-admin hitting `/api/admin/*`, expired/rotated key behavior, fail-closed on simulated Core outage, `/check` called with a `userId` never onboarded to the calling application (`USER_NOT_ASSOCIATED`) |
| Portal-specific | All three gated actions behave correctly under `allowed`, `denied`, and `SERVICE_UNAVAILABLE`                                                                                                            |

---

## 18. Feature Completeness Checklist

**Core**

- [x] Auth (register/login/refresh/logout, roles, rotate-on-use `RefreshToken`)
- [x] ConsumerApplication (CRUD, key issuance/rotation/revocation, scopes)
- [x] `applicationId` always derived from the API key — never a client-supplied parameter to `/check` or the SSE stream
- [x] `/check` rejects users the calling application never onboarded (`USER_NOT_ASSOCIATED`), closing the userId-enumeration gap
- [x] Cached authorization treated as non-authoritative — expiry or uncertainty always re-queries Core or denies, never serves stale `allowed`
- [x] Purposes & versioned, immutable policies (per-application)
- [x] Grant/withdraw/re-consent with explicit invalid-transition rejection
- [x] Required purposes auto-`GRANTED` on account creation, never left `NOT_GRANTED`
- [x] Decision engine with structured reason codes
- [x] Mutation + audit write committed in a single transaction; SSE published only after commit
- [x] Idempotency keys on all mutating consent endpoints
- [x] Rate limiting (login, check, admin) — env-configurable
- [x] Fail-closed on any dependency failure
- [x] Append-only audit log, insert-only DB credential
- [x] Real-time SSE push, explicitly non-authoritative
- [x] `/health`, `/ready`
- [x] Full index/uniqueness set across all four tenancy levels
- [x] Core role boundary enforced: `ADMIN` for ConsentGuard administrators only; consumer-application staff/patients never obtain a Core `ADMIN` JWT (§7.3)
- [x] App-scoped `/api/consents/audit` (`audit:read` scope) so consumer apps can read their own audit trail without a Core `ADMIN` credential

**Hospital Portal**

- [x] Patient consent dashboard + history (5 purposes, 1 required/non-withdrawable)
- [x] Staff dashboard with three independently gated real actions, each surfacing its distinct reason code (never a generic "Access Denied")
- [x] `consentGuard.js` as a real, shared, importable middleware — no inline permission checks anywhere
- [x] Local cache with TTL + SSE-driven invalidation
- [x] Fail-closed behavior on Core outage, demoable
- [x] Scoped audit view for staff-admin
- [x] End-to-end live-revocation demo path

---

_This document reflects every architectural decision made and approved during design: the ConsumerApplication tenancy boundary, the ordered decision-engine table, lazy re-consent evaluation, HMAC-based API key hashing, fail-closed default, and non-authoritative real-time push. Treat it as the implementation source of truth going forward._
