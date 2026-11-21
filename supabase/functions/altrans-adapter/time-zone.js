const kyivFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function localParts(instant) {
  const parts = Object.fromEntries(
    kyivFormatter.formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function sameParts(left, right) {
  return left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second;
}

export function kyivLocalDateTimeToIso(date, time) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] ?? 0),
  };
  const targetUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );
  if (
    !Number.isFinite(targetUtc) ||
    target.month < 1 || target.month > 12 ||
    target.hour > 23 || target.minute > 59 || target.second > 59 ||
    !sameParts(
      {
        year: new Date(targetUtc).getUTCFullYear(),
        month: new Date(targetUtc).getUTCMonth() + 1,
        day: new Date(targetUtc).getUTCDate(),
        hour: new Date(targetUtc).getUTCHours(),
        minute: new Date(targetUtc).getUTCMinutes(),
        second: new Date(targetUtc).getUTCSeconds(),
      },
      target,
    )
  ) return null;

  const offsets = new Set(
    [-12, -6, 0, 6, 12].map((hours) => {
      const sample = targetUtc + hours * 60 * 60 * 1000;
      const parts = localParts(sample);
      return Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      ) - sample;
    }),
  );

  const matchingInstants = [...offsets]
    .map((offset) => targetUtc - offset)
    .filter((instant) => sameParts(localParts(instant), target))
    .sort((left, right) => left - right);

  return matchingInstants.length ? new Date(matchingInstants[0]).toISOString() : null;
}
