export type ScheduleStop = {
  provider_location_id: string;
  stop_order: number;
  day_offset: number;
  departure_time: string;
  place: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ProviderRouteSchedule = {
  provider_route_id: string;
  schedule_key: string;
  title: string;
  direction: "outbound" | "inbound";
  service_weekday: number;
  stops: ScheduleStop[];
};

type ProviderStop = Record<string, unknown>;

const WEEKDAYS: Readonly<Record<string, number>> = {
  "понеділок": 1,
  "вівторок": 2,
  "середа": 3,
  "четвер": 4,
  "п'ятниця": 5,
  "пятниця": 5,
  "субота": 6,
  "неділя": 7,
};

export function parseProviderWeekday(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase("uk-UA")
    .replace(/[\u2019\u02bc`]/g, "'");
  return WEEKDAYS[normalized] ?? null;
}

function providerStops(schedule: unknown): ProviderStop[] {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    throw new Error("INVALID_SCHEDULE");
  }
  const items = (schedule as Record<string, unknown>).items;
  if (!Array.isArray(items) || items.length < 2) throw new Error("INVALID_SCHEDULE_STOPS");
  return items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("INVALID_SCHEDULE_STOP");
    }
    return item as ProviderStop;
  });
}

function requiredCityId(stop: ProviderStop): string {
  const value = stop.city_id;
  if ((typeof value !== "number" && typeof value !== "string") || !String(value).trim()) {
    throw new Error("INVALID_SCHEDULE_CITY_ID");
  }
  return String(value);
}

function requiredWeekday(value: unknown): number {
  const weekday = parseProviderWeekday(value);
  if (weekday === null) throw new Error("INVALID_SCHEDULE_WEEKDAY");
  return weekday;
}

function requiredTime(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("INVALID_SCHEDULE_TIME");
  }
  const match = value.trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error("INVALID_SCHEDULE_TIME");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? "0");
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error("INVALID_SCHEDULE_TIME");
  }
  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (!String(value).trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildStops(
  items: ProviderStop[],
  direction: "outbound" | "inbound",
  serviceWeekday: number,
): ScheduleStop[] {
  const ordered = direction === "outbound" ? items : [...items].reverse();
  return ordered.map((stop, stopOrder) => {
    const weekday = requiredWeekday(
      direction === "outbound" ? stop.departure_day_str : stop.return_day_str,
    );
    const time = direction === "outbound" ? stop.departure_time_str : stop.return_time_str;
    return {
      provider_location_id: requiredCityId(stop),
      stop_order: stopOrder,
      day_offset: (weekday - serviceWeekday + 7) % 7,
      departure_time: requiredTime(time),
      place: optionalText(stop.place),
      latitude: optionalNumber(stop.latitude),
      longitude: optionalNumber(stop.longitude),
    };
  });
}

export function normalizeProviderSchedule(
  providerRouteId: string,
  value: unknown,
): ProviderRouteSchedule[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_SCHEDULE");
  }
  const schedule = value as Record<string, unknown>;
  const items = providerStops(schedule);
  const outboundWeekday = requiredWeekday(schedule.departure_day);
  const inboundWeekday = requiredWeekday(schedule.return_day);
  const locationIds = items.map(requiredCityId);
  const scheduleKey = `${outboundWeekday}-${inboundWeekday}:${locationIds.join(",")}`;
  const title = optionalText(schedule.title) ?? scheduleKey;

  return [
    {
      provider_route_id: providerRouteId,
      schedule_key: scheduleKey,
      title,
      direction: "outbound",
      service_weekday: outboundWeekday,
      stops: buildStops(items, "outbound", outboundWeekday),
    },
    {
      provider_route_id: providerRouteId,
      schedule_key: scheduleKey,
      title,
      direction: "inbound",
      service_weekday: inboundWeekday,
      stops: buildStops(items, "inbound", inboundWeekday),
    },
  ];
}

export function buildDirectedRoutePairs(
  providerRouteId: string,
  providerLocationIds: string[],
): Array<{
  fromProviderId: string;
  toProviderId: string;
  providerRouteId: string;
}> {
  const pairs = new Map<string, {
    fromProviderId: string;
    toProviderId: string;
    providerRouteId: string;
  }>();

  for (let fromIndex = 0; fromIndex < providerLocationIds.length; fromIndex += 1) {
    for (let toIndex = 0; toIndex < providerLocationIds.length; toIndex += 1) {
      if (fromIndex === toIndex) continue;
      const fromProviderId = providerLocationIds[fromIndex];
      const toProviderId = providerLocationIds[toIndex];
      if (fromProviderId === toProviderId) continue;
      pairs.set(`${providerRouteId}:${fromProviderId}:${toProviderId}`, {
        fromProviderId,
        toProviderId,
        providerRouteId,
      });
    }
  }

  return [...pairs.values()];
}
