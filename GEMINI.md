# ConsentGuard — Global Agent Context (`GEMINI.md`)

This file provides the condensed architectural context and non-negotiable rules for all agents and tools across the ConsentGuard project.

---

## 1. Tenancy Chain

- **Tenancy Hierarchy:** `ConsumerApplication → ConsentPurpose → PolicyVersion`
- **Consent Resolution:** `ConsentRecord = User × Application × Purpose × PolicyVersion`
  - A `ConsumerApplication` defines its own purposes and policies.
  - A user's consent state is isolated per application and purpose.

---

## 2. Core Entities (8 Entities)

1. `User`
2. `ConsumerApplication`
3. `ConsentPurpose`
4. `PolicyVersion`
5. `ConsentRecord`
6. `AuditLog`
7. `RefreshToken`
8. `IdempotencyKey`

_(Full field specifications and indexes reside in Step 4 specification)._

---

## 3. Consent State Machine

```
NOT_GRANTED ──grant──▶ GRANTED ──withdraw──▶ WITHDRAWN ──grant(re-consent)──▶ GRANTED
```

- **Persisted Statuses:** Only `NOT_GRANTED`, `GRANTED`, `WITHDRAWN` are persisted in `ConsentRecord.status`.
- **Computed Status:** `RECONSENT_REQUIRED` is **never persisted**; it is dynamically computed at check-time.
- **Required Purposes:** Auto-granted on initial user interaction/onboarding; cannot be withdrawn (`PURPOSE_NOT_WITHDRAWABLE`).
- **Optimistic Concurrency:** Governed by `ConsentRecord.version` counter; mismatches return `409 CONFLICT`.

---

## 4. `/check` Evaluation Order (7 Ordered Rules)

The `/api/consents/check` decision engine evaluates rules top-to-bottom (first match wins):

1. `PURPOSE_NOT_FOUND` — Purpose missing or inactive.
2. `NOT_SCOPED` — Purpose's `applicationId` mismatch with key-resolved app OR key missing `consent:check` scope.
3. `USER_NOT_ASSOCIATED` — No `ConsentRecord` exists for this user under this `applicationId` for any purpose (closes userId-enumeration gap; runs before Rule 4).
4. `NO_CONSENT` — No `ConsentRecord` exists for user + app + this purpose.
5. `CONSENT_WITHDRAWN` — `ConsentRecord.status == WITHDRAWN`.
6. `RECONSENT_REQUIRED` — `status == GRANTED` but `policyVersionId` ≠ active published version AND active version requires re-consent.
7. `OK` — Consent granted and valid; allowed (`allowed: true`).

- **Fail-Closed Fallback:** Any exception, database error, or network failure returns denied with `SERVICE_UNAVAILABLE`.

---

## 5. Non-Negotiables & Invariants

1. **Fail-Closed Always:** Any uncertainty, error, timeout, cache expiry without refresh, or unparseable state defaults to `DENY` (`allowed: false`).
2. **Server-Derived Application Identity:** `applicationId` is **always** derived server-side from the consumer application's API key (Authorization header lookup). It is **never** accepted as a client parameter in `/check` or `/stream`.
3. **Immutability of Published Policies:** Once `PolicyVersion.status == PUBLISHED`, its `content` cannot be modified by any endpoint.
4. **Atomic Mutation & Audit:** Every consent mutation and its append-only `AuditLog` entry are committed in the same database transaction before returning success.
5. **Non-Authoritative Push:** SSE push notifications are convenience cache invalidators only; the database and `/check` remain the sole source of truth.

---

## 6. Role Boundaries & Service Segregation

- **Core Roles:** Core only knows `USER` (patients managing own consent) and `ADMIN` (ConsentGuard system administrators).
- **Portal Staff:** `Portal Staff` is a **portal-local role** with **no Core role and no Core JWT — ever**.
  - All portal backend calls made on behalf of staff (checks, stream, audit) authenticate strictly via the `ConsumerApplication` API key.
  - Core `ADMIN` credentials are never issued to or forwarded by consumer application staff.

---

## 7. Application Scopes (3 Defined Scopes)

- `consent:check` — Authorizes evaluation of `/api/consents/check`.
- `consent:stream` — Authorizes real-time SSE stream subscription `/api/consents/stream`.
- `audit:read` — Authorizes reading application-scoped audit events `/api/consents/audit` & summaries.
