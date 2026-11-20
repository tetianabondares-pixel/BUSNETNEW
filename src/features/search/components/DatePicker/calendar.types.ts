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
  fromLocationId: string | null;
  toLocationId: string | null;
  timezone: "Europe/Kyiv";
  schemaVersion: "1";
};
