import test from "node:test";
import assert from "node:assert/strict";
import { parseAssistantRequest } from "../src/lib/adminAssistantIntent.mjs";

test("recognizes Russian and Ukrainian greetings without database intent", () => {
  assert.deepEqual(parseAssistantRequest("Привет!"), { kind: "greeting" });
  assert.deepEqual(parseAssistantRequest("Добрий день"), { kind: "greeting" });
});

test("extracts a passenger name from a Ukrainian search request", () => {
  assert.deepEqual(
    parseAssistantRequest("Знайди пасажира: Іван Іванов"),
    { kind: "passenger_search", query: "Іван Іванов" },
  );
});

test("extracts an email from a Russian search request", () => {
  assert.deepEqual(
    parseAssistantRequest("Найди пассажира ivan@example.com"),
    { kind: "passenger_search", query: "ivan@example.com" },
  );
});

test("extracts a name following an explicit search field", () => {
  assert.deepEqual(
    parseAssistantRequest("Знайди пасажира за ім’ям Іван Іванов"),
    { kind: "passenger_search", query: "Іван Іванов" },
  );
});

test("asks for the search value when the passenger is omitted", () => {
  assert.deepEqual(
    parseAssistantRequest("Покажи пассажира"),
    { kind: "passenger_search_missing_query" },
  );
  assert.deepEqual(
    parseAssistantRequest("Покажи пассажира по имени"),
    { kind: "passenger_search_missing_query" },
  );
});

test("does not claim unsupported requests were executed", () => {
  assert.deepEqual(
    parseAssistantRequest("Сколько сегодня бронирований?"),
    { kind: "unsupported" },
  );
});
