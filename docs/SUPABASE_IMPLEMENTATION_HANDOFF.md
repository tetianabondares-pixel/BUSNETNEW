# BUSNET: Supabase implementation handoff

Этот документ предназначен для ИИ или инженера, который имеет доступ к Supabase-проекту BUSNET, но не имеет доступа к исходному React-коду.

## 1. Project

- Project name: `tetianabondares-pixel's Project`
- Supabase project ref: `htgvcoshbnvvoseigtdg`
- Region: `eu-west-1`
- Postgres: `17`
- Status: `ACTIVE_HEALTHY`

Do not print or return Supabase service-role keys, provider API keys, database passwords or JWT secrets.

The project already has the BUSNET frontend and Auth configured. Changes must be made additively. Do not reset database, disable RLS globally or use the `service_role` key in browser-facing code.

## 2. Required environments

Frontend variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` or legacy-compatible `VITE_SUPABASE_ANON_KEY`

Server/Edge Function secrets:

- `ALTRANS_API_BASE`
- `ALTRANS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended booking expiration: 15 minutes.

Timezone for UI and provider availability: `Europe/Kyiv`.

## 3. Existing migration files

Apply/verify migrations in chronological order:

1. `20261119153000_busnet_core.sql`
2. `20261119153000_busnet_passenger_auth_profile.sql`
3. `20261119170000_location_autocomplete.sql`
4. `20261119173000_atomic_altrans_catalog_sync.sql`
5. `20261120133431_altrans_weekly_schedule_calendar.sql`
6. `20261120133443_altrans_schedule_tables_revoke_write_grants.sql`
7. `20261120160000_busnet_booking_mvp.sql`
8. `20261120161000_passenger_account.sql`
9. `20261120162000_busnet_admin_dashboard.sql`
10. `20261120164000_admin_content_audit.sql`

Before applying a migration, check whether its objects already exist. Migrations must be idempotent or explicitly guarded.

Do not add duplicate migrations with the same timestamp. Supabase migration versions must be unique.

## 4. Core tables

Verify that these tables exist and have RLS enabled:

### `profiles`

User-facing profile:

- `id uuid` references `auth.users(id)`
- `full_name text`
- `email text`
- `phone text`
- `preferred_locale text`: `uk`, `en`, `it`
- `created_at timestamptz`
- `updated_at timestamptz`

Insert is handled only by Auth trigger.

Own select/update only.

### `locations`

Canonical location source:

- `id uuid`
- `name_uk text`
- `name_en text`
- `name_it text`
- `normalized_name text`
- `ascii_name text`
- `aliases jsonb`
- `country_code char(2)`
- `provider_location_id text`
- `latitude double precision`
- `longitude double precision`
- `active boolean`

Public read: active locations only.

Writes: service role or admin/provider operator server function only.

### `routes`

- `id uuid`
- `from_location_id uuid`
- `to_location_id uuid`
- `provider_route_id text`
- `active boolean`

Public read: active routes.

Writes: service role/server function only.

### `trips`

- `id uuid`
- `route_id uuid`
- `provider_trip_id text`
- `departure_at timestamptz`
- `arrival_at timestamptz`
- `duration_minutes integer`
- `carrier text`
- `status text`: `scheduled`, `active`, `cancelled`, `completed`

Public read: only `scheduled`/`active`.

Writes: provider/server function only.

### `trip_stops`

- `trip_id uuid`
- `location_id uuid`
- `stop_order integer`
- `arrival_offset interval`
- `departure_offset interval`
- `day_offset integer`
- `is_pickup boolean`
- `is_dropoff boolean`

### `trip_prices`

- `trip_id uuid`
- `currency char(3)`
- `price numeric(12,2)`
- `seats_available integer`
- `source text`
- `confirmed_at timestamptz`
- `expires_at timestamptz`

Public read must include only confirmed, non-expired pricing.

### `availability_cache`

- `route_id uuid`
- `travel_date date`
- `trips_count integer`
- `min_price numeric`
- `max_price numeric`
- `currency char(3)`
- `provider_source text`
- `schema_version text`
- `confirmed_at timestamptz`
- `expires_at timestamptz`

