# BUSNET: prompt for implementing the complete admin dashboard

You are a senior full-stack product engineer. Implement a production-ready administration dashboard in `C:\Users\Tania\Desktop\busnet-new`.

## 1. Product goal

Build a secure, reliable operations cockpit for BUSNET administration. The dashboard is not a decorative mockup: every visible action must perform a real, authorized operation and every table must reflect confirmed Supabase/provider data.

The dashboard must support the complete operational lifecycle of a bus-ticket MVP:

- authenticate an internal user;
- verify an internal role;
- monitor bookings and system activity;
- process passenger bookings and cancellation requests;
- synchronize the AL-TRANS catalog;
- manage active locations, routes, schedules and popular routes;
- manage passenger profiles and support cases;
- configure public content;
- preserve auditability and prevent unauthorized writes;
- work in UK, EN and IT;
- work in light and dark themes;
- remain usable on desktop, tablet and mobile.

The public passenger site and the admin site must remain separate visual and permission domains. Never expose service-role credentials or provider secrets in frontend code.

## 2. Stack

- React 19
- TypeScript strict
- Vite 6
- React Router 7
- i18next
- Supabase Auth, Postgres, RLS and Edge Functions
- AL-TRANS provider adapter
- Lucide React
- Existing BUSNET theme tokens

Preserve existing project patterns and local components. Do not replace the application with another UI framework.

## 3. Existing implementation to preserve

Keep and integrate:

- `src/pages/admin/AdminLoginPage.tsx`
- `src/pages/admin/AdminDashboardPage.tsx`
- `src/routes/router.tsx`
- `src/pages/PassengerBookingPage.tsx` or `src/pages/BookingPage.tsx`
- `src/pages/account/PassengerAccountPage.tsx`
- `src/lib/supabase.ts`
- `src/theme`
- `src/i18n/locales/uk.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/it.json`
- `supabase/functions/altrans-adapter/index.ts`
- the existing BUSNET public website: header, search, popular destinations, How It Works, FAQ, final CTA and footer.

Do not remove public website functionality while changing the admin layout.

## 4. Existing data model

Use these canonical tables:

- `profiles`
- `passengers`
- `locations`
- `routes`
- `trips`
- `trip_stops`
- `trip_prices`
- `availability_cache`
- `popular_routes`
- `provider_request_logs`
- `provider_route_schedules`
- `provider_route_schedule_stops`
- `bookings`
- `booking_passengers`
- `booking_cancellation_requests`
- `admin_profiles`

Do not introduce shadow tables for public cities or hardcoded mock destinations.

Provider identity must remain canonical:

- location: `locations.id` and `locations.provider_location_id`
- route: `routes.id` and `routes.provider_route_id`
- trip: `trips.id` and `trips.provider_trip_id`

## 5. Admin roles

`admin_profiles.role` values are:

- `super_admin`
- `admin`
- `content_manager`
- `support`
- `provider_operator`

Role policy:

- `super_admin`: full access
- `admin`: bookings, passengers, routes, catalog and operational content
- `content_manager`: popular routes and public content only
- `support`: view/search bookings and passenger data; process support and cancellation requests; no provider catalog writes
- `provider_operator`: provider sync and catalog-related operational data; no passenger status changes without explicit permission

Before rendering `/admin`, check both:

1. an authenticated Supabase session exists;
2. `admin_profiles` contains an active matching role.

Do not rely only on hiding UI controls. Enforce every operation with RLS and/or server functions.

The dashboard must show the signed-in role and provide sign out.

## 6. Layout

Create a desktop-first admin shell with:

- fixed or sticky left sidebar;
- BUSNET logo/name;
- active navigation state;
- role badge;
- header with page title, breadcrumb or context, search if appropriate and sign-out/avatar action;
- responsive main workspace;
- mobile sidebar converted to top horizontal navigation or collapsible drawer;
- consistent light/dark theme support;
- no duplicated icons or ambiguous number badges;
- clear loading, empty, denied, success and error states.

Recommended routes:

- `/admin` — overview
- `/admin/bookings`
- `/admin/passengers`
- `/admin/catalog`
- `/admin/routes`
- `/admin/cancellations`
- `/admin/content`
- `/admin/settings`
- `/admin/audit`

Tabs or nested routes may be used, but deep links must work.

## 7. Overview dashboard

The overview is an operational summary, not a marketing page.

Required metrics:

- total/current bookings;
- bookings by status: pending, confirmed, cancelled, expired, refunded;
- passenger count;
- active locations;
- active routes;
- active schedules;
- provider sync status;
- open cancellation requests;
- provider request failures in the selected period;
- latest bookings;
- latest cancellations;
- latest provider sync result;
- provider availability status.

