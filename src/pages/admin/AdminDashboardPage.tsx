import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Mail,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Settings,
  Star,
  TicketCheck,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import "./AdminDashboardPage.css";

type Tab = "overview" | "bookings" | "passengers" | "cancellations" | "catalog" | "routes" | "locations" | "popular" | "content" | "audit" | "settings";
type AdminRole = "super_admin" | "admin" | "content_manager" | "support" | "provider_operator";
type DataSection = "stats" | "bookings" | "passengers" | "cancellations" | "providerLogs" | "routes" | "locations" | "popularRoutes" | "publicContent" | "auditLogs" | "settings" | "notifications";

const ADMIN_PATHS: Record<string, Tab> = {
  "/admin/bookings": "bookings",
  "/admin/passengers": "passengers",
  "/admin/cancellations": "cancellations",
  "/admin/catalog": "catalog",
  "/admin/routes": "routes",
  "/admin/locations": "locations",
  "/admin/popular-routes": "popular",
  "/admin/content": "content",
  "/admin/audit": "audit",
  "/admin/settings": "settings",
};

const ROLE_TABS: Record<AdminRole, Tab[]> = {
  super_admin: ["overview", "bookings", "passengers", "cancellations", "catalog", "routes", "locations", "popular", "content", "audit", "settings"],
  admin: ["overview", "bookings", "passengers", "cancellations", "catalog", "routes", "locations", "popular", "content", "audit", "settings"],
  content_manager: ["locations", "popular", "content"],
  support: ["overview", "bookings", "passengers", "cancellations", "audit"],
  provider_operator: ["catalog", "routes", "locations"],
};

const TAB_PATHS: Record<Tab, string> = {
  overview: "/admin",
  bookings: "/admin/bookings",
  passengers: "/admin/passengers",
  cancellations: "/admin/cancellations",
  catalog: "/admin/catalog",
  routes: "/admin/routes",
  locations: "/admin/locations",
  popular: "/admin/popular-routes",
  content: "/admin/content",
  audit: "/admin/audit",
  settings: "/admin/settings",
};

type CancellationRow = {
  id: string;
  booking_id: string;
  passenger_id: string;
  reason: string;
  status: "new" | "in_progress" | "resolved";
  resolution: "approved" | "rejected" | null;
  resolution_note: string | null;
  assigned_to: string | null;
  created_at: string;
};

type SupportAgent = { user_id: string; full_name: string; role: AdminRole };

type PassengerRow = {
  id: string;
  full_name: string;
  email: string | null;
  preferred_locale: string;
  phone: string | null;
  created_at: string;
  booking_count?: number;
  latest_booking_at?: string | null;
};

type ProviderLogRow = {
  id: string;
  provider: string;
  operation: string;
  route_key: string | null;
  travel_date: string | null;
  status: string;
  response_code: number | null;
  cache_hit: boolean;
  error_code: string | null;
  requested_at: string;
  completed_at: string | null;
};

type RouteRow = {
  id: string;
  provider_route_id: string | null;
  active: boolean;
  from_location_id: string;
  to_location_id: string;
  fromName?: string;
  toName?: string;
  scheduleCount?: number;
  schedules?: RouteScheduleRow[];
};

type RouteScheduleRow = {
  id: string;
  provider_route_id: string;
  schedule_key: string;
  title: string;
  direction: "outbound" | "inbound";
  service_weekday: number;
  active: boolean;
  stops: Array<{
    location_name: string;
    stop_order: number;
    day_offset: number;
    departure_time: string;
    place: string | null;
  }>;
};

type LocationRow = {
  id: string;
  name_uk: string;
  name_en: string | null;
  name_it: string | null;
  provider_location_id: string | null;
  country_code: string | null;
  aliases: string[];
  latitude: number | null;
  longitude: number | null;
  active: boolean;
};

type PopularRouteRow = {
  id: string;
  route_id: string;
  locale: "uk" | "en" | "it";
  sort_order: number;
  is_featured: boolean;
  active: boolean;
  routeName?: string;
};

type PublicContentRow = {
  id: string;
  content_key: string;
  locale: "uk" | "en" | "it";
  content: Record<string, unknown>;
  active: boolean;
  updated_at: string;
};

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type BookingRow = {
  id: string;
  booking_number: string;
  status: "pending" | "confirmed" | "cancelled" | "expired" | "refunded";
  currency: string;
  total_amount: number;
  created_at: string;
  expires_at: string | null;
  confirmed_at?: string | null;
  provider_booking_id?: string | null;
  passenger_id: string | null;
  trip_id: string;
  trip_details?: {
    departure_at?: string;
    arrival_at?: string | null;
    carrier?: string | null;
    from_city?: string;
    to_city?: string;
  };
  booking_passengers: Array<{ full_name: string; email: string | null; phone: string | null }>;
  total_count?: number;
};

type AdminNotification = {
  id: string;
  type: "new_booking" | "cancellation_request" | "booking_status";
  booking_id: string | null;
  passenger_id: string | null;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type SyncResult = {
  providerError: false;
  importedLocations: number;
  importedRoutes: number;
  importedSchedules: number;
  importedScheduleStops: number;
};

function isSyncResult(value: unknown): value is SyncResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.providerError === false &&
    Number.isSafeInteger(result.importedLocations) &&
    Number.isSafeInteger(result.importedRoutes) &&
    Number.isSafeInteger(result.importedSchedules) &&
    Number.isSafeInteger(result.importedScheduleStops);
}

function errorCodeOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const errorCode = (value as Record<string, unknown>).errorCode;
  return typeof errorCode === "string" ? errorCode : null;
}