Direct writes: service role only.

Public read: `expires_at > now()`.

### `provider_request_logs`

- `provider text`
- `operation text`
- `route_key text`
- `travel_date date`
- `status text`
- `response_code integer`
- `cache_hit boolean`
- `error_code text`
- `requested_at timestamptz`
- `completed_at timestamptz`

No raw provider response body should be saved.

Admin read only, via `is_admin()`.

## 5. Weekly schedule tables

### `provider_route_schedules`

- `id uuid`
- `provider_route_id text`
- `schedule_key text`
- `direction text`
- `title text`
- `service_weekday integer`
- `active boolean`

Public read: active schedules.

Write: service role/atomic sync RPC only.

### `provider_route_schedule_stops`

- `schedule_id uuid`
- `location_id uuid`
- `provider_location_id text`
- `provider_stop_id text`
- `stop_order integer`
- `day_offset integer`
- `departure_time text`
- `place text`
- `active boolean`

Public read: only stops belonging to active schedules.

Write: service role/atomic sync RPC only.

## 6. Popular routes

### `popular_routes`

- `id uuid`
- `route_id uuid`
- `locale text`: `uk`, `en`, `it`
- `sort_order integer`
- `is_featured boolean`
- `active boolean`

Public read: active entries.

Admin management:

- `super_admin`
- `admin`
- `content_manager`

Do not hardcode popular destinations in frontend fallback. A fallback may query first active routes only as an empty-state strategy.

## 7. Passenger and booking tables

### `bookings`

- `id uuid`
- `booking_number text`
- `passenger_id uuid`, nullable for guest booking
- `trip_id uuid`
- `status text`: `pending`, `confirmed`, `cancelled`, `expired`, `refunded`
- `currency char(3)`
- `total_amount numeric(12,2)`
- `expires_at timestamptz`
- `provider_booking_id text`
- `created_at timestamptz`
- `confirmed_at timestamptz`

Frontend direct insert is prohibited.

Frontend direct status update is prohibited.

Passenger read: own `passenger_id`.

Admin read: active admin profile.

Sensitive status updates: `update_booking_status`.

### `booking_passengers`

- `booking_id uuid`
- `full_name text`
- `email text`
- `phone text`
- `seat_number text`
- `nationality text`
- `document_type text`
- `document_number text`

Direct frontend insert/select should remain forbidden except authorized server or owner/admin policy.

Admin read policy: active admin profile.

Passenger read: only if the related booking belongs to the passenger.

### `booking_cancellation_requests`

- `id uuid`
- `booking_id uuid`
- `passenger_id uuid`
- `reason text`
- `status text`: `new`, `in_progress`, `resolved`
- `created_at timestamptz`
- `updated_at timestamptz`

Unique open request per booking.

Passenger insert/process:

- `request_booking_cancellation(p_booking_id, p_reason)`

Passenger read: own request or admin.

Admin update: active admin.

Do not immediately cancel a booking just because a request is submitted. Cancellation remains support-approved.

## 8. Admin tables

### `admin_profiles`

- `user_id uuid`
- `role text`
- `active boolean`
- `created_at timestamptz`

Allowed roles:

- `super_admin`
- `admin`
- `content_manager`
- `support`
- `provider_operator`

Existing active admin must be preserved.

Current project admin profile:

- User ID: `a869fccd-159f-470d-a11b-09ad0a3de6fd`
- Role: `super_admin`
- Active: `true`

Do not disclose this ID publicly or expose it as frontend configuration. It is for database verification only.

## 9. Public content

### `public_content`

- `id uuid`
- `content_key text`
- `locale text`: `uk`, `en`, `it`
- `content jsonb`
- `active boolean`
- `updated_at timestamptz`
- `updated_by uuid`

Unique pair:

- `(content_key, locale)`

Public read: active rows.

Admin write: `super_admin`, `admin`, `content_manager`.

Recommended content keys:

- `faq`
- `howItWorks`
- `footer`
- `finalCta`
- `popularDestinations`
- `homeHero`
- `baggageRules`
- `borderRules`
- `refundPolicy`

Example JSON shape:

