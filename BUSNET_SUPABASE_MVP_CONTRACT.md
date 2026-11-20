# BUSNET: Supabase MVP Contract

Цей документ описує backend-домен нового проєкту BUSNET для етапу MVP.
Він не використовує старі таблиці, route JSON, mock-ціни або старі credentials.

## 1. Мета MVP

Потрібні такі можливості:

- реєстрація та входи пасажирів через Supabase Auth;
- пошук міст;
- пошук маршрутів;
- календар доступності по місяцях;
- пошук рейсів за датою;
- вибір рейсу;
- створення бронювання;
- адміністративний доступ;
- захист даних через RLS.

Наразі не реалізовувати:

- оплату карткою;
- PDF або QR-квитки;
- реальне блокування місць у сторонній системі;
- стару customer dashboard;
- перенесення старої бази даних.

## 2. Конфігурація

Frontend має використовувати окремі змінні для нового Supabase-проєкту:

```env
VITE_SUPABASE_URL=https://YOUR_NEW_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_NEW_PUBLISHABLE_OR_ANON_KEY
VITE_BUSNET_AVAILABILITY_API=https://YOUR_NEW_PROJECT.supabase.co/functions/v1/get-month-availability
```

Секрети провайдерів зберігати тільки у Supabase Edge Function secrets:

- ключ API провайдера;
- URL провайдера;
- підписні секрети;
- webhook secrets.

Не зберігати ці значення у frontend, URL або logs.

## 3. Таблиці

### 3.1 `profiles`

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  preferred_language text not null default 'uk'
    check (preferred_language in ('uk', 'en', 'it')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Політика створення профілю:

```text
auth user -> auth trigger -> public.profiles
```

Виконувати create/update тільки для поточного користувача.

Обов’язкові поля фронтенду під час реєстрації:

- `full_name`;
- `email`;
- `password`;
- `confirm_password`.

Паролі і підтвердження пароля не зберігати в таблицях.

### 3.2 `locations`

```sql
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name_uk text not null,
  name_en text,
  name_it text,
  normalized_name text not null,
  country_code char(2),
  provider_location_id text,
  latitude double precision,
  longitude double precision,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Потрібні індекси для пошуку:

- `normalized_name`;
- `provider_location_id`;
- `active`.

Міста мають містити локалізовані назви для UK/EN/IT.

### 3.3 `routes`

```sql
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  from_location_id uuid not null references public.locations(id),
  to_location_id uuid not null references public.locations(id),
  provider_route_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_location_id, to_location_id, provider_route_id)
);
```

Під час пошуку заборонено дозволяти:

- однакове місто відправлення і призначення;
- неактивні маршрути;
- неактивні міста;
- користувацькі назви замість нормалізованих ID.

AL-TRANS publishes recurring schedules rather than a static inventory of dated
trips. Persist those schedules separately in `provider_route_schedules` and
`provider_route_schedule_stops`:

- one schedule row per provider route, timetable variant, and direction;
- `service_weekday` uses ISO weekdays (Monday = 1 through Sunday = 7);
- each ordered stop stores its canonical location, departure time, and
  `day_offset` from that direction's first stop;
- inbound stops are stored in reverse order.

The calendar derives scheduled dates from these tables. It must not depend on
pre-populated `trips` or `trip_prices`, and a scheduled date is not a guarantee
of current seats or a price. The date-based AL-TRANS search confirms those.

### 3.4 `trips`

```sql
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id),
  provider_trip_id text,
  departure_at timestamptz not null,
  arrival_at timestamptz not null,
  duration_minutes integer,
  carrier text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'cancelled', 'completed')),
  external_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Індекси:

- `route_id, departure_at`;
- `provider_trip_id`;
- `status, departure_at`.

### 3.5 `trip_stops`

