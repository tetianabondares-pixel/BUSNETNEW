import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { BusFront, MapPin, Plus, X } from "lucide-react";
import { useTheme } from "@/theme";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  buildStopsFromRouteSchedule,
  type RouteLocation,
  type RouteSchedule,
  type RouteScheduleStop,
} from "../../supabase/functions/altrans-adapter/route-itinerary";
import type { NormalizedProviderTrip } from "../../supabase/functions/altrans-adapter/trip-normalization";
import "./BookingPage.css";
import "./TripRequestCard.css";

type ProviderStop = {
  city: string;
  place: string;
  arrival_date: string | null;
  arrival_time: string | null;
  departure_date: string | null;
  departure_time: string | null;
};

type ProviderTrip = {
  trip_id: string;
  provider_route_id?: string | null;
  departure_city_id?: string | null;
  arrival_city_id?: string | null;
  segment_count?: number;
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
  stops?: ProviderStop[];
  stops_source?: string;
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

function matchesCurrentTrip(candidate: unknown, current: ProviderTrip) {
  if (!isProviderTrip(candidate)) return false;
  const candidatePrice = candidate.price == null ? null : Number(candidate.price);
  const currentPrice = current.price == null ? null : Number(current.price);
  const identifiersMatch = (["provider_route_id", "departure_city_id", "arrival_city_id"] as const)
    .every((field) => {
      const previousValue = candidate[field];
      const currentValue = current[field];
      return previousValue == null || currentValue == null || previousValue === currentValue;
    });

  return candidate.trip_id === current.trip_id &&
    candidate.departure_date === current.departure_date &&
    candidate.departure_time === current.departure_time &&
    candidate.arrival_date === current.arrival_date &&
    candidate.arrival_time === current.arrival_time &&
    candidatePrice === currentPrice &&
    candidate.currency === current.currency &&
    identifiersMatch;
}

async function getFunctionErrorCode(error: unknown): Promise<string | null> {
  if (!(error instanceof FunctionsHttpError) || !(error.context instanceof Response)) return null;
  try {
    const body: unknown = await error.context.clone().json();
    return body && typeof body === "object" && "errorCode" in body && typeof body.errorCode === "string"
      ? body.errorCode
      : null;
  } catch (caught) {
    console.error("Could not read booking error response", caught);
    return null;
  }
}

function languageOf(language: string): "uk" | "en" | "it" {
  return language.startsWith("en") ? "en" : language.startsWith("it") ? "it" : "uk";
}

function emptyPassenger(): Passenger {
  return { firstName: "", lastName: "", email: "", phone: "" };
}

function escapeHtml(value: string | number | null | undefined) {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character]);
}

function endpointStops(trip: ProviderTrip): ProviderStop[] {
  return [
    {
      city: trip.departure_city,
      place: trip.departure_place,
      arrival_date: null,
      arrival_time: null,
      departure_date: trip.departure_date,
      departure_time: trip.departure_time,
    },
    {
      city: trip.arrival_city,
      place: trip.arrival_place,
      arrival_date: trip.arrival_date,
      arrival_time: trip.arrival_time,
      departure_date: null,
      departure_time: null,
    },
  ];
}

