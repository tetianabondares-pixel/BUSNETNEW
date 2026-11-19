export type CalendarAvailability = {
  date: string;
  tripsCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  routes: string[];
  isAvailable: boolean;
};

export type AvailabilityMonthRequest = {
  year: number;
  month: number;
  from: string;
  to: string;
  timezone: "Europe/Kyiv";
  schemaVersion: "1";
};