```json
{
  "title": "Localized title",
  "subtitle": "Localized subtitle",
  "items": []
}
```

Frontend can keep i18n fallback while Supabase content is added or imported.

## 10. Audit logs

### `audit_logs`

- `id uuid`
- `actor_id uuid`
- `action text`
- `target_type text`
- `target_id text`
- `metadata jsonb`
- `created_at timestamptz`

Admin read only.

Insert only through `log_admin_action`.

No secrets or raw document numbers are allowed in `metadata`.

Log at least:

- booking status changes
- booking cancellation decisions
- catalog sync
- popular route changes
- public content changes
- role changes
- route activation changes

## 11. Required RPC functions

### `is_admin`

```sql
public.is_admin()
returns boolean
```

Must verify an active `admin_profiles` row for `auth.uid()`.

For internal RLS use, it should be `SECURITY DEFINER` and protected from anonymous callable access.

Do not expose a bypass or accept a user-supplied role parameter.

### `search_locations`

Inputs:

- `p_query text`
- `p_language text`
- `p_limit integer`

Returns:

- `id`
- `name`
- `country_code`
- `provider_location_id`

Requirements:

- active locations only
- exact/alias/prefix/substring ranking
- limit 1–20
- Unicode normalized matching
- deterministic sorting

### `search_destination_locations`

Pair-aware destination search:

- `p_query`
- `p_language`
- `p_limit`
- `p_from_location_id`

Prioritize active routes starting from the selected origin.

### `search_origin_locations`

Pair-aware origin search:

- `p_query`
- `p_language`
- `p_limit`
- `p_to_location_id`

### `get_month_availability`

Inputs:

- `p_year`
- `p_month`
- `p_from`
- `p_to`
- `p_timezone`
- `p_schema_version`

No frontend mock availability is allowed.

### `search_trips`

The live provider search should remain in the Edge Function, not be emulated by frontend schedule tables.

### `sync_altrans_catalog`

Must:

- accept locations, routes and schedules
- validate provider IDs
- validate location/route/schedule relationships
- perform atomic import
- deactivate stale active routes/schedules only under an explicitly confirmed provider sync contract
- return exact imported counts

### `update_booking_status`

```sql
public.update_booking_status(p_booking_id uuid, p_status text)
```

Allowed status values:

- `pending`
- `confirmed`
- `cancelled`
- `expired`
- `refunded`

Requirements:

- authenticated caller
- active admin profile
- booking exists
- allowed transition
- set `confirmed_at` when confirmed
- no direct client-supplied passenger ID

### `request_booking_cancellation`

```sql
public.request_booking_cancellation(p_booking_id uuid, p_reason text)
```

Requirements:

- authenticated caller
- booking belongs to `auth.uid()`
- booking status allows cancellation
- create or return existing open cancellation request
- reason length max 1000 chars
- no direct booking cancellation

### `cancel_booking`

The former direct cancellation RPC must not allow passenger status changes outside the cancellation review flow.

If retained:

- requires auth
- owner/admin check
- allowed status transition
- audit log

### `log_admin_action`

```sql
public.log_admin_action(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb
)
```

Requirements:

- authenticated active admin
- sanitized metadata
- actor ID from `auth.uid()`
- no API/provider secrets

## 12. AL-TRANS Edge Function

Function name:

- `altrans-adapter`

Supported operations:

- `sync-catalog`
- `routes`
- `route-details`
- `search-trips`
- `create-booking`

Later operations:

- `get-trip-details`
- `cancel-booking`
- `sync-provider-trips`

Rules:

- validate operation and JSON shape
- reject unknown operations
- validate UUID/date/passenger/currency parameters
- resolve provider IDs through canonical `locations`
- never accept frontend-only fake trip IDs
- never return provider secrets
- distinguish provider failure from no trips
- provider failure must use a stable response such as:

```json
{
  "providerError": true,
  "errorCode": "ALTRANS_UNAVAILABLE",
  "trips": []
}
```

- timeout provider requests
- log only sanitized technical fields
- service role is allowed only inside server context

## 13. Search-trips contract

Request:

