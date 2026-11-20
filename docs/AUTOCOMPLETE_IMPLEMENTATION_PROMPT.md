# BUSNET: prompt for implementing multilingual city autocomplete

You are a senior full-stack engineer. Implement production-ready city autocomplete in `C:\Users\Tania\Desktop\busnet-new`.

## Stack

- React 19
- TypeScript strict
- Vite 6
- React Router 7
- i18next
- Supabase
- AL-TRANS provider adapter
- UK, EN, and IT locales

## Reference projects

Use `C:\Users\Tania\Desktop\busnet-new` as the implementation target.

Use `C:\Users\Tania\Desktop\busnet-fresh` only as read-only legacy reference for UX and AL-TRANS mapping.

Do not copy into the new project:

- `.env` or `.env.local` values
- AL-TRANS API keys
- Supabase keys or service-role keys
- legacy carrier UID as the only provider identity
- hardcoded prices
- fake seats
- fake buses or amenities
- legacy fallback availability
- legacy CRM seat synchronization as booking truth
- legacy route tables when canonical tables already exist

Never read, print, log, or change secret values.

## Relevant files

Current implementation:

- `src/components/SearchWidget.tsx`
- `src/features/search/components/DatePicker/BusnetCalendar.tsx`
- `src/features/search/components/DatePicker/useCalendarAvailability.ts`
- `src/lib/supabase.ts`
- `src/pages/BookingPage.tsx`
- `src/i18n/locales/uk.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/it.json`
- `src/components/PopularDestinations.tsx`

Supabase:

- `supabase/migrations/20261119153000_busnet_core.sql`
- `supabase/migrations/20261119153000_busnet_passenger_auth_profile.sql`
- `supabase/functions/altrans-adapter/index.ts`

## Target data model

The new Supabase schema and the schedule migration provide:

- `locations`
- `routes`
- `trips`
- `trip_stops`
- `trip_prices`
- `availability_cache`
- `provider_route_schedules`
- `provider_route_schedule_stops`
- `popular_routes`
- `provider_request_logs`
- `bookings`
- `booking_passengers`
- `admin_profiles`

The `locations` table should be the canonical city source.

Required location fields:

- internal UUID `id`
- `name_uk`
- `name_en`
- `name_it`
- `normalized_name`
- `ascii_name`
- `aliases`
- `country_code`
- `provider_location_id`
- `latitude`
- `longitude`
- `active`

Existing RPC:

```sql
search_locations(p_query text, p_language text, p_limit integer)
```

Existing RPC return shape:

```text
id
name
country_code
provider_location_id
```

Existing AL-TRANS operations:

- `sync-catalog`
- `catalog-routes`
- `catalog-route-details`
- `search-trips`

## Goal

Replace the demo text-only autocomplete with a canonical, server-backed, localization-aware, pair-aware autocomplete.

The form must use location identity, not city text, as the source of truth:

```text
text input
-> server/Supabase RPC
-> resolved canonical location
-> location UUID
-> active route pair
-> travel date
-> live/provider search
```

Do not implement fake autocomplete using only a static frontend city array.

## Required behavior

### Search source

The primary source is the Supabase `locations` table.

The UI must receive canonical location IDs and provider location IDs.

A manual text match must not be the only resolution mechanism.

Use `search_locations` as the default location search RPC.

If the current RPC is insufficient, improve it with a migration:

- exact match
- alias match
- prefix match
- substring match
- alternate-language match
- popularity ranking
- active location only
- pair-aware filtering
- deterministic sorting
- limit of 1–20

### Empty-field state

When a city field is focused and empty:

- show popular cities for "From";
- show popular destinations or available cities for "To";
- show recent locations if available;
- show no more than 8 items;
- show a neutral empty state if no data exists.

Do not show an empty field with no explanation.

### Debounce and request cancellation

For text input:

- debounce 180–250 ms;
- run the RPC after at least 2 characters;
- abort or ignore stale RPC responses;
- show loading state;
- cache recent search queries briefly in memory;
- recover from RPC failure;
- distinguish empty result from network/provider failure;
- never update the dropdown from an obsolete query.

### Ranking

Implement this ranking order:

1. exact name in the current locale
2. exact alias
3. exact name in another locale
4. prefix in the current locale
5. prefix alias
6. substring match
7. alphabetic fallback

