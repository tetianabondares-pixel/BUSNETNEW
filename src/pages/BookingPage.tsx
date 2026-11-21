import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";

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
  stops?: Array<{
    city: string;
    place: string;
    arrival_date: string | null;
    arrival_time: string | null;
    departure_date: string | null;
    departure_time: string | null;
  }>;
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
  const [providerTrip, setProviderTrip] = useState<ProviderTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerSearched, setProviderSearched] = useState(false);
  const [error, setError] = useState("");
  const [providerError, setProviderError] = useState("");
  const [showTripDetails, setShowTripDetails] = useState(false);
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
          phone: String(profile?.phone || metadata.phone || current[0].phone),
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
    setShowTripDetails(false);
    if (!isProviderTrip(pendingTrip)) setSelectedTrip(null);
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
  }, [fromId, toId, date, i18n.language, pendingTrip, t]);

  useEffect(() => {
    setProviderTrip(null);
    setProviderSearched(false);
    setProviderError("");
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
        const response = data as { providerError?: boolean; errorCode?: string; trip?: ProviderTrip | null } | null;
        if (response?.providerError) {
          setProviderError(t("booking.providerError"));
          return;
        }
        setProviderTrip(response?.trip && isProviderTrip(response.trip) ? response.trip : null);
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
  }, [fromId, toId, date, t]);

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
      const { data: updatedProfile, error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ phone: passengers[0].phone.trim() })
        .eq("id", userData.user.id)
        .select("id")
        .maybeSingle();
      if (profileUpdateError || !updatedProfile) {
        console.error(
          "Passenger booking phone save failed",
          profileUpdateError?.code ?? "PROFILE_NOT_FOUND",
        );
        setBookingError(t("booking.profilePhoneSaveError"));
        return;
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
            : response?.errorCode === "PRICE_CHANGED"
              ? t("booking.tripPriceChanged")
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

      {providerLoading && <p style={{ color: tokens.colorTextSecondary }}>{t("booking.loadingLive")}</p>}
      {providerError && <p style={{ color: tokens.colorWarning }}>{providerError}</p>}
      {providerSearched && !providerLoading && !providerError && !providerTrip && (
        <p style={{ color: tokens.colorTextSecondary }}>{t("booking.noProviderTrips")}</p>
      )}
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

      {!providerLoading && providerTrip && (
        <div style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "12px" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "8px 0 0" }}>{t("booking.availableTrips")}</h2>
          <article style={{ padding: "16px", borderRadius: "14px", border: `2px solid ${tokens.colorBorder}`, background: tokens.colorBgCard, color: tokens.colorText }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
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
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
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
                onClick={() => { setSelectedTrip(providerTrip); setBookingResult(null); setBookingError(""); }}
                style={{ padding: "9px 14px", border: 0, borderRadius: "9px", background: "#087DFF", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                {t("booking.bookTrip")}
              </button>
            </div>
            {showTripDetails && (
              <ol style={{ display: "grid", gap: "14px", margin: "18px 0 0", paddingLeft: "24px" }}>
                {(providerTrip.stops ?? []).map((stop, index) => (
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
            )}
          </article>
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
