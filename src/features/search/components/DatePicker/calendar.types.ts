export type CalendarAvailability = {
  date: string;
  scheduledServicesCount: number;
  routes: string[];
  isAvailable: boolean;
};

export type AvailabilityMonthRequest = {
  year: number;
  month: number;
  fromLocationId: string | null;
  toLocationId: string | null;
  timezone: "Europe/Kyiv";
};
