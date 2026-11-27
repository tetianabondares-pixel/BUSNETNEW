import assert from "node:assert/strict";
import test from "node:test";
import {
  filterSchedulesForDirectedRoute,
  getUniqueDepartureWeekdays,
} from "../src/lib/routeScheduleMatching.ts";

test("selects only the schedule that follows the route's direction", () => {
  const schedules = [
    { id: "outbound", stops: [{ location_id: "A" }, { location_id: "B" }, { location_id: "C" }] },
    { id: "inbound", stops: [{ location_id: "C" }, { location_id: "B" }, { location_id: "A" }] },
  ];

  assert.deepEqual(
    filterSchedulesForDirectedRoute(schedules, "A", "C").map((schedule) => schedule.id),
    ["outbound"],
  );
  assert.deepEqual(
    filterSchedulesForDirectedRoute(schedules, "C", "A").map((schedule) => schedule.id),
    ["inbound"],
  );
});

test("returns distinct departure weekdays adjusted for the route origin stop", () => {
  assert.deepEqual(
    getUniqueDepartureWeekdays([
      { service_weekday: 1, stops: [{ location_id: "V", day_offset: 1 }] },
      { service_weekday: 4, stops: [{ location_id: "V", day_offset: 1 }] },
      { service_weekday: 6, stops: [{ location_id: "V", day_offset: 1 }] },
      { service_weekday: 3, stops: [{ location_id: "V", day_offset: 1 }] },
      { service_weekday: 3, stops: [{ location_id: "B", day_offset: 0 }] },
      { service_weekday: 8, stops: [{ location_id: "V", day_offset: 0 }] },
    ], "V"),
    [2, 4, 5, 7],
  );
});
