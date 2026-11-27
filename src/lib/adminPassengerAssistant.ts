import { supabase } from "@/lib/supabase";

export type AssistantPassenger = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  preferred_locale: string;
  created_at: string;
  booking_count: number;
  latest_booking_at: string | null;
};

export type AssistantPassengerCard = {
  profile: Omit<AssistantPassenger, "booking_count" | "latest_booking_at">;
  summary: {
    booking_count: number;
    pending_booking_count: number;
    confirmed_booking_count: number;
    cancelled_booking_count: number;
    expired_booking_count: number;
    refunded_booking_count: number;
    completed_trip_record_count: number;
    last_past_departure_at: string | null;
    next_departure_at: string | null;
  };
  page: number;
  page_size: number;
  has_more: boolean;
  bookings: AssistantBooking[];
};

export type AssistantBooking = {
  id: string;
  booking_number: string;
  status: string;
  currency: string;
  total_amount: number;
  created_at: string;
  confirmed_at: string | null;
  trip: {
    departure_at: string | null;
    arrival_at: string | null;
    carrier: string | null;
    status: string | null;
    from_city: string | null;
    to_city: string | null;
  } | null;
  booking_passengers: Array<{
    full_name: string;
    email: string | null;
    phone: string | null;
    seat_number: string | null;
  }>;
  cancellation_requests: Array<{
    status: string;
    resolution: string | null;
    created_at: string;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Invalid passenger data: ${field}`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredString(value, field);
}

function numericValue(value: unknown, field: string): number {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Invalid passenger data: ${field}`);
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid passenger data: ${field}`);
  return parsed;
}

function arrayValue(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid passenger data: ${field}`);
  return value;
}

function parsePassenger(value: unknown): AssistantPassenger {
  if (!isRecord(value)) throw new Error("Invalid passenger search response");
  return {
    id: requiredString(value.id, "id"),
    full_name: nullableString(value.full_name, "full_name"),
    email: nullableString(value.email, "email"),
    phone: nullableString(value.phone, "phone"),
    preferred_locale: requiredString(value.preferred_locale, "preferred_locale"),
    created_at: requiredString(value.created_at, "created_at"),
    booking_count: numericValue(value.booking_count, "booking_count"),
    latest_booking_at: nullableString(value.latest_booking_at, "latest_booking_at"),
  };
}

function parseAssistantBooking(value: unknown): AssistantBooking {
  if (!isRecord(value)) throw new Error("Invalid passenger booking data");
  const tripValue = value.trip;
  let trip: AssistantBooking["trip"] = null;
  if (tripValue !== null) {
    if (!isRecord(tripValue)) throw new Error("Invalid passenger trip data");
    trip = {
      departure_at: nullableString(tripValue.departure_at, "trip.departure_at"),
      arrival_at: nullableString(tripValue.arrival_at, "trip.arrival_at"),
      carrier: nullableString(tripValue.carrier, "trip.carrier"),
      status: nullableString(tripValue.status, "trip.status"),
      from_city: nullableString(tripValue.from_city, "trip.from_city"),
      to_city: nullableString(tripValue.to_city, "trip.to_city"),
    };
  }

  const bookingPassengers = arrayValue(value.booking_passengers, "booking_passengers").map((item) => {
    if (!isRecord(item)) throw new Error("Invalid booking passenger data");
    return {
      full_name: requiredString(item.full_name, "booking_passengers.full_name"),
      email: nullableString(item.email, "booking_passengers.email"),
      phone: nullableString(item.phone, "booking_passengers.phone"),
      seat_number: nullableString(item.seat_number, "booking_passengers.seat_number"),
    };
  });
  const cancellationRequests = arrayValue(value.cancellation_requests, "cancellation_requests").map((item) => {
    if (!isRecord(item)) throw new Error("Invalid cancellation request data");
    return {
      status: requiredString(item.status, "cancellation_requests.status"),
      resolution: nullableString(item.resolution, "cancellation_requests.resolution"),
      created_at: requiredString(item.created_at, "cancellation_requests.created_at"),
    };
  });

  return {
    id: requiredString(value.id, "booking.id"),
    booking_number: requiredString(value.booking_number, "booking.booking_number"),
    status: requiredString(value.status, "booking.status"),
    currency: requiredString(value.currency, "booking.currency"),
    total_amount: numericValue(value.total_amount, "booking.total_amount"),
    created_at: requiredString(value.created_at, "booking.created_at"),
    confirmed_at: nullableString(value.confirmed_at, "booking.confirmed_at"),
    trip,
    booking_passengers: bookingPassengers,
    cancellation_requests: cancellationRequests,
  };
}