async function loadScheduledStops(
  trip: ProviderTrip,
  fromLocationId: string,
  toLocationId: string,
  locale: string,
): Promise<ProviderStop[] | null> {
  const { data: routeRows, error: routeError } = await supabase
    .from("routes")
    .select("provider_route_id")
    .eq("from_location_id", fromLocationId)
    .eq("to_location_id", toLocationId)
    .eq("active", true)
    .not("provider_route_id", "is", null);
  if (routeError) throw new Error(`ROUTE_LOOKUP_FAILED:${routeError.code}`);

  const routeIds = [...new Set((routeRows ?? [])
    .map((route) => route.provider_route_id)
    .filter((routeId): routeId is string => typeof routeId === "string" && routeId.length > 0))];
  if (routeIds.length === 0) return null;

  const { data: scheduleRows, error: scheduleError } = await supabase
    .from("provider_route_schedules")
    .select("id, provider_route_id, direction, service_weekday")
    .in("provider_route_id", routeIds)
    .eq("active", true);
  if (scheduleError) throw new Error(`SCHEDULE_LOOKUP_FAILED:${scheduleError.code}`);

  const schedules = (scheduleRows ?? []) as RouteSchedule[];
  if (schedules.length === 0) return null;
  const scheduleIds = schedules.map((schedule) => schedule.id);
  const { data: stopRows, error: stopsError } = await supabase
    .from("provider_route_schedule_stops")
    .select("schedule_id, location_id, stop_order, day_offset, departure_time, place")
    .in("schedule_id", scheduleIds)
    .order("schedule_id")
    .order("stop_order");
  if (stopsError) throw new Error(`SCHEDULE_STOPS_LOOKUP_FAILED:${stopsError.code}`);

  const scheduleStops = (stopRows ?? []) as RouteScheduleStop[];
  const locationIds = [...new Set(scheduleStops.map((stop) => stop.location_id))];
  if (locationIds.length === 0) return null;
  const { data: locationRows, error: locationsError } = await supabase
    .from("locations")
    .select("id, provider_location_id, name_uk, name_en, name_it")
    .in("id", locationIds)
    .eq("active", true);
  if (locationsError) throw new Error(`STOP_LOCATIONS_LOOKUP_FAILED:${locationsError.code}`);

  const locations = (locationRows ?? []) as RouteLocation[];
  const fromLocation = locations.find((location) => location.id === fromLocationId);
  const toLocation = locations.find((location) => location.id === toLocationId);
  if (!fromLocation || !toLocation) return null;

  const matchingItineraries = routeIds
    .map((providerRouteId) => {
      const normalizedTrip: NormalizedProviderTrip = {
        ...trip,
        provider_route_id: providerRouteId,
        departure_city_id: fromLocation.provider_location_id,
        arrival_city_id: toLocation.provider_location_id,
        segment_count: 1,
        stops: trip.stops ?? [],
      };
      return buildStopsFromRouteSchedule(
        normalizedTrip,
        schedules,
        scheduleStops,
        locations,
        locale,
      );
    })
    .filter((stops): stops is ProviderStop[] => stops !== null);

  if (matchingItineraries.length === 0) return null;
  const itinerary = matchingItineraries[0];
  return matchingItineraries.every((candidate) =>
    JSON.stringify(candidate) === JSON.stringify(itinerary)
  )
    ? itinerary
    : null;
}