```sql
create table public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  stop_order integer not null,
  arrival_offset integer,
  departure_offset integer,
  day_offset integer not null default 0,
  is_pickup boolean not null default false,
  is_dropoff boolean not null default false,
  unique (trip_id, stop_order)
);
```

`day_offset` in `trip_stops` is for concrete dated trips; recurring calendar
dates use `provider_route_schedule_stops.day_offset`.

### 3.6 `trip_prices`

```sql
create table public.trip_prices (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  currency char(3) not null,
  price numeric(12,2) not null check (price >= 0),
  seats_available integer check (seats_available >= 0),
  source text not null,
  confirmed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

Не створювати ціни з frontend або заздалегідь fixed mock-data.

### 3.7 `availability_cache`

```sql
create table public.availability_cache (
  route_id uuid not null references public.routes(id),
  travel_date date not null,
  trips_count integer not null check (trips_count >= 0),
  min_price numeric(12,2),
  max_price numeric(12,2),
  currency char(3),
  provider_source text not null,
  schema_version text not null,
  confirmed_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (route_id, travel_date, schema_version)
);
```

`availability_cache` is only for confirmed date-specific provider results; it
must not be populated from recurring schedules. The monthly calendar reads
`provider_route_schedules` instead.

Рекомендований TTL для даних `availability_cache`:

- підтверджена доступність конкретної дати: 1-5 хвилин;
- деталі конкретного рейсу: перевіряти при виборі;
- остаточна ціна: перевіряти під час створення бронювання.

### 3.8 `popular_routes`

```sql
create table public.popular_routes (
  route_id uuid primary key references public.routes(id),
  sort_order integer not null default 0,
  is_featured boolean not null default true,
  active boolean not null default true
);
```

Популярні маршрути мають походити тільки з підтверджених даних провайдера.

### 3.9 `bookings`

```sql
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_number text unique not null,
  passenger_id uuid references auth.users(id),
  trip_id uuid not null references public.trips(id),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  currency char(3) not null,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  expires_at timestamptz,
  provider_booking_id text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
```

На поточному MVP допускаються guest-bronjuвання, але `passenger_id` не може змінюватися frontend.

### 3.10 `booking_passengers`

```sql
create table public.booking_passengers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  seat_number text,
  nationality text,
  document_type text,
  document_number text
);
```

Не зберігати повні дані картки.
Не показувати паспортні дані в logs і не включати їх у URL.

### 3.11 `provider_request_logs`

```sql
create table public.provider_request_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  operation text not null,
  route_key text,
  travel_date date,
  status text not null,
  response_code integer,
  cache_hit boolean not null default false,
  error_code text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
```

Не логувати email, phone, document_number або password.

### 3.12 `admin_profiles`

```sql
create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null
    check (role in (
      'super_admin',
      'admin',
      'content_manager',
      'support',
      'provider_operator'
    )),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

## 4. Auth contract

### Реєстрація

Frontend викликає Supabase Auth:

```ts
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      full_name: fullName,
      preferred_language: 'uk',
    },
  },
});
```

Потрібний auth trigger:

```sql
insert into public.profiles (id, full_name)
values (
  new.id,
  coalesce(new.raw_user_meta_data->>'full_name', '')
);
```

### Вхід

```ts
await supabase.auth.signInWithPassword({ email, password });
```

Показувати:

- неправильні credentials;
- непідтверджений email;
- помилку мережі;
- помилку сервера.

### Відновлення пароля

```ts
await supabase.auth.resetPasswordForEmail(email);
```

Не повідомляти frontend, чи існує конкретна email-адреса.

### Вихід

```ts
await supabase.auth.signOut();
```

## 5. Пошуковий контракт

### Запит популярних міст

Параметри:

```text
query
language
limit
```

Response:

```json
{
  "locations": [
    {
      "id": "uuid",
      "name": "Київ",
      "countryCode": "UA"
    }
  ]
}
```

### Запит популярних маршрутів

