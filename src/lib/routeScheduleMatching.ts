type ScheduleStopLocation = {
  location_id: string;
};

type ScheduleWithStops = {
  stops: readonly ScheduleStopLocation[];
};

type ScheduleWithServiceWeekday = {
  service_weekday: number;
  stops: readonly (ScheduleStopLocation & {
    day_offset: number;
  })[];
};

export function filterSchedulesForDirectedRoute<T extends ScheduleWithStops>(
  schedules: readonly T[],
  fromLocationId: string,
  toLocationId: string,
): T[] {
  return schedules.filter((schedule) =>
    schedule.stops.some((stop, fromIndex) =>
      stop.location_id === fromLocationId &&
      schedule.stops.slice(fromIndex + 1).some((nextStop) => nextStop.location_id === toLocationId)
    )
  );
}

export function getUniqueDepartureWeekdays<T extends ScheduleWithServiceWeekday>(
  schedules: readonly T[],
  fromLocationId: string,
): number[] {
  return [...new Set(
    schedules
      .map((schedule) => {
        const fromStop = schedule.stops.find((stop) => stop.location_id === fromLocationId);
        const { service_weekday: serviceWeekday } = schedule;
        if (
          !fromStop ||
          !Number.isInteger(serviceWeekday) ||
          serviceWeekday < 1 ||
          serviceWeekday > 7 ||
          !Number.isInteger(fromStop.day_offset) ||
          fromStop.day_offset < 0 ||
          fromStop.day_offset > 6
        ) {
          return null;
        }
        return ((serviceWeekday - 1 + fromStop.day_offset) % 7) + 1;
      })
      .filter((weekday): weekday is number => weekday !== null),
  )].sort((left, right) => left - right);
}