Every metric must come from Supabase or an Edge Function. Do not hardcode demo counts or percentages.

Include quick actions based on role:

- open bookings;
- open cancellation requests;
- synchronize catalog;
- add or review popular route;
- open support cases;
- view provider logs.

## 8. Bookings module

The bookings page must include:

- search by booking number, passenger name, email, phone or trip ID;
- filters for status, date range, carrier, route and passenger type;
- sortable table;
- pagination;
- row count;
- export CSV;
- booking detail drawer or page;
- status timeline;
- passenger list;
- route and trip details;
- price/currency/amount;
- provider booking ID when present;
- expiration date;
- creation and confirmation timestamps;
- cancellation reason if available.

Status actions:

- pending → confirmed;
- pending/confirmed → cancelled;
- confirmed → refunded;
- expired is set by server, not arbitrary frontend action.

For status changes:

- use the `update_booking_status` RPC or a dedicated Edge Function;
- validate role;
- validate allowed transitions;
- log the actor and reason;
- refresh the row and counters;
- show success/failure feedback.

The UI must never allow guest/unknown users to update bookings. Direct frontend table writes are allowed only with matching RLS, preferably no direct update for sensitive fields.

## 9. Booking details

A booking detail view must show:

- booking number;
- current status;
- total amount and currency;
- passenger identity and contacts;
- documents and nationality without exposing unnecessary PII;
- seat number if supplied;
- departure/arrival cities and times;
- carrier and bus number;
- trip/provider identifiers;
- cancellation history;
- audit events.

Admin support must be able to copy useful sanitized identifiers, but secrets and service-role data must never be rendered.

## 10. Passenger module

Create a passenger directory backed by `profiles`, `passengers`, auth metadata and `bookings`.

Required fields:

- full name;
- email;
- phone;
- locale;
- active/blocked status if the data model supports it;
- registration date;
- booking count;
- latest booking.

Features:

- search;
- filter by locale/status;
- passenger detail;
- passenger booking history;
- profile editing only with authorization;
- support notes;
- no credential or password content.

Do not add password-management UI without a Supabase-approved reset or admin recovery flow.

## 11. Cancellation module

Use `booking_cancellation_requests`.

Required states:

- `new`
- `in_progress`
- `resolved`

Features:

- queue ordered by oldest first;
- search;
- filter by status and date;
- passenger reason;
- booking details;
- assign to support;
- resolve or reject;
- update booking status when an approved cancellation completes;
- record audit actor and resolution.

Cancellation must remain reviewable; do not silently cancel a booking merely because a passenger submitted a request.

Guest cancellation is not a required admin flow. Authenticated passenger requests must remain tied to `passenger_id`.

## 12. Catalog and provider operations

The catalog module must show the result and health of AL-TRANS operations.

Include:

- catalog sync button;
- sync loading state;
- last successful sync timestamp;
- imported locations count;
- imported routes count;
- imported schedules count;
- imported schedule stops count;
- provider error code;
- retry action;
- sanitized operation log.

`sync-catalog` must remain a server-side/Edge Function operation. It must:

- authorize a super admin/admin/provider operator;
- call AL-TRANS;
- validate provider responses;
- reject incomplete imports;
- perform an atomic catalog transaction;
- never deactivate confirmed active catalog data because of a partial provider failure;
- never expose API keys or raw secrets.

Implement provider request log viewing:

- provider;
- operation;
- status;
- response code;
- cache hit;
- travel date;
- route key;
- requested/completed timestamps;
- sanitized error code.

Do not expose provider response bodies containing personal or internal data.

## 13. Locations, routes and schedules

### Locations

- list canonical locations;
- active/inactive state;
- UK, EN and IT names;
- aliases;
- country code;
- provider location ID;
- coordinates if present;
- search;
- edit localization only through an authorized admin/content role.

### Routes

- list active/inactive route pairs;
- from location;
- to location;
- provider route ID;
- schedule count;
- trip count;
- popular-route status.

Route activation/deactivation must be server-managed and auditable.

### Schedules

- schedule title/key;
- carrier/provider route;
- weekday;
- start/end date if available;
- stops and stop order;
- `day_offset`;
- pickup/dropoff times;
- place;
- active state.

Admin UI must clearly explain that a weekly schedule is an availability candidate, not confirmed seat availability or final price.

## 14. Popular destinations

Add a real popular-route editor:

