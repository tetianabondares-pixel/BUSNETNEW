type RouteStopDate = {
  stopOrder: number;
  dayOffset: number;
};

export type ScheduledService = {
  id: string;
  departureDate: string;
  departureTime: string;
  departurePlace: string | null;
  arrivalDate: string;
  arrivalTime: string;
  arrivalPlace: string | null;
};

function addDays(date: string, count: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + count);
  return result.toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function getScheduledArrivalDate(
  departureDate: string,
  fromStop: RouteStopDate,
  toStop: RouteStopDate,
  serviceWeekday: number,
): string | null {
  if (
    toStop.stopOrder <= fromStop.stopOrder ||
    isoWeekday(addDays(departureDate, -fromStop.dayOffset)) !== serviceWeekday
  ) {
    return null;
  }

  return addDays(departureDate, toStop.dayOffset - fromStop.dayOffset);
}

export function deduplicateScheduledServicesByDeparture(
  services: readonly ScheduledService[],
): ScheduledService[] {
  const servicesByDeparture = new Map<string, ScheduledService>();

  for (const service of services) {
    const departureKey = `${service.departureDate}T${service.departureTime}`;
    const current = servicesByDeparture.get(departureKey);
    if (
      !current ||
      `${service.arrivalDate}T${service.arrivalTime}` >
        `${current.arrivalDate}T${current.arrivalTime}`
    ) {
      servicesByDeparture.set(departureKey, service);
    }
  }

  return [...servicesByDeparture.values()].sort((left, right) =>
    `${left.departureDate}T${left.departureTime}`.localeCompare(
      `${right.departureDate}T${right.departureTime}`,
    ),
  );
}
