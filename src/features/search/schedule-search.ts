type RouteStopDate = {
  stopOrder: number;
  dayOffset: number;
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