function parsePassengerCard(value: unknown): AssistantPassengerCard {
  if (!isRecord(value) || !isRecord(value.profile) || !isRecord(value.summary)) {
    throw new Error("Invalid passenger card response");
  }
  const profile = value.profile;
  const summary = value.summary;
  if (typeof value.has_more !== "boolean") {
    throw new Error("Invalid passenger card response: has_more");
  }
  return {
    profile: {
      id: requiredString(profile.id, "profile.id"),
      full_name: nullableString(profile.full_name, "profile.full_name"),
      email: nullableString(profile.email, "profile.email"),
      phone: nullableString(profile.phone, "profile.phone"),
      preferred_locale: requiredString(profile.preferred_locale, "profile.preferred_locale"),
      created_at: requiredString(profile.created_at, "profile.created_at"),
    },
    summary: {
      booking_count: numericValue(summary.booking_count, "summary.booking_count"),
      pending_booking_count: numericValue(summary.pending_booking_count, "summary.pending_booking_count"),
      confirmed_booking_count: numericValue(summary.confirmed_booking_count, "summary.confirmed_booking_count"),
      cancelled_booking_count: numericValue(summary.cancelled_booking_count, "summary.cancelled_booking_count"),
      expired_booking_count: numericValue(summary.expired_booking_count, "summary.expired_booking_count"),
      refunded_booking_count: numericValue(summary.refunded_booking_count, "summary.refunded_booking_count"),
      completed_trip_record_count: numericValue(summary.completed_trip_record_count, "summary.completed_trip_record_count"),
      last_past_departure_at: nullableString(summary.last_past_departure_at, "summary.last_past_departure_at"),
      next_departure_at: nullableString(summary.next_departure_at, "summary.next_departure_at"),
    },
    page: numericValue(value.page, "page"),
    page_size: numericValue(value.page_size, "page_size"),
    has_more: value.has_more,
    bookings: arrayValue(value.bookings, "bookings").map(parseAssistantBooking),
  };
}

export async function searchAdminPassengers(query: string): Promise<{
  matches: AssistantPassenger[];
  totalCount: number;
}> {
  const searchValue = query.trim();
  if (!searchValue || searchValue.length > 200) {
    throw new Error("Пошуковий запит має містити від 1 до 200 символів.");
  }
  const literalQuery = searchValue.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await supabase.rpc("admin_search_passengers", {
    p_query: literalQuery,
    p_locale: null,
    p_page: 0,
    p_page_size: 20,
  }).returns<unknown>();
  if (error) {
    if (error.code === "42501" || /authorization denied|permission denied/i.test(error.message)) {
      throw new Error("Доступ до пошуку пасажирів є лише у super_admin, admin та support.");
    }
    console.error("BUSNET assistant passenger search RPC failed", error);
    throw new Error("Не вдалося виконати пошук пасажира. Перевірте з’єднання та спробуйте ще раз.");
  }
  const rows = arrayValue(data, "search results");
  const matches = rows.map(parsePassenger);
  return {
    matches,
    totalCount: matches.length ? numericValue(
      isRecord(rows[0]) ? rows[0].total_count : undefined,
      "total_count",
    ) : 0,
  };
}

export async function loadAdminPassengerCard(
  passengerId: string,
  page = 0,
): Promise<AssistantPassengerCard> {
  const { data, error } = await supabase.rpc("admin_get_passenger_assistant_card", {
    p_passenger_id: passengerId,
    p_page: page,
    p_page_size: 25,
  }).returns<unknown>();
  if (error) {
    if (error.code === "42501") {
      throw new Error("Доступ до картки пасажира є лише у super_admin, admin та support.");
    }
    console.error("BUSNET assistant passenger card RPC failed", error);
    throw new Error("Не вдалося завантажити картку та історію пасажира.");
  }
  return parsePassengerCard(data);
}
