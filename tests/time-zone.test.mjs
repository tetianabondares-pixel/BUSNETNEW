import test from "node:test";
import assert from "node:assert/strict";
import { kyivLocalDateTimeToIso } from "../supabase/functions/altrans-adapter/time-zone.js";

test("converts Kyiv winter and summer local times using their DST offsets", () => {
  assert.equal(kyivLocalDateTimeToIso("2026-01-15", "12:00"), "2026-01-15T10:00:00.000Z");
  assert.equal(kyivLocalDateTimeToIso("2026-07-15", "12:00"), "2026-07-15T09:00:00.000Z");
});

test("rejects nonexistent local times during the spring DST transition", () => {
  assert.equal(kyivLocalDateTimeToIso("2026-03-29", "03:30"), null);
});

test("uses the earlier instant for an ambiguous autumn DST time", () => {
  assert.equal(kyivLocalDateTimeToIso("2026-10-25", "03:30"), "2026-10-25T00:30:00.000Z");
});