```json
{
  "operation": "search-trips",
  "fromLocationId": "location UUID",
  "toLocationId": "location UUID",
  "travelDate": "YYYY-MM-DD",
  "passengersCount": 1,
  "currencyCode": "UAH"
}
```

Validation:

- canonical IDs
- different origin/destination
- valid date
- passenger count 1–9
- allowed currency
- provider location IDs numeric/safe

Response:

```json
{
  "providerError": false,
  "trips": [],
  "searchedAt": "ISO timestamp"
}
```

## 14. Create-booking contract

Request:

```json
{
  "operation": "create-booking",
  "tripId": "provider trip ID",
  "fromLocationId": "location UUID",
  "toLocationId": "location UUID",
  "travelDate": "YYYY-MM-DD",
  "locale": "uk",
  "passengers": []
}
```

Passenger fields:

- `fullName`
- `email`
- `phone`
- `nationality`
- `documentType`
- `documentNumber`
- optional `seatNumber`

Before inserting:

- re-query provider availability
- verify trip exists
- verify price
- verify passenger count
- verify departure is not past
- create local trip/price records if confirmed
- create booking
- create booking passengers
- create booking only after passenger validation

Success response:

```json
{
  "bookingId": "uuid",
  "bookingNumber": "BUS-...",
  "status": "pending",
  "currency": "UAH",
  "totalAmount": 2900,
  "expiresAt": "ISO timestamp"
}
```

Do not implement payment in MVP.

Do not allow the frontend to set `passenger_id`, price or provider booking status.

## 15. Catalog sync contract

Operation:

```json
{
  "operation": "sync-catalog"
}
```

Authorization:

- authenticated
- active admin profile
- role:
  - `super_admin`
  - `admin`
  - `provider_operator`

Success counts:

- imported locations
- imported routes
- imported schedules
- imported schedule stops

Failure must use:

- `providerError`
- `errorCode`
- HTTP status

No partial success is allowed.

## 16. RLS policies

Ensure the following high-level policies:

### Public

- locations: active read
- routes: active read
- trips: scheduled/active read
- trip prices: confirmed/non-expired active read
- trip stops: active trip read
- popular routes: active read
- public content: active read
- provider schedules: active read
- provider schedule stops: active schedule read
- availability cache: non-expired read

### Passenger

- profiles: own select/update
- bookings: own select
- booking passengers: own booking select
- cancellation requests: own select/insert through RPC

### Admin

- bookings: select/update according to role
- booking passengers: admin/support select
- cancellation requests: admin/support select/update
- provider logs: admin/provider operator read
- locations/routes/schedules: provider/admin write
- public content/popular routes: admin/content manager write
- audit logs: admin read

No direct insert/update policy should allow arbitrary passenger or status fields through the public API.

## 17. Policies already applied

Verify these policy names exist:

- `public content public read`
- `public content admin manage`
- `audit logs admin read`
- `booking passengers admin read`
- `provider request logs admin read`
- `popular routes admin manage`
- `popular_routes_public_read`

If an existing policy has a conflicting name or broader `USING (true)`, replace it rather than adding an additional broad policy.

No table should have RLS enabled without a usable policy.

## 18. Security checks

Run Supabase security advisor and verify:

- no public write policy on locations/routes/trips
- no public insert/update/delete on bookings
- no public insert/update/delete on booking passengers
- no public read on provider logs
- no public read on audit logs
- no public execute grant for admin/status/audit RPCs
- no service-role key in frontend or Edge Function logs
- auth leaked-password protection enabled
- MFA guidance enabled if organization policy requires it
- all service-role operations happen server-side

Security-definer functions must be explicitly revoked from `public`/`anon`, then granted only to roles that must execute them.

## 19. Auth setup

Admin login uses Supabase Auth email/password.

After login, frontend executes:

```text
auth session exists
-> admin_profiles.user_id = auth.uid()
-> active = true
-> role allowed
-> show dashboard
```

No role should be stored only in `user_metadata`.

Admin role changes must be made through a secure database admin operation and audited.

No frontend account registration should create `admin_profiles`.

Enable/recommend:

- email confirmation
- recovery email
- leaked-password protection
- short/appropriate session settings
- password strength validation

