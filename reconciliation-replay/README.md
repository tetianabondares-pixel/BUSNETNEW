# Forensic replay only

This directory is an isolated reconstruction of the recovered database sources. It is not a canonical migration chain and must not be applied to Production.

- `supabase/migrations/` contains 17 byte-exact Production ledger statements plus 3 normalized Dashboard SQL statements.
- `replay-sources.json` records source lineage and hashes.
- `supabase/config.toml` uses a local-only project ID and database port `55432`; automatic migration startup and seed-file execution are disabled.
- The Knowledge Center v3 migration requires an existing `auth.users` row. For local replay, the database was started without migrations, a test-only `@invalid.example` user was inserted, and `supabase migration up` applied the 20 files.

The replay succeeds, but it does not yet reproduce Production exactly: the current Production catalog has 27 RLS-enabled public tables and 41 policies; replay has 15 RLS-enabled tables and 30 policies. Production also has one additional pre-existing Knowledge Center entry. The original source for those differences was not recovered. SQL lint also identifies an unresolved `digest()` lookup in `claim_guest_booking`.

Do not use this directory with `--remote`, `db push`, or a Production deployment. Resolve the differences and verify a restorable Production backup before any deployment.