export function BookingPage() {
  const { t, i18n } = useTranslation();
  const { tokens } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [providerTrip, setProviderTrip] = useState<ProviderTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerSearched, setProviderSearched] = useState(false);
  const [providerSearchRevision, setProviderSearchRevision] = useState(0);
  const [error, setError] = useState("");
  const [providerError, setProviderError] = useState("");
  const [stopDetailsWarning, setStopDetailsWarning] = useState("");
  const [showTripDetails, setShowTripDetails] = useState(false);
  const [routeNames, setRouteNames] = useState({ from: "", to: "" });
  const [selectedTrip, setSelectedTrip] = useState<ProviderTrip | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([emptyPassenger()]);
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const passengerEditedRef = useRef(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingResult, setBookingResult] = useState<{
    bookingId: string;
    bookingNumber: string;
    totalAmount: number;
    currency: string;
    expiresAt: string | null;
    claimToken: string | null;
  } | null>(null);
  const [bookingError, setBookingError] = useState("");
  const [needsTripRefresh, setNeedsTripRefresh] = useState(false);
  const [shareMessage, setShareMessage] = useState<"shared" | "copied" | "shareFailed" | null>(null);
  const [tripRequestName, setTripRequestName] = useState("");
  const [tripRequestPhone, setTripRequestPhone] = useState("");
  const [tripRequestLoading, setTripRequestLoading] = useState(false);
  const [tripRequestError, setTripRequestError] = useState("");
  const [tripRequestSubmitted, setTripRequestSubmitted] = useState(false);
  const [tripRequestSeconds, setTripRequestSeconds] = useState(120);

  const fromId = searchParams.get("fromId")?.trim() ?? "";
  const toId = searchParams.get("toId")?.trim() ?? "";
  const date = searchParams.get("date")?.trim() ?? "";
  const pendingTrip = (location.state as { pendingTrip?: unknown } | null)?.pendingTrip;

  const bookingReady = Boolean(
    selectedTrip &&
    providerTrip &&
    matchesCurrentTrip(selectedTrip, providerTrip) &&
    fromId &&
    toId &&
    date &&
    providerSearched &&
    !loading &&
    !providerLoading &&
    !error &&
    !providerError
  );

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
    if (!tripRequestSubmitted || tripRequestSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setTripRequestSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [tripRequestSubmitted]);

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
          phone: String(profile?.phone || metadata.phone || current[0].phone),
        }, ...current.slice(1)]);
      } catch {
        if (!cancelled) setProfileLoadError(true);
      }
    };
    void loadPassengerProfile();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setRouteNames({ from: "", to: "" });
    if (!fromId || !toId || !date) {
      setError(t("booking.missingSearch"));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setProviderTrip(null);
    setSelectedTrip(null);
    setShowTripDetails(false);
    setBookingResult(null);

    const loadLocations = async () => {
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

        if (!cancelled) {
          setRouteNames({ from: displayName(fromLocation), to: displayName(toLocation) });
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

    void loadLocations();
    return () => { cancelled = true; };
  }, [fromId, toId, date, i18n.language, t]);

  useEffect(() => {
    setProviderTrip(null);
    setSelectedTrip(null);
    setProviderSearched(false);
    setProviderError("");
    setStopDetailsWarning("");
    if (!fromId || !toId || !date) {
      setProviderLoading(false);
      return;
    }
    let cancelled = false;
    setProviderLoading(true);

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("altrans-adapter", {
          body: {
            operation: "search-trips",
            fromLocationId: fromId,
            toLocationId: toId,
            travelDate: date,
            passengersCount: 1,
            currencyCode: "UAH",
            locale: languageOf(i18n.language),
          },
        });
        if (cancelled) return;
        if (error) {
          setProviderError(t("booking.providerError"));
          return;
        }
        const response = data as {
          providerError?: boolean;
          errorCode?: string;
          trip?: unknown;
          trips?: unknown[];
        } | null;
        if (response?.providerError) {
          setProviderError(t("booking.providerError"));
          return;
        }
        const providerTrip = response && isProviderTrip(response.trip)
          ? response.trip
          : response?.trips?.find(isProviderTrip) ?? null;
        if (!providerTrip) {
          setProviderTrip(null);
          setBookingError("");
          setNeedsTripRefresh(false);
          return;
        }

        let resolvedTrip = providerTrip;
        let detailsWarning = "";
        if (
          providerTrip.stops_source !== "provider_route_schedule" &&
          (providerTrip.stops?.length ?? 0) <= 2
        ) {
          try {
            const scheduledStops = await loadScheduledStops(
              providerTrip,
              fromId,
              toId,
              languageOf(i18n.language),
            );
            if (scheduledStops) {
              resolvedTrip = { ...providerTrip, stops: scheduledStops };
            } else {
              resolvedTrip = {
                ...providerTrip,
                stops: providerTrip.stops?.length ? providerTrip.stops : endpointStops(providerTrip),
              };
              detailsWarning = t("booking.itineraryLimited");
            }
          } catch (caught) {
            console.error(
              "Route stop lookup failed",
              caught instanceof Error ? caught.message : "unknown",
            );
            resolvedTrip = {
              ...providerTrip,
              stops: providerTrip.stops?.length ? providerTrip.stops : endpointStops(providerTrip),
            };
            detailsWarning = t("booking.itineraryError");
          }
        } else if (!providerTrip.stops?.length) {
          resolvedTrip = { ...providerTrip, stops: endpointStops(providerTrip) };
        }
        if (!cancelled) {
          setProviderTrip(resolvedTrip);
          setSelectedTrip(matchesCurrentTrip(pendingTrip, providerTrip) ? resolvedTrip : null);
          setStopDetailsWarning(detailsWarning);
          setBookingError("");
          setNeedsTripRefresh(false);
        }
      } catch {
        if (!cancelled) setProviderError(t("booking.providerError"));
      } finally {
        if (!cancelled) {
          setProviderSearched(true);
          setProviderLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fromId, toId, date, pendingTrip, providerSearchRevision, t]);

  const updatePassenger = (index: number, field: keyof Passenger, value: string) => {
    passengerEditedRef.current = true;
    setPassengers((current) => current.map((passenger, passengerIndex) =>
      passengerIndex === index ? { ...passenger, [field]: value } : passenger
    ));
  };

  const addPassenger = () => {
    setPassengers((current) => current.length >= 9 ? current : [...current, emptyPassenger()]);
  };

  const removePassenger = (index: number) => {
    if (index === 0) return;
    setPassengers((current) => current.filter((_, passengerIndex) => passengerIndex !== index));
  };

  const refreshTripSearch = () => {
    setProviderSearchRevision((revision) => revision + 1);
  };

  const submitTripRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!fromId || !toId || !date) return;
    if (tripRequestName.trim().length < 2 || tripRequestPhone.trim().length < 7) {
      setTripRequestError(t("booking.tripRequestFillFields"));
      return;
    }

    setTripRequestLoading(true);
    setTripRequestError("");
    try {
      const { data, error } = await supabase.functions.invoke("trip-request", {
        body: {
          fromLocationId: fromId,
          toLocationId: toId,
          travelDate: date,
          fullName: tripRequestName.trim(),
          phone: tripRequestPhone.trim(),
          locale: languageOf(i18n.language),
        },
      });
      if (error || !(data as { requestReceived?: boolean } | null)?.requestReceived) throw error ?? new Error("TRIP_REQUEST_FAILED");
      setTripRequestSubmitted(true);
      setTripRequestSeconds(120);
    } catch (caught) {
      console.error("Trip search request failed", caught);
      setTripRequestError(t("booking.tripRequestError"));
    } finally {
      setTripRequestLoading(false);
    }
  };

  const submitBooking = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTrip) return;
    if (!bookingReady) {
      setBookingError(error || providerError || t("booking.tripUnavailable"));
      return;
    }
    const contactPassenger = passengers[0];
    if (
      passengers.some((passenger) => !passenger.firstName.trim() || !passenger.lastName.trim())
      || !contactPassenger.email.trim()
      || !contactPassenger.phone.trim()
    ) {
      setBookingError(t("booking.fillPassengerFields"));
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    setBookingLoading(true);
    setBookingError("");
    setBookingResult(null);
    setShareMessage(null);
    try {
      if (!userError && userData.user) {
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update({ phone: passengers[0].phone.trim() })
          .eq("id", userData.user.id);
        if (profileUpdateError) {
          console.error("Passenger booking phone save failed", profileUpdateError.code);
        }
      }

      const { data, error } = await supabase.functions.invoke("altrans-adapter", {
        body: {
          operation: "create-booking",
          tripId: selectedTrip.trip_id,
          expectedPrice: selectedTrip.price == null ? null : Number(selectedTrip.price),
          expectedCurrency: selectedTrip.currency,
          fromLocationId: fromId,
          toLocationId: toId,
          travelDate: date,
          locale: languageOf(i18n.language),
          passengers: passengers.map((passenger) => ({
            fullName: `${passenger.firstName} ${passenger.lastName}`.trim(),
            email: contactPassenger.email,
            phone: contactPassenger.phone,
          })),
        },
      });
      if (error) {
        console.error("Booking request failed", error);
        const errorCode = await getFunctionErrorCode(error);
        if (errorCode === "PRICE_CHANGED" || errorCode === "TRIP_UNAVAILABLE") {
          setBookingError(t(
            errorCode === "PRICE_CHANGED" ? "booking.tripPriceChanged" : "booking.tripUnavailable",
          ));
          setSelectedTrip(null);
          setProviderTrip(null);
          setProviderSearched(false);
          setNeedsTripRefresh(true);
          return;
        }
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
        claimToken?: string | null;
      };
      if (!response?.bookingNumber) {
        setBookingError(
          response?.errorCode === "TRIP_UNAVAILABLE"
            ? t("booking.tripUnavailable")
            : response?.errorCode === "PRICE_CHANGED"
              ? t("booking.tripPriceChanged")
            : t("booking.bookingError"),
        );
        return;
      }
      setBookingResult({
        bookingId: response.bookingId ?? "",
        bookingNumber: response.bookingNumber,
        totalAmount: response.totalAmount ?? 0,
        currency: response.currency ?? "UAH",
        expiresAt: response.expiresAt ?? null,
        claimToken: response.claimToken ?? null,
      });
      setNeedsTripRefresh(false);
      if (response.claimToken && response.bookingId) {
        localStorage.setItem("busnet_pending_claim", JSON.stringify({
          bookingId: response.bookingId,
          claimToken: response.claimToken,
          email: passengers[0].email.trim(),
          fullName: `${passengers[0].firstName} ${passengers[0].lastName}`.trim(),
          phone: passengers[0].phone.trim(),
        }));
      }
    } catch (caught) {
      console.error("Booking request failed", caught);
      setBookingError(t("booking.bookingError"));
    } finally {
      setBookingLoading(false);
    }
  };

  const downloadTicket = () => {
    if (!bookingResult || !selectedTrip) return;
    const passengerNames = passengers
      .map((passenger) => `${escapeHtml(passenger.firstName)} ${escapeHtml(passenger.lastName)}`)
      .join("<br>");
    const ticketHtml = `<!doctype html>
<html lang="${escapeHtml(languageOf(i18n.language))}"><head><meta charset="utf-8"><title>${escapeHtml(bookingResult.bookingNumber)}</title>
<style>body{font-family:Arial,sans-serif;max-width:720px;margin:40px auto;padding:24px;color:#172033}article{border:2px solid #087DFF;border-radius:16px;padding:24px}h1{color:#087DFF}.row{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #ddd;padding:10px 0}.status{background:#fff7e6;color:#8a4b00;padding:10px;border-radius:8px}@media print{button{display:none}}</style></head>
<body><article><h1>BUSNET</h1><h2>${escapeHtml(t("booking.ticketTitle"))}</h2>
<div class="row"><strong>${escapeHtml(t("booking.bookingNumber"))}</strong><span>${escapeHtml(bookingResult.bookingNumber)}</span></div>
<div class="row"><strong>${escapeHtml(t("booking.route"))}</strong><span>${escapeHtml(routeNames.from)} → ${escapeHtml(routeNames.to)}</span></div>
<div class="row"><strong>${escapeHtml(t("booking.date"))}</strong><span>${escapeHtml(date)} · ${escapeHtml(selectedTrip.departure_time)} — ${escapeHtml(selectedTrip.arrival_time)}</span></div>
<div class="row"><strong>${escapeHtml(t("booking.passengerDetails"))}</strong><span>${passengerNames}<br>${escapeHtml(passengers[0].email)}<br>${escapeHtml(passengers[0].phone)}</span></div>
<div class="row"><strong>${escapeHtml(t("booking.carrier"))}</strong><span>${escapeHtml(selectedTrip.carrier)}${selectedTrip.bus_number ? ` · ${escapeHtml(selectedTrip.bus_number)}` : ""}</span></div>
<div class="row"><strong>${escapeHtml(t("booking.total"))}</strong><span>${escapeHtml(bookingResult.totalAmount)} ${escapeHtml(bookingResult.currency)}</span></div>
<p class="status">${escapeHtml(t("booking.ticketNotConfirmed"))}</p></article></body></html>`;
    const blob = new Blob([ticketHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${bookingResult.bookingNumber}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const shareTicket = async () => {
    if (!bookingResult) return;
    const text = `${t("booking.bookingNumber")}: ${bookingResult.bookingNumber}\n${routeNames.from} → ${routeNames.to}\n${date} · ${selectedTrip?.departure_time ?? ""}`;
    setShareMessage(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: "BUSNET", text });
        setShareMessage("shared");
        return;
      }
      if (!navigator.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
      await navigator.clipboard.writeText(text);
      setShareMessage("copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareMessage("shareFailed");
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
    <section className="booking-page" style={{ color: tokens.colorText }}>
      <h1 className="booking-page__title">{t("booking.title")}</h1>
      {routeNames.from && routeNames.to && (
        <p className="booking-page__route" style={{ color: tokens.colorTextSecondary }}>
          {routeNames.from} → {routeNames.to} · {date}
        </p>
      )}

      {(loading || providerLoading) && (
        <div className="booking-searching" role="status" aria-live="polite">
          <div className="booking-searching__route" aria-hidden="true">
            <span className="booking-searching__stop booking-searching__stop--origin">
              <MapPin className="booking-searching__pin" size={20} />
            </span>
            <div className="booking-searching__road">
              <span className="booking-searching__bus"><BusFront size={22} /></span>
            </div>
            <span className="booking-searching__stop booking-searching__stop--destination">
              <MapPin className="booking-searching__pin" size={20} />
            </span>
          </div>
          <p className="booking-searching__message">{t("booking.searchingTrip")}</p>
          <div className="booking-searching__preview" aria-hidden="true">
            <span className="booking-searching__skeleton booking-searching__skeleton--title" />
            <span className="booking-searching__skeleton booking-searching__skeleton--details" />
            <span className="booking-searching__skeleton booking-searching__skeleton--price" />
          </div>
        </div>
      )}
      {!loading && error && <p style={{ color: tokens.colorTextSecondary }}>{error}</p>}

      {!providerLoading && providerError && <p style={{ color: tokens.colorWarning }}>{providerError}</p>}
      {providerSearched && !providerLoading && !providerTrip && (
        <div className="trip-request-card">
          <div className="trip-request-card__title">{t("booking.noTripTitle")}</div>
          <p className="trip-request-card__subtitle">{t("booking.noTripSubtitle")}</p>
          <div className="trip-request-card__route" aria-label={t("booking.tripRequestRoute")}>
            <span>{routeNames.from || t("booking.tripRequestFrom")}</span>
            <span>{routeNames.to || t("booking.tripRequestTo")}</span>
            <time>{date}</time>
          </div>

          {tripRequestSubmitted ? (
            <div className="trip-request-card__success" role="status" aria-live="polite">
              <strong>{t("booking.tripRequestSent")}</strong>
              <p>{t("booking.tripRequestWaiting")}</p>
              <div className="trip-request-card__countdown">
                <span>{t("booking.tripRequestCountdown")}</span>
                <strong>
                  {`${Math.floor(tripRequestSeconds / 60)}:${String(tripRequestSeconds % 60).padStart(2, "0")}`}
                </strong>
              </div>
            </div>
          ) : (
            <form className="trip-request-card__form" onSubmit={submitTripRequest}>
              <label>
                <span>{t("booking.tripRequestName")}</span>
                <input
                  autoComplete="name"
                  value={tripRequestName}
                  onChange={(event) => setTripRequestName(event.target.value)}
                  placeholder={t("booking.tripRequestNamePlaceholder")}
                  maxLength={100}
                />
              </label>
              <label>
                <span>{t("booking.tripRequestPhone")}</span>
                <input
                  autoComplete="tel"
                  inputMode="tel"
                  type="tel"
                  value={tripRequestPhone}
                  onChange={(event) => setTripRequestPhone(event.target.value)}
                  placeholder="+380 XX XXX-XX-XX"
                  maxLength={32}
                />
              </label>
              {tripRequestError && <p className="trip-request-card__error" role="alert">{tripRequestError}</p>}
              <button type="submit" disabled={tripRequestLoading}>
                {tripRequestLoading ? t("booking.tripRequestSending") : t("booking.tripRequestSubmit")}
              </button>
            </form>
          )}
        </div>
      )}
      {profileLoadError && selectedTrip && (
        <p role="status" style={{ color: tokens.colorWarning }}>{t("booking.profileLoadError")}</p>
      )}
      {selectedTrip && authLoading && <p role="status">{t("booking.checkingAccount")}</p>}
      {!providerLoading && providerTrip && (
        <div style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "12px" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "8px 0 0" }}>{t("booking.availableTrips")}</h2>
          <article style={{ padding: "16px", borderRadius: "14px", border: `2px solid ${tokens.colorBorder}`, background: tokens.colorBgCard, color: tokens.colorText }}>
            <div className="booking-page__trip-summary" style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <strong>{providerTrip.departure_time} → {providerTrip.arrival_time}</strong>
              <strong>
                {providerTrip.price == null
                  ? t("booking.priceUnavailable")
                  : `${Number(providerTrip.price)} ${providerTrip.currency}`}
              </strong>
            </div>
            <div style={{ color: tokens.colorTextSecondary, marginTop: "6px" }}>
              {providerTrip.carrier}{providerTrip.bus_number ? ` · ${providerTrip.bus_number}` : ""}
            </div>
            <div className="booking-page__trip-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
              <button
                type="button"
                aria-expanded={showTripDetails}
                onClick={() => setShowTripDetails((showDetails) => !showDetails)}
                style={{ padding: "9px 14px", border: `1px solid ${tokens.colorBorder}`, borderRadius: "9px", background: "transparent", color: tokens.colorText, fontWeight: 700, cursor: "pointer" }}
              >
                {showTripDetails ? t("booking.hideDetails") : t("booking.showDetails")}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedTrip(providerTrip); setBookingResult(null); setBookingError(""); setShareMessage(null); }}
                style={{ padding: "9px 14px", border: 0, borderRadius: "9px", background: "#087DFF", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                {t("booking.bookTrip")}
              </button>
            </div>
            {showTripDetails && (
              <>
                {stopDetailsWarning && (
                  <p role="status" style={{ margin: "14px 0 0", color: tokens.colorWarning }}>
                    {stopDetailsWarning}
                  </p>
                )}
                <ol style={{ display: "grid", gap: "14px", margin: "18px 0 0", paddingLeft: "24px" }}>
                {(providerTrip.stops?.length ? providerTrip.stops : endpointStops(providerTrip)).map((stop, index) => (
                  <li key={`${stop.city}-${index}`} style={{ paddingLeft: "4px" }}>
                    <strong>{stop.city}</strong>
                    {stop.place && <div style={{ color: tokens.colorTextSecondary }}>{stop.place}</div>}
                    {stop.arrival_time && (
                      <div style={{ color: tokens.colorTextSecondary }}>
                        {t("booking.stopArrival")}: {[stop.arrival_date, stop.arrival_time].filter(Boolean).join(" ")}
                      </div>
                    )}
                    {stop.departure_time && (
                      <div style={{ color: tokens.colorTextSecondary }}>
                        {t("booking.stopDeparture")}: {[stop.departure_date, stop.departure_time].filter(Boolean).join(" ")}
                      </div>
                    )}
                  </li>
                ))}
                </ol>
              </>
            )}
          </article>
        </div>
      )}

      {selectedTrip && (
        <form onSubmit={submitBooking} style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "12px", padding: "18px", borderRadius: "14px", border: `1px solid ${tokens.colorBorder}`, background: tokens.colorBgCard, boxSizing: "border-box" }}>
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>{t("booking.passengerDetails")}</h2>
          {passengers.length > 1 && <p style={{ color: tokens.colorTextSecondary, fontSize: "0.85rem" }}>{t("booking.contactShared")}</p>}
          {passengers.map((passenger, index) => (
            <fieldset
              key={index}
              style={{
                display: "grid",
                gap: "10px",
                border: 0,
                borderTop: `1px solid ${tokens.colorBorder}`,
                paddingTop: "12px",
              }}
            >
              <legend style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "0 8px 0 0", fontSize: "0.9rem", fontWeight: 700 }}>
                <span>{t("booking.passengerNumber", { number: index + 1 })}</span>
                {index > 0 && (
                  <button
                    type="button"
                    aria-label={t("booking.removePassenger", { number: index + 1 })}
                    onClick={() => removePassenger(index)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: tokens.colorTextSecondary, fontSize: "0.8rem" }}
                  >
                    <X size={14} aria-hidden="true" />
                    {t("booking.removePassengerLabel")}
                  </button>
                )}
              </legend>
              {([
                ["firstName", "firstName"],
                ["lastName", "lastName"],
              ] as const).map(([field, key]) => (
                <label key={field} style={{ display: "grid", gap: "6px", color: tokens.colorTextSecondary }}>
                  {t(`booking.${key}`)}
                  <input
                    required
                    type="text"
                    value={passenger[field]}
                    onChange={(event) => updatePassenger(index, field, event.target.value)}
                    style={inputStyle}
                  />
                </label>
              ))}
              {index === 0 && ([
                ["email", "email"],
                ["phone", "phone"],
              ] as const).map(([field, key]) => (
                <label key={field} style={{ display: "grid", gap: "6px", color: tokens.colorTextSecondary }}>
                  {t(`booking.${key}`)}
                  <input
                    required
                    type={field === "email" ? "email" : "tel"}
                    value={passenger[field]}
                    onChange={(event) => updatePassenger(index, field, event.target.value)}
                    style={inputStyle}
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <button
            type="button"
            disabled={passengers.length >= 9}
            onClick={addPassenger}
            style={{
              display: "inline-flex",
              width: "fit-content",
              minHeight: "42px",
              alignItems: "center",
              gap: "8px",
              padding: "0 12px",
              border: `1px solid ${tokens.colorBorder}`,
              borderRadius: "10px",
              color: tokens.colorText,
              fontWeight: 700,
              opacity: passengers.length >= 9 ? 0.55 : 1,
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {t("booking.addPassenger")}
          </button>
          <p style={{ color: tokens.colorTextSecondary, fontSize: "0.78rem" }}>{t("booking.passengerLimit")}</p>
          <button
            type="submit"
            disabled={bookingLoading || !bookingReady}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: 0,
              background: "#087DFF",
              color: "#fff",
              fontWeight: 700,
              cursor: bookingLoading || !bookingReady ? "wait" : "pointer",
            }}
          >
            {bookingLoading ? t("booking.bookingLoading") : t("booking.confirmBooking")}
          </button>
        </form>
      )}

      {bookingError && <p role="alert" style={{ color: tokens.colorWarning }}>{bookingError}</p>}
      {needsTripRefresh && (
        <button
          disabled={loading || providerLoading}
          onClick={refreshTripSearch}
          style={{
            padding: "10px 14px",
            border: `1px solid ${tokens.colorBorder}`,
            borderRadius: "9px",
            background: "transparent",
            color: tokens.colorText,
            fontWeight: 700,
            cursor: loading || providerLoading ? "wait" : "pointer",
          }}
          type="button"
        >
          {t("booking.refreshTripSearch")}
        </button>
      )}
      {bookingResult && (
        <div role="status" style={{ width: "100%", maxWidth: "760px", padding: "18px", borderRadius: "14px", border: "1px solid #22C55E", background: tokens.colorBgCard, boxSizing: "border-box" }}>
          <strong>{t("booking.bookingCreated")}</strong>
          <p>{t("booking.pendingAdminConfirmation")}</p>
          <div>{t("booking.bookingNumber")}: {bookingResult.bookingNumber}</div>
          <div>{t("booking.total")}: {bookingResult.totalAmount} {bookingResult.currency}</div>
          {bookingResult.expiresAt && <div style={{ color: tokens.colorTextSecondary }}>{t("booking.expiresAt")}: {new Date(bookingResult.expiresAt).toLocaleString()}</div>}
          <p style={{ color: tokens.colorTextSecondary }}>{t("booking.activateAccountHint")}</p>
          <div className="booking-page__booking-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
            {bookingResult.claimToken && !isAuthenticated && (
              <button type="button" onClick={() => navigate("/register", {
                state: {
                  from: { pathname: "/account" },
                  pendingBooking: {
                    bookingId: bookingResult.bookingId,
                    claimToken: bookingResult.claimToken,
                  },
                },
              })} style={{ padding: "11px 14px", border: 0, borderRadius: "9px", background: "#087DFF", color: "#fff", fontWeight: 700 }}>
                {t("booking.activateAccount")}
              </button>
            )}
            {isAuthenticated && (
              <button type="button" onClick={() => navigate("/account")} style={{ padding: "11px 14px", border: 0, borderRadius: "9px", background: "#087DFF", color: "#fff", fontWeight: 700 }}>
                {t("booking.openAccount")}
              </button>
            )}
            <button type="button" onClick={downloadTicket} style={{ padding: "11px 14px", border: `1px solid ${tokens.colorBorder}`, borderRadius: "9px", background: "transparent", color: tokens.colorText, fontWeight: 700 }}>
              {t("booking.downloadTicket")}
            </button>
            <button type="button" onClick={() => void shareTicket()} style={{ padding: "11px 14px", border: `1px solid ${tokens.colorBorder}`, borderRadius: "9px", background: "transparent", color: tokens.colorText, fontWeight: 700 }}>
              {t("booking.shareTicket")}
            </button>
          </div>
          {shareMessage && (
            <p
              role={shareMessage === "shareFailed" ? "alert" : "status"}
              aria-live={shareMessage === "shareFailed" ? "assertive" : "polite"}
              style={{ marginBottom: 0, color: shareMessage === "shareFailed" ? tokens.colorWarning : "#15803D" }}
            >
              {t(`booking.${shareMessage}`)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
