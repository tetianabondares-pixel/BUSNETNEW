import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseCanonicalTrip,
  normalizeProviderTrip,
  selectProviderTrip,
} from "../supabase/functions/altrans-adapter/trip-normalization.ts";
import {
  buildStopsFromRouteSchedule,
} from "../supabase/functions/altrans-adapter/route-itinerary.ts";

test("normalizes a provider itinerary into ordered stops and merges a matching transfer", () => {
  const trip = normalizeProviderTrip({
    canBook: true,
    price: 250,
    currency_code: "UAH",
    trips: [
      {
        id: "leg-1",
        departure_city: "Kyiv",
        departure_place: "Central station",
        departure_date: "2026-11-25",
        departure_time: "08:00",
        arrival_city: "Lviv",
        arrival_place: "Bus station",
        arrival_date: "2026-11-25",
        arrival_time: "14:00",
      },
      {
        id: "leg-2",
        departure_city: "Lviv",
        departure_place: "Bus station",
        departure_date: "2026-11-25",
        departure_time: "15:00",
        arrival_city: "Warsaw",
        arrival_place: "West station",
        arrival_date: "2026-11-26",
        arrival_time: "01:00",
      },
    ],
  }, 0);

  assert.deepEqual(trip.stops, [
    {
      city: "Kyiv",
      place: "Central station",
      arrival_date: null,
      arrival_time: null,
      departure_date: "2026-11-25",
      departure_time: "08:00:00",
    },
    {
      city: "Lviv",
      place: "Bus station",
      arrival_date: "2026-11-25",
      arrival_time: "14:00:00",
      departure_date: "2026-11-25",
      departure_time: "15:00:00",
    },
    {
      city: "Warsaw",
      place: "West station",
      arrival_date: "2026-11-26",
      arrival_time: "01:00:00",
      departure_date: null,
      departure_time: null,
    },
  ]);
});

test("does not merge a transfer when its stop location differs", () => {
  const trip = normalizeProviderTrip({
    canBook: true,
    trips: [
      {
        id: "leg-1",
        departure_city: "Kyiv",
        departure_date: "2026-11-25",
        departure_time: "08:00",
        arrival_city: "Lviv",
        arrival_place: "North station",
        arrival_date: "2026-11-25",
        arrival_time: "14:00",
      },
      {
        id: "leg-2",
        departure_city: "Lviv",
        departure_place: "South station",
        departure_date: "2026-11-25",
        departure_time: "15:00",
        arrival_city: "Warsaw",
        arrival_date: "2026-11-26",
        arrival_time: "01:00",
      },
    ],
  }, 0);

  assert.deepEqual(trip.stops.slice(1, 3).map((stop) => stop.place), [
    "North station",
    "South station",
  ]);
});

test("selects exactly one bookable trip by lowest price then departure and arrival", () => {
  const candidates = [
    normalizeProviderTrip({
      canBook: true,
      price: 300,
      departure_date: "2026-11-25",
      departure_time: "07:00",
      arrival_date: "2026-11-25",
      arrival_time: "13:00",
      first_trip: { id: "later" },
    }, 0),
    normalizeProviderTrip({
      canBook: true,
      price: 250,
      departure_date: "2026-11-25",
      departure_time: "09:00",
      arrival_date: "2026-11-25",
      arrival_time: "14:00",
      first_trip: { id: "cheap-later" },
    }, 1),
    normalizeProviderTrip({
      canBook: true,
      price: 250,
      departure_date: "2026-11-25",
      departure_time: "08:00",
      arrival_date: "2026-11-25",
      arrival_time: "15:00",
      first_trip: { id: "cheap-earlier" },
    }, 2),
  ].filter((trip) => trip !== null);

  assert.equal(chooseCanonicalTrip(candidates)?.trip_id, "cheap-earlier");
  assert.equal(chooseCanonicalTrip([]), null);
  assert.equal(normalizeProviderTrip({ canBook: false }, 3), null);
  assert.equal(normalizeProviderTrip({ canBook: true, trips: [{ departure_city_id: 1 }] }, 4), null);
  assert.equal(chooseCanonicalTrip([
    normalizeProviderTrip({ canBook: true, price: null, first_trip: { id: "no-price" } }, 4),
  ])?.trip_id, "no-price");
});

test("normalizes the AL-TRANS date, time, route, and segment fields from the supplied response shape", () => {
  const trip = normalizeProviderTrip({
    canBook: true,
    departure_date: "05.11.2026",
    departure_date_ddmmyyyy: "05.11.2026",
    departure_time: "09:30:00",
    departure_time_hhmm: "09:30",
    price: 120,
    currency_code: "EUR",
    canBookWithPaymentAtBoarding: true,
    trips: [{
      id: 31145,
      route_id: 118,
      departure_city_id: 1,
      departure_city: "Львів",
      departure_place: "Автовокзал",
      departure_date: "05.11.2026",
      departure_time: "09:30:00",
      arrival_city_id: 41,
      arrival_city: "Рим",
      arrival_place: "Autostazione",
      arrival_date: "06.11.2026",
      arrival_time: "16:20:00",
    }],
  }, 0);

  assert.equal(trip?.trip_id, "31145");
  assert.equal(trip?.provider_route_id, "118");
  assert.equal(trip?.departure_city_id, "1");
  assert.equal(trip?.arrival_city_id, "41");
  assert.equal(trip?.departure_date, "2026-11-05");
  assert.equal(trip?.arrival_date, "2026-11-06");
  assert.equal(trip?.departure_time, "09:30:00");
  assert.equal(trip?.arrival_time, "16:20:00");
  assert.equal(trip?.currency, "EUR");
  assert.equal(trip?.can_book_with_payment_at_boarding, true);
});

