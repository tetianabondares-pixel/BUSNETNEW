import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDirectedRoutePairs,
  normalizeProviderSchedule,
  parseProviderWeekday,
} from "../supabase/functions/altrans-adapter/schedule-import.ts";

test("normalizes outbound and inbound weekdays and stop offsets", () => {
  const [outbound, inbound] = normalizeProviderSchedule("97", {
    title: "Понеділок / Четвер",
    departure_day: "Понеділок",
    return_day: "Четвер",
    items: [
      {
        city_id: 3,
        departure_day_str: "Понеділок",
        departure_time_str: "20:00",
        return_day_str: "Субота",
        return_time_str: "07:45",
      },
      {
        city_id: 2,
        departure_day_str: "Понеділок",
        departure_time_str: "22:30",
        return_day_str: "Субота",
        return_time_str: "05:00",
      },
      {
        city_id: 78,
        departure_day_str: "Середа",
        departure_time_str: "19:50",
        return_day_str: "Четвер",
        return_time_str: "07:00",
      },
    ],
  });

  assert.equal(outbound.service_weekday, 1);
  assert.deepEqual(outbound.stops.map((stop) => stop.provider_location_id), ["3", "2", "78"]);
  assert.deepEqual(outbound.stops.map((stop) => stop.day_offset), [0, 0, 2]);
  assert.equal(inbound.service_weekday, 4);
  assert.deepEqual(inbound.stops.map((stop) => stop.provider_location_id), ["78", "2", "3"]);
  assert.deepEqual(inbound.stops.map((stop) => stop.day_offset), [0, 2, 2]);
  assert.equal(inbound.stops[0].departure_time, "07:00:00");
});

test("parses Friday variants and rejects unknown provider weekdays", () => {
  assert.equal(parseProviderWeekday("П'ятниця"), 5);
  assert.equal(parseProviderWeekday("П’ятниця"), 5);
  assert.equal(parseProviderWeekday("невідомо"), null);
  assert.throws(() => normalizeProviderSchedule("97", {
    departure_day: "Понеділок",
    return_day: "Четвер",
    items: [
      { city_id: 1, departure_day_str: "Понеділок", departure_time_str: "25:00", return_day_str: "Четвер", return_time_str: "12:00" },
      { city_id: 2, departure_day_str: "Вівторок", departure_time_str: "12:00", return_day_str: "П'ятниця", return_time_str: "12:00" },
    ],
  }), /INVALID_SCHEDULE_TIME/);
});

test("builds directed route pairs in both travel directions", () => {
  const pairs = buildDirectedRoutePairs("97", ["3", "2", "78"]);
  assert.equal(pairs.length, 6);
  assert.ok(pairs.some((pair) => pair.fromProviderId === "3" && pair.toProviderId === "78"));
  assert.ok(pairs.some((pair) => pair.fromProviderId === "78" && pair.toProviderId === "3"));
});
