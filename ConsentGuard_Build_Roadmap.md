# ConsentGuard — 30-Step Build Roadmap (Antigravity IDE)

Built from `ConsentGuard_Architecture_v2.md`. Each step is self-contained — enough
spec is embedded that whichever agent/model executes it doesn't need the full
666-line architecture doc pasted in. That self-containment is itself the main
token-saving move: see Principle 1 below.

---

## Token/Credit Optimization Principles

1. **Build `GEMINI.md` in Step 1 and never re-explain the architecture again.**
   Every step below tells the agent to "read GEMINI.md §X" instead of re-pasting
   spec. Antigravity shares this file across every agent in the project regardless
   of which model is active — this is the single biggest lever for cutting repeated
   context tokens across 30 steps.
2. **Match model tier to task risk, not step size.** Mechanical/boilerplate steps
   (CRUD, schemas, UI wiring, test volume) → cheapest fast model. Security-critical
   or judgment-heavy steps (auth, the decision engine, transactions, CSRF, final
   audit) → your strongest reasoning model. Paying for a frontier model on
   boilerplate wastes credits; using a cheap model on the decision engine risks a
   bug that costs far more in rework.
3. **Use Plan Mode only on steps marked "Plan Mode."** It adds a planning pass
   before code — worth it on ~8 of these 30 steps, wasted overhead on the rest.
   Default to Fast/Agent-Driven mode everywhere else.
