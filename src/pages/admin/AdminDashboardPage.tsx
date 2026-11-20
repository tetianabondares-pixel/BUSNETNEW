import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  RefreshCw,
  Search,
  Settings,
  TicketCheck,
  Users,
} from "lucide-react";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";
import "./AdminDashboardPage.css";

type Tab = "overview" | "bookings" | "passengers" | "cancellations" | "catalog" | "routes" | "popular" | "content" | "audit";

type CancellationRow = {
  id: string;
  booking_id: string;
  passenger_id: string;
  reason: string;
  status: "new" | "in_progress" | "resolved";
  created_at: string;
};

type PassengerRow = {
  id: string;
  full_name: string;
  email: string | null;
  preferred_locale: string;
  phone: string | null;
  created_at: string;
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
  passenger_id: string | null;
  trip_id: string;
  booking_passengers: Array<{ full_name: string; email: string | null; phone: string | null }>;
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
  const { tokens } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [bookingSearch, setBookingSearch] = useState("");
  const [passengers, setPassengers] = useState<PassengerRow[]>([]);
  const [passengerSearch, setPassengerSearch] = useState("");
  const [cancellations, setCancellations] = useState<CancellationRow[]>([]);
  const [cancellationSearch, setCancellationSearch] = useState("");
  const [providerLogs, setProviderLogs] = useState<ProviderLogRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [routeSearch, setRouteSearch] = useState("");
  const [popularRoutes, setPopularRoutes] = useState<PopularRouteRow[]>([]);
  const [publicContent, setPublicContent] = useState<PublicContentRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [popularRouteId, setPopularRouteId] = useState("");
  const [popularLocale, setPopularLocale] = useState<"uk" | "en" | "it">("uk");
  const [contentKey, setContentKey] = useState("finalCta");
  const [contentLocale, setContentLocale] = useState<"uk" | "en" | "it">("uk");
  const [contentJson, setContentJson] = useState("{}");
  const [contentMessage, setContentMessage] = useState("");
  const [stats, setStats] = useState({
    bookings: 0,
    pending: 0,
    confirmed: 0,
    cancellations: 0,
    locations: 0,
    routes: 0,
    schedules: 0,
  });

  useEffect(() => {
    const pathTab: Record<string, Tab> = {
      "/admin/bookings": "bookings",
      "/admin/passengers": "passengers",
      "/admin/cancellations": "cancellations",
      "/admin/catalog": "catalog",
      "/admin/routes": "routes",
      "/admin/popular-routes": "popular",
      "/admin/content": "content",
      "/admin/audit": "audit",
    };
    setTab(pathTab[location.pathname] ?? "overview");
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
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
        setLoading(false);
        return;
      }
      setRole(profile.role);
      setAuthorized(true);
      await Promise.all([
        loadStats(),
        loadBookings(),
        loadPassengers(),
        loadCancellations(),
        loadProviderLogs(),
        loadRoutes(),
        loadPopularRoutes(),
        loadPublicContent(),
        loadAuditLogs(),
      ]);
      if (!cancelled) setLoading(false);
    };
    void initialize();
    return () => { cancelled = true; };
  }, [navigate]);

  const loadStats = async () => {
    const [
      bookingsResult,
      pendingResult,
      confirmedResult,
      cancellationsResult,
      locationsResult,
      routesResult,
      schedulesResult,
    ] = await Promise.all([
      supabase.from("bookings").select("id", { count: "exact", head: true }),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
      supabase.from("booking_cancellation_requests").select("id", { count: "exact", head: true }).in("status", ["new", "in_progress"]),
      supabase.from("locations").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("routes").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("provider_route_schedules").select("id", { count: "exact", head: true }).eq("active", true),
    ]);
    setStats({
      bookings: bookingsResult.count ?? 0,
      pending: pendingResult.count ?? 0,
      confirmed: confirmedResult.count ?? 0,
      cancellations: cancellationsResult.count ?? 0,
      locations: locationsResult.count ?? 0,
      routes: routesResult.count ?? 0,
      schedules: schedulesResult.count ?? 0,
    });
  };

  const loadBookings = async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("id,booking_number,status,currency,total_amount,created_at,expires_at,passenger_id,trip_id,booking_passengers(full_name,email,phone)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setBookings(data as unknown as BookingRow[]);
  };

  const loadPassengers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,full_name,email,preferred_locale,phone,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) setPassengers(data as unknown as PassengerRow[]);
  };

  const loadCancellations = async () => {
    const { data, error } = await supabase
      .from("booking_cancellation_requests")
      .select("id,booking_id,passenger_id,reason,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) setCancellations(data as unknown as CancellationRow[]);
  };

  const loadProviderLogs = async () => {
    const { data, error } = await supabase
      .from("provider_request_logs")
      .select("id,provider,operation,route_key,travel_date,status,response_code,cache_hit,error_code,requested_at,completed_at")
      .order("requested_at", { ascending: false })
      .limit(50);
    if (!error && data) setProviderLogs(data as unknown as ProviderLogRow[]);
  };

  const loadRoutes = async () => {
    const { data: routeData, error: routesError } = await supabase
      .from("routes")
      .select("id,provider_route_id,active,from_location_id,to_location_id")
      .order("provider_route_id", { ascending: true })
      .limit(300);
    if (routesError || !routeData) return;

    const routeRows = routeData as unknown as RouteRow[];
    const locationIds = [...new Set(routeRows.flatMap((route) => [
      route.from_location_id,
      route.to_location_id,
    ]))];
    const providerRouteIds = [...new Set(routeRows
      .map((route) => route.provider_route_id)
      .filter((id): id is string => Boolean(id)))];

    const [{ data: locationData }, { data: scheduleData }] = await Promise.all([
      supabase
        .from("locations")
        .select("id,name_uk,name_en,name_it")
        .in("id", locationIds),
      providerRouteIds.length
        ? supabase
          .from("provider_route_schedules")
          .select("provider_route_id")
          .in("provider_route_id", providerRouteIds)
          .eq("active", true)
        : Promise.resolve({ data: [] as Array<{ provider_route_id: string }> }),
    ]);

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
    for (const schedule of scheduleData ?? []) {
      scheduleCounts.set(
        schedule.provider_route_id,
        (scheduleCounts.get(schedule.provider_route_id) ?? 0) + 1,
      );
    }

    setRoutes(routeRows.map((route) => ({
      ...route,
      fromName: names.get(route.from_location_id) ?? route.from_location_id,
      toName: names.get(route.to_location_id) ?? route.to_location_id,
      scheduleCount: route.provider_route_id
        ? scheduleCounts.get(route.provider_route_id) ?? 0
        : 0,
    })));
  };

  const loadPopularRoutes = async () => {
    const { data, error } = await supabase
      .from("popular_routes")
      .select("id,route_id,locale,sort_order,is_featured,active")
      .order("locale")
      .order("sort_order");
    if (error || !data) return;

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
  };

  const loadPublicContent = async () => {
    const { data, error } = await supabase
      .from("public_content")
      .select("id,content_key,locale,content,active,updated_at")
      .order("content_key");
    if (!error && data) setPublicContent(data as unknown as PublicContentRow[]);
  };

  const loadAuditLogs = async () => {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id,actor_id,action,target_type,target_id,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setAuditLogs(data as unknown as AuditRow[]);
  };

  const addPopularRoute = async () => {
    if (!popularRouteId) return;
    const { error } = await supabase.from("popular_routes").upsert({
      route_id: popularRouteId,
      locale: popularLocale,
      sort_order: popularRoutes.filter((row) => row.locale === popularLocale).length,
      is_featured: true,
      active: true,
    }, { onConflict: "route_id,locale" });
    if (!error) {
      await supabase.rpc("log_admin_action", {
        p_action: "popular_route_upsert",
        p_target_type: "popular_route",
        p_target_id: popularRouteId,
        p_metadata: { locale: popularLocale },
      });
      await loadPopularRoutes();
    }
  };

  const togglePopularRoute = async (row: PopularRouteRow) => {
    const { error } = await supabase
      .from("popular_routes")
      .update({ active: !row.active })
      .eq("id", row.id);
    if (!error) {
      await supabase.rpc("log_admin_action", {
        p_action: "popular_route_toggle",
        p_target_type: "popular_route",
        p_target_id: row.id,
        p_metadata: { active: !row.active },
      });
      await loadPopularRoutes();
    }
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
    const { error } = await supabase
      .from("public_content")
      .upsert({
        content_key: contentKey.trim(),
        locale: contentLocale,
        content: parsed,
        active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "content_key,locale" });
    if (error) {
      setContentMessage(t("admin.saveContentFailed"));
      return;
    }
    await supabase.rpc("log_admin_action", {
      p_action: "public_content_upsert",
      p_target_type: "public_content",
      p_target_id: `${contentKey}:${contentLocale}`,
      p_metadata: { locale: contentLocale, contentKey },
    });
    await loadPublicContent();
    setContentMessage(t("admin.saveContentSuccess"));
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
      await Promise.all([loadStats(), loadProviderLogs(), loadRoutes()]);
    } catch {
      setSyncMessage(t("admin.catalogSyncFailed"));
    } finally {
      setSyncing(false);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: BookingRow["status"]) => {
    const { error } = await supabase.rpc("update_booking_status", {
      p_booking_id: bookingId,
      p_status: status,
    });
    if (!error) await loadBookings();
  };

  const updateCancellation = async (
    request: CancellationRow,
    action: "start" | "resolve" | "cancel",
  ) => {
    if (action === "start") {
      const { error } = await supabase
        .from("booking_cancellation_requests")
        .update({ status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", request.id);
      if (!error) await loadCancellations();
      return;
    }

    if (action === "cancel") {
      await updateBookingStatus(request.booking_id, "cancelled");
    }
    const { error } = await supabase
      .from("booking_cancellation_requests")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .eq("id", request.id);
    if (!error) await Promise.all([loadCancellations(), loadBookings(), loadStats()]);
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

  const filteredBookings = bookings.filter((booking) => {
    const query = bookingSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      booking.booking_number,
      booking.status,
      ...booking.booking_passengers.flatMap((passenger) => [passenger.full_name, passenger.email ?? "", passenger.phone ?? ""]),
    ].some((value) => value.toLowerCase().includes(query));
  });

  const filteredPassengers = passengers.filter((passenger) => {
    const query = passengerSearch.trim().toLowerCase();
    if (!query) return true;
    return [passenger.full_name, passenger.email ?? "", passenger.phone ?? "", passenger.preferred_locale]
      .some((value) => value.toLowerCase().includes(query));
  });

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

  const navItems: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
    { id: "overview", label: t("admin.tabs.overview"), icon: LayoutDashboard },
    { id: "bookings", label: t("admin.tabs.bookings"), icon: TicketCheck },
    { id: "passengers", label: t("admin.tabs.passengers"), icon: Users },
    { id: "cancellations", label: t("admin.tabs.cancellations"), icon: TicketCheck },
    { id: "catalog", label: t("admin.tabs.catalog"), icon: RefreshCw },
    { id: "routes", label: t("admin.tabs.routes"), icon: MapIcon },
    { id: "popular", label: t("admin.tabs.popular"), icon: BookOpen },
    { id: "content", label: t("admin.tabs.content"), icon: Settings },
    { id: "audit", label: t("admin.tabs.audit"), icon: Users },
  ];

  const tabPaths: Record<Tab, string> = {
    overview: "/admin",
    bookings: "/admin/bookings",
    passengers: "/admin/passengers",
    cancellations: "/admin/cancellations",
    catalog: "/admin/catalog",
    routes: "/admin/routes",
    popular: "/admin/popular-routes",
    content: "/admin/content",
    audit: "/admin/audit",
  };

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
              onClick={() => navigate(tabPaths[id])}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-dashboard__account">
          <div><Users size={17} /><span>{role}</span></div>
          <button type="button" onClick={() => void signOut()}><LogOut size={17} /> {t("admin.signOut")}</button>
        </div>
      </aside>

      <section className="admin-dashboard__workspace">
        {tab === "overview" && (
          <>
            <header className="admin-dashboard__header">
              <div>
                <p>{t("admin.overviewSubtitle")}</p>
                <h2>{t("admin.tabs.overview")}</h2>
              </div>
              <button type="button" onClick={() => navigate("/admin/catalog")}><RefreshCw size={17} /> {t("admin.catalogSyncButton")}</button>
            </header>
            <div className="admin-dashboard__stats">
              <article><span><TicketCheck size={18} /></span><strong>{stats.bookings}</strong><p>{t("admin.stats.bookings")}</p></article>
              <article><span><TicketCheck size={18} /></span><strong>{stats.pending}</strong><p>{t("admin.stats.pending")}</p></article>
              <article><span><TicketCheck size={18} /></span><strong>{stats.confirmed}</strong><p>{t("admin.stats.confirmed")}</p></article>
              <article><span><TicketCheck size={18} /></span><strong>{stats.cancellations}</strong><p>{t("admin.stats.cancellations")}</p></article>
              <article><span><MapIcon size={18} /></span><strong>{stats.locations}</strong><p>{t("admin.stats.locations")}</p></article>
              <article><span><BookOpen size={18} /></span><strong>{stats.routes}</strong><p>{t("admin.stats.routes")}</p></article>
              <article><span><Settings size={18} /></span><strong>{stats.schedules}</strong><p>{t("admin.stats.schedules")}</p></article>
            </div>
            <div className="admin-dashboard__panel">
              <div className="admin-dashboard__panel-title">
                <h3>{t("admin.recentBookings")}</h3>
                <button type="button" onClick={() => navigate("/admin/bookings")}>{t("admin.viewAll")}</button>
              </div>
              <BookingTable bookings={bookings.slice(0, 5)} onStatusChange={updateBookingStatus} t={t} />
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
                <input value={bookingSearch} onChange={(event) => setBookingSearch(event.target.value)} placeholder={t("admin.searchBookings")} />
              </label>
              <span>{filteredBookings.length} {t("admin.results")}</span>
              <button className="admin-dashboard__export" type="button" onClick={exportBookingsCsv}>
                {t("admin.exportCsv")}
              </button>
            </div>
            <div className="admin-dashboard__panel">
              <BookingTable bookings={filteredBookings} onStatusChange={updateBookingStatus} t={t} />
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
                <input value={passengerSearch} onChange={(event) => setPassengerSearch(event.target.value)} placeholder={t("admin.searchPassengers")} />
              </label>
              <span>{filteredPassengers.length} {t("admin.results")}</span>
            </div>
            <div className="admin-dashboard__panel">
              {filteredPassengers.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noPassengers")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.passenger")}</th><th>{t("admin.table.email")}</th><th>{t("admin.table.phone")}</th><th>{t("admin.table.locale")}</th><th>{t("admin.table.created")}</th></tr></thead>
                    <tbody>
                      {filteredPassengers.map((passenger) => (
                        <tr key={passenger.id}>
                          <td><strong>{passenger.full_name || "—"}</strong></td>
                          <td>{passenger.email || "—"}</td>
                          <td>{passenger.phone || "—"}</td>
                          <td>{passenger.preferred_locale}</td>
                          <td>{new Date(passenger.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
              {filteredCancellations.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noCancellations")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.booking")}</th><th>{t("admin.table.reason")}</th><th>{t("admin.table.status")}</th><th>{t("admin.table.created")}</th><th>{t("admin.table.actions")}</th></tr></thead>
                    <tbody>
                      {filteredCancellations.map((request) => (
                        <tr key={request.id}>
                          <td><strong>{request.booking_id.slice(0, 8)}</strong></td>
                          <td>{request.reason || "—"}</td>
                          <td><span className={`admin-dashboard__status admin-dashboard__status--${request.status}`}>{request.status}</span></td>
                          <td>{new Date(request.created_at).toLocaleString()}</td>
                          <td>
                            <div className="admin-dashboard__actions">
                              {request.status === "new" && (
                                <button type="button" onClick={() => void updateCancellation(request, "start")}>{t("admin.startReview")}</button>
                              )}
                              {request.status === "in_progress" && (
                                <>
                                  <button type="button" onClick={() => void updateCancellation(request, "cancel")}>{t("admin.approveCancellation")}</button>
                                  <button type="button" onClick={() => void updateCancellation(request, "resolve")}>{t("admin.closeRequest")}</button>
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
              {providerLogs.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noProviderLogs")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.operation")}</th><th>{t("admin.table.status")}</th><th>{t("admin.table.response")}</th><th>{t("admin.table.requested")}</th></tr></thead>
                    <tbody>
                      {providerLogs.map((log) => (
                        <tr key={log.id}>
                          <td><strong>{log.operation}</strong><span>{log.error_code || log.route_key || "—"}</span></td>
                          <td><span className={`admin-dashboard__status ${log.status === "success" ? "admin-dashboard__status--confirmed" : "admin-dashboard__status--cancelled"}`}>{log.status}</span></td>
                          <td>{log.response_code ?? "—"} {log.cache_hit ? "· cache" : ""}</td>
                          <td>{new Date(log.requested_at).toLocaleString()}</td>
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
              {filteredRoutes.length === 0 ? (
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
                          <td>{route.scheduleCount ?? 0}</td>
                          <td><span className={`admin-dashboard__status ${route.active ? "admin-dashboard__status--confirmed" : "admin-dashboard__status--cancelled"}`}>{route.active ? t("admin.active") : t("admin.inactive")}</span></td>
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
              {popularRoutes.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noPopular")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.route")}</th><th>{t("admin.table.locale")}</th><th>{t("admin.table.order")}</th><th>{t("admin.table.status")}</th></tr></thead>
                    <tbody>
                      {popularRoutes.map((row) => (
                        <tr key={row.id}>
                          <td><strong>{row.routeName}</strong></td>
                          <td>{row.locale.toUpperCase()}</td>
                          <td>{row.sort_order}</td>
                          <td><button type="button" onClick={() => void togglePopularRoute(row)} className={`admin-dashboard__status ${row.active ? "admin-dashboard__status--confirmed" : "admin-dashboard__status--cancelled"}`}>{row.active ? t("admin.active") : t("admin.inactive")}</button></td>
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
              <button type="button" onClick={() => void savePublicContent()}>{t("admin.saveContent")}</button>
              {contentMessage && <p role="status">{contentMessage}</p>}
            </div>
            <div className="admin-dashboard__panel">
              {publicContent.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noContent")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.contentKey")}</th><th>{t("admin.table.locale")}</th><th>{t("admin.table.updated")}</th><th>{t("admin.table.status")}</th></tr></thead>
                    <tbody>
                      {publicContent.map((row) => (
                        <tr key={row.id}>
                          <td><strong>{row.content_key}</strong></td>
                          <td>{row.locale.toUpperCase()}</td>
                          <td>{new Date(row.updated_at).toLocaleString()}</td>
                          <td><span className={`admin-dashboard__status ${row.active ? "admin-dashboard__status--confirmed" : "admin-dashboard__status--cancelled"}`}>{row.active ? t("admin.active") : t("admin.inactive")}</span></td>
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
              {auditLogs.length === 0 ? (
                <p className="admin-dashboard__empty">{t("admin.noAudit")}</p>
              ) : (
                <div className="admin-dashboard__table-wrap">
                  <table className="admin-dashboard__table">
                    <thead><tr><th>{t("admin.table.action")}</th><th>{t("admin.table.target")}</th><th>{t("admin.table.created")}</th></tr></thead>
                    <tbody>
                      {auditLogs.map((row) => (
                        <tr key={row.id}>
                          <td><strong>{row.action}</strong></td>
                          <td>{row.target_type}{row.target_id ? ` · ${row.target_id.slice(0, 8)}` : ""}</td>
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
      </section>
    </main>
  );
}

function BookingTable({
  bookings,
  onStatusChange,
  t,
}: {
  bookings: BookingRow[];
  onStatusChange: (id: string, status: BookingRow["status"]) => Promise<void>;
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
              <tr key={booking.id}>
                <td><strong>{booking.booking_number}</strong><span>{new Date(booking.created_at).toLocaleString()}</span></td>
                <td><strong>{passenger?.full_name || "—"}</strong><span>{passenger?.phone || passenger?.email || "—"}</span></td>
                <td>{Number(booking.total_amount).toLocaleString()} {booking.currency}</td>
                <td><span className={`admin-dashboard__status admin-dashboard__status--${booking.status}`}>{booking.status}</span></td>
                <td>
                  {booking.status === "pending" && (
                    <div className="admin-dashboard__actions">
                      <button type="button" onClick={() => void onStatusChange(booking.id, "confirmed")}>{t("admin.confirm")}</button>
                      <button type="button" onClick={() => void onStatusChange(booking.id, "cancelled")}>{t("admin.cancel")}</button>
                    </div>
                  )}
                  {booking.status === "confirmed" && (
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