## 20. Supabase Storage

No public booking documents or passport images are required for MVP.

Do not store passport/document images unless a secure private bucket and explicit retention policy are approved.

## 21. Provider request logging

Only log sanitized fields:

- provider
- operation
- route key
- travel date
- status
- response code
- cache hit
- error code
- requested/completed timestamps

Do not log:

- API key
- Authorization header
- passenger PII
- full provider payload
- document numbers
- raw JSON response

## 22. Data integrity constraints

Add/check:

- routes cannot point to the same location
- provider trip ID unique
- booking number unique
- one current price per trip
- one open cancellation request per booking
- booking passenger cascade delete
- active route references canonical locations
- active schedule stops reference canonical locations

## 23. Indexes

Ensure indexes exist for:

- locations: active, normalized name, ascii name
- routes: from/to location, provider route ID, active
- trips: route/departure, status/departure
- trip prices: trip ID
- bookings: passenger ID, status, created at
- booking passengers: booking ID
- cancellation requests: booking ID, passenger ID, status
- schedules: provider route ID/active
- schedule stops: schedule/location/stop order
- provider request logs: provider/operation/requested at
- popular routes: locale/active/sort order
- audit logs: created at/action/actor

## 24. Verification queries

Run these queries after migrations:

```sql
select user_id, role, active
from public.admin_profiles
order by created_at desc;
```

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'booking_passengers',
    'provider_request_logs',
    'popular_routes',
    'public_content',
    'audit_logs',
    'bookings',
    'booking_cancellation_requests'
  )
order by tablename, policyname;
```

```sql
select
  to_regprocedure('public.is_admin()') is not null as is_admin_exists,
  to_regprocedure('public.update_booking_status(uuid,text)') is not null as status_rpc_exists,
  to_regprocedure('public.request_booking_cancellation(uuid,text)') is not null as cancel_request_rpc_exists,
  to_regprocedure('public.log_admin_action(text,text,text,jsonb)') is not null as audit_rpc_exists;
```

```sql
select count(*) as active_locations
from public.locations
where active = true;
```

```sql
select count(*) as active_routes
from public.routes
where active = true;
```

```sql
select count(*) as active_schedules
from public.provider_route_schedules
where active = true;
```

## 25. Testing matrix

Test with four identities:

1. anonymous guest
2. passenger
3. support
4. super_admin

Anonymous must not:

- read bookings
- read booking passengers
- read audit logs
- read provider logs
- update popular routes/public content
- update booking status
- execute admin/audit/status RPCs

Passenger can:

- read own profile
- read own bookings
- read own booking passengers
- create cancellation requests for own bookings

Passenger cannot:

- read another passenger
- change booking status directly
- change another booking
- read provider logs
- read audit logs
- manage catalog/content

Support can:

- read/search allowed booking data
- update cancellation request state
- not sync catalog or change routes/content

Admin/super_admin can:

- read admin data
- change allowed booking statuses
- sync provider catalog
- manage routes/popular routes/content
- read audit logs

## 26. Known unresolved project settings

The Supabase Security Advisor has previously reported:

- Auth leaked-password protection disabled
- some `SECURITY DEFINER` functions callable by exposed roles
- RLS enabled tables with no policy were fixed for `booking_passengers` and `provider_request_logs`

The external Supabase Auth setting for leaked-password protection must be enabled in the Auth configuration UI or through the approved Supabase management API.

Internal trigger/system functions such as `handle_new_auth_user()` and `rls_auto_enable()` must be distinguished from application-facing RPCs.

Do not disable them blindly. Only revoke application-facing execute grants after verifying trigger behavior.

## 27. Next implementation step

After applying/verifying migrations:

1. verify `/admin/login`
2. verify `/admin`
3. verify real admin profile/role
4. verify booking table loads
5. verify status RPC
6. verify cancellation queue
7. verify catalog sync
8. verify popular route editor
9. verify public content editor
10. verify audit rows
11. verify mobile layout
12. rerun security advisors

The implementation is complete for an environment only when all of the above objects exist, all direct write boundaries are protected, and real admin credentials can reach the dashboard.