export function AdminDashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<AdminRole | "">("");
  const [loadErrors, setLoadErrors] = useState<Partial<Record<DataSection, string>>>({});
  const [actionMessage, setActionMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("");
  const [bookingFromDate, setBookingFromDate] = useState("");
  const [bookingToDate, setBookingToDate] = useState("");
  const [bookingPage, setBookingPage] = useState(0);
  const [bookingTotal, setBookingTotal] = useState(0);
  const [passengers, setPassengers] = useState<PassengerRow[]>([]);
  const [passengerSearch, setPassengerSearch] = useState("");
  const [passengerLocaleFilter, setPassengerLocaleFilter] = useState("");
  const [passengerPage, setPassengerPage] = useState(0);
  const [passengerTotal, setPassengerTotal] = useState(0);
  const [cancellations, setCancellations] = useState<CancellationRow[]>([]);
  const [cancellationSearch, setCancellationSearch] = useState("");
  const [cancellationResolutionNote, setCancellationResolutionNote] = useState("");
  const [supportAgents, setSupportAgents] = useState<SupportAgent[]>([]);
  const [providerLogs, setProviderLogs] = useState<ProviderLogRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [routeSearch, setRouteSearch] = useState("");
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationSearch, setLocationSearch] = useState("");
  const [editingLocationId, setEditingLocationId] = useState("");
  const [locationDraft, setLocationDraft] = useState({ name_uk: "", name_en: "", name_it: "", aliases: "" });
  const [popularRoutes, setPopularRoutes] = useState<PopularRouteRow[]>([]);
  const [publicContent, setPublicContent] = useState<PublicContentRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [popularRouteId, setPopularRouteId] = useState("");
  const [popularLocale, setPopularLocale] = useState<"uk" | "en" | "it">("uk");
  const [contentKey, setContentKey] = useState("finalCta");
  const [contentLocale, setContentLocale] = useState<"uk" | "en" | "it">("uk");
  const [contentJson, setContentJson] = useState("{}");
  const [contentMessage, setContentMessage] = useState("");
  const [selectedContentId, setSelectedContentId] = useState("");
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [bookingEditing, setBookingEditing] = useState(false);
  const [bookingEditDraft, setBookingEditDraft] = useState({
    fullName: "",
    email: "",
    phone: "",
  });
  const [bookingEditSaving, setBookingEditSaving] = useState(false);
  const [cancellationRequestReason, setCancellationRequestReason] = useState("");
  const [cancellationRequestSaving, setCancellationRequestSaving] = useState(false);
  const [passengerComment, setPassengerComment] = useState("");
  const [passengerRating, setPassengerRating] = useState(0);
  const [tripCompleted, setTripCompleted] = useState(false);
  const [interactionSaving, setInteractionSaving] = useState(false);
  const interactionLoadRequestRef = useRef(0);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({
    timezone: "Europe/Kyiv",
    expirationMinutes: "30",
    currencies: "UAH",
    maxPassengers: "5",
    maintenanceMode: false,
    supportEmail: "",
    supportPhone: "",
    defaultLocale: "uk",
  });
  const [stats, setStats] = useState<{
    bookings: number | null;
    pending: number | null;
    confirmed: number | null;
    cancelled: number | null;
    expired: number | null;
    refunded: number | null;
    passengers: number | null;
    cancellations: number | null;
    locations: number | null;
    routes: number | null;
    schedules: number | null;
    providerErrors: number | null;
  }>({
    bookings: null,
    pending: null,
    confirmed: null,
    cancelled: null,
    expired: null,
    refunded: null,
    passengers: null,
    cancellations: null,
    locations: null,
    routes: null,
    schedules: null,
    providerErrors: null,
  });

  useEffect(() => {
    setTab(ADMIN_PATHS[location.pathname] ?? "overview");
  }, [location.pathname]);

  useEffect(() => {
    if (loading || !role) return;
    const currentTab = ADMIN_PATHS[location.pathname] ?? "overview";
    if (!ROLE_TABS[role].includes(currentTab)) {
      const firstAllowed = ROLE_TABS[role][0];
      setActionMessage(t("admin.accessDeniedDescription"));
      navigate(TAB_PATHS[firstAllowed], { replace: true });
    }
  }, [loading, location.pathname, navigate, role, t]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        if (!cancelled) {
          setLoadErrors({ stats: t("admin.loadFailed") });
          setLoading(false);
        }
        return;
      }
      if (!sessionData.session) {
        if (!cancelled) navigate("/admin/login", { replace: true });
        return;
      }
      const { data: profile, error } = await supabase
        .from("admin_profiles")
        .select("role,active")
        .eq("user_id", sessionData.session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !profile?.active) {
        setAuthorized(false);
        if (error) setLoadErrors({ stats: t("admin.loadFailed") });
        setLoading(false);
        return;
      }
      setRole(profile.role as AdminRole);
      setAuthorized(true);
      const roleSections: Partial<Record<AdminRole, Array<() => Promise<void>>>> = {
        super_admin: [loadStats, loadBookings, loadNotifications, loadPassengers, loadCancellations, loadSupportAgents, loadProviderLogs, loadRoutes, loadLocations, loadPopularRoutes, loadPublicContent, loadAuditLogs, loadSettings],
        admin: [loadStats, loadBookings, loadNotifications, loadPassengers, loadCancellations, loadSupportAgents, loadProviderLogs, loadRoutes, loadLocations, loadPopularRoutes, loadPublicContent, loadAuditLogs, loadSettings],
        support: [loadStats, loadBookings, loadNotifications, loadPassengers, loadCancellations, loadSupportAgents, loadAuditLogs],
        content_manager: [loadLocations, loadPopularRoutes, loadPublicContent],
        provider_operator: [loadProviderLogs, loadRoutes, loadLocations],
      };
      await Promise.allSettled((roleSections[profile.role as AdminRole] ?? []).map((load) => load()));
      if (!cancelled) setLoading(false);
    };
    void initialize();
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    if (!authorized) return;
    const channel = supabase
      .channel("admin-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const notification = payload.new as unknown as AdminNotification;
          setNotifications((current) =>
            [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 30),
          );
          setActionMessage(notification.message);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(notification.title, {
              body: notification.message,
              icon: "/icons/busnet-192.png",
              tag: notification.id,
            });
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [authorized]);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  const loadStats = async () => {
    const results = await Promise.all([
      supabase.from("bookings").select("id", { count: "exact", head: true }),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "expired"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "refunded"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("booking_cancellation_requests").select("id", { count: "exact", head: true }).in("status", ["new", "in_progress"]),
      supabase.from("locations").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("routes").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("provider_route_schedules").select("id", { count: "exact", head: true }).eq("active", true),
      ["super_admin", "admin", "provider_operator"].includes(role)
        ? supabase.from("provider_request_logs").select("id", { count: "exact", head: true }).eq("status", "error")
        : Promise.resolve({ count: null, error: null }),
    ]);
    const failed = results.some((result) => result.error);
    setLoadErrors((current) => ({ ...current, stats: failed ? t("admin.loadFailed") : undefined }));
    setStats({
      bookings: results[0].error ? null : results[0].count,
      pending: results[1].error ? null : results[1].count,
      confirmed: results[2].error ? null : results[2].count,
      cancelled: results[3].error ? null : results[3].count,
      expired: results[4].error ? null : results[4].count,
      refunded: results[5].error ? null : results[5].count,
      passengers: results[6].error ? null : results[6].count,
      cancellations: results[7].error ? null : results[7].count,
      locations: results[8].error ? null : results[8].count,
      routes: results[9].error ? null : results[9].count,
      schedules: results[10].error ? null : results[10].count,
      providerErrors: results[11].error ? null : results[11].count,
    });
  };

  const loadBookings = async () => {
    const { data, error } = await supabase.rpc("admin_search_bookings", {
      p_query: bookingSearch || null,
      p_status: bookingStatusFilter || null,
      p_from_date: bookingFromDate || null,
      p_to_date: bookingToDate || null,
      p_page: bookingPage,
      p_page_size: 50,
    });
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, bookings: t("admin.loadFailed") }));
      setBookings([]);
      setBookingTotal(0);
      return;
    }
    const rows = data as unknown as Array<BookingRow & { total_count: number }>;
    setLoadErrors((current) => ({ ...current, bookings: undefined }));
    setBookings(rows);
    setBookingTotal(rows[0]?.total_count ?? 0);
  };

  const loadNotifications = async () => {
    const { data, error } = await supabase
      .from("admin_notifications")
      .select("id,type,booking_id,passenger_id,title,message,metadata,read_at,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, notifications: t("admin.loadFailed") }));
      setNotifications([]);
      return;
    }
    setLoadErrors((current) => ({ ...current, notifications: undefined }));
    setNotifications(data as unknown as AdminNotification[]);
  };

  const loadPassengers = async () => {
    const { data, error } = await supabase.rpc("admin_search_passengers", {
      p_query: passengerSearch || null,
      p_locale: passengerLocaleFilter || null,
      p_page: passengerPage,
      p_page_size: 50,
    });
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, passengers: t("admin.loadFailed") }));
      setPassengers([]);
      setPassengerTotal(0);
      return;
    }
    const rows = data as unknown as Array<PassengerRow & { total_count: number }>;
    setLoadErrors((current) => ({ ...current, passengers: undefined }));
    setPassengers(rows);
    setPassengerTotal(rows[0]?.total_count ?? 0);
  };

  const loadCancellations = async () => {
    const { data, error } = await supabase
      .from("booking_cancellation_requests")
      .select("id,booking_id,passenger_id,reason,status,resolution,resolution_note,assigned_to,created_at")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, cancellations: t("admin.loadFailed") }));
      setCancellations([]);
      return;
    }
    setLoadErrors((current) => ({ ...current, cancellations: undefined }));
    setCancellations(data as unknown as CancellationRow[]);
  };

  const loadProviderLogs = async () => {
    const { data, error } = await supabase
      .from("provider_request_logs")
      .select("id,provider,operation,route_key,travel_date,status,response_code,cache_hit,error_code,requested_at,completed_at")
      .order("requested_at", { ascending: false })
      .limit(50);
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, providerLogs: t("admin.loadFailed") }));
      setProviderLogs([]);
      return;
    }
    setLoadErrors((current) => ({ ...current, providerLogs: undefined }));
    setProviderLogs(data as unknown as ProviderLogRow[]);
  };

  const loadSupportAgents = async () => {
    const { data, error } = await supabase.rpc("admin_list_support_agents");
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, cancellations: t("admin.loadFailed") }));
      setSupportAgents([]);
      return;
    }
    setSupportAgents(data as SupportAgent[]);
  };

  const loadRoutes = async () => {
    const { data: routeData, error: routesError } = await supabase
      .from("routes")
      .select("id,provider_route_id,active,from_location_id,to_location_id")
      .order("provider_route_id", { ascending: true })
      .limit(300);
    if (routesError || !routeData) {
      setLoadErrors((current) => ({ ...current, routes: t("admin.loadFailed") }));
      setRoutes([]);
      return;
    }

    const routeRows = routeData as unknown as RouteRow[];
    const locationIds = [...new Set(routeRows.flatMap((route) => [
      route.from_location_id,
      route.to_location_id,
    ]))];
    const providerRouteIds = [...new Set(routeRows
      .map((route) => route.provider_route_id)
      .filter((id): id is string => Boolean(id)))];

    const [locationsResult, schedulesResult] = await Promise.all([
      supabase
        .from("locations")
        .select("id,name_uk,name_en,name_it")
        .in("id", locationIds),
      providerRouteIds.length
        ? supabase
          .from("provider_route_schedules")
          .select("id,provider_route_id,schedule_key,title,direction,service_weekday,active")
          .in("provider_route_id", providerRouteIds)
          .eq("active", true)
        : Promise.resolve({
          data: [] as Array<{
            id: string;
            provider_route_id: string;
            schedule_key: string;
            title: string;
            direction: "outbound" | "inbound";
            service_weekday: number;
            active: boolean;
          }>,
          error: null,
        }),
    ]);
    const locationData = locationsResult.data;
    if (locationsResult.error || schedulesResult.error) {
      setLoadErrors((current) => ({ ...current, routes: t("admin.loadFailed") }));
      setRoutes([]);
      return;
    }
    const scheduleRows = schedulesResult.data ?? [];
    const scheduleIds = scheduleRows.map((schedule) => schedule.id);
    const { data: stopData, error: stopsError } = scheduleIds.length
      ? await supabase
        .from("provider_route_schedule_stops")
        .select("schedule_id,location_id,stop_order,day_offset,departure_time,place")
        .in("schedule_id", scheduleIds)
        .order("stop_order")
      : { data: [], error: null };
    if (stopsError) {
      setLoadErrors((current) => ({ ...current, routes: t("admin.loadFailed") }));
      setRoutes([]);
      return;
    }
    const stopLocationIds = [...new Set((stopData ?? []).map((stop) => stop.location_id))];
    const { data: stopLocations, error: stopLocationsError } = stopLocationIds.length
      ? await supabase
        .from("locations")
        .select("id,name_uk,name_en,name_it")
        .in("id", stopLocationIds)
      : { data: [], error: null };
    if (stopLocationsError) {
      setLoadErrors((current) => ({ ...current, routes: t("admin.loadFailed") }));
      setRoutes([]);
      return;
    }

    const locale = i18n.language?.startsWith("en")
      ? "en"
      : i18n.language?.startsWith("it")
        ? "it"
        : "uk";
    const names = new Map<string, string>(
      (locationData ?? []).map((location) => {
        const name = locale === "en"
          ? location.name_en ?? location.name_uk
          : locale === "it"
            ? location.name_it ?? location.name_en ?? location.name_uk
            : location.name_uk;
        return [location.id, name] as [string, string];
      }),
    );
    const scheduleCounts = new Map<string, number>();
    const schedulesByRoute = new Map<string, RouteScheduleRow[]>();
    const stopNames = new Map<string, string>(
      (stopLocations ?? []).map((location) => {
        const name = locale === "en"
          ? location.name_en ?? location.name_uk
          : locale === "it"
            ? location.name_it ?? location.name_en ?? location.name_uk
            : location.name_uk;
        return [location.id, name] as [string, string];
      }),
    );
    for (const schedule of scheduleRows) {
      scheduleCounts.set(
        schedule.provider_route_id,
        (scheduleCounts.get(schedule.provider_route_id) ?? 0) + 1,
      );
      schedulesByRoute.set(schedule.provider_route_id, [
        ...(schedulesByRoute.get(schedule.provider_route_id) ?? []),
        {
          ...schedule,
          stops: (stopData ?? [])
            .filter((stop) => stop.schedule_id === schedule.id)
            .map((stop) => ({
              location_name: stopNames.get(stop.location_id) ?? stop.location_id,
              stop_order: stop.stop_order,
              day_offset: stop.day_offset,
              departure_time: stop.departure_time,
              place: stop.place,
            })),
        },
      ]);
    }

    setRoutes(routeRows.map((route) => ({
      ...route,
      fromName: names.get(route.from_location_id) ?? route.from_location_id,
      toName: names.get(route.to_location_id) ?? route.to_location_id,
      scheduleCount: route.provider_route_id
        ? scheduleCounts.get(route.provider_route_id) ?? 0
        : 0,
      schedules: route.provider_route_id
        ? schedulesByRoute.get(route.provider_route_id) ?? []
        : [],
    })));
    setLoadErrors((current) => ({ ...current, routes: undefined }));
  };

  const loadLocations = async () => {
    const { data, error } = await supabase
      .from("locations")
      .select("id,name_uk,name_en,name_it,provider_location_id,country_code,aliases,latitude,longitude,active")
      .order("name_uk")
      .limit(500);
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, locations: t("admin.loadFailed") }));
      setLocations([]);
      return;
    }
    setLoadErrors((current) => ({ ...current, locations: undefined }));
    setLocations(data as unknown as LocationRow[]);
  };

  const beginLocationEdit = (locationRow: LocationRow) => {
    setEditingLocationId(locationRow.id);
    setLocationDraft({
      name_uk: locationRow.name_uk,
      name_en: locationRow.name_en ?? "",
      name_it: locationRow.name_it ?? "",
      aliases: locationRow.aliases.join(", "),
    });
  };

  const saveLocationLocalization = async (locationId: string) => {
    const nameUk = locationDraft.name_uk.trim();
    const aliases = [...new Set(locationDraft.aliases.split(",").map((alias) => alias.trim()).filter(Boolean))];
    if (!nameUk) {
      setActionMessage(t("admin.invalidLocation"));
      return;
    }
    const { error } = await supabase.from("locations").update({
      name_uk: nameUk,
      name_en: locationDraft.name_en.trim() || null,
      name_it: locationDraft.name_it.trim() || null,
      aliases,
      normalized_name: nameUk.normalize("NFC").toLocaleLowerCase("uk-UA"),
    }).eq("id", locationId);
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setEditingLocationId("");
    setActionMessage(t("admin.actionSucceeded"));
    await loadLocations();
  };

  const loadPopularRoutes = async () => {
    const { data, error } = await supabase
      .from("popular_routes")
      .select("id,route_id,locale,sort_order,is_featured,active")
      .order("locale")
      .order("sort_order");
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, popularRoutes: t("admin.loadFailed") }));
      setPopularRoutes([]);
      return;
    }

    const routeIds = [...new Set(data.map((row) => row.route_id))];
    const { data: routeData } = routeIds.length
      ? await supabase
        .from("routes")
        .select("id,from_location_id,to_location_id")
        .in("id", routeIds)
      : { data: [] };
    const locationIds = [...new Set((routeData ?? []).flatMap((route) =>
      [route.from_location_id, route.to_location_id],
    ))];
    const { data: locationData } = locationIds.length
      ? await supabase
        .from("locations")
        .select("id,name_uk,name_en,name_it")
        .in("id", locationIds)
      : { data: [] };

    const names = new Map<string, string>(
      (locationData ?? []).map((location) => [
        location.id,
        i18n.language?.startsWith("en")
          ? location.name_en ?? location.name_uk
          : i18n.language?.startsWith("it")
            ? location.name_it ?? location.name_en ?? location.name_uk
            : location.name_uk,
      ] as [string, string]),
    );
    const routeNames = new Map<string, string>(
      (routeData ?? []).map((route) => [
        route.id,
        `${names.get(route.from_location_id) ?? ""} → ${names.get(route.to_location_id) ?? ""}`,
      ] as [string, string]),
    );
    setPopularRoutes((data as unknown as PopularRouteRow[]).map((row) => ({
      ...row,
      routeName: routeNames.get(row.route_id) ?? row.route_id,
    })));
    setLoadErrors((current) => ({ ...current, popularRoutes: undefined }));
  };

  const loadPublicContent = async () => {
    const { data, error } = await supabase
      .from("public_content")
      .select("id,content_key,locale,content,active,updated_at")
      .order("content_key");
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, publicContent: t("admin.loadFailed") }));
      setPublicContent([]);
      return;
    }
    setLoadErrors((current) => ({ ...current, publicContent: undefined }));
    setPublicContent(data as unknown as PublicContentRow[]);
  };

  const loadAuditLogs = async () => {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id,actor_id,action,target_type,target_id,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, auditLogs: t("admin.loadFailed") }));
      setAuditLogs([]);
      return;
    }
    setLoadErrors((current) => ({ ...current, auditLogs: undefined }));
    setAuditLogs(data as unknown as AuditRow[]);
  };

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from("admin_settings")
      .select("setting_key,setting_value");
    if (error || !data) {
      setLoadErrors((current) => ({ ...current, settings: t("admin.loadFailed") }));
      return;
    }
    const values = new Map(data.map((row) => [row.setting_key, row.setting_value]));
    setSettingsDraft({
      timezone: String(values.get("timezone") ?? "Europe/Kyiv"),
      expirationMinutes: String(values.get("booking_expiration_minutes") ?? 30),
      currencies: Array.isArray(values.get("supported_currencies"))
        ? (values.get("supported_currencies") as string[]).join(", ")
        : "UAH",
      maxPassengers: String(values.get("max_passengers_per_booking") ?? 5),
      maintenanceMode: values.get("maintenance_mode") === true,
      supportEmail: String(values.get("support_email") ?? ""),
      supportPhone: String(values.get("support_phone") ?? ""),
      defaultLocale: String(values.get("default_locale") ?? "uk"),
    });
    setLoadErrors((current) => ({ ...current, settings: undefined }));
  };

  const saveSettings = async () => {
    const expirationMinutes = Number(settingsDraft.expirationMinutes);
    const maxPassengers = Number(settingsDraft.maxPassengers);
    const currencies = settingsDraft.currencies.split(",").map((currency) => currency.trim().toUpperCase()).filter(Boolean);
    if (!Number.isInteger(expirationMinutes) || expirationMinutes < 1 ||
        !Number.isInteger(maxPassengers) || maxPassengers < 1 || maxPassengers > 20 ||
        currencies.some((currency) => !/^[A-Z]{3}$/.test(currency)) ||
        !["uk", "en", "it"].includes(settingsDraft.defaultLocale)) {
      setActionMessage(t("admin.invalidSettings"));
      return;
    }
    const values = [
      ["timezone", settingsDraft.timezone],
      ["booking_expiration_minutes", expirationMinutes],
      ["supported_currencies", [...new Set(currencies)]],
      ["max_passengers_per_booking", maxPassengers],
      ["maintenance_mode", settingsDraft.maintenanceMode],
      ["support_email", settingsDraft.supportEmail.trim()],
      ["support_phone", settingsDraft.supportPhone.trim()],
      ["default_locale", settingsDraft.defaultLocale],
    ].map(([setting_key, setting_value]) => ({ setting_key, setting_value, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("admin_settings").upsert(values, { onConflict: "setting_key" });
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setActionMessage(t("admin.actionSucceeded"));
    await loadSettings();
  };

  useEffect(() => {
    if (loading || !authorized) return;
    if (tab === "bookings" && ["super_admin", "admin", "support"].includes(role)) {
      void loadBookings();
    }
  }, [authorized, bookingFromDate, bookingPage, bookingSearch, bookingStatusFilter, bookingToDate, loading, role, tab]);

  useEffect(() => {
    if (loading || !authorized) return;
    if (tab === "passengers" && ["super_admin", "admin", "support"].includes(role)) {
      void loadPassengers();
    }
  }, [authorized, loading, passengerLocaleFilter, passengerPage, passengerSearch, role, tab]);

  const addPopularRoute = async () => {
    if (!popularRouteId) return;
    const { error } = await supabase.from("popular_routes").upsert({
      route_id: popularRouteId,
      locale: popularLocale,
      sort_order: Math.max(-1, ...popularRoutes
        .filter((row) => row.locale === popularLocale)
        .map((row) => row.sort_order)) + 1,
      is_featured: true,
      active: true,
    }, { onConflict: "route_id,locale" });
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setActionMessage(t("admin.saveContentSuccess"));
    await loadPopularRoutes();
  };

  const togglePopularRoute = async (row: PopularRouteRow) => {
    const { error } = await supabase
      .from("popular_routes")
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setActionMessage(t("admin.saveContentSuccess"));
    await loadPopularRoutes();
  };

  const updatePopularOrder = async (row: PopularRouteRow, direction: -1 | 1) => {
    const sameLocale = popularRoutes
      .filter((item) => item.locale === row.locale)
      .sort((left, right) => left.sort_order - right.sort_order);
    const currentIndex = sameLocale.findIndex((item) => item.id === row.id);
    const neighbor = sameLocale[currentIndex + direction];
    if (!neighbor) return;
    const { error } = await supabase.rpc("swap_popular_route_order", {
      p_first_id: row.id,
      p_second_id: neighbor.id,
    });
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setActionMessage(t("admin.saveContentSuccess"));
    await loadPopularRoutes();
  };

  const deletePopularRoute = async (row: PopularRouteRow) => {
    const { error } = await supabase.from("popular_routes").delete().eq("id", row.id);
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setActionMessage(t("admin.saveContentSuccess"));
    await loadPopularRoutes();
  };

  const togglePublicContent = async (row: PublicContentRow) => {
    const { error } = await supabase.from("public_content")
      .update({ active: !row.active, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setActionMessage(t("admin.actionSucceeded"));
    await loadPublicContent();
  };

  const deletePublicContent = async (row: PublicContentRow) => {
    const { error } = await supabase.from("public_content").delete().eq("id", row.id);
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setActionMessage(t("admin.actionSucceeded"));
    await loadPublicContent();
  };

  const savePublicContent = async () => {
    setContentMessage("");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(contentJson);
    } catch {
      setContentMessage(t("admin.invalidJson"));
      return;
    }
    if (!contentKey.trim() ||
        !["finalCta", "faq", "howItWorks", "footer"].includes(contentKey.trim()) ||
        !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setContentMessage(t("admin.unsupportedContentKey"));
      return;
    }
    const { data: savedContent, error } = await supabase
      .from("public_content")
      .upsert({
        content_key: contentKey.trim(),
        locale: contentLocale,
        content: parsed,
        active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "content_key,locale" })
      .select("id")
      .single();
    if (error) {
      setContentMessage(t("admin.saveContentFailed"));
      return;
    }
    await loadPublicContent();
    if (savedContent?.id) setSelectedContentId(savedContent.id);
    setContentMessage(t("admin.saveContentSuccess"));
  };

  const selectPublicContent = (id: string) => {
    setSelectedContentId(id);
    const row = publicContent.find((item) => item.id === id);
    if (!row) return;
    setContentKey(row.content_key);
    setContentLocale(row.locale);
    setContentJson(JSON.stringify(row.content, null, 2));
  };

  const exportBookingsCsv = () => {
    const escapeCsv = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["booking_number", "status", "amount", "currency", "passenger", "phone", "email", "created_at"],
      ...filteredBookings.map((booking) => {
        const passenger = booking.booking_passengers?.[0];
        return [
          booking.booking_number,
          booking.status,
          booking.total_amount,
          booking.currency,
          passenger?.full_name ?? "",
          passenger?.phone ?? "",
          passenger?.email ?? "",
          booking.created_at,
        ];
      }),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `busnet-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const syncCatalog = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("altrans-adapter", {
        body: { operation: "sync-catalog" },
      });
      if (error) {
        setSyncMessage(t("admin.catalogSyncFailed"));
        return;
      }
      if (!isSyncResult(data)) {
        const errorCode = errorCodeOf(data);
        setSyncMessage(errorCode
          ? t("admin.catalogSyncFailedWithCode", { code: errorCode })
          : t("admin.catalogSyncFailed"));
        return;
      }
      setSyncMessage(t("admin.catalogSyncSuccess", {
        locations: data.importedLocations,
        routes: data.importedRoutes,
        schedules: data.importedSchedules,
        stops: data.importedScheduleStops,
      }));
      const { error: auditError } = await supabase.rpc("log_admin_action", {
        p_action: "catalog_sync_completed",
        p_target_type: "catalog",
        p_target_id: null,
        p_metadata: {
          importedLocations: data.importedLocations,
          importedRoutes: data.importedRoutes,
          importedSchedules: data.importedSchedules,
          importedScheduleStops: data.importedScheduleStops,
        },
      });
      if (auditError) setActionMessage(t("admin.auditWriteFailed"));
      await Promise.all([loadStats(), loadProviderLogs(), loadRoutes()]);
    } catch {
      setSyncMessage(t("admin.catalogSyncFailed"));
    } finally {
      setSyncing(false);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: BookingRow["status"]): Promise<boolean> => {
    const { error } = await supabase.rpc("update_booking_status", {
      p_booking_id: bookingId,
      p_status: status,
    });
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return false;
    }
    setActionMessage(t("admin.actionSucceeded"));
    await Promise.all([loadBookings(), loadStats()]);
    return true;
  };

  const updateCancellation = async (
    request: CancellationRow,
    action: "start" | "approve" | "reject" | "assign",
    assigneeId?: string,
  ) => {
    const { error } = await supabase.rpc("admin_review_cancellation", {
      p_request_id: request.id,
      p_action: action,
      p_resolution_note: cancellationResolutionNote || null,
      p_assigned_to: assigneeId || null,
    });
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setActionMessage(t("admin.actionSucceeded"));
    setCancellationResolutionNote("");
    await Promise.all([loadCancellations(), loadBookings(), loadStats(), loadAuditLogs()]);
  };

  const openBooking = (booking: BookingRow) => {
    const passenger = booking.booking_passengers?.[0];
    const requestId = ++interactionLoadRequestRef.current;
    setSelectedBooking(booking);
    setBookingEditing(false);
    setBookingEditDraft({
      fullName: passenger?.full_name ?? "",
      email: passenger?.email ?? "",
      phone: passenger?.phone ?? "",
    });
    setCancellationRequestReason("");
    setPassengerComment("");
    setPassengerRating(0);
    setTripCompleted(false);
    void (async () => {
      const { data } = await supabase
        .from("passenger_interactions")
        .select("trip_completed,rating,comment")
        .eq("booking_id", booking.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (requestId !== interactionLoadRequestRef.current) return;
      setTripCompleted(Boolean(data?.trip_completed));
      setPassengerRating(Number(data?.rating ?? 0));
      setPassengerComment(String(data?.comment ?? ""));
    })();
  };

  const openNotification = async (notification: AdminNotification) => {
    if (!notification.read_at) {
      const { error } = await supabase.rpc("mark_admin_notification_read", {
        p_notification_id: notification.id,
      });
      if (error) {
        setActionMessage(t("admin.actionFailed"));
        return;
      }
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
    }
    setNotificationsOpen(false);
    if (notification.booking_id) {
      const booking = bookings.find((item) => item.id === notification.booking_id);
      if (booking) openBooking(booking);
      else {
        await loadBookings();
        navigate("/admin/bookings");
      }
    }
  };

  const savePassengerInteraction = async () => {
    if (!selectedBooking) return;
    setInteractionSaving(true);
    const { error } = await supabase.rpc("save_passenger_interaction", {
      p_booking_id: selectedBooking.id,
      p_trip_completed: tripCompleted,
      p_rating: passengerRating || null,
      p_comment: passengerComment.trim() || null,
    });
    setInteractionSaving(false);
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setActionMessage(t("admin.actionSucceeded"));
  };

  const saveBookingPassenger = async () => {
    if (!selectedBooking) return;
    setBookingEditSaving(true);
    const { error } = await supabase.rpc("admin_update_booking_passenger", {
      p_booking_id: selectedBooking.id,
      p_full_name: bookingEditDraft.fullName.trim(),
      p_email: bookingEditDraft.email.trim() || null,
      p_phone: bookingEditDraft.phone.trim() || null,
    });
    setBookingEditSaving(false);
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setSelectedBooking((current) => {
      if (!current) return current;
      return {
        ...current,
        booking_passengers: [{
          full_name: bookingEditDraft.fullName.trim(),
          email: bookingEditDraft.email.trim() || null,
          phone: bookingEditDraft.phone.trim() || null,
        }],
      };
    });
    setBookingEditing(false);
    setActionMessage(t("admin.actionSucceeded"));
    await Promise.all([loadBookings(), loadPassengers()]);
  };

  const requestBookingCancellation = async () => {
    if (!selectedBooking) return;
    setCancellationRequestSaving(true);
    const { error } = await supabase.rpc("admin_request_booking_cancellation", {
      p_booking_id: selectedBooking.id,
      p_reason: cancellationRequestReason.trim() || null,
    });
    setCancellationRequestSaving(false);
    if (error) {
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setCancellationRequestReason("");
    setActionMessage("Запит на скасування передано диспетчеру");
    await Promise.all([loadCancellations(), loadBookings(), loadStats(), loadAuditLogs()]);
  };

  const installApp = async () => {
    if (!installPrompt) {
      setActionMessage("Для встановлення відкрийте меню браузера та оберіть «Встановити застосунок».");
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  if (loading) {
    return <main className="admin-dashboard"><p className="admin-dashboard__loading">{t("admin.loading")}</p></main>;
  }

  if (!authorized) {
    return (
      <main className="admin-dashboard">
        <section className="admin-dashboard__denied">
          <h1>{t("admin.accessDenied")}</h1>
          <p>{t("admin.accessDeniedDescription")}</p>
          <button type="button" onClick={() => void signOut()}>{t("admin.signOut")}</button>
        </section>
      </main>
    );
  }

  const filteredBookings = bookings;
  const filteredPassengers = passengers;

  const filteredCancellations = cancellations.filter((request) => {
    const query = cancellationSearch.trim().toLowerCase();
    if (!query) return true;
    return [request.reason, request.status, request.booking_id]
      .some((value) => value.toLowerCase().includes(query));
  });

  const filteredRoutes = routes.filter((route) => {
    const query = routeSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      route.fromName ?? "",
      route.toName ?? "",
      route.provider_route_id ?? "",
      route.active ? "active" : "inactive",
    ].some((value) => value.toLowerCase().includes(query));
  });
  const filteredLocations = locations.filter((location) => {
    const query = locationSearch.trim().toLowerCase();
    return !query || [
      location.name_uk,
      location.name_en ?? "",
      location.name_it ?? "",
      location.provider_location_id ?? "",
      location.country_code ?? "",
      ...location.aliases,
    ].some((value) => value.toLowerCase().includes(query));
  });

  const allNavItems: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard; roles: AdminRole[] }> = [
    { id: "overview", label: t("admin.tabs.overview"), icon: LayoutDashboard, roles: ["super_admin", "admin", "support"] },
    { id: "bookings", label: t("admin.tabs.bookings"), icon: TicketCheck, roles: ["super_admin", "admin", "support"] },
    { id: "passengers", label: t("admin.tabs.passengers"), icon: Users, roles: ["super_admin", "admin", "support"] },
    { id: "cancellations", label: t("admin.tabs.cancellations"), icon: TicketCheck, roles: ["super_admin", "admin", "support"] },
    { id: "catalog", label: t("admin.tabs.catalog"), icon: RefreshCw, roles: ["super_admin", "admin", "provider_operator"] },
    { id: "routes", label: t("admin.tabs.routes"), icon: MapIcon, roles: ["super_admin", "admin", "provider_operator"] },
    { id: "locations", label: t("admin.tabs.locations"), icon: MapIcon, roles: ["super_admin", "admin", "content_manager", "provider_operator"] },
    { id: "popular", label: t("admin.tabs.popular"), icon: BookOpen, roles: ["super_admin", "admin", "content_manager"] },
    { id: "content", label: t("admin.tabs.content"), icon: Settings, roles: ["super_admin", "admin", "content_manager"] },
    { id: "audit", label: t("admin.tabs.audit"), icon: Users, roles: ["super_admin", "admin", "support"] },
    { id: "settings", label: t("admin.tabs.settings"), icon: Settings, roles: ["super_admin", "admin"] },
  ];
  const navItems = allNavItems.filter((item) => item.roles.includes(role as AdminRole));

  return (
    <main className="admin-dashboard">
      <aside className="admin-dashboard__sidebar">
        <div>
          <p className="admin-dashboard__eyebrow">BUSNET UA</p>
          <h1>{t("admin.dashboard")}</h1>
        </div>
        <nav aria-label={t("admin.navigation")}>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "is-active" : ""}
              type="button"
              onClick={() => navigate(TAB_PATHS[id])}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-dashboard__account">
          <div><Users size={17} /><span>{role}</span></div>
          <button type="button" onClick={() => void installApp()}><Download size={17} /> {t("admin.installApp")}</button>
          <button
            type="button"
            onClick={() => {
              if ("Notification" in window) {
                void Notification.requestPermission();
              }
            }}
          >
            <Bell size={17} /> {t("admin.enableNotifications")}
          </button>
          <button type="button" onClick={() => void signOut()}><LogOut size={17} /> {t("admin.signOut")}</button>
        </div>
      </aside>

      <section className="admin-dashboard__workspace">
        <div className="admin-dashboard__workspace-tools">
          <button
            aria-label={t("admin.notifications")}
            className="admin-dashboard__notification-button"
            onClick={() => setNotificationsOpen((open) => !open)}
            type="button"
          >
            <Bell size={18} />
            {notifications.filter((item) => !item.read_at).length > 0 && (
              <span>{notifications.filter((item) => !item.read_at).length}</span>
            )}
          </button>
          {notificationsOpen && (
            <div className="admin-dashboard__notifications">
              <h3>{t("admin.notifications")}</h3>
              {loadErrors.notifications ? (
                <p className="admin-dashboard__error" role="alert">{loadErrors.notifications}</p>
              ) : notifications.length === 0 ? (
                <p>{t("admin.noNotifications")}</p>
              ) : notifications.map((notification) => (
                <button
                  className={notification.read_at ? "" : "is-unread"}
                  key={notification.id}
                  onClick={() => void openNotification(notification)}
                  type="button"
                >
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>
                  <small>{new Date(notification.created_at).toLocaleString()}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        {actionMessage && <p className="admin-dashboard__feedback" role="status">{actionMessage}</p>}
        {tab === "overview" && (
          <>
            <header className="admin-dashboard__header">
              <div>
                <p>{t("admin.overviewSubtitle")}</p>
                <h2>{t("admin.tabs.overview")}</h2>
              </div>
              {["super_admin", "admin", "provider_operator"].includes(role) && (
                <button type="button" onClick={() => void syncCatalog()} disabled={syncing}>
                  <RefreshCw size={17} /> {syncing ? t("admin.catalogSyncLoading") : t("admin.catalogSyncButton")}
                </button>
              )}
            </header>
            {loadErrors.stats && <p className="admin-dashboard__error" role="alert">{loadErrors.stats}</p>}
            <div className="admin-dashboard__stats">
              <article><span><TicketCheck size={18} /></span><strong>{stats.bookings ?? "—"}</strong><p>{t("admin.stats.bookings")}</p></article>
              <article><span><TicketCheck size={18} /></span><strong>{stats.pending ?? "—"}</strong><p>{t("admin.stats.pending")}</p></article>
              <article><span><TicketCheck size={18} /></span><strong>{stats.confirmed ?? "—"}</strong><p>{t("admin.stats.confirmed")}</p></article>
              <article><span><TicketCheck size={18} /></span><strong>{stats.cancelled ?? "—"}</strong><p>{t("admin.stats.cancelled")}</p></article>
              <article><span><TicketCheck size={18} /></span><strong>{stats.expired ?? "—"}</strong><p>{t("admin.stats.expired")}</p></article>
              <article><span><TicketCheck size={18} /></span><strong>{stats.refunded ?? "—"}</strong><p>{t("admin.stats.refunded")}</p></article>
              <article><span><Users size={18} /></span><strong>{stats.passengers ?? "—"}</strong><p>{t("admin.stats.passengers")}</p></article>
              <article><span><TicketCheck size={18} /></span><strong>{stats.cancellations ?? "—"}</strong><p>{t("admin.stats.cancellations")}</p></article>
              <article><span><MapIcon size={18} /></span><strong>{stats.locations ?? "—"}</strong><p>{t("admin.stats.locations")}</p></article>
              <article><span><BookOpen size={18} /></span><strong>{stats.routes ?? "—"}</strong><p>{t("admin.stats.routes")}</p></article>
              <article><span><Settings size={18} /></span><strong>{stats.schedules ?? "—"}</strong><p>{t("admin.stats.schedules")}</p></article>
              <article><span><RefreshCw size={18} /></span><strong>{stats.providerErrors ?? "—"}</strong><p>{t("admin.stats.providerErrors")}</p></article>
            </div>
            <div className="admin-dashboard__panel">
              <div className="admin-dashboard__panel-title">
                <h3>{t("admin.recentBookings")}</h3>
                <button type="button" onClick={() => navigate("/admin/bookings")}>{t("admin.viewAll")}</button>
              </div>
              {loadErrors.bookings
                ? <p className="admin-dashboard__error" role="alert">{loadErrors.bookings}</p>
                : <BookingTable bookings={bookings.slice(0, 5)} onStatusChange={updateBookingStatus} onOpen={openBooking} canManageStatus={["super_admin", "admin"].includes(role)} t={t} />}
            </div>
          </>
        )}

        {tab === "bookings" && (
          <>
            <header className="admin-dashboard__header">
              <div><p>{t("admin.bookingsSubtitle")}</p><h2>{t("admin.tabs.bookings")}</h2></div>
            </header>
            <div className="admin-dashboard__toolbar">
              <label>
                <Search size={17} />
                <input value={bookingSearch} onChange={(event) => { setBookingPage(0); setBookingSearch(event.target.value); }} placeholder={t("admin.searchBookings")} />
              </label>
              <select value={bookingStatusFilter} onChange={(event) => { setBookingPage(0); setBookingStatusFilter(event.target.value); }} aria-label={t("admin.table.status")}>
                <option value="">{t("admin.allStatuses")}</option>
                {["pending", "confirmed", "cancelled", "expired", "refunded"].map((status) => <option key={status} value={status}>{t(`admin.status.${status}`)}</option>)}
              </select>
              <input aria-label={t("admin.fromDate")} type="date" value={bookingFromDate} onChange={(event) => { setBookingPage(0); setBookingFromDate(event.target.value); }} />
              <input aria-label={t("admin.toDate")} type="date" value={bookingToDate} onChange={(event) => { setBookingPage(0); setBookingToDate(event.target.value); }} />
              <span>{bookingTotal} {t("admin.results")}</span>
              <button className="admin-dashboard__export" type="button" onClick={exportBookingsCsv}>
                {t("admin.exportCsv")}
              </button>
            </div>
            <div className="admin-dashboard__panel">
              {loadErrors.bookings
                ? <p className="admin-dashboard__error" role="alert">{loadErrors.bookings}</p>
                : <BookingTable bookings={filteredBookings} onStatusChange={updateBookingStatus} onOpen={openBooking} canManageStatus={["super_admin", "admin"].includes(role)} t={t} />}
              <Pagination page={bookingPage} total={bookingTotal} pageSize={50} onPageChange={setBookingPage} t={t} />
            </div>
          </>
        )}

        {tab === "passengers" && (
          <>
            <header className="admin-dashboard__header">
              <div><p>{t("admin.passengersSubtitle")}</p><h2>{t("admin.tabs.passengers")}</h2></div>
            </header>
            <div className="admin-dashboard__toolbar">
              <label>
                <Search size={17} />
                <input value={passengerSearch} onChange={(event) => { setPassengerPage(0); setPassengerSearch(event.target.value); }} placeholder={t("admin.searchPassengers")} />
              </label>
              <select value={passengerLocaleFilter} onChange={(event) => { setPassengerPage(0); setPassengerLocaleFilter(event.target.value); }} aria-label={t("admin.table.locale")}>
                <option value="">{t("admin.allLocales")}</option>
                {["uk", "en", "it"].map((locale) => <option key={locale} value={locale}>{locale.toUpperCase()}</option>)}
              </select>
              <span>{passengerTotal} {t("admin.results")}</span>
            </div>
            <div className="admin-dashboard__panel">
              {loadErrors.passengers ? <p className="admin-dashboard__error" role="alert">{loadErrors.passengers}</p> : filteredPassengers.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noPassengers")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.passenger")}</th><th>{t("admin.table.email")}</th><th>{t("admin.table.phone")}</th><th>{t("admin.table.locale")}</th><th>{t("admin.table.created")}</th><th>{t("admin.table.bookingCount")}</th><th>{t("admin.table.latestBooking")}</th></tr></thead>
                    <tbody>
                      {filteredPassengers.map((passenger) => (
                        <tr key={passenger.id}>
                          <td><strong>{passenger.full_name || "—"}</strong></td>
                          <td>{passenger.email || "—"}</td>
                          <td>{passenger.phone || "—"}</td>
                          <td>{passenger.preferred_locale}</td>
                          <td>{new Date(passenger.created_at).toLocaleDateString()}</td>
                          <td>{passenger.booking_count ?? 0}</td>
                          <td>{passenger.latest_booking_at ? new Date(passenger.latest_booking_at).toLocaleDateString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={passengerPage} total={passengerTotal} pageSize={50} onPageChange={setPassengerPage} t={t} />
            </div>
          </>
        )}

        {tab === "cancellations" && (
          <>
            <header className="admin-dashboard__header">
              <div><p>{t("admin.cancellationsSubtitle")}</p><h2>{t("admin.tabs.cancellations")}</h2></div>
            </header>
            <div className="admin-dashboard__toolbar">
              <label>
                <Search size={17} />
                <input value={cancellationSearch} onChange={(event) => setCancellationSearch(event.target.value)} placeholder={t("admin.searchCancellations")} />
              </label>
              <span>{filteredCancellations.length} {t("admin.results")}</span>
            </div>
            <div className="admin-dashboard__panel">
              {loadErrors.cancellations ? <p className="admin-dashboard__error" role="alert">{loadErrors.cancellations}</p> : filteredCancellations.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noCancellations")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.booking")}</th><th>{t("admin.table.reason")}</th><th>{t("admin.table.status")}</th><th>{t("admin.table.assignedTo")}</th><th>{t("admin.table.created")}</th><th>{t("admin.table.actions")}</th></tr></thead>
                    <tbody>
                      {filteredCancellations.map((request) => (
                        <tr key={request.id}>
                          <td><strong>{request.booking_id.slice(0, 8)}</strong></td>
                          <td>{request.reason || "—"}</td>
                          <td><span className={`admin-dashboard__status admin-dashboard__status--${request.status}`}>{t(`admin.cancellationStatus.${request.status}`)}{request.resolution ? ` · ${t(`admin.cancellationResolution.${request.resolution}`)}` : ""}</span></td>
                          <td>
                            {request.status !== "resolved" ? (
                              <select
                                aria-label={t("admin.table.assignedTo")}
                                value={request.assigned_to ?? ""}
                                onChange={(event) => void updateCancellation(request, "assign", event.target.value)}
                              >
                                <option value="">{t("admin.unassigned")}</option>
                                {supportAgents.map((agent) => (
                                  <option key={agent.user_id} value={agent.user_id}>{agent.full_name} · {agent.role}</option>
                                ))}
                              </select>
                            ) : request.assigned_to
                              ? supportAgents.find((agent) => agent.user_id === request.assigned_to)?.full_name ?? request.assigned_to.slice(0, 8)
                              : "—"}
                          </td>
                          <td>{new Date(request.created_at).toLocaleString()}</td>
                          <td>
                            <div className="admin-dashboard__actions">
                              {request.status === "new" && (
                                <button type="button" onClick={() => void updateCancellation(request, "start")}>{t("admin.startReview")}</button>
                              )}
                              {request.status === "in_progress" && (
                                <>
                                  <button type="button" onClick={() => void updateCancellation(request, "approve")}>{t("admin.approveCancellation")}</button>
                                  <button type="button" onClick={() => void updateCancellation(request, "reject")}>{t("admin.rejectCancellation")}</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {cancellations.some((request) => request.status === "in_progress") && (
                <label className="admin-dashboard__resolution-note">
                  {t("admin.resolutionNote")}
                  <textarea value={cancellationResolutionNote} maxLength={1000} onChange={(event) => setCancellationResolutionNote(event.target.value)} />
                </label>
              )}
            </div>
          </>
        )}

        {tab === "catalog" && (
          <>
            <header className="admin-dashboard__header">
              <div><p>{t("admin.catalogSubtitle")}</p><h2>{t("admin.tabs.catalog")}</h2></div>
            </header>
            <div className="admin-dashboard__panel admin-dashboard__catalog">
              <div className="admin-dashboard__catalog-icon"><RefreshCw size={24} /></div>
              <div><h3>AL-TRANS</h3><p>{t("admin.catalogDescription")}</p></div>
              <button type="button" onClick={() => void syncCatalog()} disabled={syncing}>
                {syncing ? t("admin.catalogSyncLoading") : t("admin.catalogSyncButton")}
              </button>
              {syncMessage && <p className="admin-dashboard__sync-message" role="status">{syncMessage}</p>}
            </div>
            <div className="admin-dashboard__panel">
              <div className="admin-dashboard__panel-title"><h3>{t("admin.providerLogs")}</h3></div>
              {loadErrors.providerLogs ? <p className="admin-dashboard__error" role="alert">{loadErrors.providerLogs}</p> : providerLogs.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noProviderLogs")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.provider")}</th><th>{t("admin.table.operation")}</th><th>{t("admin.table.route")}</th><th>{t("admin.table.travelDate")}</th><th>{t("admin.table.status")}</th><th>{t("admin.table.response")}</th><th>{t("admin.table.requested")}</th><th>{t("admin.table.completed")}</th></tr></thead>
                    <tbody>
                      {providerLogs.map((log) => (
                        <tr key={log.id}>
                          <td>{log.provider}</td>
                          <td><strong>{log.operation}</strong><span>{log.error_code || "—"}</span></td>
                          <td>{log.route_key || "—"}</td>
                          <td>{log.travel_date || "—"}</td>
                          <td><span className={`admin-dashboard__status ${log.status === "success" ? "admin-dashboard__status--confirmed" : "admin-dashboard__status--cancelled"}`}>{log.status}</span></td>
                          <td>{log.response_code ?? "—"} {log.cache_hit ? "· cache" : ""}</td>
                          <td>{new Date(log.requested_at).toLocaleString()}</td>
                          <td>{log.completed_at ? new Date(log.completed_at).toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "routes" && (
          <>
            <header className="admin-dashboard__header">
              <div><p>{t("admin.routesSubtitle")}</p><h2>{t("admin.tabs.routes")}</h2></div>
            </header>
            <div className="admin-dashboard__toolbar">
              <label>
                <Search size={17} />
                <input value={routeSearch} onChange={(event) => setRouteSearch(event.target.value)} placeholder={t("admin.searchRoutes")} />
              </label>
              <span>{filteredRoutes.length} {t("admin.results")}</span>
            </div>
            <div className="admin-dashboard__panel">
              {loadErrors.routes ? <p className="admin-dashboard__error" role="alert">{loadErrors.routes}</p> : filteredRoutes.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noRoutes")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.route")}</th><th>{t("admin.table.providerId")}</th><th>{t("admin.table.schedules")}</th><th>{t("admin.table.status")}</th></tr></thead>
                    <tbody>
                      {filteredRoutes.map((route) => (
                        <tr key={route.id}>
                          <td><strong>{route.fromName} → {route.toName}</strong></td>
                          <td>{route.provider_route_id || "—"}</td>
                          <td>
                            {route.scheduleCount ?? 0}
                            {!!route.schedules?.length && (
                              <details>
                                <summary>{t("admin.scheduleDetails")}</summary>
                                {route.schedules.map((schedule) => (
                                  <span key={schedule.id}>
                                    {schedule.title} · {schedule.direction} · {t("admin.weekday")} {schedule.service_weekday}
                                    {schedule.stops.map((stop) => (
                                      <span key={`${schedule.id}-${stop.stop_order}`}>
                                        {stop.stop_order + 1}. {stop.location_name} · {stop.departure_time}
                                        {stop.day_offset > 0 ? ` (+${stop.day_offset} ${t("admin.dayOffset")})` : ""}
                                        {stop.place ? ` · ${stop.place}` : ""}
                                      </span>
                                    ))}
                                  </span>
                                ))}
                              </details>
                            )}
                          </td>
                          <td><span className={`admin-dashboard__status ${route.active ? "admin-dashboard__status--confirmed" : "admin-dashboard__status--cancelled"}`}>{route.active ? t("admin.active") : t("admin.inactive")}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="admin-dashboard__schedule-note">{t("admin.scheduleDisclaimer")}</p>
            </div>
          </>
        )}
        {tab === "locations" && (
          <>
            <header className="admin-dashboard__header">
              <div><p>{t("admin.locationsSubtitle")}</p><h2>{t("admin.tabs.locations")}</h2></div>
            </header>
            <div className="admin-dashboard__toolbar">
              <label>
                <Search size={17} />
                <input value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} placeholder={t("admin.searchLocations")} />
              </label>
              <span>{filteredLocations.length} {t("admin.results")}</span>
            </div>
            <div className="admin-dashboard__panel">
              {loadErrors.locations ? <p className="admin-dashboard__error" role="alert">{loadErrors.locations}</p> : filteredLocations.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noLocations")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr>
                      <th>{t("admin.table.location")}</th>
                      <th>UK / EN / IT</th>
                      <th>{t("admin.table.providerId")}</th>
                      <th>{t("admin.table.country")}</th>
                      <th>{t("admin.table.coordinates")}</th>
                      <th>{t("admin.table.status")}</th>
                    </tr></thead>
                    <tbody>
                      {filteredLocations.map((locationRow) => (
                        <tr key={locationRow.id}>
                          <td>
                            <strong>{locationRow.name_uk}</strong>
                            <span>{locationRow.aliases.join(", ") || "—"}</span>
                            {["super_admin", "admin", "content_manager"].includes(role) && (
                              <details onToggle={(event) => {
                                if (event.currentTarget.open && editingLocationId !== locationRow.id) {
                                  beginLocationEdit(locationRow);
                                }
                              }}>
                                <summary>{t("admin.editLocalization")}</summary>
                                {editingLocationId === locationRow.id && (
                                  <div className="admin-dashboard__location-editor">
                                    <label>UK<input value={locationDraft.name_uk} onChange={(event) => setLocationDraft((current) => ({ ...current, name_uk: event.target.value }))} /></label>
                                    <label>EN<input value={locationDraft.name_en} onChange={(event) => setLocationDraft((current) => ({ ...current, name_en: event.target.value }))} /></label>
                                    <label>IT<input value={locationDraft.name_it} onChange={(event) => setLocationDraft((current) => ({ ...current, name_it: event.target.value }))} /></label>
                                    <label>{t("admin.aliases")}<input value={locationDraft.aliases} onChange={(event) => setLocationDraft((current) => ({ ...current, aliases: event.target.value }))} /></label>
                                    <button type="button" onClick={() => void saveLocationLocalization(locationRow.id)}>{t("admin.saveContent")}</button>
                                  </div>
                                )}
                              </details>
                            )}
                          </td>
                          <td>{locationRow.name_uk} / {locationRow.name_en ?? "—"} / {locationRow.name_it ?? "—"}</td>
                          <td>{locationRow.provider_location_id ?? "—"}</td>
                          <td>{locationRow.country_code ?? "—"}</td>
                          <td>{locationRow.latitude != null && locationRow.longitude != null ? `${locationRow.latitude}, ${locationRow.longitude}` : "—"}</td>
                          <td><span className={`admin-dashboard__status ${locationRow.active ? "admin-dashboard__status--confirmed" : "admin-dashboard__status--cancelled"}`}>{locationRow.active ? t("admin.active") : t("admin.inactive")}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
        {tab === "popular" && (
          <>
            <header className="admin-dashboard__header">
              <div><p>{t("admin.popularSubtitle")}</p><h2>{t("admin.tabs.popular")}</h2></div>
            </header>
            <div className="admin-dashboard__panel admin-dashboard__content-editor">
              <label>
                {t("admin.route")}
                <select value={popularRouteId} onChange={(event) => setPopularRouteId(event.target.value)}>
                  <option value="">—</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>{route.fromName} → {route.toName}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("admin.locale")}
                <select value={popularLocale} onChange={(event) => setPopularLocale(event.target.value as "uk" | "en" | "it")}>
                  <option value="uk">UK</option><option value="en">EN</option><option value="it">IT</option>
                </select>
              </label>
              <button type="button" disabled={!popularRouteId} onClick={() => void addPopularRoute()}>{t("admin.addPopular")}</button>
            </div>
            <div className="admin-dashboard__panel">
              {loadErrors.popularRoutes ? <p className="admin-dashboard__error" role="alert">{loadErrors.popularRoutes}</p> : popularRoutes.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noPopular")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.route")}</th><th>{t("admin.table.locale")}</th><th>{t("admin.table.order")}</th><th>{t("admin.table.status")}</th><th>{t("admin.table.actions")}</th></tr></thead>
                    <tbody>
                      {popularRoutes.map((row) => (
                        <tr key={row.id}>
                          <td><strong>{row.routeName}</strong></td>
                          <td>{row.locale.toUpperCase()}</td>
                          <td>{row.sort_order}</td>
                          <td><button type="button" onClick={() => void togglePopularRoute(row)} className={`admin-dashboard__status ${row.active ? "admin-dashboard__status--confirmed" : "admin-dashboard__status--cancelled"}`}>{row.active ? t("admin.active") : t("admin.inactive")}</button></td>
                          <td className="admin-dashboard__actions">
                            <button type="button" aria-label={t("admin.moveUp")} onClick={() => void updatePopularOrder(row, -1)}>↑</button>
                            <button type="button" aria-label={t("admin.moveDown")} onClick={() => void updatePopularOrder(row, 1)}>↓</button>
                            <button type="button" onClick={() => { if (window.confirm(t("admin.confirmDeletePopular"))) void deletePopularRoute(row); }}>{t("admin.delete")}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
        {tab === "content" && (
          <>
            <header className="admin-dashboard__header">
              <div><p>{t("admin.contentSubtitle")}</p><h2>{t("admin.tabs.content")}</h2></div>
            </header>
            <div className="admin-dashboard__panel admin-dashboard__json-editor">
              <div className="admin-dashboard__json-fields">
                <label>
                  {t("admin.contentKey")}
                  <input value={contentKey} onChange={(event) => setContentKey(event.target.value)} />
                </label>
                <label>
                  {t("admin.locale")}
                  <select value={contentLocale} onChange={(event) => setContentLocale(event.target.value as "uk" | "en" | "it")}>
                    <option value="uk">UK</option>
                    <option value="en">EN</option>
                    <option value="it">IT</option>
                  </select>
                </label>
              </div>
              <label>
                JSON
                <textarea value={contentJson} onChange={(event) => setContentJson(event.target.value)} rows={10} spellCheck={false} />
              </label>
              <p className="admin-dashboard__editor-hint">{t("admin.contentStructureHint")}</p>
              <button type="button" onClick={() => void savePublicContent()}>{t("admin.saveContent")}</button>
              {contentMessage && <p role="status">{contentMessage}</p>}
            </div>
            <div className="admin-dashboard__panel">
              {loadErrors.publicContent ? <p className="admin-dashboard__error" role="alert">{loadErrors.publicContent}</p> : publicContent.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noContent")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.contentKey")}</th><th>{t("admin.table.locale")}</th><th>{t("admin.table.updated")}</th><th>{t("admin.table.status")}</th><th>{t("admin.table.actions")}</th></tr></thead>
                    <tbody>
                      {publicContent.map((row) => (
                      <tr key={row.id} className={selectedContentId === row.id ? "is-selected" : ""}>
                          <td><button className="admin-dashboard__content-select" type="button" onClick={() => selectPublicContent(row.id)}><strong>{row.content_key}</strong></button></td>
                          <td>{row.locale.toUpperCase()}</td>
                          <td>{new Date(row.updated_at).toLocaleString()}</td>
                          <td><button type="button" onClick={() => void togglePublicContent(row)} className={`admin-dashboard__status ${row.active ? "admin-dashboard__status--confirmed" : "admin-dashboard__status--cancelled"}`}>{row.active ? t("admin.active") : t("admin.inactive")}</button></td>
                          <td><button type="button" onClick={() => { if (window.confirm(t("admin.confirmDeleteContent"))) void deletePublicContent(row); }}>{t("admin.delete")}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
        {tab === "audit" && (
          <>
            <header className="admin-dashboard__header">
              <div><p>{t("admin.auditSubtitle")}</p><h2>{t("admin.tabs.audit")}</h2></div>
            </header>
            <div className="admin-dashboard__panel">
              {loadErrors.auditLogs ? <p className="admin-dashboard__error" role="alert">{loadErrors.auditLogs}</p> : auditLogs.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noAudit")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.action")}</th><th>{t("admin.table.actor")}</th><th>{t("admin.table.target")}</th><th>{t("admin.table.details")}</th><th>{t("admin.table.created")}</th></tr></thead>
                    <tbody>
                      {auditLogs.map((row) => (
                        <tr key={row.id}>
                          <td><strong>{row.action}</strong></td>
                          <td>{row.actor_id ? row.actor_id.slice(0, 8) : "—"}</td>
                          <td>{row.target_type}{row.target_id ? ` · ${row.target_id.slice(0, 8)}` : ""}</td>
                          <td><code>{JSON.stringify(row.metadata)}</code></td>
                          <td>{new Date(row.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
        {tab === "settings" && (
          <>
            <header className="admin-dashboard__header">
              <div><p>{t("admin.settingsSubtitle")}</p><h2>{t("admin.tabs.settings")}</h2></div>
            </header>
            <div className="admin-dashboard__panel admin-dashboard__settings">
              {loadErrors.settings && <p className="admin-dashboard__error" role="alert">{loadErrors.settings}</p>}
              <label>{t("admin.settings.timezone")}
                <input value={settingsDraft.timezone} onChange={(event) => setSettingsDraft((current) => ({ ...current, timezone: event.target.value }))} />
              </label>
              <label>{t("admin.settings.expirationMinutes")}
                <input type="number" min="1" value={settingsDraft.expirationMinutes} onChange={(event) => setSettingsDraft((current) => ({ ...current, expirationMinutes: event.target.value }))} />
              </label>
              <label>{t("admin.settings.currencies")}
                <input value={settingsDraft.currencies} onChange={(event) => setSettingsDraft((current) => ({ ...current, currencies: event.target.value }))} />
              </label>
              <label>{t("admin.settings.maxPassengers")}
                <input type="number" min="1" max="20" value={settingsDraft.maxPassengers} onChange={(event) => setSettingsDraft((current) => ({ ...current, maxPassengers: event.target.value }))} />
              </label>
              <label>{t("admin.settings.defaultLocale")}
                <select value={settingsDraft.defaultLocale} onChange={(event) => setSettingsDraft((current) => ({ ...current, defaultLocale: event.target.value }))}>
                  <option value="uk">UK</option><option value="en">EN</option><option value="it">IT</option>
                </select>
              </label>
              <label>{t("admin.settings.supportEmail")}
                <input type="email" value={settingsDraft.supportEmail} onChange={(event) => setSettingsDraft((current) => ({ ...current, supportEmail: event.target.value }))} />
              </label>
              <label>{t("admin.settings.supportPhone")}
                <input type="tel" value={settingsDraft.supportPhone} onChange={(event) => setSettingsDraft((current) => ({ ...current, supportPhone: event.target.value }))} />
              </label>
              <label className="admin-dashboard__checkbox">
                <input type="checkbox" checked={settingsDraft.maintenanceMode} onChange={(event) => setSettingsDraft((current) => ({ ...current, maintenanceMode: event.target.checked }))} />
                {t("admin.settings.maintenanceMode")}
              </label>
              <p>{t("admin.settings.runtimeNote")}</p>
              <button type="button" onClick={() => void saveSettings()}>{t("admin.saveSettings")}</button>
            </div>
          </>
        )}
        {selectedBooking && (
          <div className="admin-dashboard__modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedBooking(null);
          }}>
            <section
              aria-modal="true"
              aria-labelledby="booking-modal-title"
              className="admin-dashboard__booking-modal"
              role="dialog"
            >
              <header>
                <div>
                  <p>Бронювання</p>
                  <h2 id="booking-modal-title">{selectedBooking.booking_number}</h2>
                </div>
                <button aria-label="Закрити" onClick={() => setSelectedBooking(null)} type="button">
                  <X size={18} />
                </button>
              </header>

              {(() => {
                const passenger = selectedBooking.booking_passengers?.[0];
                const phone = passenger?.phone?.replace(/[^\d+]/g, "") ?? "";
                const whatsAppPhone = phone.replace(/^\+/, "");
                return (
                  <>
                    <div className="admin-dashboard__booking-modal-grid">
                      <article>
                        <span>Пасажир</span>
                        <strong>{passenger?.full_name || "—"}</strong>
                        {passenger?.phone && <p>{passenger.phone}</p>}
                        {passenger?.email && <p>{passenger.email}</p>}
                      </article>
                      <article>
                        <span>Рейс</span>
                        <strong>
                          {selectedBooking.trip_details?.from_city ?? "—"} → {selectedBooking.trip_details?.to_city ?? "—"}
                        </strong>
                        <p>
                          {selectedBooking.trip_details?.departure_at
                            ? new Date(selectedBooking.trip_details.departure_at).toLocaleString()
                            : "—"}
                        </p>
                      </article>
                      <article>
                        <span>Статус і сума</span>
                        <strong>{t(`admin.status.${selectedBooking.status}`)}</strong>
                        <p>{Number(selectedBooking.total_amount).toLocaleString()} {selectedBooking.currency}</p>
                      </article>
                    </div>

                    <div className="admin-dashboard__contact-actions">
                      {phone && (
                        <>
                          <a href={`tel:${phone}`}><Phone size={17} /> Дзвонити</a>
                          <a href={`https://wa.me/${whatsAppPhone}`} target="_blank" rel="noreferrer">
                            <MessageCircle size={17} /> Написати в WhatsApp
                          </a>
                        </>
                      )}
                      {passenger?.email && (
                        <a href={`mailto:${passenger.email}`}><Mail size={17} /> Написати email</a>
                      )}
                    </div>

                    <div className="admin-dashboard__modal-actions">
                      {["super_admin", "admin"].includes(role) && selectedBooking.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => void updateBookingStatus(selectedBooking.id, "confirmed").then((ok) => {
                            if (ok) setSelectedBooking((current) => current ? { ...current, status: "confirmed" } : null);
                          })}
                        >
                          Підтвердити бронювання
                        </button>
                      )}
                      {["super_admin", "admin"].includes(role) && ["pending", "confirmed"].includes(selectedBooking.status) && (
                        <button
                          className="is-danger"
                          type="button"
                          onClick={() => void requestBookingCancellation()}
                        >
                          Запросити скасування
                        </button>
                      )}
                    </div>

                    {["pending", "confirmed"].includes(selectedBooking.status) && (
                      <div className="admin-dashboard__cancellation-request">
                        <label>
                          Причина скасування для диспетчера
                          <textarea
                            maxLength={1000}
                            onChange={(event) => setCancellationRequestReason(event.target.value)}
                            placeholder="Наприклад: пасажир попросив перенести або скасувати поїздку"
                            value={cancellationRequestReason}
                          />
                        </label>
                        {cancellationRequestSaving && <p>Створюємо запит...</p>}
                      </div>
                    )}

                    <div className="admin-dashboard__booking-edit">
                      {!bookingEditing ? (
                        <button type="button" onClick={() => setBookingEditing(true)}>
                          Редагувати пасажира
                        </button>
                      ) : (
                        <>
                          <h3>Редагування пасажира</h3>
                          <label>
                            Ім’я та прізвище
                            <input
                              value={bookingEditDraft.fullName}
                              onChange={(event) => setBookingEditDraft((current) => ({ ...current, fullName: event.target.value }))}
                            />
                          </label>
                          <label>
                            Email
                            <input
                              type="email"
                              value={bookingEditDraft.email}
                              onChange={(event) => setBookingEditDraft((current) => ({ ...current, email: event.target.value }))}
                            />
                          </label>
                          <label>
                            Телефон
                            <input
                              type="tel"
                              value={bookingEditDraft.phone}
                              onChange={(event) => setBookingEditDraft((current) => ({ ...current, phone: event.target.value }))}
                            />
                          </label>
                          <div className="admin-dashboard__modal-actions">
                            <button type="button" disabled={bookingEditSaving} onClick={() => void saveBookingPassenger()}>
                              {bookingEditSaving ? "Збереження..." : "Зберегти"}
                            </button>
                            <button type="button" onClick={() => setBookingEditing(false)}>Скасувати редагування</button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="admin-dashboard__passenger-review">
                      <h3>Результат поїздки пасажира</h3>
                      <label className="admin-dashboard__checkbox">
                        <input
                          checked={tripCompleted}
                          onChange={(event) => setTripCompleted(event.target.checked)}
                          type="checkbox"
                        />
                        Поїздка відбулася
                      </label>
                      <div className="admin-dashboard__rating" aria-label="Рейтинг пасажира">
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <button
                            aria-label={`Рейтинг ${rating}`}
                            className={rating <= passengerRating ? "is-active" : ""}
                            key={rating}
                            onClick={() => setPassengerRating(rating)}
                            type="button"
                          >
                            <Star fill={rating <= passengerRating ? "currentColor" : "none"} size={20} />
                          </button>
                        ))}
                      </div>
                      <label>
                        Коментар агенту
                        <textarea
                          maxLength={2000}
                          onChange={(event) => setPassengerComment(event.target.value)}
                          placeholder="Як пройшла поїздка, особливості пасажира або наступного зв’язку..."
                          value={passengerComment}
                        />
                      </label>
                      <button
                        disabled={interactionSaving}
                        onClick={() => void savePassengerInteraction()}
                        type="button"
                      >
                        {interactionSaving ? "Збереження..." : "Зберегти коментар і рейтинг"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function BookingTable({
  bookings,
  onStatusChange,
  onOpen,
  canManageStatus,
  t,
}: {
  bookings: BookingRow[];
  onStatusChange: (id: string, status: BookingRow["status"]) => Promise<boolean>;
  onOpen: (booking: BookingRow) => void;
  canManageStatus: boolean;
  t: (key: string) => string;
}) {
  if (bookings.length === 0) return <p className="admin-dashboard__empty">{t("admin.noBookings")}</p>;
  return (
    <div className="admin-dashboard__table-wrap">
      <table className="admin-dashboard__table">
        <thead><tr><th>{t("admin.table.booking")}</th><th>{t("admin.table.passenger")}</th><th>{t("admin.table.amount")}</th><th>{t("admin.table.status")}</th><th>{t("admin.table.actions")}</th></tr></thead>
        <tbody>
          {bookings.map((booking) => {
            const passenger = booking.booking_passengers?.[0];
            return (
              <tr key={booking.id} onDoubleClick={() => onOpen(booking)}>
                <td>
                  <strong>{booking.booking_number}</strong>
                  <span>{new Date(booking.created_at).toLocaleString()}</span>
                  <details>
                    <summary>{t("admin.bookingDetails")}</summary>
                    <span>{booking.trip_details?.from_city ?? "—"} → {booking.trip_details?.to_city ?? "—"}</span>
                    <span>{booking.trip_details?.departure_at ? new Date(booking.trip_details.departure_at).toLocaleString() : "—"}</span>
                    <span>{t("admin.table.tripId")}: {booking.trip_id}</span>
                    <span>{t("admin.table.providerId")}: {booking.provider_booking_id ?? "—"}</span>
                    <span>{t("admin.table.expires")}: {booking.expires_at ? new Date(booking.expires_at).toLocaleString() : "—"}</span>
                    <span>{t("admin.table.confirmed")}: {booking.confirmed_at ? new Date(booking.confirmed_at).toLocaleString() : "—"}</span>
                    {booking.booking_passengers.map((item, index) => (
                      <span key={`${booking.id}-passenger-${index}`}>{item.full_name} · {item.phone ?? item.email ?? "—"}</span>
                    ))}
                  </details>
                </td>
                <td><strong>{passenger?.full_name || "—"}</strong><span>{passenger?.phone || passenger?.email || "—"}</span></td>
                <td>{Number(booking.total_amount).toLocaleString()} {booking.currency}</td>
                <td><span className={`admin-dashboard__status admin-dashboard__status--${booking.status}`}>{t(`admin.status.${booking.status}`)}</span></td>
                <td>
                  <div className="admin-dashboard__actions">
                    <button type="button" onClick={() => onOpen(booking)}>Відкрити</button>
                  </div>
                  {canManageStatus && booking.status === "pending" && (
                    <div className="admin-dashboard__actions">
                      <button type="button" onClick={() => void onStatusChange(booking.id, "confirmed")}>{t("admin.confirm")}</button>
                      <button type="button" onClick={() => void onStatusChange(booking.id, "cancelled")}>{t("admin.cancel")}</button>
                    </div>
                  )}
                  {canManageStatus && booking.status === "confirmed" && (
                    <button type="button" onClick={() => void onStatusChange(booking.id, "cancelled")}>{t("admin.cancel")}</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  t,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  t: (key: string) => string;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <nav className="admin-dashboard__pagination" aria-label={t("admin.pagination")}>
      <button type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft size={16} aria-hidden="true" /> {t("admin.previous")}
      </button>
      <span>{page + 1} / {pages}</span>
      <button type="button" disabled={page + 1 >= pages} onClick={() => onPageChange(page + 1)}>
        {t("admin.next")} <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
