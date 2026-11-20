import assert from "node:assert/strict";
import test from "node:test";
import {
  deduplicateScheduledServicesByDeparture,
  getScheduledArrivalDate,
} from "../src/features/search/schedule-search.ts";

test("matches the weekly service day using the origin stop offset", () => {
  const arrivalDate = getScheduledArrivalDate(
    "2026-11-25",
    { stopOrder: 1, dayOffset: 2 },
    { stopOrder: 4, dayOffset: 4 },
    1,
  );

  assert.equal(arrivalDate, "2026-11-27");
});

test("does not match another service weekday or a stop before the origin", () => {
  const from = { stopOrder: 2, dayOffset: 1 };
  const to = { stopOrder: 4, dayOffset: 2 };

  assert.equal(getScheduledArrivalDate("2026-11-25", from, to, 7), null);
  assert.equal(
    getScheduledArrivalDate("2026-11-25", to, from, 3),
    null,
  );
});

test("deduplicates overlapping providers and keeps the confirmed arrival time", () => {
  const result = deduplicateScheduledServicesByDeparture([
    {
      id: "route-125",
      departureDate: "2026-11-23",
      departureTime: "22:30",
      departurePlace: "Kyiv",
      arrivalDate: "2026-11-25",
      arrivalTime: "07:15",
      arrivalPlace: "Vicenza",
    },
    {
      id: "route-99",
      departureDate: "2026-11-23",
      departureTime: "22:30",
      departurePlace: "Kyiv",
      arrivalDate: "2026-11-25",
      arrivalTime: "08:15",
      arrivalPlace: "Vicenza",
    },
    {
      id: "next-service",
      departureDate: "2026-11-23",
      departureTime: "23:00",
      departurePlace: "Kyiv",
      arrivalDate: "2026-11-25",
      arrivalTime: "09:00",
      arrivalPlace: "Vicenza",
    },
  ]);

  assert.deepEqual(
    result.map(({ id, arrivalTime }) => [id, arrivalTime]),
    [["route-99", "08:15"], ["next-service", "09:00"]],
  );
});
