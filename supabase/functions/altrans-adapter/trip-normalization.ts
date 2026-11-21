export type ProviderStop = {
  city: string;
  place: string;
  arrival_date: string | null;
  arrival_time: string | null;
  departure_date: string | null;
  departure_time: string | null;
};

export type NormalizedProviderTrip = {
  trip_id: string;
  provider_route_id?: string | null;
  departure_city_id?: string | null;
  arrival_city_id?: string | null;
  segment_count?: number;
  carrier: string;
  bus_number: string | null;
  departure_city: string;
  departure_place: string;
  departure_date: string;
  departure_time: string;
  arrival_city: string;
  arrival_place: string;
  arrival_date: string;
  arrival_time: string;
  price: number | string | null;
  currency: string;
  can_book_with_payment_at_boarding: boolean;
  stops: ProviderStop[];
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function validDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1000 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function providerDate(...values: unknown[]): string {
  for (const value of values) {
    const raw = text(value).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (iso) {
      const parsed = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      if (parsed) return parsed;
    }

    const european = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
    if (european) {
      const parsed = validDate(
        Number(european[3]),
        Number(european[2]),
        Number(european[1]),
      );
      if (parsed) return parsed;
    }
  }
  return "";
}

function providerTime(...values: unknown[]): string {
  for (const value of values) {
    const raw = text(value).trim();
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
    if (!match) continue;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? "0");
    if (hours <= 23 && minutes <= 59 && seconds <= 59) {
      return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
    }
  }
  return "";
}

function normalizeCity(value: string): string {
  return value.trim().normalize("NFC").toLocaleLowerCase();
}

function buildStops(segments: JsonRecord[], firstTrip: JsonRecord, lastTrip: JsonRecord): ProviderStop[] {
  const stops: ProviderStop[] = [];
  const legs = segments.length > 0 ? segments : [firstTrip];

  const addStop = (
    cityValue: unknown,
    placeValue: unknown,
    dateValue: unknown,
    timeValue: unknown,
    event: "arrival" | "departure",
  ) => {
    const city = text(cityValue).trim();
    if (!city) return;
    const place = text(placeValue).trim();
    const date = providerDate(dateValue) || null;
    const time = providerTime(timeValue) || null;
    const current = stops[stops.length - 1];

    const samePlace = !current?.place || !place ||
      normalizeCity(current.place) === normalizeCity(place);
    if (current && normalizeCity(current.city) === normalizeCity(city) && samePlace) {
      if (place && !current.place) current.place = place;
      if (event === "arrival") {
        current.arrival_date = date;
        current.arrival_time = time;
      } else {
        current.departure_date = date;
        current.departure_time = time;
      }
      return;
    }

    stops.push({
      city,
      place,
      arrival_date: event === "arrival" ? date : null,
      arrival_time: event === "arrival" ? time : null,
      departure_date: event === "departure" ? date : null,
      departure_time: event === "departure" ? time : null,
    });
  };

  for (const [index, segment] of legs.entries()) {
    const isFirst = index === 0;
    const isLast = index === legs.length - 1;
    addStop(
      isFirst ? firstTrip.departure_city ?? segment.departure_city : segment.departure_city,
      isFirst ? firstTrip.departure_place ?? segment.departure_place : segment.departure_place,
      isFirst ? firstTrip.departure_date ?? segment.departure_date : segment.departure_date,
      isFirst ? firstTrip.departure_time ?? segment.departure_time : segment.departure_time,
      "departure",
    );
    addStop(
      isLast ? lastTrip.arrival_city ?? segment.arrival_city : segment.arrival_city,
      isLast ? lastTrip.arrival_place ?? segment.arrival_place : segment.arrival_place,
      isLast ? lastTrip.arrival_date ?? segment.arrival_date : segment.arrival_date,
      isLast ? lastTrip.arrival_time ?? segment.arrival_time : segment.arrival_time,
      "arrival",
    );
  }

  return stops;
}