4. **Use Review-Driven mode (approve each write) only on the steps touching auth,
   money-equivalent logic (consent = the whole product's trust claim), or CSRF.**
   Autopilot everywhere else — reviewing boilerplate diffs burns your own time
   without reducing model cost.
5. **One step = one agent turn = one commit.** Don't batch multiple steps into a
   single prompt even if they feel related — a large multi-file autonomous run
   re-loads more context per correction and is harder to hand off mid-way if you
   switch models between steps.
6. **You can switch agents after any step, not just at a phase boundary.**
   Because Principle 5 makes each step its own self-contained turn/commit, a
   fresh agent picking up Step N only needs GEMINI.md plus that step's own
   Task text — it never needs the previous agent's chat history. Phase
   boundaries (Steps 4, 9, 14, 18, 23, 27, 29) are just the _cleanest_ points
   if you want to batch by specialization (e.g. one agent for all of backend,
   another for all of frontend) — Step 18 in particular is called out inline
   below as the natural backend→frontend seam — but nothing breaks if you
   switch mid-phase instead. The only thing to watch: if you switch mid-phase,
   skim the new agent the Acceptance line of the _previous_ step so it knows
   what already exists to build on.

### Model legend

Exact model names in Antigravity's picker drift over time — check yours before
starting. The tiers below are what matters and should still map cleanly:

- **Fast tier** (Gemini Flash class) — cheapest, fastest, best for volume/boilerplate.
- **Frontier Gemini tier** (Gemini Pro class) — strong general coding, good default for frontend.
- **Claude Sonnet tier** — strong security/logic reasoning at moderate cost — your workhorse for anything risk-bearing.
- **Claude Opus tier** — best available reasoning — reserve for the 2–3 steps where a mistake is most expensive (Steps 9, 10).

---

## Phase 0 — Setup & Shared Context (Steps 1–3)

### Step 1 — Monorepo scaffold + `GEMINI.md` context file

**Model:** Fast tier · **Mode:** Fast/Agent-Driven
**Task:** Create a monorepo with two workspaces: `/core` (Node + Express + TypeScript + Mongoose) and `/portal` (Next.js + TypeScript). Root `package.json` with workspaces, shared `tsconfig.base.json`, ESLint + Prettier config. Then create `GEMINI.md` at repo root containing, condensed:

- The tenancy chain: `ConsumerApplication → ConsentPurpose → PolicyVersion`, and `ConsentRecord = User × Application × Purpose × PolicyVersion`.
- The 8 entities by name only (User, ConsumerApplication, ConsentPurpose, PolicyVersion, ConsentRecord, AuditLog, RefreshToken, IdempotencyKey) — full field lists live in Step 4's own spec, don't duplicate here.
- The state machine: `NOT_GRANTED → GRANTED → WITHDRAWN → (re-consent) → GRANTED`, with the rule that `RECONSENT_REQUIRED` is never persisted, only computed at check-time.
- The 7-rule `/check` evaluation order (names only): `PURPOSE_NOT_FOUND → NOT_SCOPED → USER_NOT_ASSOCIATED → NO_CONSENT → CONSENT_WITHDRAWN → RECONSENT_REQUIRED → OK`, first match wins.
- The two non-negotiables: **fail-closed always** (any uncertainty = deny), **applicationId is always derived server-side from the API key, never accepted as a client parameter.**
- Core role boundary: Core only knows `USER`/`ADMIN`. Portal Staff is a portal-local role with no Core role and no Core JWT — ever.
  **Acceptance:** Both workspaces boot to a placeholder route/page. `GEMINI.md` committed and readable from repo root.

### Step 2 — Environment & config scaffolding

**Model:** Fast tier · **Mode:** Fast
**Task:** `.env.example` with every variable: `MONGO_URI`, `JWT_SECRET`, `HMAC_KEY`, `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_CHECK_MAX`, `RATE_LIMIT_ADMIN_MAX` (+ window sizes), `CACHE_TTL_SECONDS`, `RECONSENT_GRACE_HOURS`, `SESSION_COOKIE_SECRET`, `ANTHROPIC_API_KEY` (optional). Build a config loader that fails fast at boot if any required var is missing, with `ANTHROPIC_API_KEY` explicitly optional.
**Acceptance:** Boot fails loudly with a missing required var; boots clean once `.env` is populated from the example.

### Step 3 — Testing & CI skeleton

**Model:** Fast tier · **Mode:** Fast
**Task:** Jest/Vitest for `/core`, Playwright or RTL for `/portal`. GitHub Actions workflow running lint + test on push. Empty test folders `/core/tests/{unit,integration,e2e,security}` — later steps just add files to the right bucket, no restructuring later.
**Acceptance:** CI green on empty scaffolding.

---

## Phase 1 — Core Data Layer & Auth (Steps 4–8)

### Step 4 — Mongoose schemas (all 8 entities)

**Model:** Fast tier · **Mode:** Fast
**Task:** Implement exactly, under `/core/src/models`:

- `User`: email(unique,lowercased), passwordHash, role[USER|ADMIN], timestamps.
- `ConsumerApplication`: name(unique), status[ACTIVE|SUSPENDED], apiKeyHash, previousKeyHash, previousKeyExpiresAt, scopes[String], lastUsedAt.
- `ConsentPurpose`: applicationId(ref), code, name, description, required(Boolean), active(Boolean). Unique index `(applicationId, code)`.
- `PolicyVersion`: purposeId(ref), version, content, plainLanguageSummary(nullable), status[DRAFT|PUBLISHED], requiresReconsent, publishedAt. Unique index `(purposeId, version)`.
- `ConsentRecord`: userId, applicationId, purposeId, policyVersionId, status[NOT_GRANTED|GRANTED|WITHDRAWN], version(Number, optimistic concurrency counter), grantedAt, withdrawnAt. Unique index `(userId, applicationId, purposeId)`; secondary index `(applicationId, purposeId, status)`.
- `AuditLog`: actorId(nullable), actorType[USER|ADMIN|SYSTEM], applicationId, purposeId(nullable), action, previousState, newState, metadata(Object — IP/user-agent only, never tokens/passwords). Indexes `(applicationId, createdAt)` and `(actorId, createdAt)`. Append-only by convention here — DB-level enforcement comes in Step 11.
- `RefreshToken`: userId, tokenHash, expiresAt, revokedAt. Unique index `(tokenHash)`, index `(userId)`.
- `IdempotencyKey`: applicationId, key, requestHash, responseSnapshot. Unique index `(applicationId, key)`.
  **Acceptance:** Unit tests assert every listed index/uniqueness constraint exists.

### Step 5 — Auth: register/login/refresh/logout

**Model:** Claude Sonnet tier · **Mode:** Plan Mode, then Agent-Assisted (review before merging)
**Task:** `POST /api/auth/register` (bcrypt/Argon2 hash, creates USER role), `POST /api/auth/login` (returns short-lived ~15min access JWT + refresh token), `POST /api/auth/refresh` (rotate-on-use: mark presented token's `revokedAt`, issue new row — read GEMINI.md's state-machine note for why this matters), `POST /api/auth/logout` (revokes refresh token).
**Acceptance:** Integration test — replaying an already-rotated refresh token is rejected; expired access token is rejected.

### Step 6 — ConsumerApplication CRUD + API key lifecycle

**Model:** Claude Sonnet tier · **Mode:** Plan Mode
**Task:** `POST /api/admin/applications` (creates app, returns raw key **once**, never retrievable again), `GET` (list, hash only, never raw key), `PATCH` (scopes/status), `POST .../rotate-key` (new key issued, old key valid via `previousKeyHash`+`previousKeyExpiresAt` for a grace window e.g. 24h), `POST .../revoke` (immediate, clears both current and previous key, no grace period). Store keys as HMAC-SHA256 hashes — not bcrypt/Argon2 (those are deliberately slow for low-entropy passwords; wrong tool for a high-entropy token checked on every `/check` call).
**Acceptance:** Old key authenticates until grace expiry, then rejected; revoke kills both keys immediately in test.

### Step 7 — Purposes & PolicyVersion CRUD

**Model:** Fast tier · **Mode:** Fast (but flag the one hard rule below explicitly to the agent)
**Task:** `POST .../purposes`, `PATCH /purposes/:id` (activate/deactivate), `GET /applications/:appId/purposes` (public, renders consent screen), `POST .../policies` (create draft), `POST /policies/:id/publish` (sets status=PUBLISHED, sets requiresReconsent), `GET /purposes/:purposeId/policies/active`. **Non-negotiable:** once `status: PUBLISHED`, no endpoint may ever modify `content` again — enforce this in the update handler itself, not just by convention.
**Acceptance:** A PATCH attempting to change `content` on a PUBLISHED policy returns a 4xx.

### Step 8 — Role-boundary middleware

**Model:** Claude Sonnet tier · **Mode:** Plan Mode
**Task:** Admin-route middleware that requires authentication AND an explicit `role === 'ADMIN'` check performed independently — never inferred from "a token is present." This is the seam that keeps Portal Staff from ever holding a Core ADMIN JWT later on, so get it right now before anything depends on it.
**Acceptance:** Security test — a non-admin token on any `/api/admin/*` route returns `403`, never a silent empty `200`.

---

## Phase 2 — Decision Engine & Consent Logic (Steps 9–13)

_This is the actual product. Steps 9–10 are the highest-stakes code in the system — spend your best model here._

### Step 9 — Consent state machine + transition guards

**Model:** Claude Opus tier if available, else Sonnet · **Mode:** Plan Mode (require the agent to write out the transition table as a comment block before implementing) + Review-Driven (approve each file)
**Task:** Implement exactly this transition table:

| Operation | Current status                       | Result                            |
| --------- | ------------------------------------ | --------------------------------- |
| Withdraw  | WITHDRAWN                            | 409 `ALREADY_WITHDRAWN`           |
| Withdraw  | NOT_GRANTED                          | 409 `NOTHING_TO_WITHDRAW`         |
| Withdraw  | required purpose                     | 403 `PURPOSE_NOT_WITHDRAWABLE`    |
| Grant     | already GRANTED, same policy version | 200 no-op, returns current record |

Every mutating write checks the `ConsentRecord.version` optimistic-concurrency field; a mismatch returns `409 CONFLICT` and forces client re-fetch. Required purposes (`required: true`) get an auto-created `GRANTED` record the moment a user first interacts with the application (account creation / first login) — never left `NOT_GRANTED`.
**Acceptance:** Unit test matrix covering every cell in the table above, plus the auto-grant-on-first-interaction path.

### Step 10 — Decision engine `/check`

**Model:** Claude Opus tier if available, else Sonnet · **Mode:** Plan Mode + Review-Driven, no autopilot
**Task:** Implement the ordered rule table, first match wins:

1. Purpose missing/inactive → deny, `PURPOSE_NOT_FOUND`
2. Purpose's applicationId ≠ key-resolved applicationId, or key lacks `consent:check` scope → deny, `NOT_SCOPED`
3. No ConsentRecord exists for this user+application for **any** purpose (never onboarded) → deny, `USER_NOT_ASSOCIATED`
4. No ConsentRecord for user+app+**this** purpose → deny, `NO_CONSENT`
5. status == WITHDRAWN → deny, `CONSENT_WITHDRAWN`
6. status == GRANTED but policyVersionId ≠ active published version AND that version requires reconsent → deny, `RECONSENT_REQUIRED`
7. Otherwise → allow, `OK`
8. Any exception/DB error at any point → deny, `SERVICE_UNAVAILABLE` (wrap the whole handler)

`applicationId` is **never** read from the request — resolve it server-side as `API key → ConsumerApplication lookup → applicationId`, and check rules 2–3 against that resolved value. Rule 3 must run before rule 4 (it closes a userId-enumeration gap — a valid key holder shouldn't be able to distinguish "user not onboarded" from "user onboarded, purpose not consented" by probing).
**Acceptance:** One test per rule (7 rules + the fail-closed wrapper), plus a dedicated test proving rule 3 fires before rule 4 for an unassociated user.

### Step 11 — Mutation → audit transaction pipeline

**Model:** Claude Sonnet tier · **Mode:** Plan Mode
**Task:** Wrap every consent mutation in one MongoDB session: validate → mutate ConsentRecord → write AuditLog entry → commit, all in the same transaction; publish the SSE event only _after_ commit succeeds, and an SSE publish failure must never roll back the transaction or block the HTTP response. Give `AuditLog` writes a separate **insert-only** DB credential/role (no UPDATE/DELETE grants at the database level, not just app-code convention).
**Acceptance:** Forced-failure test — if the AuditLog insert throws mid-transaction, the ConsentRecord change is rolled back too (no mutation ever exists without its audit row, or vice versa).
**Flag to the agent:** this is explicitly called out as the highest implementation-risk piece in the source spec — running two different DB credentials through one transaction session may need extra plumbing depending on the Mongoose/driver setup. Don't treat this as routine; if it's fighting the driver, that's expected, not a sign something's wrong with the design.

### Step 12 — Idempotency key handling

**Model:** Fast tier · **Mode:** Fast
**Task:** `grant`/`withdraw` require an `Idempotency-Key` header. First use: process + snapshot response keyed `(applicationId, key)`. Replay with same key + same body hash → return the original snapshot, no new mutation. Replay with same key + different body hash → `409 IDEMPOTENCY_KEY_CONFLICT`.
**Acceptance:** Replay test (returns identical snapshot) + conflict test (different body, same key).

### Step 13 — User-facing consent endpoints + rate limiting + health checks

**Model:** Fast tier · **Mode:** Fast
**Task:** `GET /api/consents?applicationId=`, `POST /api/consents/grant`, `POST /api/consents/withdraw`, `GET /api/consents/history?applicationId=`. Rate limits: login (per IP + per email), `/check` (per applicationId), `/api/admin/*` (per admin user, lower ceiling) — all thresholds and windows env-configurable, not hardcoded. `GET /health` (process up), `GET /ready` (DB + dependencies reachable).
**Acceptance:** Exceeding a configured limit returns `429` in test.

---

## Phase 3 — Admin/Audit/Ops (Steps 14–17)

### Step 14 — Real-time SSE stream

**Model:** Fast tier · **Mode:** Fast
**Task:** `GET /api/consents/stream` (consent:stream scope, applicationId resolved from key like `/check`), pushes `{userId, applicationId, purposeId, status}` after every committed mutation. No policy text or extra PII in the payload.
**Acceptance:** Test proving a dropped SSE connection never causes a stale `allowed` — consumer falls back to cache-TTL logic (built in Step 19), never trusts old push data indefinitely.

### Step 15 — Cross-app and app-scoped audit endpoints

**Model:** Fast tier · **Mode:** Fast
**Task:** `GET /api/admin/audit?applicationId=&actorId=&from=&to=` (Core ADMIN JWT, cross-app, paginated). `GET /api/consents/audit` (consumer app API key, `audit:read` scope, scoped to the calling application only — no cross-app or arbitrary actorId query).
**Acceptance:** Test proving the app-scoped endpoint cannot return another application's rows even with a crafted query.

### Step 16 — Security checklist pass

**Model:** Claude Sonnet tier · **Mode:** Review-Driven (report findings before changing code)
**Task:** Audit the codebase built so far against this checklist and fix any failures: request bodies validated with Zod/Joi rejecting unknown fields (not just missing ones); admin routes independently check auth AND role; all secrets via env only; audit DB credential genuinely insert-only at the database layer; client-supplied state never trusted server-side (every sensitive route re-derives from Core/DB, never a request-body flag).
**Acceptance:** Written pass/fail per checklist item; every fail has a corresponding fix commit.

### Step 17 — Core integration test suite

**Model:** Fast tier (volume) — feed it the acceptance criteria already written in Steps 4–16 rather than re-deriving them
**Task:** Assemble: unit (state machine, decision engine, idempotency), integration (every endpoint incl. forged/tampered bodies), e2e (`login → grant → check:allowed → withdraw → check:denied → re-grant → check:allowed`), security (non-admin on admin routes, expired/rotated key, simulated Core outage → fail-closed, `USER_NOT_ASSOCIATED` path).
**Acceptance:** All four test layers green.

---

## Phase 4 — Hospital Portal Frontend (Steps 18–22)

_Natural agent-switch point if you're changing models here — Step 18 re-grounds from GEMINI.md so a fresh agent has full context._

### Step 18 — Portal scaffold + auth pages

**Model:** Frontier Gemini tier (or Fast tier for pure boilerplate) · **Mode:** Fast/Agent-Driven
**Task:** Next.js app. Patient login/register hits Core's `/api/auth/*`; store the JWT via an httpOnly cookie set by a portal-side BFF route (never exposed to client JS). Staff login is portal-local auth only — staff never receive, and the portal never forwards, a Core JWT.
**Acceptance:** Patient can log in and land on an empty dashboard shell; staff login is a fully separate flow with no Core token anywhere in staff's session.

### Step 19 — `consentGuard.js` middleware

**Model:** Claude Sonnet tier · **Mode:** Plan Mode
**Task:** A real, importable middleware module (not inline `if` checks per route): reads userId from the authenticated session → checks in-memory cache `(userId, purposeCode)` keyed with the TTL Core returned (default 30s) → on miss/expiry calls `/check` with the app's API key (userId + purpose only on the wire — applicationId never sent) → on **any** non-`allowed:true` outcome, blocks with the reason code and logs locally → on success attaches `{allowed, reason, policyVersion}` to the request and continues → subscribes to the SSE stream at startup, invalidating matching cache entries immediately on push. Critically: on cache expiry with an unreachable/erroring Core, do **not** fall back to the old cached value — deny.
**Acceptance:** Unit test — expired cache + simulated Core timeout results in deny, never a stale-allow.

### Step 20 — Patient Consent Dashboard + History

**Model:** Fast tier · **Mode:** Fast
**Task:** Dashboard lists all 5 purposes (ESSENTIAL_SERVICE, MARKETING_COMMS, LOCATION_TRACKING, RESEARCH_DATA_SHARING, TELEHEALTH_NOTIFICATIONS) with status/last-updated/grant-withdraw buttons; ESSENTIAL_SERVICE shows as always-on with no withdraw control. Leave a "Plain-language version" toggle placeholder next to each purpose (wired live in Step 27). History page pulls `/api/consents/history`.
**Acceptance:** Grant/withdraw actually round-trips through Core and re-renders from a fresh `/check`, not just optimistic local state.

### Step 21 — Staff pages + three gated actions

**Model:** Fast tier for pages; have whichever agent built Step 19 (or a quick Sonnet pass) review the `requireConsent(...)` wiring specifically, since this is what gets demoed live
**Task:** Staff patient list/search, patient record page, three buttons each wrapped by `requireConsent('MARKETING_COMMS')`, `requireConsent('LOCATION_TRACKING')`, `requireConsent('RESEARCH_DATA_SHARING')`. On deny, the UI must surface the actual reason code (`NO_CONSENT`, `CONSENT_WITHDRAWN`, etc.) — never a generic "Access Denied." The research-sharing action additionally writes a portal-side log line noting the check result.
**Acceptance:** Toggling a patient's consent from the dashboard visibly changes the corresponding staff button's state within the SSE window (~1–2s) without a page reload.

### Step 22 — Staff Audit View + live-revocation demo assembly

**Model:** Fast tier · **Mode:** Fast
**Task:** Read-only view of the app-scoped `GET /api/consents/audit`. Then assemble the full demo script end-to-end: patient dashboard and staff view open side-by-side → patient withdraws Marketing consent → staff button disables within ~1–2s showing `CONSENT_WITHDRAWN` → a direct API call bypassing the UI is still denied by Core's `/check` (proves server-side enforcement) → patient history and admin audit both show the withdrawal with actor/timestamp/previous-new state.
**Acceptance:** The script runs live, unscripted, against a freshly seeded database.

---

## Phase 5 — Admin Console + Design System (Steps 23–26)

### Step 23 — Admin Console auth (session cookie + CSRF)

**Model:** Claude Sonnet tier · **Mode:** Plan Mode
**Task:** `POST /api/admin/console/login` — same credential check as `/api/auth/login`, issues an httpOnly/secure/SameSite=strict session cookie instead of a JWT pair, rejects non-ADMIN with the same generic 403 every other admin route uses (no role-leaking error message). `POST /logout` revokes the underlying RefreshToken and clears the cookie. `GET /me` confirms session validity on load. Extend the existing admin-route middleware to accept **either** the Bearer JWT it already checks **or** this cookie. This is the only cookie-based auth surface in the whole system, which makes it the only surface exposed to CSRF — every state-changing console request must carry a CSRF token checked server-side against the session.
**Acceptance:** A state-changing request with a valid session cookie but no CSRF token is rejected.

### Step 24 — Admin Console pages

**Model:** Fast tier · **Mode:** Fast (no new backend logic — pure UI over existing endpoints)
**Task:** Login page. Applications page (list with status/scopes/lastUsedAt; create shows the raw key **once** in a copy-to-clipboard panel with an explicit "you will not see this again" warning; rotate shows the grace-period countdown; revoke requires confirmation). Purposes & Policies page (per-app list/create/toggle-active; per-purpose DRAFT/PUBLISHED version list; publish requires an explicit **two-step** confirm since content becomes immutable). Cross-App Audit page with `applicationId`/`actorId`/date-range filters. The console must never call `/check` or write to `ConsentRecord` directly — it only manages definitions.
**Acceptance:** Publish flow cannot complete in one click; two explicit confirms required.

### Step 25 — Shared frontend design system

**Model:** Whichever agent/model you find strongest visually (Frontend-oriented tier) · **Mode:** Fast, but paste this spec verbatim rather than paraphrasing — it's opinionated and easy to flatten into generic defaults
**Task:** A shared `packages/ui` workspace consumed by both the Portal and Admin Console:

- Status shown as **icon + label + color together, never color alone** (accessibility + legible in black-and-white printouts).
- `GRANTED` = confident desaturated teal/forest tone; `WITHDRAWN` = neutral slate — **not** red, because withdrawal is a right being exercised, not a failure. Red is reserved exclusively for `SERVICE_UNAVAILABLE` and genuine system errors.
- One shared reason-code badge component covering all 5 codes (`NO_CONSENT`, `CONSENT_WITHDRAWN`, `RECONSENT_REQUIRED`, `NOT_SCOPED`, `SERVICE_UNAVAILABLE`) — implemented once, imported everywhere, never re-implemented per page. `SERVICE_UNAVAILABLE` gets a visually distinct neutral treatment (system state, not a patient's fault).
- Typography: a clean humanist sans for UI chrome/body; a monospace face reserved specifically for timestamps, reason codes, and audit entries.
- The audit trail is the signature visual element: a vertical ledger — timestamp, actor, previous → new state, set in the monospace face, reading as _logged_ rather than editorialized.
- Admin Console runs a tighter spacing/density scale than the Patient Dashboard — they do genuinely different jobs.
  **Acceptance:** Change one color token at the source and verify it updates in both apps without touching either app's own code — this is the proof the "shared package" claim actually holds.

### Step 26 — Empty/loading/error state pass

**Model:** Fast tier · **Mode:** Fast
**Task:** Explicit pass over every data-driven page building a real (non-placeholder) state for: empty (Patient History with no events yet), loading (Staff Audit View mid-fetch), and error (a `/check`-adjacent call failing inside the Console).
**Acceptance:** Each named state screenshot-documented with real UI, not a spinner-only or blank placeholder.

---

## Phase 6 — AI-Assisted Compliance Layer (Steps 27–28)

_Two separate model choices apply here: the coding agent building the endpoint, and the LLM the endpoint itself calls at runtime. Keep them distinct._

### Step 27 — Plain-language policy summaries

**Coding agent model:** Fast tier · **Runtime LLM for the endpoint itself:** a small/fast model (the source spec suggests Anthropic's Haiku-class lineup for cost/latency on this specific summarization task — verify the current smallest-tier model name at docs.claude.com before wiring it in)
**Task:** `POST /api/admin/policies/:id/generate-summary` (Core ADMIN only, via Bearer JWT or console session) calls the runtime LLM to draft a two-to-three sentence `plainLanguageSummary`. The admin can edit or reject freely; nothing is saved until explicitly accepted; the endpoint never writes to `content`. If `ANTHROPIC_API_KEY` is unset, return a clean `503 AI_UNAVAILABLE` with the rest of the system completely unaffected. Cache the summary by `policyVersion._id`.
**Acceptance:** Unsetting the API key produces a clean 503 on this endpoint only; every other endpoint keeps working.

### Step 28 — Grounded audit summaries

**Coding agent model:** Fast tier
**Task:** `GET /api/consents/audit-summary?from=&to=` (app API key, `audit:read` scope) and `GET /api/admin/audit-summary?applicationId=&from=&to=` (Core ADMIN). Both fetch the actual rows under the **exact same authorization boundary as the underlying audit endpoint from Step 15** — no widened access for the AI feature — pass them to the LLM as structured context, and return `{summary, rows}` together, **never the summary alone**. Rate-limit identically to the rest of Core (an LLM call costs more than a `/check` lookup). Cache by window bounds + applicationId.
**Acceptance:** Test asserting `rows` is always present in the response even when summary generation is mocked to fail.

---

## Phase 7 — Testing, Hardening, Deployment, Demo Prep (Steps 29–30)

### Step 29 — Remaining test matrix + deployment config

**Model:** Fast tier for test volume; Claude Sonnet tier specifically for the Admin Console/CSRF and AI-layer boundary tests
**Task:** Admin Console tests (CSRF required and verified on every state-changing request; session rejected after logout; non-ADMIN login rejected identically to every other admin route). AI-layer tests (both endpoints 503 cleanly with no API key; `generate-summary` never writes `content` under any input; `audit-summary` always includes raw rows). Deployment: confirm both services are independently deployable with no code-level coupling; every env var from Step 2 wired through; Admin Console's static build served by Core itself under `/admin/*` (keeps the "two services" claim true); structured JSON logs on both services, with the portal logging every `requireConsent` outcome — not just failures — so the demo has a visible trail.
**Acceptance:** Full test suite green; a clean checkout boots both services using only `.env.example` plus real secret values.

### Step 30 — Feature-completeness audit + viva rehearsal

**Model:** Claude Sonnet/Opus tier — this is a judgment call, not a coding task
**Task:** Walk the complete feature checklist (Core, Hospital Portal, Admin Console, AI-Assisted Compliance Layer, Frontend Design System — roughly 25 items) against the actual running codebase, item by item, marking each as genuinely verified or explicitly descoped — no "planned" language left unresolved. Rehearse the Step 22 live demo script twice end-to-end, including the deliberate API-bypass step. Prepare tight answers for the two hardest likely questions: "Does AI decide who gets access?" (no — §5's decision engine is untouched by Phase 6, verify this is still true in the actual code) and "What was the hardest technical risk?" (the Step 11 transaction/insert-only-credential plumbing — have the actual resolution ready to describe).
**Acceptance:** Every checklist item has a real, current answer; both demo run-throughs complete without an unscripted failure.
