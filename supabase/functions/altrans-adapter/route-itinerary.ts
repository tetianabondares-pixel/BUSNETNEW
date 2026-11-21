import type { NormalizedProviderTrip, ProviderStop } from "./trip-normalization.ts";

export type RouteSchedule = {
  id: string;
  provider_route_id: string;
  direction: "outbound" | "inbound";
  service_weekday: number;
};

export type RouteScheduleStop = {
  schedule_id: string;
  location_id: string;
  stop_order: number;
  day_offset: number;
  departure_time: string;
  place: string | null;
};

export type RouteLocation = {
  id: string;
  provider_location_id: string;
  name_uk: string;
  name_en: string | null;
  name_it: string | null;
};

function isoDateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function addDays(date: string, days: number): string | null {
  const parsed = isoDateParts(date);
  if (!parsed) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function isIsoWeekday(date: Date): number {
  return date.getUTCDay() || 7;
}

function canonicalTime(value: string): string | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? "0");
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

function localizedCity(location: RouteLocation, locale: string): string {
  if (locale === "en") return location.name_en || location.name_uk;
  if (locale === "it") return location.name_it || location.name_uk;
  return location.name_uk;
}

export function buildStopsFromRouteSchedule(
  trip: NormalizedProviderTrip,
  schedules: readonly RouteSchedule[],
  scheduleStops: readonly RouteScheduleStop[],
  locations: readonly RouteLocation[],
  locale: string,
): ProviderStop[] | null {
  if (
    trip.segment_count !== 1 ||
    !trip.provider_route_id ||
    !trip.departure_city_id ||
    !trip.arrival_city_id
  ) {
    return null;
  }

  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const providerCityIdByLocationId = new Map(
    locations.map((location) => [location.id, location.provider_location_id]),
  );
  const stopsBySchedule = new Map<string, RouteScheduleStop[]>();
  for (const stop of scheduleStops) {
    const stops = stopsBySchedule.get(stop.schedule_id) ?? [];
    stops.push(stop);
    stopsBySchedule.set(stop.schedule_id, stops);
  }

  const matchingItineraries: ProviderStop[][] = [];
  for (const schedule of schedules) {
    if (schedule.provider_route_id !== trip.provider_route_id) continue;
    const stops = [...(stopsBySchedule.get(schedule.id) ?? [])]
      .sort((left, right) => left.stop_order - right.stop_order);
    if (stops.length < 2) continue;

    for (let fromIndex = 0; fromIndex < stops.length - 1; fromIndex += 1) {
      const fromStop = stops[fromIndex];
      if (providerCityIdByLocationId.get(fromStop.location_id) !== trip.departure_city_id) {
        continue;
      }
      const originTime = canonicalTime(fromStop.departure_time);
      if (
        !originTime ||
        originTime !== canonicalTime(trip.departure_time) ||
        fromStop.day_offset < 0 ||
        fromStop.day_offset > 6
      ) {
        continue;
      }

      const serviceDate = addDays(trip.departure_date, -fromStop.day_offset);
      const serviceDateValue = serviceDate ? isoDateParts(serviceDate) : null;
      if (!serviceDateValue || isIsoWeekday(serviceDateValue) !== schedule.service_weekday) {
        continue;
      }

      for (let toIndex = fromIndex + 1; toIndex < stops.length; toIndex += 1) {
        const toStop = stops[toIndex];
        if (providerCityIdByLocationId.get(toStop.location_id) !== trip.arrival_city_id) {
          continue;
        }

        const selectedStops = stops.slice(fromIndex, toIndex + 1);
        if (selectedStops.some((stop, index) =>
          stop.day_offset < fromStop.day_offset ||
          (index > 0 && stop.day_offset < selectedStops[index - 1].day_offset)
        )) {
          continue;
        }

        const itinerary: ProviderStop[] = [];
        for (const [index, stop] of selectedStops.entries()) {
          const location = locationsById.get(stop.location_id);
          if (!location) {
            itinerary.length = 0;
            break;
          }
          const isOrigin = index === 0;
          const isDestination = index === selectedStops.length - 1;
          const scheduledDate = addDays(
            trip.departure_date,
            stop.day_offset - fromStop.day_offset,
          );
          const scheduledTime = canonicalTime(stop.departure_time);
          if (!scheduledDate || !scheduledTime) {
            itinerary.length = 0;
            break;
          }

          itinerary.push({
            city: isOrigin
              ? trip.departure_city
              : isDestination
                ? trip.arrival_city
                : localizedCity(location, locale),
            place: isOrigin
              ? trip.departure_place || stop.place || ""
              : isDestination
                ? trip.arrival_place || stop.place || ""
                : stop.place || "",
            arrival_date: isDestination ? trip.arrival_date : null,
            arrival_time: isDestination ? trip.arrival_time : null,
            departure_date: isDestination ? null : scheduledDate,
            departure_time: isDestination ? null : scheduledTime,
          });
        }

        if (itinerary.length === selectedStops.length) {
          matchingItineraries.push(itinerary);
        }
      }
    }
  }

  if (matchingItineraries.length === 0) return null;
  const first = matchingItineraries[0];
  return matchingItineraries.every((itinerary) =>
    JSON.stringify(itinerary) === JSON.stringify(first)
  )
    ? first
    : null;
}