```json
[
  {
    "from": "Київ",
    "to": "Варшава",
    "fromLocationId": "uuid",
    "toLocationId": "uuid"
  }
]
```

Ці дані мають бути реальними і підтвердженими провайдером.
Поки вони не підтверджені — не показувати як bookable routes.

### Запит пошуку рейсу

```text
function: search-trips

fromLocationId
toLocationId
travelDate
passengersCount
currencyCode
```

`travelDate` передавати як `YYYY-MM-DD`.
Edge Function сама знаходить provider city IDs за UUID локацій і надсилає
AL-TRANS поля `departure_city_id`, `arrival_city_id`, `depature_date`,
`passengers_count`, `currecny_code` та `enable_external_search: false`.
Одруківки `depature_date` і `currecny_code` навмисні — це поля legacy API.
Не призначати часовий пояс до provider-часу, якщо API його не повертає.

Каталог і розклад міст синхронізуються Edge Function operation `sync-catalog`.
Операція вимагає активну роль `super_admin`, `admin` або `provider_operator`;
вона атомарно оновлює локалізовані `locations`, спрямовані пари `routes`,
тижневі `provider_route_schedules` та впорядковані
`provider_route_schedule_stops`. Записи відсутніх у повному імпорті ліній і
розкладів деактивуються, а не використовуються як доступні.

Response:

```json
{
  "trips": [
    {
      "trip_id": "31145",
      "departure_date": "05.11.2026",
      "departure_time": "09:30:00",
      "arrival_date": "06.11.2026",
      "arrival_time": "16:20:00",
      "carrier": "AL-TRANS",
      "currency": "EUR",
      "price": 120,
      "can_book_with_payment_at_boarding": true
    }
  ],
  "providerError": false,
  "searchedAt": "2026-11-19T15:00:00Z"
}
```

Для помилки провайдера відповідь має бути окремою:

```json
{
  "providerError": true,
  "errorCode": "ALTRANS_UNAVAILABLE"
}
```

Це не передавати як «рейсів немає».

## 6. Календар доступності

Календар показує дні, у які за опублікованим тижневим розкладом є рейс для
вибраної пари зупинок. Це **не** підтвердження вільних місць і не ціна;
booking page має підтвердити конкретний рейс запитом `search-trips`.

### Запит

```text
function: get-month-availability

year
month
fromLocationId
toLocationId
timezone
```

Застарілі запити скасовуються при зміні місяця або маршруту.

### Response

```json
[
  {
    "date": "2026-11-23",
    "scheduled_services_count": 1,
    "routes": ["Київ — Рим"],
    "is_available": true
  }
]
```

Правила:

- по одному запису на день;
- `scheduled_services_count` рахує відповідні повторювані розклади, не конкретні рейси;
- дата обчислюється через service weekday маршруту та `day_offset` посадкової зупинки;
- якщо розклад не збігається — `scheduled_services_count=0`, `is_available=false`;
- календар не показує ціну чи наявність місць;
- live search окремо відображає помилки провайдера, не маскуючи їх як порожній результат;
- сервер сам формує availability;
- frontend не створює fallback availability.

## 7. Обмеження календаря

Frontend і backend повинні застосовувати однакові межі:

- today допустима дата;
- today розраховується для Europe/Kyiv;
- past dates disabled;
- max horizon = 365 днів;
- наступний місяць блокувати по досягненню горизонту;
- попередній місяць блокувати раніше today;
- враховувати `day_offset` з `provider_route_schedule_stops`;
- timezone не стверджувати як факт провайдера поза даними API.

## 8. Контракт бронювання

### Create booking

```text
function: create-booking

tripId
passengers[]
locale
```

Кожен passenger має містити:

- fullName;
- email;
- phone;
- nationality;
- documentType;
- documentNumber;
- seatNumber optional.

Server має перевірити:

- trip існує;
- status active;
- departureAt ще не минув;
- актуальна ціна;
- seatsAvailable;
- кількість пасажирів;
- часове обмеження бронювання;
- що user не змінив ID рейсу вручну.

