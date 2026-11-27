# BUSNET assistant chat MVP

The admin chat MVP supports two deterministic actions: greeting responses and
searching registered passenger profiles by name, email, or phone. It does not
call an external AI service and does not execute booking changes.

## Data access

- Search uses the existing `admin_search_passengers` RPC.
- The new read-only `admin_get_passenger_assistant_card` RPC returns profile,
  booking, trip, booking-passenger snapshot, and cancellation-request data.
- Both RPC paths are restricted to active `super_admin`, `admin`, and `support`
  users. The card RPC returns no document fields and paginates booking history.
- The chat only searches registered profiles. Booking-only guest snapshots are
  not merged into profiles because they do not have a guaranteed account
  identity.

## Data limitations and retention

- A booking's `total_amount` is not proof of payment or refund; no payment
  ledger is returned.
- A completed trip status is not proof that a passenger travelled. No-show and
  reschedule facts are not inferred.
- Candidate lists and passenger cards are held in memory only. Passenger search
  text is redacted in browser chat history; task history stores generic titles
  and execution events in this browser's local storage, not centrally.

## Database rollout and tests

`20261127120000_admin_assistant_passenger_card.sql` is a branch-local migration.
It has not been applied to Production. The SQL regression script
`supabase/tests/admin_passenger_assistant.sql` uses synthetic rows and rolls
them back. It covers email, phone, exact-name, partial-name, no-match searches,
card pagination, document-field minimization, RPC grants, and non-admin denial.