test("selects only the requested date and route, preferring price only in requested currency", () => {
  const candidates = [
    normalizeProviderTrip({
      canBook: true,
      departure_date: "23.11.2026",
      departure_time: "08:00:00",
      price: 1,
      currency_code: "EUR",
      trips: [{ id: "wrong-date", route_id: 97, departure_city_id: 1, arrival_city_id: 41 }],
    }, 0),
    normalizeProviderTrip({
      canBook: true,
      departure_date: "24.11.2026",
      departure_time: "08:00:00",
      price: 100,
      currency_code: "UAH",
      trips: [{ id: "wrong-route", route_id: 97, departure_city_id: 1, arrival_city_id: 41 }],
    }, 1),
    normalizeProviderTrip({
      canBook: true,
      departure_date: "24.11.2026",
      departure_time: "09:00:00",
      price: 120,
      currency_code: "EUR",
      trips: [{ id: "eur-higher", route_id: 97, departure_city_id: 1, arrival_city_id: 41 }],
    }, 2),
    normalizeProviderTrip({
      canBook: true,
      departure_date: "24.11.2026",
      departure_time: "10:00:00",
      price: 115,
      currency_code: "EUR",
      trips: [{ id: "eur-lower", route_id: 97, departure_city_id: 1, arrival_city_id: 41 }],
    }, 3),
  ].filter((trip) => trip !== null);
  candidates[1].departure_city_id = "1";
  candidates[1].arrival_city_id = "53";

  assert.equal(
    selectProviderTrip(candidates, "2026-11-24", "1", "41", "EUR")?.trip_id,
    "eur-lower",
  );
  assert.equal(
    selectProviderTrip(candidates, "2026-11-24", "1", "41", "UAH")?.trip_id,
    "eur-higher",
  );
  assert.equal(
    selectProviderTrip(candidates, "2026-11-25", "1", "41", "EUR"),
    null,
  );
});

test("uses a matching route schedule for intermediate departures without inventing arrivals", () => {
  const trip = normalizeProviderTrip({
    canBook: true,
    departure_date: "05.11.2026",
    departure_time: "09:30:00",
    arrival_date: "06.11.2026",
    arrival_time: "16:20:00",
    trips: [{
      id: 31145,
      route_id: 118,
      departure_city_id: 1,
      departure_city: "Львів",
      departure_place: "Автовокзал",
      arrival_city_id: 41,
      arrival_city: "Рим",
      arrival_place: "Autostazione",
    }],
  }, 0);
  const routeSchedules = [{
    id: "schedule-97",
    provider_route_id: "97",
    direction: "outbound",
    service_weekday: 3,
  }, {
    id: "schedule-118",
    provider_route_id: "118",
    direction: "outbound",
    service_weekday: 3,
  }];
  const routeStops = [
    {
      schedule_id: "schedule-97",
      location_id: "location-1",
      stop_order: 0,
      day_offset: 1,
      departure_time: "09:30:00",
      place: "Львів, автовокзал",
    },
    {
      schedule_id: "schedule-97",
      location_id: "location-wrong-route",
      stop_order: 1,
      day_offset: 1,
      departure_time: "11:00:00",
      place: "Інший маршрут",
    },
    {
      schedule_id: "schedule-97",
      location_id: "location-3",
      stop_order: 2,
      day_offset: 2,
      departure_time: "15:00:00",
      place: "Рим",
    },
    {
      schedule_id: "schedule-118",
      location_id: "location-1",
      stop_order: 0,
      day_offset: 1,
      departure_time: "09:30:00",
      place: "Львів, автовокзал",
    },
    {
      schedule_id: "schedule-118",
      location_id: "location-2",
      stop_order: 1,
      day_offset: 1,
      departure_time: "12:15:00",
      place: "Проміжна станція",
    },
    {
      schedule_id: "schedule-118",
      location_id: "location-3",
      stop_order: 2,
      day_offset: 2,
      departure_time: "16:00:00",
      place: "Рим, автовокзал",
    },
  ];
  const locations = [
    { id: "location-1", provider_location_id: "1", name_uk: "Львів", name_en: "Lviv", name_it: "Leopoli" },
    { id: "location-2", provider_location_id: "20", name_uk: "Проміжне місто", name_en: "Middle City", name_it: "Città intermedia" },
    { id: "location-3", provider_location_id: "41", name_uk: "Рим", name_en: "Rome", name_it: "Roma" },
    { id: "location-wrong-route", provider_location_id: "21", name_uk: "Інший маршрут", name_en: "Wrong route", name_it: "Altro percorso" },
  ];

  const stops = buildStopsFromRouteSchedule(
    trip,
    routeSchedules,
    routeStops,
    locations,
    "en",
  );
  assert.deepEqual(stops?.map((stop) => ({
    city: stop.city,
    arrival_date: stop.arrival_date,
    arrival_time: stop.arrival_time,
    departure_date: stop.departure_date,
    departure_time: stop.departure_time,
  })), [
    {
      city: "Львів",
      arrival_date: null,
      arrival_time: null,
      departure_date: "2026-11-05",
      departure_time: "09:30:00",
    },
    {
      city: "Middle City",
      arrival_date: null,
      arrival_time: null,
      departure_date: "2026-11-05",
      departure_time: "12:15:00",
    },
    {
      city: "Рим",
      arrival_date: "2026-11-06",
      arrival_time: "16:20:00",
      departure_date: null,
      departure_time: null,
    },
  ]);
});