Success:

```json
{
  "bookingId": "uuid",
  "bookingNumber": "BUS-...",
  "status": "pending",
  "currency": "UAH",
  "totalAmount": 2900,
  "expiresAt": "2026-11-19T15:30:00Z"
}
```

Error states:

- trip not found;
- trip unavailable;
- seats unavailable;
- price changed;
- provider unavailable;
- booking expired;
- authorization error.

Не робити payment або seat confirmation на поточному етапі.

### Cancel booking

```text
function: cancel-booking

bookingId
reason optional
```

Пасажир може cancel тільки власне бронювання.
Адмін може cancel тільки згідно з роллю та policy.

## 9. RLS

### `profiles`

- select: тільки свій профіль;
- update: тільки свій профіль;
- insert: тільки auth trigger.

### `locations`, `routes`, `trips`, `trip_stops`, `trip_prices`

- public read дозволений тільки для active confirmed даних;
- write тільки service role або адміністраторські server functions.

### `provider_route_schedules`, `provider_route_schedule_stops`

- public read дозволений тільки для active schedules;
- write тільки через атомарну `sync-catalog` server operation.

### `availability_cache`

- public read через RPC або Edge Function;
- direct write тільки service role.

### `bookings`

- passenger select тільки own bookings;
- passenger insert через `create-booking` function;
- admin select/update залежно від ролі;
- direct insert через anon заборонити.

### `booking_passengers`

- доступ тільки через own booking;
- direct insert заборонити;
- direct select для admin за дозволеною роллю.

### `admin_profiles`

- доступ тільки для service role або читання самої роли поточним користувачем.

## 10. Edge Functions

Рекомендовані MVP-функції:

1. `get-month-availability`
2. `search-location`
3. `search-trips`
4. `get-trip-details`
5. `create-booking`
6. `cancel-booking`
7. `sync-provider-trips`

Всі функції повинні:

- валідувати schema version;
- перевіряти параметри;
- використовувати service role тільки всередині server context;
- скасовувати застарілі запити;
- не повертавати internal provider error як successful response;
- логувати тільки технічні sanitized поля;
- повернути стабільні коди помилок.

## 11. Логіка провайдера

Джерела даних мають бути такими:

- provider API;
- затверджена server integration;
- Supabase cache для підтверджених даних.

Недозволені джерела:

- old route JSON;
- old Supabase credentials;
- `supabase.from('routes')` в старому репозиторії;
- old fallback prices;
- frontend mock destinations;
- mock trip prices.

Recurring schedule dates are candidates only. Bookability, seats, and prices
must be confirmed by the date-based provider search. A provider error there must
not be shown as an empty result.

## 12. Env і секрети

Frontend environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_BUSNET_AVAILABILITY_API
```

`VITE_SUPABASE_PUBLISHABLE_KEY` є сучасною назвою для publishable key.
`VITE_SUPABASE_ANON_KEY` підтримується як сумісна legacy-назва.
У новому застосунку достатньо однієї з цих змінних; service_role key не використовувати.

Server secrets:

```text
PROVIDER_API_URL
PROVIDER_API_KEY
PROVIDER_WEBHOOK_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

Не передавати service role key у браузер.

## 13. Frontend readiness

Готово:

- responsive desktop popover;
- mobile bottom sheet;
- quick dates;
- 42-cell month grid;
- keyboard navigation;
- UK/EN/IT;
- day theme/night theme;
- loading/error states;
- abort availability request;
- 365-day Europe/Kyiv limit.
- passenger auth wiring;
- Supabase-backed trip results;
- Supabase RPC calls for monthly availability and trip search.
- mock destinations removed.

Ще не готово backend-інтеграції:

- location autocomplete;
- real monthly availability;
- real trip search data in database;
- booking flow;
- admin auth;
- admin dashboard;
- payments.
