# Handoff: AL-TRANS search and route stops

## Status and safety boundary

This handoff is for the AI/operator with access to the BUSNET Supabase project.

- The user confirmed that `altrans-adapter` is already deployed. Their Supabase screenshot shows the function in the production project, with 11 deployments and a recent update. The screenshot does not establish the active source code or `verify_jwt` setting; verify both in Supabase before acting.
- The project shown in the screenshot is `BUSNET NEW`, production branch `main`, project reference `htgvcoshbnvoseigtgd`.
- No Supabase data, migrations, secrets, Edge Function deployments, or AL-TRANS bookings were changed or created in this local task.
- Do not deploy the local function over production until its current deployed source, schema, JWT settings, and route schedule data have been checked. The production function may contain changes not present in this worktree.
- Do not expose AL-TRANS keys, Supabase JWTs, service-role keys, or passenger/provider personal data in responses or logs.
- Do not run `busnet-fresh/al_trans_routes_import.sql` against this project. It targets a different `public.routes` schema and includes route deletions.

## Work completed locally

The following changes were made in this worktree:

- `supabase/functions/altrans-adapter/trip-normalization.ts`
  - Parses the provider's actual `dd.MM.yyyy` dates as ISO dates and normalizes provider times to `HH:mm:ss`.
  - Retains the segment ID as the booking lookup ID and captures route/city IDs internally for route matching.
  - Does not assume UAH when the provider's currency is absent.
  - Selects only bookable trips for the requested date and city pair; compares prices only within the requested currency. If there is no usable price, selection falls back to departure/arrival time and does not invent a price.
- `supabase/functions/altrans-adapter/route-itinerary.ts` (new)
  - Builds a partial itinerary only when route ID, origin/destination city IDs, service weekday, origin day offset, and origin departure time all match an active schedule.
  - Includes only the selected origin-to-destination slice. Intermediate schedule entries have departure times only; arrival times are left `null`.
  - Returns no schedule itinerary when no schedule matches or when multiple matching schedules produce different itineraries.
- `supabase/functions/altrans-adapter/index.ts`
  - Filters before selecting the result and returns `trip` plus a backward-compatible `trips` array containing zero or one item.
  - Reads existing `provider_route_schedules`, `provider_route_schedule_stops`, and `locations` data to enrich a single-segment result; falls back to provider-confirmed segment endpoints if no schedule can be used.
  - Rechecks the exact date and city pair in `create-booking`, matches the database route by the selected provider route ID, and rejects missing prices/unsupported currencies instead of silently substituting UAH.
  - Does not call an AL-TRANS booking-creation endpoint. `create-booking` still creates a BUSNET pending request only.
- `src/pages/BookingPage.tsx` sends the current UI locale for stop-name localization.
- `tests/altrans-trip-normalization.test.mjs` covers actual provider date/time fields, exact-date/city filtering, same-currency price selection, and schedule-derived stops without invented arrivals.

No schema migration was added. The local schema already defines the three schedule tables used above.

## Evidence from the supplied data

Reviewed files supplied from `C:\Users\Tania\Desktop\busnet-fresh`:

- `al_trans_search_trips.json`
- `al_trans_route_details_key.json`
- `al_trans_master_routes.json`
- `al_trans_master_routes.csv`
- `al_trans_routes_import.sql`

The search sample contains 20 bookable sequences across different departure dates, with route IDs 97 and 118. Each sequence has one segment. The sample uses `departure_date_ddmmyyyy` such as `24.11.2026`, and `trips[0].id` is the stable segment ID; the sequence-level `id` is absent in the sample. The provider returns `currency_code: "EUR"` and price `120` in the checked sample even though the BUSNET search request may ask for UAH. Always preserve the actual returned currency; never convert or relabel it.

For the 24.11.2026 sample result, route 97 is city 1 to city 41 (Lviv to Rome), departing 09:30 and arriving 25.11.2026 at 14:35. Running the local normalizer and itinerary builder against the supplied route-97 schedule produced 15 ordered stops. The intermediate stops had departure times only; the destination arrival came from the search result.

The route-details file contains route 97 only. The master routes file also contains route 118; do not use route 97 stops for a route-118 trip. Both supplied files are samples, not proof that the corresponding schedules are present and active in production Supabase.

## Required Supabase-side work

1. Inspect the currently deployed `altrans-adapter` source and deployment details. Confirm active deployment, `verify_jwt`, environment-secret presence (presence only; never reveal values), and all five existing operations: `routes`, `route-details`, `sync-catalog`, `search-trips`, and `create-booking`.
2. Read-only inspect the live schema and schedule data. Confirm:
   - `provider_route_schedules` and `provider_route_schedule_stops` columns match local migration `20261120133431_altrans_weekly_schedule_calendar.sql`;
   - active schedules and stops exist for provider route IDs 97 and 118;
   - provider city IDs 1 and 41 map to active locations and to directed active route rows for the corresponding provider route IDs;
   - stops are ordered correctly, and the origin day offset, service weekday, and departure time match the provider result.
3. Compare the deployed source with the local changes listed above. Do not overwrite unrelated production fixes. If deployed code differs materially, reconcile it deliberately and keep the existing operation/error contracts.
4. If authorized to validate the deployed search, invoke **only** `search-trips` with a safe date/route and no passenger data. Confirm:
   - `trip` is either `null` or one result;
   - `trips.length <= 1` and contains the same result as `trip`;
   - the selected result matches the requested date and provider city IDs;
   - route schedule stops use the selected result's provider route ID;
   - intermediate arrivals remain unknown (`null`) and the final arrival comes from AL-TRANS;
   - when no active matching schedule exists, the response exposes only provider-confirmed segment stops and indicates the schedule warning/source.
5. Do not invoke `create-booking` for testing: it writes a pending booking and passenger rows. Do not claim it creates a real AL-TRANS booking. The real AL-TRANS booking-create contract, idempotency behavior, and response reference are still unverified.
6. Do not alter production schema or deploy a function until the deployed-source comparison and read-only checks pass and deployment is explicitly approved. No new migration is expected for the local search/itinerary behavior.
7. If the Edge Function is updated, preserve `verify_jwt`, all five operations, authentication behavior, CORS/error contracts, and the production secrets. Verify deployed search after deployment. A frontend build/deployment is separate from an Edge Function deployment.

## Local verification performed

- `npm test`: passed, 16 tests.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite reported the existing large-chunk advisory.
- The supplied 24.11.2026 route-97 sample was run through the local normalizer and itinerary builder: 15 stops, correct next-day destination arrival, no intermediate arrival times invented.
- Deno and the Supabase CLI are not installed in the local environment, so no Deno check or Supabase deployment verification was possible.
- No live AL-TRANS request, production database write, deployment, or real booking was performed.

## Remaining risks to resolve before production use

- The active deployed function source and current production schedule row counts have not been independently verified.
- The provider sample's actual currency is EUR despite UAH being requested in the frontend. Confirm the provider's currency behavior; keep displaying/storing the returned currency.
- Existing booking timestamp conversion uses Kyiv-local conversion for departure and arrival. Verify whether arrival times for non-Ukrainian destinations need destination-local timezone handling before relying on stored `trips.arrival_at`.
- The SQL import file's schema is incompatible with BUSNET and its deletion behavior is unsafe for this project.