export function normalizeProviderTrip(value: unknown): NormalizedProviderTrip | null {
  const sequence = asRecord(value);
  if (!sequence || sequence.canBook !== true) return null;

  const segments = asArray(sequence.trips).map(asRecord).filter(
    (segment): segment is JsonRecord => segment !== null,
  );
  const firstTrip = asRecord(sequence.first_trip) ?? segments[0] ?? {};
  const lastTrip = asRecord(sequence.last_trip) ?? segments[segments.length - 1] ?? firstTrip;
  const tripId = text(firstTrip.id ?? sequence.id).trim();
  if (!tripId) return null;
  const departureDate = providerDate(
    sequence.departure_date,
    sequence.departure_date_ddmmyyyy,
    firstTrip.departure_date,
    firstTrip.departure_date_ddmmyyyy,
  );
  const departureTime = providerTime(
    sequence.departure_time,
    sequence.departure_time_hhmm,
    firstTrip.departure_time,
    firstTrip.departure_time_hhmm,
  );
  const arrivalDate = providerDate(
    sequence.arrival_date,
    lastTrip.arrival_date,
    lastTrip.arrival_date_ddmmyyyy,
  );
  const arrivalTime = providerTime(
    sequence.arrival_time,
    lastTrip.arrival_time,
    lastTrip.arrival_time_hhmm,
  );

  return {
    trip_id: tripId,
    provider_route_id: text(firstTrip.route_id ?? sequence.route_id) || null,
    departure_city_id: text(firstTrip.departure_city_id ?? sequence.departure_city_id) || null,
    arrival_city_id: text(lastTrip.arrival_city_id ?? sequence.arrival_city_id) || null,
    segment_count: segments.length,
    carrier: text(firstTrip.carrier_name ?? sequence.carrier_name) || "AL-TRANS",
    bus_number: firstTrip.bus_number == null ? null : text(firstTrip.bus_number),
    departure_city: text(firstTrip.departure_city ?? sequence.departure_city),
    departure_place: text(firstTrip.departure_place ?? sequence.departure_place),
    departure_date: departureDate,
    departure_time: departureTime,
    arrival_city: text(lastTrip.arrival_city ?? sequence.arrival_city),
    arrival_place: text(lastTrip.arrival_place ?? sequence.arrival_place),
    arrival_date: arrivalDate,
    arrival_time: arrivalTime,
    price: typeof sequence.price === "number" || typeof sequence.price === "string"
      ? sequence.price
      : null,
    currency: text(sequence.currency_code),
    can_book_with_payment_at_boarding: sequence.canBookWithPaymentAtBoarding === true,
    stops: buildStops(segments, {
      ...firstTrip,
      departure_date: departureDate || firstTrip.departure_date,
      departure_time: departureTime || firstTrip.departure_time,
    }, {
      ...lastTrip,
      arrival_date: arrivalDate || lastTrip.arrival_date,
      arrival_time: arrivalTime || lastTrip.arrival_time,
    }),
  };
}

function departureInstant(trip: NormalizedProviderTrip): number {
  const value = Date.parse(`${trip.departure_date}T${trip.departure_time}Z`);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function arrivalInstant(trip: NormalizedProviderTrip): number {
  const value = Date.parse(`${trip.arrival_date}T${trip.arrival_time}Z`);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function validPrice(trip: NormalizedProviderTrip): number {
  if (trip.price == null || (typeof trip.price === "string" && !trip.price.trim())) {
    return Number.POSITIVE_INFINITY;
  }
  const price = Number(trip.price);
  return Number.isFinite(price) && price >= 0 ? price : Number.POSITIVE_INFINITY;
}

export function chooseCanonicalTrip(trips: readonly NormalizedProviderTrip[]): NormalizedProviderTrip | null {
  const pricedTrips = trips.filter((trip) => Number.isFinite(validPrice(trip)));
  const candidates = pricedTrips.length > 0 ? pricedTrips : [...trips];

  return [...candidates].sort((left, right) => {
    return (pricedTrips.length > 0 ? validPrice(left) - validPrice(right) : 0) ||
      departureInstant(left) - departureInstant(right) ||
      arrivalInstant(left) - arrivalInstant(right) ||
      left.trip_id.localeCompare(right.trip_id);
  })[0] ?? null;
}

export function selectProviderTrip(
  trips: readonly NormalizedProviderTrip[],
  travelDate: string,
  departureCityId: string,
  arrivalCityId: string,
  currencyCode: string,
): NormalizedProviderTrip | null {
  const matchingTrips = trips.filter((trip) =>
    trip.departure_date === travelDate &&
    trip.departure_time !== "" &&
    Boolean(trip.provider_route_id) &&
    trip.departure_city_id === departureCityId &&
    trip.arrival_city_id === arrivalCityId
  );
  const pricedInRequestedCurrency = matchingTrips.filter((trip) =>
    trip.currency === currencyCode && Number.isFinite(validPrice(trip))
  );
  const candidates = pricedInRequestedCurrency.length > 0
    ? pricedInRequestedCurrency
    : matchingTrips;
  const pricedCandidates = pricedInRequestedCurrency.length > 0;

  return [...candidates].sort((left, right) =>
    (pricedCandidates ? validPrice(left) - validPrice(right) : 0) ||
    departureInstant(left) - departureInstant(right) ||
    arrivalInstant(left) - arrivalInstant(right) ||
    left.trip_id.localeCompare(right.trip_id)
  )[0] ?? null;
}
