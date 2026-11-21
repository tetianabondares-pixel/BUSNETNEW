import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";
import {
  deduplicateProviderTrips,
  deduplicateScheduledServicesByDeparture,
  getScheduledArrivalDate,
  type ScheduledService,
} from "@/features/search/schedule-search";

type ProviderTrip = {
  trip_id: string;
  carrier: string;
  bus_number: string | null;
  departure_city: string;
  departure_place: string;
  departure_date: string;
  departure_time: string;
  arrival_city: string;
  arrival_place: string;
  arrival_date: string;
  arrival_time: string;
  price: number | string | null;
  currency: string;
  can_book_with_payment_at_boarding: boolean;
};

type Passenger = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

function splitFullName(value: string) {
  const [firstName = "", ...lastNameParts] = value.trim().split(/\s+/);
  return { firstName, lastName: lastNameParts.join(" ") };
}

function isProviderTrip(value: unknown): value is ProviderTrip {
  if (!value || typeof value !== "object") return false;
  const trip = value as Record<string, unknown>;
  return typeof trip.trip_id === "string" &&
    typeof trip.departure_time === "string" &&
    typeof trip.arrival_time === "string";
}

function languageOf(language: string): "uk" | "en" | "it" {
  return language.startsWith("en") ? "en" : language.startsWith("it") ? "it" : "uk";
}

