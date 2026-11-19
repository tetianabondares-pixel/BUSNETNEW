export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(key: string, count: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + count);
  return toDateKey(date);
}

export function getKyivToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isWithinSearchLimit(dateKey: string, todayKey: string): boolean {
  const date = parseDateKey(dateKey).getTime();
  const today = parseDateKey(todayKey).getTime();
  const max = today + 365 * 24 * 60 * 60 * 1000;
  return date >= today && date <= max;
}