- select canonical `routes.id`;
- locale UK/EN/IT;
- sort order;
- featured/active flags;
- preview cards;
- add/update/remove with confirmation.

The public homepage Popular Destinations section must reflect this table, with an active-route fallback only as a temporary empty-state strategy. Popular entries must not be fabricated in frontend code.

## 15. Public content

The content_manager role should be able to manage supported public content:

- homepage title/subtitle/benefit copy;
- popular destinations;
- How It Works cards;
- FAQ items;
- footer links and support text;
- final CTA copy and benefits;
- banner/notice settings if added.

Create localized records or approved JSON configuration backed by Supabase. Do not require frontend source-code deployment for normal copy changes.

At minimum, the MVP can manage:

- Popular Destinations;
- FAQ;
- How It Works;
- footer support details;
- final CTA copy.

## 16. Settings and audit

Settings must include:

- provider configuration status;
- timezone (`Europe/Kyiv`);
- booking expiration duration;
- supported currencies;
- passenger-count limits;
- maintenance mode;
- support contacts;
- locale defaults.

Never render or edit provider API keys in the browser.

Implement an audit log for:

- booking status changes;
- cancellation decisions;
- catalog sync;
- route/location activation;
- popular-route changes;
- public content changes;
- role changes;
- login/recovery events.

Audit entries must include actor, action, target, timestamp and sanitized metadata.

## 17. Security

Implement and verify:

- route guard;
- active admin role check;
- RLS on all tables;
- direct passenger insert protection;
- direct booking passenger insert protection;
- server-only service-role operations;
- secure Edge Function authorization;
- allowed status-transition checks;
- input validation;
- error-code normalization;
- no broad catch/success-shaped fallbacks;
- no user-controlled `passenger_id`, `trip_id`, price or booking status in client-only operations.

Required RLS:

- passengers cannot read admin-only catalog write tables;
- only owners or admins can read own passenger profiles/bookings;
- admins/support read bookings and booking passengers only according to role;
- admin writes require active matching role;
- provider and schedule writes require service role or provider/admin server function;
- public reads remain limited to active confirmed data;
- audit/cancellation request writes follow authorized policies.

Never run Supabase service role in browser code.

## 18. Visual style

Follow existing BUSNET design:

- blue and sky-blue accents only;
- no greenish cyan/turquoise;
- light: `#F4F7FB`, cards `#FFFFFF`, text `#101828`;
- dark: `#050912`, cards `#0B1422`, blue accents;
- no giant placeholder cards;
- no dead empty space;
- clear hierarchy;
- restrained shadows;
- accessible contrast;
- hover/focus states;
- reduced-motion support;
- keyboard navigation;
- table row and mobile card alternatives.

Use existing theme tokens instead of hardcoding unrelated palettes.

## 19. Responsive behavior

- desktop: sidebar + workspace;
- tablet: compact sidebar and scroll-safe tables;
- mobile: drawer or compact top navigation;
- mobile tables become cards or show only essential columns;
- every action has a reachable tap target;
- no horizontal page overflow;
- filters become a bottom sheet or expandable panel;
- no direct text overlap.

## 20. Error states

Every module must distinguish:

- loading;
- empty result;
- no permission;
- network failure;
- provider failure;
- invalid query;
- stale provider data;
- successful mutation.

Admin mutations must show stable errors and not claim success when provider data is stale or incomplete.

## 21. Required tests

Add focused tests for:

- admin route guard;
- role allow/deny matrix;
- booking status transitions;
- cancellation queue;
- catalog sync authorization;
- direct RLS write protection;
- booking passenger privacy;
- booking search/filter behavior;
- popular route locale behavior;
- duplicate catalog sync;
- provider partial-failure handling;
- mobile render behavior;
- UK/EN/IT strings.

Do not add tests that only assert static text or constants.

## 22. Acceptance criteria

The implementation is complete only when:

- no unauthenticated or unprivileged user can open or mutate admin data;
- the overview shows real database counters;
- bookings can be searched and status-managed;
- passenger/cancellation data follows authorization boundaries;
- provider sync is protected and reports real counts/errors;
- locations, routes and schedules reflect canonical Supabase data;
- popular destinations are editable and appear on the public homepage;
- public content can be localized;
- all major modules support loading/empty/error states;
- desktop/mobile and both themes are polished;
- `npm run build` passes;
- relevant tests pass;
- no secrets are stored in frontend files or logs.

## 23. Delivery format

Deliver:

- changed React components;
- admin-specific CSS;
- Supabase migrations/RPC changes;
- Edge Function updates;
- i18n keys;
- route updates;
- focused tests;
- a concise implementation summary.
