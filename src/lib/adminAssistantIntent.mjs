const GREETING_PATTERN =
  /^(?:привет|привіт|добрый день|добрий день|доброго дня|здравствуйте|вітаю|hello|hi|hey)[!.,?\s]*$/iu;
const ACTION_PATTERN =
  /^(?:(?:пожалуйста|будь ласка)\s+)?(?:найди|найти|знайди|знайти|пошукай|покажи|find|search|look up|show)(?=$|[\s:,-])/iu;
const PASSENGER_PATTERN =
  /(?<![\p{L}\p{N}_])(?:пассажир(?:а|ку)?|пасажир(?:а|ку)?|passenger)(?![\p{L}\p{N}_])/iu;
const ACTION_PREFIX_PATTERN =
  /^(?:(?:пожалуйста|будь ласка)\s+)?(?:найди|найти|знайди|знайти|пошукай|покажи|find|search|look up|show)(?=$|[\s:,-])[\s:,-]*/iu;
const PASSENGER_PREFIX_PATTERN =
  /^(?:пассажир(?:а|ку)?|пасажир(?:а|ку)?|passenger)(?=$|[\s:,-])[\s:,-]*/iu;

function cleanQuery(value) {
  return value
    .replace(/^[\s"'«»“”]+|[\s"'«»“”.,!?;:]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function parseAssistantRequest(rawText) {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text) return { kind: "unsupported" };
  if (GREETING_PATTERN.test(text)) return { kind: "greeting" };

  const startsWithAction = ACTION_PATTERN.test(text);
  const mentionsPassenger = PASSENGER_PATTERN.test(text);
  if (!startsWithAction && !mentionsPassenger) return { kind: "unsupported" };

  const query = cleanQuery(
    text.replace(ACTION_PREFIX_PATTERN, "").replace(PASSENGER_PREFIX_PATTERN, ""),
  );
  const searchValue = cleanQuery(
    query.replace(/^(?:по имени|за ім’ям|за ім'ям|по телефону|за телефоном|по email|за email)(?:\s+|$)/iu, ""),
  );
  return searchValue
    ? { kind: "passenger_search", query: searchValue }
    : { kind: "passenger_search_missing_query" };
}