Use Unicode NFC, lowercase matching, apostrophe normalization, repeated whitespace normalization, and ASCII aliases.

Do not use a fuzzy search that can silently match unrelated cities.

Fuzzy or typo tolerance may be added as a separate score only after exact/prefix/alias ranks.

### Pair-aware autocomplete

The "To" list must prioritize locations that have an active route from the selected "From" location.

The "From" list may prioritize locations that have an active route to a selected "To" location.

Add RPCs if necessary, for example:

```sql
search_destination_locations(
  p_query,
  p_language,
  p_limit,
  p_from_location_id
)
```

```sql
search_origin_locations(
  p_query,
  p_language,
  p_limit,
  p_to_location_id
)
```

The pair-aware RPC must enforce:

- `routes.active = true`
- `locations.active = true`
- valid from/to UUIDs
- no same-location results
- current locale names
- aliases
- country code
- deterministic sorting
- popularity as a secondary ranking signal

Do not list an inactive route pair or an active location pair as a real destination unless the route exists.

### Canonical state

Create a strict TypeScript model:

```ts
interface ResolvedLocation {
  id: string;
  name: string;
  nameUk: string;
  nameEn: string | null;
  nameIt: string | null;
  countryCode: string | null;
  providerLocationId: string | null;
}
```

Keep separate state for:

```text
fromLocation
toLocation
fromText
toText
dateISO
```

Rules:

- selecting a suggestion stores the complete location object;
- changing the text clears the previous canonical selection;
- changing language changes the display name but not the location ID;
- swapping swaps canonical location objects and display strings;
- search is blocked until both canonical locations are resolved;
- search never compares or resolves by raw text alone;
- `/booking` receives location IDs or a location-ID-first contract.

### Language behavior

When locale changes:

- preserve canonical location IDs;
- update visible names;
- use `nameUk` or provider name as fallback;
- do not rerun provider search merely because locale changed;
- do not translate strings imperatively inside components;
- add UI strings to UK, EN, and IT locale JSON files.

Fallback order:

```text
current locale
-> Ukrainian name
-> English name
-> Italian name
-> provider/imported name
```

## Search form behavior

Before search:

- verify both locations are resolved;
- verify locations are different;
- verify provider location IDs exist;
- verify ISO date format;
- verify date is not past;
- verify date is within the approved search range;
- prevent repeated submissions;
- prevent search while loading;
- show separate validation errors for:
  - missing locations
  - same location
  - location not resolved
  - past date
  - invalid date
  - location not imported
  - provider unavailable

Do not enable search from a stale canonical location after the user edits a field.

Search should navigate to `/booking` with a canonical contract.

The booking page must resolve canonical IDs before calling AL-TRANS.

Do not pass free text to the provider adapter as the sole location key.

## Calendar behavior

When both canonical locations are selected:

- call `get_month_availability` for the selected pair;
- pass timezone;
- debounce and abort stale requests;
- show loading, retry, and scheduled/no-schedule states;
- describe dates as matching the published timetable, not confirmed seats;
- do not show prices in the calendar;
- cache the monthly schedule response by pair and month;
- update availability after swapping or changing locations.

When a location pair is incomplete:

- do not call provider availability;
- do not show fake dots or static prices;
- show `selectRouteError`.

The monthly calendar is calculated from recurring provider schedules and stop
offsets, not from `trips` or `trip_prices`. Never present a scheduled date as
confirmed bookability or show static fallback prices.

## Popular routes

Read popular routes from `popular_routes` joined to `routes` and `locations`.

Popular cards must:

- use canonical route pair IDs;
- use locale-specific location names;
- update the SearchWidget through a typed selection;
- not contain fixed fake prices;
- not imply availability for the selected date;
- scroll/focus the search form after selection.

## Dropdown UX

Desktop and mobile requirements:

- no horizontal viewport overflow;
- max height and internal scroll;
- 44px minimum row height on touch devices;
- country code or country name when useful;
- popular marker;
- exact match marker or highlighting;
- hover and active states;
- clear button;
- loading state;
- empty state;
- provider/RPC error state;
- close outside;
- close on Escape;
- close on blur;
- close on Tab;
- close on selection;
- portal or correct absolute positioning.

## Keyboard and accessibility

Required behavior:

- `ArrowDown`
- `ArrowUp`
- `Enter`
- `Escape`
- `Tab`
- IME composition protection
- `role=combobox`
- `role=listbox`
- `role=option`
- `aria-expanded`
- `aria-haspopup`
- `aria-controls`
- `aria-activedescendant`
- `aria-autocomplete=list`
- live region for result/loading/error announcements
- scroll the keyboard-highlighted row into view
- Enter only executes search when no suggestion is highlighted
- Enter on a highlighted result selects that result
- Tab closes the dropdown

## Swap behavior

The swap button must:

- swap canonical locations;
- swap visible names;
- swap from/to text;
- clear stale pair availability;
- not trigger search or provider request;
- be disabled during search/loading when appropriate;
- reduce animation for `prefers-reduced-motion`.

## AL-TRANS mapping

The adapter already supports location synchronization:

```text
catalog routes
-> route details
-> city_id + city_name
-> provider_location_id
-> canonical locations upsert
```

Verify provider payload structures against current provider documentation before changing the adapter.

Legacy reference documents:

- `C:\Users\Tania\Desktop\busnet-fresh\docs\AL_TRANS_LEGACY_TRANSFER.md`
- `C:\Users\Tania\Desktop\busnet-fresh\docs\AL_TRANS_INTEGRATION.md`

Legacy request examples must be treated as reference, not as guaranteed current contracts:

- `departure_city_id`
- `arrival_city_id`
- `depature_date`
- `passengers_count`
- `currecny_code`
- `enable_external_search`

Catalog synchronization must:

- run server-side or admin-only;
- require AL-TRANS secret server-side;
- upsert locations by `provider_location_id`;
- preserve existing canonical locations;
- add aliases instead of overwriting all localization data blindly;
- stage data before replacing catalog;
- log route-level import errors;
- support retry;
- not publish partial catalog as complete truth.

Do not expose provider secrets to React or browser code.

## Supabase migration rules

Before adding a migration:

1. inspect the existing migration and RPC signatures;
2. avoid duplicate or incompatible function names;
3. use a versioned migration;
4. preserve public RLS behavior;
5. keep location search public-readable;
6. keep provider sync admin-only;
7. add indexes for location and route matching;
8. test migration locally or against a confirmed branch/project.

Do not modify production Supabase or secrets without explicit confirmation.

## Forbidden behavior

Do not implement:

- hardcoded route availability
- hardcoded prices
- fake free seats
- fake bus number
- fake bus model
- fake carrier response
- static popular locations as proof of availability
- provider key in frontend
- provider key in a migration
- provider key in git
- raw provider response returned directly to React
- text matching as the only provider location identity
- cached empty provider result presented as a successful search
- success UI while provider search failed

## Testing

Add focused tests or at least runnable verification for:

- 1-character query: no RPC
- 2-character query: debounced RPC
- exact match ranking
- prefix match ranking
- alias match
- English name
- Italian name
- Ukrainian name
- duplicate city names in different countries
- stale request response ignored
- RPC failure
- empty response
- IME composition
- ArrowUp/ArrowDown
- Enter selection
- Enter search
- Escape
- Tab
- outside click
- text edit after selection
- same location
- missing location
- past date
- swap
- locale change
- 320px mobile viewport
- mobile sheet/popover
- keyboard-only search
- screen reader live regions
- reduced-motion preference
- pair-aware destination list
- provider unavailable
- canonical location ID navigation
- direct `/booking` URL

## Validation commands

Run the smallest relevant checks:

```powershell
npm run typecheck
npm run build
```

If tests exist, run only their relevant selector. Do not add unrelated dependencies.

## Implementation order

1. Inspect and improve the existing location RPC.
2. Introduce strict resolved-location state.
3. Implement dropdown states and keyboard navigation.
4. Add locale-aware names and aliases.
5. Add pair-aware destination RPC.
6. Integrate canonical IDs into `/booking`.
7. Connect calendar availability to canonical locations.
8. Add popular routes and recent locations.
9. Add tests and accessibility checks.
10. Run typecheck/build.

## Final delivery

Provide:

- changed file list
- Supabase migrations changed or not changed
- implemented behavior
- validation commands and results
- remaining provider/backend blockers
- exact manual checks required

Do not claim AL-TRANS live integration works unless it was actually tested with a confirmed key and confirmed provider contract.
