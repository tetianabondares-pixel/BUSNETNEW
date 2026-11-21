import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme";
import "./PassengerAccountPage.css";

type Booking = {
  id: string;
  booking_number: string;
  trip_id: string;
  status: string;
  currency: string;
  total_amount: number | string;
  expires_at: string | null;
  created_at: string;
  confirmed_at: string | null;
};

type Trip = {
  id: string;
  route_id: string;
  departure_at: string;
  arrival_at: string | null;
};

type Route = {
  id: string;
  from_location_id: string;
  to_location_id: string;
};

type Location = {
  id: string;
  name_uk: string;
  name_en: string | null;
  name_it: string | null;
};

type CancellationRequest = {
  booking_id: string;
  status: "new" | "in_progress" | "resolved";
  created_at: string;
};

type AccountBooking = Booking & {
  departureAt: string | null;
  arrivalAt: string | null;
  fromName: string;
  toName: string;
  cancellationRequest: CancellationRequest | null;
};

type ProfileForm = {
  fullName: string;
  email: string;
  phone: string;
  locale: "uk" | "en" | "it";
};

const emptyProfile: ProfileForm = {
  fullName: "",
  email: "",
  phone: "",
  locale: "uk",
};

function languageOf(language: string): ProfileForm["locale"] {
  return language.startsWith("en") ? "en" : language.startsWith("it") ? "it" : "uk";
}

function isProfileLocale(value: unknown): value is ProfileForm["locale"] {
  return value === "uk" || value === "en" || value === "it";
}

