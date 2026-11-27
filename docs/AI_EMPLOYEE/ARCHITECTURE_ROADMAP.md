# BUSNET AI Employee — current state and integration architecture

**Reviewed:** 2026-11-26
**Status:** architecture proposal; no external model or provider API is enabled by this document.

## Executive summary

BUSNET currently has an admin-facing assistant UI, a Supabase Knowledge Center, and an `assistant-chat` Edge Function. It does **not** yet have an operational agent that can plan and execute registered BUSNET tools, persist tasks and conversations across devices, or verify multi-step work.

The AI provider secrets required by `assistant-chat` were not supplied in this session. Even with those secrets, the current Edge Function only retrieves verified shared knowledge and requests a text answer; it does not call booking, passenger, route, analytics, or system tools.

An offline deterministic planner can be built without external AI, but it will only understand explicitly implemented command grammars and typed inputs. It cannot provide general-purpose natural-language understanding comparable to a language model. Keep that limitation visible instead of simulating intelligence.

## Current implementation findings

| Area | What exists | What is not implemented / verified |
|---|---|---|
| Admin assistant UI | Chat surface and workspace tabs are present in `AdminDashboardPage.tsx`. | UI presence does not mean background execution. |
| Chat persistence | Messages and draft task cards are saved in browser `localStorage`. | No server-side conversation/task history; it does not reliably persist across devices or browser storage loss. |
| Supabase Knowledge Center | Versioned entries, evidence/source metadata, proposal/review/conflict RPCs, role checks and RLS are implemented. The source-metadata response mismatch was fixed in the applied Knowledge search function. | There is no general memory/task engine and no worker execution. |
| Assistant Edge Function | `assistant-chat` is active, requires an authenticated active admin and searches verified shared knowledge. | It has no BUSNET tools or task lifecycle. It needs `AI_API_URL`, `AI_API_KEY` and `AI_MODEL`; no provider configuration was supplied. |
| AI answer | Function code calls an OpenAI-compatible endpoint when secrets are configured. | No external provider/model should be considered available until secrets and an end-to-end response are verified. |
| Tools | The admin UI itself uses real application RPCs and routes. | Those operations are not registered or callable by the assistant. The existing Tool Registry correctly labels them as candidates, not connected tools. |
| Capability Engine | The local migration defines capabilities, tool versions, append-only test runs and operational checks; admin reads are RLS-protected, status changes use an audited super-admin RPC, and evidence writes are restricted to `service_role`. The admin tab reads and filters real rows. Persisted lifecycle states are `planned`, `in_development`, `verified`, `operational` and `retired`; `stale_evidence` is display-only. The target migration and idempotent 100-row seed were applied and tested against local Supabase. | A trusted CI/test producer and assistant execution service are not connected. `service_role` authorization and `runner_identity` metadata do not independently prove a CI run's origin. No seeded tool is active and there is no production evidence of operational capabilities. The full migration chain still stops at the pre-existing passenger-profile migration because `public.passengers` is absent from the local schema; the Capability Engine migration was validated separately with its existing local prerequisites. |
| Live Operations | Workspace tabs and local draft-task presentation exist. | No persisted server task, queue, worker, event timeline, approval snapshot, or execution verification. |
| First capability list | Ten knowledge entries were inserted into the connected Supabase project as `verified`, each containing ten numbered ideas. | These are plans, not proof of 100 working features. They were incorrectly represented as verified knowledge and must not be used as evidence of implemented capability. |

### Important production correction

The earlier seed was applied to the connected BUSNET Supabase project despite the later requirement to keep seed work isolated. It created **10 bundled capability entries** (100 ideas inside their content), marked them `verified`, with an assumed creator/verifier. This was incorrect. No further production writes are made by this roadmap or the replacement seed file.

Before the assistant is allowed to use those entries as operational facts, an authorized, reviewed correction must remove them from the verified Knowledge Center retrieval path while preserving audit/history. Do not silently rewrite immutable knowledge history or deploy a cleanup migration without an explicit production change review.

The earlier actor selection (`first auth.users row`) is also unsuitable for an approval claim. Capability planning does not require an actor; Knowledge Center verification must use the authenticated curator who actually reviewed the claim.

## Chat storage, clear action and retention

The current **Очистити чат** button clears the current browser's chat message history only, after confirmation. It does not delete Supabase data because chat messages are not currently stored in Supabase. It also leaves local draft tasks, assistant preferences, Knowledge Center entries and any future durable task/audit records untouched.

When persistent chat is added, keep these lifecycles independent:

| Data | Clear current chat? | Lifecycle |
|---|---:|---|
| Conversation messages | Yes, for the selected conversation only | User can clear/delete their own conversation; owner-scoped RLS and a server-side transactional operation. |
| Conversation metadata | End the active conversation or retain a minimal tombstone only if needed for deletion/audit | New chat creates a new conversation; archive is reversible; delete is explicit. |
| Tasks, results and approvals | No | Separate task history; never copy raw chat transcripts into task records without a defined need. |
| Owner memory | No | Separate, explicitly consented store with its own view/edit/forget controls. |
| Verified Knowledge Center | No | Existing versioned, curator-reviewed lifecycle. |
| Security/audit events | No | Separate access-controlled retention policy; do not retain message bodies or secrets in deletion events. |

Recommended implementation: `assistant_conversations(owner_id, status, timestamps)` and `assistant_messages(conversation_id, owner_id, role, content, created_at)`, with row-level ownership checks and a server-side delete/clear RPC that verifies the authenticated owner and deletes the selected conversation's messages transactionally. An append-only audit event may record that a conversation was deleted without preserving its contents. Do not expose direct client table deletes or service credentials.

Start with a configurable **90-day message retention** proposal, manual clear/delete at any time, and explicit limits for message size and attachments. Confirm legal/privacy requirements before treating 90 days as policy. Scheduled purge should use a verified scheduler/worker available in the target Supabase project; do not assume `pg_cron` or a worker is enabled. Keep task results and audit retention separately configurable; archive is not a substitute for expiry. Purge must be observable, idempotent and tested without touching Knowledge Center or unrelated tasks.

## Keep three different concepts separate

1. **Verified rules and facts** — stored in `knowledge_entries`; describe BUSNET policy or sourced facts. `verified` means the content/source was reviewed, not that software can perform the described operation.
2. **Planned capabilities** — stored in the separate `assistant_capabilities` registry; a product backlog, always `planned` until actual code and tests exist.
3. **Verified/operational capabilities** — persisted stages linked to an active registered tool version and trusted evidence. `verified` requires a fresh successful test run; `operational` also requires a fresh successful execution check. `stale_evidence` is a derived display state, not a stored lifecycle value.

The 100-point list is capability planning input only. It is not model training, self-learning, business truth, tool authorization, or evidence that an action exists.

## Proposed architecture and component boundaries

```text
Admin chat
  -> Command boundary (auth, locale, input limits, owner scope)
  -> Intent/planning provider
       v1 offline: explicit deterministic grammar + typed clarification
       later optional: model provider behind the same interface
  -> Policy validator (role, module ACL, schemas, risk, approval)
  -> Knowledge Engine (verified, permission-filtered entries + source versions)
  -> Memory Engine (owner-scoped instructions/preferences, explicit consent)
  -> Task Engine (server-side conversation/task/step/event/approval records)
  -> Execution Engine (reviewed, versioned tool registry and server handlers)
  -> Worker/queue (bounded concurrency, lease, checkpoint, idempotency)
  -> Verification Engine (tool-specific read-after-write / quality checks)
  -> Response Engine (actual result, source citations, uncertainty, failures)
  -> Live Operations (database-backed task and event timeline)
```

Supabase provides durable state, authorization/RLS, audit and queues where configured; application code defines intent handling, tool contracts, policy gates, orchestration, workers and verification. A database row containing a capability does not execute it.

### Component responsibilities

- **Command Intelligence:** authenticate caller, normalize input, preserve locale, reject oversized/unsupported requests.
- **Intent Recognition:** return typed intent, slots, module and confidence. Offline v1 supports only published intents; unknown language/intent asks a clarifying question.
- **Planning Engine:** compose a DAG from implemented tool contracts only. It may not plan a tool merely because it appears in the planned-capability registry.
- **Knowledge Engine:** call the permission-aware Knowledge API; pass entry IDs, versions and source references to the plan/result.
- **Memory Engine:** store owner preferences/instructions separately from shared BUSNET facts; changes require explicit owner consent and remain auditable.
- **Execution Engine:** dispatch only allowlisted, server-side handlers. The client cannot choose arbitrary RPC names, SQL, URLs or service credentials.
- **Worker Engine:** claim queued steps with leases; bounded concurrency, checkpoints, retries only for safe idempotent handlers.
- **Verification Engine:** define a measurable postcondition per tool. No postcondition/result means no `succeeded` state.
- **Response Engine:** report what ran, what returned, evidence, partial failure and next step. Never claim an action without persisted execution evidence.
- **Live Operations:** render server events and real step counts, not client-only drafts or fabricated progress.

## Proposed persistence model

Build incrementally; do not replace the existing Knowledge Center:

- `assistant_conversations`, `assistant_messages`: durable chat, owner and timestamps; avoid logging secrets or unnecessary passenger data.
- `assistant_tasks`, `assistant_task_steps`, `assistant_task_events`: lifecycle, plan, status, checkpoints and append-only execution history.
- `assistant_approvals`: one-time approval bound to a hash of tool version, normalized input and target IDs.
- `assistant_memory`: explicitly consented owner-scoped memory, separate from shared knowledge and task history.
- `assistant_capabilities`: lifecycle registry with `planned`, `in_development`, `verified`, `operational` and `retired` states. `verified` requires a current successful test run; `operational` also requires a current successful execution check. Evidence expires after 30 days and 7 days respectively; stale evidence is derived for display, not stored as a lifecycle status.
- `assistant_tool_registry`: code handler/version catalog. Activating a tool requires a current successful test; downgrading an active version is blocked while verified/operational capabilities depend on it. Capabilities reference exact `(tool_id, tool_version)` pairs.
- `assistant_capability_test_runs` and `assistant_capability_operational_checks`: append-only evidence history, linked to exact capability/tool versions. Writes are available only to `service_role`; a real CI or execution producer is still required. `runner_identity` is metadata, not proof of provenance.
- Existing `knowledge_entries`, `knowledge_versions`, `knowledge_sources`, proposals and conflicts remain the verified knowledge system.

All task/memory rows need owner-aware RLS. Shared knowledge continues through its existing scoped ACL. Never expose `service_role` to the browser. The browser is not a worker.

## Rollout plan (no external AI API required for phases 0–3)

### Phase 0 — correct capability truth

- Keep all 100 ideas as `planned` in a separate registry.
- Correct the 10 mistakenly verified live Knowledge Center bundles through an explicitly reviewed production remediation; do not silently rewrite history.
- Publish current capability state from tool registry and tests, not from claims in chat.

### Phase 1 — durable conversation and tasks

- Add server-side conversation/message/task/event storage and owner RLS.
- Migrate from localStorage carefully; keep a user-visible import/recovery path.
- Make task cards reflect persisted records and show `not executable` until a real worker exists.

### Phase 2 — offline deterministic command engine

- Define typed intents from a short allowlist and route them to typed schemas.
- Support parameter clarification, bounded plans, deterministic policy checks and honest unsupported-intent responses.
- No general-language promises. Measure coverage with intent/slot tests.

### Phase 3 — small read-only tool set

- Start with booking summary/search and route lookup only after checking live RPC signature, RLS, returned fields and pagination.
- Register each as a versioned server-side handler; do not expose raw RPC/SQL from the browser.
- Record tool result, source, timestamp and a repeatable read-only verification check.
- Register the handler/version and its tests; promote a capability only after both tool-level and capability-level checks pass.

### Phase 4 — Knowledge and owner memory

- Retrieve verified entries by role/module and cite exact versions.
- Record actual use against persisted tasks.
- Add owner memory only with explicit controls for view, edit, forget and consent.

### Phase 5 — workers and approved writes

- Add queue/leases/checkpoints and execution timeline.
- Add only after safe read tools work. Writes require exact preview, one-time approval, audit and verification. Production deploys, passenger contact, booking changes and financial actions remain gated.

### Phase 6 — optional model adapter

- Only after privacy, provider, budget and retention decisions. A model may interpret/plan; deterministic validators, ACL, tool registry and approval remain authoritative.
- The architecture should run with the model adapter disabled.

## Acceptance criteria for “a task was really done”

1. Authenticated owner and role are checked server-side.
2. Intent and required parameters are stored; ambiguity blocks execution.
3. Every plan step references an implemented tool ID/version and has an allowlisted handler.
4. Read/write risk and approval policy are enforced on the server.
5. Real tool input/result and source references are persisted with sensitive fields minimized.
6. A tool-specific postcondition succeeds before task status is `succeeded`.
7. Failures and partial results are visible; uncertain side effects require reconciliation, not blind retry.
8. Reopening the browser/device shows the same persisted conversation and task timeline.
9. Capability status changes to `verified` only with a fresh passing test run; `operational` additionally requires a fresh passing execution check. Both must match the linked capability, tool and version.

## Suggested first measurable vertical slice

Implement one complete **booking summary** path before attempting broad autonomous operations:

1. Admin asks for a real booking summary and selects a date range.
2. Deterministic intent parser validates dates and role.
3. Planner selects only `bookings.summary` version N.
4. Server handler reads the approved summary RPC.
5. Verification checks result shape, range and totals.
6. Task/events are stored in Supabase; response cites period and generation time.
7. Tests cover authorized/unauthorized, empty result, invalid date, provider/RPC failure and repeatability.

This proves the command→plan→tool→verification→response loop without claiming all 100 capabilities or requiring a third-party language model.