export function BookingPage() {
  const { t, i18n } = useTranslation();
  const { tokens } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [trips, setTrips] = useState<ScheduledService[]>([]);
  const [providerTrips, setProviderTrips] = useState<ProviderTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerLoading, setProviderLoading] = useState(false);
  const [error, setError] = useState("");
  const [providerError, setProviderError] = useState("");
  const [routeNames, setRouteNames] = useState({ from: "", to: "" });
  const [selectedTrip, setSelectedTrip] = useState<ProviderTrip | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([{
    firstName: "", lastName: "", email: "", phone: "",
  }]);
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const passengerEditedRef = useRef(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingResult, setBookingResult] = useState<{
    bookingNumber: string;
    totalAmount: number;
    currency: string;
    expiresAt: string | null;
  } | null>(null);
  const [bookingError, setBookingError] = useState("");

  const fromId = searchParams.get("fromId")?.trim() ?? "";
  const toId = searchParams.get("toId")?.trim() ?? "";
  const date = searchParams.get("date")?.trim() ?? "";
  const pendingTrip = (location.state as { pendingTrip?: unknown } | null)?.pendingTrip;

  useEffect(() => {
    if (isProviderTrip(pendingTrip)) setSelectedTrip(pendingTrip);
  }, [pendingTrip]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setIsAuthenticated(!sessionError && Boolean(data.session));
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setIsAuthenticated(Boolean(session));
      setAuthLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPassengerProfile = async () => {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const user = data.user;
        if (!user || cancelled) return;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name,phone")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError && !cancelled) setProfileLoadError(true);
        if (cancelled || passengerEditedRef.current) return;

        const metadata = user.user_metadata ?? {};
        const metadataName = String(metadata.full_name ?? metadata.name ?? "");
        const profileName = profile?.full_name ?? metadataName;
        const parsedName = splitFullName(profileName);
        setPassengers((current) => [{
          ...current[0],
          firstName: String(metadata.firstName ?? metadata.first_name ?? parsedName.firstName),
          lastName: String(metadata.lastName ?? metadata.last_name ?? parsedName.lastName),
          email: user.email ?? current[0].email,
          phone: String(profile?.phone ?? metadata.phone ?? current[0].phone),
        }]);
      } catch {
        if (!cancelled) setProfileLoadError(true);
      }
    };
    void loadPassengerProfile();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!fromId || !toId || !date) {
      setError(t("booking.missingSearch"));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setTrips([]);
    setProviderTrips([]);
    if (!isProviderTrip(pendingTrip)) setSelectedTrip(null);
    setBookingResult(null);

    const searchSchedules = async () => {
      try {
        const { data: locations, error: locationError } = await supabase
          .from("locations")
          .select("id,name_uk,name_en,name_it")
          .in("id", [fromId, toId])
          .eq("active", true);
        if (locationError) throw locationError;

        const fromLocation = locations?.find((location) => location.id === fromId);
        const toLocation = locations?.find((location) => location.id === toId);
        if (!fromLocation || !toLocation) throw new Error("LOCATION_NOT_FOUND");
        if (fromId === toId) throw new Error("SAME_LOCATION");

        const locale = languageOf(i18n.language);
        const displayName = (location: typeof fromLocation) =>
          locale === "en"
            ? location.name_en ?? location.name_uk
            : locale === "it"
              ? location.name_it ?? location.name_en ?? location.name_uk
              : location.name_uk;

        const { data: routes, error: routeError } = await supabase
          .from("routes")
          .select("provider_route_id")
          .eq("from_location_id", fromId)
          .eq("to_location_id", toId)
          .eq("active", true)
          .not("provider_route_id", "is", null);
        if (routeError) throw routeError;

        const providerRouteIds = [...new Set(
          (routes ?? []).map((route) => route.provider_route_id).filter(Boolean),
        )];
        if (providerRouteIds.length === 0) {
          if (!cancelled) setRouteNames({ from: displayName(fromLocation), to: displayName(toLocation) });
          return;
        }

        const { data: schedules, error: scheduleError } = await supabase
          .from("provider_route_schedules")
          .select("id, title, service_weekday")
          .in("provider_route_id", providerRouteIds)
          .eq("active", true);
        if (scheduleError) throw scheduleError;

        const scheduleIds = (schedules ?? []).map((schedule) => schedule.id);
        if (scheduleIds.length === 0) {
          if (!cancelled) setRouteNames({ from: displayName(fromLocation), to: displayName(toLocation) });
          return;
        }

        const { data: stops, error: stopsError } = await supabase
          .from("provider_route_schedule_stops")
          .select("schedule_id, location_id, stop_order, day_offset, departure_time, place")
          .in("schedule_id", scheduleIds)
          .in("location_id", [fromId, toId]);
        if (stopsError) throw stopsError;

        const stopsBySchedule = new Map<string, Array<{
          location_id: string;
          stop_order: number;
          day_offset: number;
          departure_time: string;
          place: string | null;
        }>>();
        for (const stop of stops ?? []) {
          const scheduleStops = stopsBySchedule.get(stop.schedule_id) ?? [];
          scheduleStops.push(stop);
          stopsBySchedule.set(stop.schedule_id, scheduleStops);
        }

        const scheduledServices = (schedules ?? []).flatMap((schedule) => {
          const scheduleStops = stopsBySchedule.get(schedule.id) ?? [];
          const fromStop = scheduleStops.find((stop) => stop.location_id === fromId);
          const toStop = scheduleStops.find((stop) => stop.location_id === toId);
          if (!fromStop || !toStop) return [];
          const arrivalDate = getScheduledArrivalDate(
            date,
            { stopOrder: fromStop.stop_order, dayOffset: fromStop.day_offset },
            { stopOrder: toStop.stop_order, dayOffset: toStop.day_offset },
            schedule.service_weekday,
          );
          if (!arrivalDate) return [];
          return [{
            id: `${schedule.id}:${date}`,
            departureDate: date,
            departureTime: fromStop.departure_time.slice(0, 5),
            departurePlace: fromStop.place,
            arrivalDate,
            arrivalTime: toStop.departure_time.slice(0, 5),
            arrivalPlace: toStop.place,
          }];
        });

        if (!cancelled) {
          setRouteNames({ from: displayName(fromLocation), to: displayName(toLocation) });
          setTrips(deduplicateScheduledServicesByDeparture(scheduledServices));
        }
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error && caught.message === "SAME_LOCATION"
          ? t("booking.sameLocation")
          : t("booking.searchError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void searchSchedules();
    return () => { cancelled = true; };
  }, [fromId, toId, date, i18n.language, pendingTrip, t]);

  useEffect(() => {
    if (!fromId || !toId || !date || trips.length === 0) return;
    let cancelled = false;
    setProviderLoading(true);
    setProviderError("");

    void supabase.functions.invoke("altrans-adapter", {
      body: {
        operation: "search-trips",
        fromLocationId: fromId,
        toLocationId: toId,
        travelDate: date,
        passengersCount: 1,
        currencyCode: "UAH",
      },
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setProviderError(t("booking.providerError"));
        return;
      }
      const response = data as { providerError?: boolean; errorCode?: string; trips?: ProviderTrip[] } | null;
      if (response?.providerError) {
        setProviderError(t("booking.providerError"));
        return;
      }
      setProviderTrips(deduplicateProviderTrips(response?.trips ?? []));
    }).finally(() => {
      if (!cancelled) setProviderLoading(false);
    });

    return () => { cancelled = true; };
  }, [trips, fromId, toId, date, t]);

  const updatePassenger = (field: keyof Passenger, value: string) => {
    passengerEditedRef.current = true;
    setPassengers((current) => [{ ...current[0], [field]: value }]);
  };

  const submitBooking = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTrip) return;
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      setBookingError(t("booking.bookingError"));
      return;
    }
    if (!userData.user) {
      navigate("/auth", {
        state: {
          from: { pathname: location.pathname, search: location.search, hash: location.hash },
          pendingTrip: selectedTrip,
        },
      });
      return;
    }
    setBookingLoading(true);
    setBookingError("");
    setBookingResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("altrans-adapter", {
        body: {
          operation: "create-booking",
          tripId: selectedTrip.trip_id,
          fromLocationId: fromId,
          toLocationId: toId,
          travelDate: date,
          locale: languageOf(i18n.language),
          passengers: passengers.map((passenger) => ({
            fullName: `${passenger.firstName} ${passenger.lastName}`.trim(),
            email: passenger.email,
            phone: passenger.phone,
          })),
        },
      });
      if (error) {
        console.error("Booking request failed", error);
        setBookingError(t("booking.bookingError"));
        return;
      }
      const response = data as {
        errorCode?: string;
        bookingId?: string;
        bookingNumber?: string;
        totalAmount?: number;
        currency?: string;
        expiresAt?: string | null;
      };
      if (!response?.bookingNumber) {
        setBookingError(
          response?.errorCode === "TRIP_UNAVAILABLE"
            ? t("booking.tripUnavailable")
            : t("booking.bookingError"),
        );
        return;
      }
      setBookingResult({
        bookingNumber: response.bookingNumber,
        totalAmount: response.totalAmount ?? 0,
        currency: response.currency ?? "UAH",
        expiresAt: response.expiresAt ?? null,
      });
    } catch (caught) {
      console.error("Booking request failed", caught);
      setBookingError(t("booking.bookingError"));
    } finally {
      setBookingLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorBorder}`,
    background: tokens.colorBgInput,
    color: tokens.colorText,
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "3rem 1.5rem", minHeight: "50vh", width: "100%", boxSizing: "border-box" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>{t("booking.title")}</h1>
      <p style={{ color: tokens.colorTextSecondary }}>{routeNames.from || fromId} → {routeNames.to || toId} · {date}</p>

      {loading && <p style={{ color: tokens.colorTextSecondary }}>{t("booking.loading")}</p>}
      {!loading && error && <p style={{ color: tokens.colorTextSecondary }}>{error}</p>}

      {!loading && !error && trips.length > 0 && (
        <div style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "12px" }}>
          <p style={{ color: tokens.colorTextSecondary, margin: 0 }}>{t("booking.scheduleConfirmed")}</p>
          {trips.map((trip) => (
            <article key={trip.id} style={{ padding: "14px", borderRadius: "12px", border: `1px solid ${tokens.colorBorder}`, background: tokens.colorBgCard }}>
              <strong>{routeNames.from} {trip.departureTime}</strong>
              <div style={{ color: tokens.colorTextSecondary }}>
                {trip.departurePlace ? `${trip.departurePlace} · ` : ""}{routeNames.to} · {trip.arrivalDate} {trip.arrivalTime}
                {trip.arrivalPlace ? ` · ${trip.arrivalPlace}` : ""}
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && !error && trips.length === 0 && (
        <p style={{ color: tokens.colorTextSecondary }}>{t("booking.notFound")}</p>
      )}

      {providerLoading && <p style={{ color: tokens.colorTextSecondary }}>{t("booking.loadingLive")}</p>}
      {providerError && <p style={{ color: tokens.colorWarning }}>{providerError}</p>}
      {profileLoadError && selectedTrip && (
        <p role="status" style={{ color: tokens.colorWarning }}>{t("booking.profileLoadError")}</p>
      )}
      {selectedTrip && authLoading && <p role="status">{t("booking.checkingAccount")}</p>}
      {selectedTrip && !authLoading && !isAuthenticated && (
        <div style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "10px", padding: "16px", borderRadius: "12px", border: `1px solid ${tokens.colorBorder}`, background: tokens.colorBgCard }}>
          <p style={{ margin: 0, color: tokens.colorTextSecondary }}>{t("booking.signInToBook")}</p>
          <button type="button" onClick={() => navigate("/auth", {
            state: {
              from: { pathname: location.pathname, search: location.search, hash: location.hash },
              pendingTrip: selectedTrip,
            },
          })} style={{ padding: "12px", border: 0, borderRadius: "10px", background: "#087DFF", color: "#fff", fontWeight: 700 }}>
            {t("booking.signInAction")}
          </button>
        </div>
      )}

      {!providerLoading && providerTrips.length > 0 && (
        <div style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "12px" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "8px 0 0" }}>{t("booking.availableTrips")}</h2>
          {providerTrips.map((trip) => {
            const price = trip.price == null ? null : Number(trip.price);
            return (
              <button
                key={trip.trip_id}
                type="button"
                onClick={() => { setSelectedTrip(trip); setBookingResult(null); setBookingError(""); }}
                style={{
                  textAlign: "left",
                  padding: "16px",
                  borderRadius: "14px",
                  border: `2px solid ${selectedTrip?.trip_id === trip.trip_id ? "#087DFF" : tokens.colorBorder}`,
                  background: tokens.colorBgCard,
                  color: tokens.colorText,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <strong>{trip.departure_time} → {trip.arrival_time}</strong>
                  <strong>{price == null ? t("booking.priceUnavailable") : `${price} ${trip.currency}`}</strong>
                </div>
                <div style={{ color: tokens.colorTextSecondary, marginTop: "6px" }}>
                  {trip.carrier}{trip.bus_number ? ` · ${trip.bus_number}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedTrip && isAuthenticated && (
        <form onSubmit={submitBooking} style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "12px", padding: "18px", borderRadius: "14px", border: `1px solid ${tokens.colorBorder}`, background: tokens.colorBgCard, boxSizing: "border-box" }}>
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>{t("booking.passengerDetails")}</h2>
          {([
            ["firstName", "firstName"],
            ["lastName", "lastName"],
            ["email", "email"],
            ["phone", "phone"],
          ] as const).map(([field, key]) => (
            <label key={field} style={{ display: "grid", gap: "6px", color: tokens.colorTextSecondary }}>
              {t(`booking.${key}`)}
              <input
                required={field !== "email"}
                type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                value={passengers[0][field]}
                onChange={(event) => updatePassenger(field, event.target.value)}
                style={inputStyle}
              />
            </label>
          ))}
          <button type="submit" disabled={bookingLoading} style={{ padding: "12px", borderRadius: "10px", border: 0, background: "#087DFF", color: "#fff", fontWeight: 700, cursor: bookingLoading ? "wait" : "pointer" }}>
            {bookingLoading ? t("booking.bookingLoading") : t("booking.confirmBooking")}
          </button>
        </form>
      )}

      {bookingError && <p style={{ color: tokens.colorWarning }}>{bookingError}</p>}
      {bookingResult && (
        <div role="status" style={{ width: "100%", maxWidth: "760px", padding: "18px", borderRadius: "14px", border: "1px solid #22C55E", background: tokens.colorBgCard, boxSizing: "border-box" }}>
          <strong>{t("booking.bookingCreated")}</strong>
          <p>{t("booking.pendingAdminConfirmation")}</p>
          <div>{t("booking.bookingNumber")}: {bookingResult.bookingNumber}</div>
          <div>{t("booking.total")}: {bookingResult.totalAmount} {bookingResult.currency}</div>
          {bookingResult.expiresAt && <div style={{ color: tokens.colorTextSecondary }}>{t("booking.expiresAt")}: {new Date(bookingResult.expiresAt).toLocaleString()}</div>}
        </div>
      )}
    </section>
  );
}