export function PassengerAccountPage() {
  const { t, i18n } = useTranslation();
  const { tokens } = useTheme();
  const navigate = useNavigate();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [now] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<"trips" | "profile">("trips");
  const [bookings, setBookings] = useState<AccountBooking[]>([]);
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [actionError, setActionError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [cancellationBooking, setCancellationBooking] = useState<AccountBooking | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationError, setCancellationError] = useState("");
  const [sendingCancellation, setSendingCancellation] = useState(false);
  const cancellationReasonRef = useRef<HTMLTextAreaElement>(null);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const user = userData.user;
      if (!user) throw new Error("AUTH_REQUIRED");

      const metadataLocale = isProfileLocale(user.user_metadata?.preferred_locale)
        ? user.user_metadata.preferred_locale
        : isProfileLocale(user.user_metadata?.preferred_language)
          ? user.user_metadata.preferred_language
          : languageOf(i18n.language);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("full_name,email,preferred_locale,phone")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;

      const preferredLocale = profileData?.preferred_locale;
      const accountProfile: ProfileForm = {
        fullName: profileData?.full_name ?? "",
        email: user.email ?? profileData?.email ?? "",
        phone: String(profileData?.phone ?? user.user_metadata?.phone ?? ""),
        locale: isProfileLocale(preferredLocale)
          ? preferredLocale
          : metadataLocale,
      };
      setProfile(accountProfile);

      if (profileData && user.email && profileData.email !== user.email) {
        const { error } = await supabase
          .from("profiles")
          .update({ email: user.email })
          .eq("id", user.id);
        if (error) throw error;
      }

      const { data: bookingRows, error: bookingsError } = await supabase
        .from("bookings")
        .select("id,booking_number,trip_id,status,currency,total_amount,expires_at,created_at,confirmed_at")
        .eq("passenger_id", user.id)
        .order("created_at", { ascending: false });
      if (bookingsError) throw bookingsError;
      const bookingList = (bookingRows ?? []) as Booking[];
      if (bookingList.length === 0) {
        setBookings([]);
        return;
      }

      const tripIds = [...new Set(bookingList.map((booking) => booking.trip_id))];
      const { data: tripRows, error: tripsError } = await supabase
        .from("trips")
        .select("id,route_id,departure_at,arrival_at")
        .in("id", tripIds);
      if (tripsError) throw tripsError;
      const tripList = (tripRows ?? []) as Trip[];
      const routeIds = [...new Set(tripList.map((trip) => trip.route_id))];
      const { data: routeRows, error: routesError } = routeIds.length
        ? await supabase
          .from("routes")
          .select("id,from_location_id,to_location_id")
          .in("id", routeIds)
        : { data: [], error: null };
      if (routesError) throw routesError;
      const routeList = (routeRows ?? []) as Route[];
      const locationIds = [...new Set(routeList.flatMap((route) => [
        route.from_location_id,
        route.to_location_id,
      ]))];
      const { data: locationRows, error: locationsError } = locationIds.length
        ? await supabase
          .from("locations")
          .select("id,name_uk,name_en,name_it")
          .in("id", locationIds)
        : { data: [], error: null };
      if (locationsError) throw locationsError;
      const locationList = (locationRows ?? []) as Location[];

      const bookingIds = bookingList.map((booking) => booking.id);
      const { data: cancellationRows, error: cancellationsError } = await supabase
        .from("booking_cancellation_requests")
        .select("booking_id,status,created_at")
        .in("booking_id", bookingIds)
        .in("status", ["new", "in_progress"]);
      if (cancellationsError) throw cancellationsError;

      const nameOf = (id: string) => {
        const item = locationList.find((location) => location.id === id);
        if (!item) return "";
        return accountProfile.locale === "en"
          ? item.name_en ?? item.name_uk
          : accountProfile.locale === "it"
            ? item.name_it ?? item.name_en ?? item.name_uk
            : item.name_uk;
      };
      const tripById = new Map(tripList.map((trip) => [trip.id, trip]));
      const routeById = new Map(routeList.map((route) => [route.id, route]));
      const cancellationByBooking = new Map(
        ((cancellationRows ?? []) as CancellationRequest[]).map((request) => [
          request.booking_id,
          request,
        ]),
      );

      setBookings(bookingList.map((booking) => {
        const trip = tripById.get(booking.trip_id);
        const route = trip ? routeById.get(trip.route_id) : undefined;
        return {
          ...booking,
          departureAt: trip?.departure_at ?? null,
          arrivalAt: trip?.arrival_at ?? null,
          fromName: route ? nameOf(route.from_location_id) : "",
          toName: route ? nameOf(route.to_location_id) : "",
          cancellationRequest: cancellationByBooking.get(booking.id) ?? null,
        };
      }));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [i18n.language]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (!cancellationBooking) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCancellationBooking(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => cancellationReasonRef.current?.focus());
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [cancellationBooking]);

  const { upcomingBookings, pastBookings } = useMemo(() => {
    const upcoming: AccountBooking[] = [];
    const past: AccountBooking[] = [];
    for (const booking of bookings) {
      if (booking.departureAt && new Date(booking.departureAt).getTime() < now) {
        past.push(booking);
      } else {
        upcoming.push(booking);
      }
    }
    return { upcomingBookings: upcoming, pastBookings: past };
  }, [bookings, now]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError("");
    setProfileMessage("");
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("AUTH_REQUIRED");

      const currentEmail = userData.user.email ?? "";
      const emailChanged = profile.email.trim().toLowerCase() !== currentEmail.toLowerCase();
      if (emailChanged) {
        const { error } = await supabase.auth.updateUser({ email: profile.email.trim() });
        if (error) throw error;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.fullName.trim(),
          email: currentEmail,
          phone: profile.phone.trim() || null,
          preferred_locale: profile.locale,
        })
        .eq("id", userData.user.id);
      if (error) throw error;

      await i18n.changeLanguage(profile.locale);
      setProfileMessage(emailChanged
        ? t("account.profile.emailConfirmation")
        : t("account.profile.saved"));
    } catch {
      setProfileError(t("account.profile.saveError"));
    } finally {
      setSavingProfile(false);
    }
  };

  const submitCancellation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cancellationBooking) return;
    setSendingCancellation(true);
    setCancellationError("");
    try {
      const { data, error } = await supabase.rpc("request_booking_cancellation", {
        p_booking_id: cancellationBooking.id,
        p_reason: cancellationReason.trim(),
      });
      if (error || !data?.length) throw error ?? new Error("REQUEST_FAILED");
      setCancellationBooking(null);
      setCancellationReason("");
      await loadAccount();
    } catch {
      setCancellationError(t("account.cancellation.error"));
    } finally {
      setSendingCancellation(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      setActionError(t("account.signOutError"));
      return;
    }
    navigate("/login", { replace: true });
  };

  const dateTime = (value: string | null) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : t("account.trips.notAvailable");

  const statusLabel = (status: string) => {
    const key = ["pending", "confirmed", "cancelled", "expired", "refunded"].includes(status)
      ? status
      : "unknown";
    return t(`account.trips.status.${key}`);
  };

  const renderBooking = (booking: AccountBooking) => {
    const expiredPending = booking.status === "pending" &&
      booking.expires_at != null &&
      new Date(booking.expires_at).getTime() <= now;
    const displayStatus = expiredPending ? "expired" : booking.status;
    const canRequestCancellation = (booking.status === "confirmed" ||
      (booking.status === "pending" && !expiredPending)) &&
      !booking.cancellationRequest;
    return (
      <article className="passenger-account__booking" key={booking.id}>
        <div className="passenger-account__booking-top">
          <div>
            <p className="passenger-account__booking-number">
              {t("account.trips.bookingNumber")}: <strong>{booking.booking_number}</strong>
            </p>
            <h3>
              {booking.fromName || "—"} <span aria-hidden="true">→</span> {booking.toName || "—"}
            </h3>
          </div>
          <span className={`passenger-account__status passenger-account__status--${displayStatus}`}>
            {statusLabel(displayStatus)}
          </span>
        </div>

        <dl className="passenger-account__trip-details">
          <div>
            <dt>{t("account.trips.departure")}</dt>
            <dd>{dateTime(booking.departureAt)}</dd>
          </div>
          {booking.arrivalAt && (
            <div>
              <dt>{t("account.trips.arrival")}</dt>
              <dd>{dateTime(booking.arrivalAt)}</dd>
            </div>
          )}
          <div>
            <dt>{t("account.trips.total")}</dt>
            <dd>{Number(booking.total_amount).toLocaleString(locale)} {booking.currency}</dd>
          </div>
        </dl>

        {booking.status === "pending" && !expiredPending && (
          <p className="passenger-account__pending-note">{t("account.trips.pendingNote")}</p>
        )}
        {booking.cancellationRequest && (
          <p className="passenger-account__request-note">
            {t(`account.cancellation.status.${booking.cancellationRequest.status}`)}
          </p>
        )}
        {canRequestCancellation && (
          <button
            className="passenger-account__text-button"
            onClick={() => {
              setCancellationBooking(booking);
              setCancellationError("");
            }}
            type="button"
          >
            {t("account.cancellation.open")}
          </button>
        )}
      </article>
    );
  };

  return (
    <section className="passenger-account" style={{ color: tokens.colorText }}>
      <div className="passenger-account__container">
        <header className="passenger-account__header">
          <div>
            <p className="passenger-account__eyebrow">{t("account.eyebrow")}</p>
            <h1>{t("account.title")}</h1>
          </div>
          <button
            className="passenger-account__signout"
            disabled={signingOut}
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut size={17} />
            {t(signingOut ? "account.signingOut" : "account.signOut")}
          </button>
        </header>
        {actionError && <p className="passenger-account__form-error" role="alert">{actionError}</p>}

        <div className="passenger-account__tabs" role="tablist" aria-label={t("account.tabsLabel")}>
          <button
            aria-selected={activeTab === "trips"}
            className={activeTab === "trips" ? "is-active" : ""}
            id="account-tab-trips"
            onClick={() => setActiveTab("trips")}
            role="tab"
            type="button"
          >
            {t("account.trips.title")}
          </button>
          <button
            aria-selected={activeTab === "profile"}
            className={activeTab === "profile" ? "is-active" : ""}
            id="account-tab-profile"
            onClick={() => setActiveTab("profile")}
            role="tab"
            type="button"
          >
            {t("account.profile.title")}
          </button>
        </div>

        {activeTab === "trips" ? (
          <div aria-labelledby="account-tab-trips" className="passenger-account__panel" role="tabpanel">
            {loading && <p className="passenger-account__message">{t("account.loading")}</p>}
            {!loading && loadError && (
              <div className="passenger-account__message passenger-account__message--error" role="alert">
                <p>{t("account.loadError")}</p>
                <button className="passenger-account__text-button" onClick={() => void loadAccount()} type="button">
                  {t("account.retry")}
                </button>
              </div>
            )}
            {!loading && !loadError && bookings.length === 0 && (
              <div className="passenger-account__empty">
                <h2>{t("account.trips.emptyTitle")}</h2>
                <p>{t("account.trips.emptyDescription")}</p>
              </div>
            )}
            {!loading && !loadError && bookings.length > 0 && (
              <div className="passenger-account__booking-groups">
                <section aria-labelledby="upcoming-trips-title">
                  <h2 id="upcoming-trips-title">{t("account.trips.upcoming")}</h2>
                  {upcomingBookings.length
                    ? upcomingBookings.map(renderBooking)
                    : <p className="passenger-account__muted">{t("account.trips.noUpcoming")}</p>}
                </section>
                <section aria-labelledby="past-trips-title">
                  <h2 id="past-trips-title">{t("account.trips.past")}</h2>
                  {pastBookings.length
                    ? pastBookings.map(renderBooking)
                    : <p className="passenger-account__muted">{t("account.trips.noPast")}</p>}
                </section>
              </div>
            )}
          </div>
        ) : (
          <div aria-labelledby="account-tab-profile" className="passenger-account__panel" role="tabpanel">
            <form className="passenger-account__profile-form" onSubmit={saveProfile}>
              <label>
                {t("account.profile.fullName")}
                <input
                  autoComplete="name"
                  maxLength={120}
                  onChange={(event) => setProfile((current) => ({ ...current, fullName: event.target.value }))}
                  required
                  value={profile.fullName}
                />
              </label>
              <label>
                {t("account.profile.email")}
                <input
                  autoComplete="email"
                  onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))}
                  required
                  type="email"
                  value={profile.email}
                />
              </label>
              <label>
                {t("account.profile.phone")}
                <input
                  autoComplete="tel"
                  maxLength={32}
                  onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))}
                  type="tel"
                  value={profile.phone}
                />
              </label>
              <label>
                {t("account.profile.language")}
                <select
                  onChange={(event) => setProfile((current) => ({
                    ...current,
                    locale: event.target.value as ProfileForm["locale"],
                  }))}
                  value={profile.locale}
                >
                  <option value="uk">{t("account.profile.languages.uk")}</option>
                  <option value="en">{t("account.profile.languages.en")}</option>
                  <option value="it">{t("account.profile.languages.it")}</option>
                </select>
              </label>
              {profileError && <p className="passenger-account__form-error" role="alert">{profileError}</p>}
              {profileMessage && <p className="passenger-account__form-success" role="status">{profileMessage}</p>}
              <button className="passenger-account__primary-button" disabled={savingProfile} type="submit">
                {t(savingProfile ? "account.profile.saving" : "account.profile.save")}
              </button>
            </form>
          </div>
        )}
      </div>

      {cancellationBooking && (
        <div className="passenger-account__modal-backdrop" onMouseDown={() => setCancellationBooking(null)}>
          <section
            aria-labelledby="cancel-request-title"
            aria-modal="true"
            className="passenger-account__modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button
              aria-label={t("account.cancellation.close")}
              className="passenger-account__modal-close"
              onClick={() => setCancellationBooking(null)}
              type="button"
            >
              <X size={20} />
            </button>
            <h2 id="cancel-request-title">{t("account.cancellation.title")}</h2>
            <p>{t("account.cancellation.explanation")}</p>
            <p className="passenger-account__modal-booking">
              {t("account.trips.bookingNumber")}: <strong>{cancellationBooking.booking_number}</strong>
            </p>
            <form onSubmit={submitCancellation}>
              <label>
                {t("account.cancellation.reason")}
                <textarea
                  maxLength={1000}
                  onChange={(event) => setCancellationReason(event.target.value)}
                  ref={cancellationReasonRef}
                  rows={3}
                  value={cancellationReason}
                />
              </label>
              {cancellationError && <p className="passenger-account__form-error" role="alert">{cancellationError}</p>}
              <div className="passenger-account__modal-actions">
                <button
                  className="passenger-account__secondary-button"
                  onClick={() => setCancellationBooking(null)}
                  type="button"
                >
                  {t("account.cancellation.keep")}
                </button>
                <button className="passenger-account__primary-button" disabled={sendingCancellation} type="submit">
                  {t(sendingCancellation ? "account.cancellation.sending" : "account.cancellation.submit")}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
