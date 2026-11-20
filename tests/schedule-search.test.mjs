import assert from "node:assert/strict";
import test from "node:test";
import { getScheduledArrivalDate } from "../src/features/search/schedule-search.ts";

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
