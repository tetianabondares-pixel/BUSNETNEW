import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileText,
  Filter,
  ListTodo,
  Mail,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Mic,
  MessageCircle,
  Moon,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Star,
  Sun,
  TicketCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme";
import { KnowledgeCenterPanel } from "@/pages/admin/KnowledgeCenterPanel";
import "./AdminDashboardPage.css";

type Tab = "overview" | "bookings" | "passengers" | "cancellations" | "catalog" | "routes" | "locations" | "popular" | "content" | "audit" | "settings";
type AdminRole = "super_admin" | "admin" | "content_manager" | "support" | "provider_operator";
type DataSection = "stats" | "bookings" | "passengers" | "cancellations" | "providerLogs" | "routes" | "locations" | "popularRoutes" | "publicContent" | "auditLogs" | "settings" | "notifications";
type BookingCategory = "all" | "attention" | "upcoming" | "completed" | "cancelled";

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
    trip_status?: string;
    open_cancellation_request?: boolean;
    from_city?: string;
    to_city?: string;
  };
  booking_passengers: Array<{
    id?: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    seat_number?: string | null;
    nationality?: string | null;
    document_type?: string | null;
    document_number?: string | null;
  }>;
  total_count?: number;
};

type BookingDashboardSummary = {
  total_count: number;
  attention_count: number;
  upcoming_count: number;
  completed_count: number;
  pending_count: number;
  confirmed_count: number;
  cancelled_count: number;
  cancellation_request_count: number;
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

type RobotPreferences = {
  greeting: string;
  enabled: boolean;
  greetOnEntry: boolean;
  animated: boolean;
  draggable: boolean;
};

type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

type AgentTask = {
  id: string;
  title: string;
  status: "draft" | "in_progress" | "completed" | "needs_confirmation" | "error";
  createdAt: string;
};

type RobotPanelMode = "launcher" | "quick-actions" | "chat" | "workspace";
type AgentWorkspaceTab = "tasks" | "reports" | "activity" | "capabilities" | "knowledge";
type KnowledgeCategory =
  | "busnet_knowledge"
  | "business_rule"
  | "experience"
  | "learned_knowledge"
  | "document"
  | "technical_knowledge"
  | "problem_solution"
  | "proposal";
type KnowledgeStatus = "new" | "needs_verification" | "verified" | "stale_or_conflict" | "rejected" | "archived";
type KnowledgeSource = "owner_input" | "platform_source" | "task_experience";
type KnowledgeScope = "shared" | "module" | "owner";

type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  status: KnowledgeStatus;
  source: KnowledgeSource;
  sourceReference: string;
  module: string;
  scope: KnowledgeScope;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
};

type KnowledgeDraft = Omit<KnowledgeEntry, "id" | "createdAt" | "updatedAt" | "isDemo">;
type KnowledgeCenterState = { entries: KnowledgeEntry[]; error: string };
type KnowledgeCategoryFilter = "all" | KnowledgeCategory;

const KNOWLEDGE_STORAGE_KEY = "busnet_knowledge_center_prototype";
const KNOWLEDGE_CATEGORIES: Array<{ id: KnowledgeCategory; label: string }> = [
  { id: "busnet_knowledge", label: "Знання про BUSNET" },
  { id: "business_rule", label: "Бізнес-правила" },
  { id: "experience", label: "Досвід" },
  { id: "learned_knowledge", label: "Нові знання" },
  { id: "document", label: "Документи" },
  { id: "technical_knowledge", label: "Технічні знання" },
  { id: "problem_solution", label: "Рішення проблем" },
  { id: "proposal", label: "Пропозиції" },
];
const KNOWLEDGE_STATUSES: Array<{ id: KnowledgeStatus; label: string }> = [
  { id: "new", label: "Нове" },
  { id: "needs_verification", label: "Потребує перевірки" },
  { id: "verified", label: "Перевірено" },
  { id: "stale_or_conflict", label: "Застаріло / суперечність" },
  { id: "rejected", label: "Відхилено" },
  { id: "archived", label: "Архів" },
];
const KNOWLEDGE_SOURCES: Array<{ id: KnowledgeSource; label: string }> = [
  { id: "owner_input", label: "Від адміністратора" },
  { id: "platform_source", label: "Джерело BUSNET" },
  { id: "task_experience", label: "Досвід задачі" },
];
const KNOWLEDGE_SCOPES: Array<{ id: KnowledgeScope; label: string }> = [
  { id: "shared", label: "Спільне" },
  { id: "module", label: "Модуль" },
  { id: "owner", label: "Лише власник" },
];
const EMPTY_KNOWLEDGE_DRAFT: KnowledgeDraft = {
  title: "",
  content: "",
  category: "busnet_knowledge",
  status: "new",
  source: "owner_input",
  sourceReference: "",
  module: "Загальне",
  scope: "shared",
};

const DEFAULT_ROBOT_PREFERENCES: RobotPreferences = {
  greeting: "Привіт, Танюшка! Ну що, до роботи? Мальдіви самі себе не оплатять! Я вже на місці — енергія заряджена. Давай сьогодні зробимо BUSNET ще успішнішим!",
  enabled: true,
  greetOnEntry: true,
  animated: true,
  draggable: true,
};

function createDemoKnowledgeEntries(): KnowledgeEntry[] {
  const now = new Date().toISOString();
  return [
    {
      id: "demo-busnet-overview",
      title: "Приклад: структура BUSNET",
      content: "Демо-запис для макета. Додайте підтверджений опис модуля та його зв’язків.",
      category: "busnet_knowledge",
      status: "needs_verification",
      source: "platform_source",
      sourceReference: "Демонстраційний приклад",
      module: "Загальне",
      scope: "shared",
      createdAt: now,
      updatedAt: now,
      isDemo: true,
    },
    {
      id: "demo-business-rule",
      title: "Приклад: бізнес-правило",
      content: "Демо-запис. Це не робоче правило і не впливає на роботу BUSNET.",
      category: "business_rule",
      status: "new",
      source: "owner_input",
      sourceReference: "Демонстраційний приклад",
      module: "Операції",
      scope: "module",
      createdAt: now,
      updatedAt: now,
      isDemo: true,
    },
    {
      id: "demo-task-experience",
      title: "Приклад: висновок із задачі",
      content: "Демо-запис досвіду. Після інтеграції його можна буде пов’язати з реальною задачею та результатом.",
      category: "experience",
      status: "new",
      source: "task_experience",
      sourceReference: "Демонстраційний приклад",
      module: "Операції",
      scope: "shared",
      createdAt: now,
      updatedAt: now,
      isDemo: true,
    },
  ];
}

function isKnowledgeEntry(value: unknown): value is KnowledgeEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.content === "string" &&
    KNOWLEDGE_CATEGORIES.some((category) => category.id === entry.category) &&
    KNOWLEDGE_STATUSES.some((status) => status.id === entry.status) &&
    KNOWLEDGE_SOURCES.some((source) => source.id === entry.source) &&
    typeof entry.sourceReference === "string" &&
    typeof entry.module === "string" &&
    KNOWLEDGE_SCOPES.some((scope) => scope.id === entry.scope) &&
    typeof entry.createdAt === "string" &&
    typeof entry.updatedAt === "string" &&
    typeof entry.isDemo === "boolean";
}

function readKnowledgeCenter(): KnowledgeCenterState {
  if (typeof window === "undefined") return { entries: createDemoKnowledgeEntries(), error: "" };
  try {
    const stored = window.localStorage.getItem(KNOWLEDGE_STORAGE_KEY);
    if (!stored) return { entries: createDemoKnowledgeEntries(), error: "" };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isKnowledgeEntry)) {
      return { entries: [], error: "Не вдалося прочитати локальні записи Knowledge Center. Перевірте дані браузера." };
    }
    return { entries: parsed, error: "" };
  } catch {
    return { entries: createDemoKnowledgeEntries(), error: "Не вдалося прочитати локальні записи Knowledge Center." };
  }
}

function readAgentMessages(): AgentMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem("busnet_intelligence_messages");
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AgentMessage =>
      !!item && typeof item === "object" &&
      typeof item.id === "string" &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.text === "string" &&
      typeof item.createdAt === "string",
    ).slice(-100);
  } catch {
    return [];
  }
}

function readAgentTasks(): AgentTask[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem("busnet_intelligence_tasks");
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AgentTask =>
      !!item && typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      ["draft", "in_progress", "completed", "needs_confirmation", "error"].includes(item.status) &&
      typeof item.createdAt === "string",
    ).slice(-100);
  } catch {
    return [];
  }
}

function readRobotPreferences(): RobotPreferences {
  if (typeof window === "undefined") return DEFAULT_ROBOT_PREFERENCES;
  try {
    const stored = window.localStorage.getItem("busnet_ai_robot_preferences");
    if (!stored) return DEFAULT_ROBOT_PREFERENCES;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_ROBOT_PREFERENCES;
    const value = parsed as Partial<RobotPreferences>;
    return {
      greeting: typeof value.greeting === "string" ? value.greeting : DEFAULT_ROBOT_PREFERENCES.greeting,
      enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_ROBOT_PREFERENCES.enabled,
      greetOnEntry: typeof value.greetOnEntry === "boolean" ? value.greetOnEntry : DEFAULT_ROBOT_PREFERENCES.greetOnEntry,
      animated: typeof value.animated === "boolean" ? value.animated : DEFAULT_ROBOT_PREFERENCES.animated,
      draggable: typeof value.draggable === "boolean" ? value.draggable : DEFAULT_ROBOT_PREFERENCES.draggable,
    };
  } catch {
    return DEFAULT_ROBOT_PREFERENCES;
  }
}

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
  const { resolved, setMode } = useTheme();
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
  const [bookingCategory, setBookingCategory] = useState<BookingCategory>("all");
  const [bookingFiltersOpen, setBookingFiltersOpen] = useState(false);
  const [bookingCreatedFrom, setBookingCreatedFrom] = useState("");
  const [bookingCreatedTo, setBookingCreatedTo] = useState("");
  const [bookingDepartureFrom, setBookingDepartureFrom] = useState("");
  const [bookingDepartureTo, setBookingDepartureTo] = useState("");
  const [bookingCarrier, setBookingCarrier] = useState("");
  const [bookingCurrency, setBookingCurrency] = useState("");
  const [bookingMinAmount, setBookingMinAmount] = useState("");
  const [bookingMaxAmount, setBookingMaxAmount] = useState("");
  const [bookingPassengerCount, setBookingPassengerCount] = useState("");
  const [bookingCarriers, setBookingCarriers] = useState<string[]>([]);
  const [bookingCurrencies, setBookingCurrencies] = useState<string[]>([]);
  const [bookingPage, setBookingPage] = useState(0);
  const [bookingTotal, setBookingTotal] = useState(0);
  const [bookingSummary, setBookingSummary] = useState<BookingDashboardSummary | null>(null);
  const [bookingHistory, setBookingHistory] = useState<AuditRow[]>([]);
  const [bookingHistoryError, setBookingHistoryError] = useState("");
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
  const [robotPreferences, setRobotPreferences] = useState<RobotPreferences>(readRobotPreferences);
  const [robotSettingsDraft, setRobotSettingsDraft] = useState<RobotPreferences>(robotPreferences);
  const robotPreferencesOnLoadRef = useRef(robotPreferences);
  const [robotGreetingOpen, setRobotGreetingOpen] = useState(false);
  const [robotPosition, setRobotPosition] = useState<{ x: number; y: number }>(() => {
    const fallback = {
      x: typeof window === "undefined"
        ? 20
        : Math.min(window.innerWidth > 680 ? 280 : 20, Math.max(16, window.innerWidth - 88)),
      y: typeof window === "undefined" ? 120 : Math.max(16, window.innerHeight - 108),
    };
    if (typeof window === "undefined") return fallback;
    try {
      const saved = window.localStorage.getItem("busnet_ai_robot_position");
      if (!saved) return fallback;
      const value: unknown = JSON.parse(saved);
      if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
      const position = value as { x?: number; y?: number };
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return fallback;
      return {
        x: Math.min(Math.max(Number(position.x), 16), Math.max(16, window.innerWidth - 88)),
        y: Math.min(Math.max(Number(position.y), 16), Math.max(16, window.innerHeight - 88)),
      };
    } catch {
      return fallback;
    }
  });
  const [hubOpen, setHubOpen] = useState(false);
  const [hubQuery, setHubQuery] = useState("");
  const [robotPanelMode, setRobotPanelMode] = useState<RobotPanelMode>("launcher");
  const [agentWorkspaceTab, setAgentWorkspaceTab] = useState<AgentWorkspaceTab>("tasks");
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>(readAgentMessages);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>(readAgentTasks);
  const [agentDraft, setAgentDraft] = useState("");
  const [knowledgeCenter, setKnowledgeCenter] = useState<KnowledgeCenterState>(readKnowledgeCenter);
  const [knowledgeCategoryFilter, setKnowledgeCategoryFilter] = useState<KnowledgeCategoryFilter>("all");
  const [knowledgeStatusFilter, setKnowledgeStatusFilter] = useState<KnowledgeStatus | "all">("all");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeFormOpen, setKnowledgeFormOpen] = useState(false);
  const [knowledgeEditingId, setKnowledgeEditingId] = useState<string | null>(null);
  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeDraft>(EMPTY_KNOWLEDGE_DRAFT);
  const [knowledgeFormError, setKnowledgeFormError] = useState("");
  const agentInputRef = useRef<HTMLTextAreaElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const hubPanelRef = useRef<HTMLDivElement>(null);
  const robotButtonRef = useRef<HTMLButtonElement>(null);
  const robotDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const robotDragRef = useRef(false);
  const robotMovedRef = useRef(false);
  const robotGreetingTimerRef = useRef<number | null>(null);
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
  const bookingLoadRequestRef = useRef(0);
  const refreshBookingDataRef = useRef<() => void>(() => {});
  const passengerLoadRequestRef = useRef(0);
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
    const preferences = robotPreferencesOnLoadRef.current;
    if (!authorized || !preferences.enabled || !preferences.greetOnEntry) return;
    setRobotGreetingOpen(true);
    robotGreetingTimerRef.current = window.setTimeout(() => setRobotGreetingOpen(false), 8500);
    return () => {
      if (robotGreetingTimerRef.current !== null) window.clearTimeout(robotGreetingTimerRef.current);
    };
  }, [authorized]);

  useEffect(() => {
    try {
      window.localStorage.setItem("busnet_intelligence_messages", JSON.stringify(agentMessages.slice(-100)));
      window.localStorage.setItem("busnet_intelligence_tasks", JSON.stringify(agentTasks.slice(-100)));
    } catch (error) {
      console.error("Could not save BUSNET Intelligence workspace history", error);
    }
  }, [agentMessages, agentTasks]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setRobotPanelMode("quick-actions");
        setHubOpen(true);
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>(".busnet-hub__search input")?.focus();
        }, 50);
      }
      if (event.key === "Escape") setHubOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!hubOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (robotButtonRef.current?.contains(target) || hubPanelRef.current?.contains(target)) return;
      setHubOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [hubOpen]);

  useEffect(() => {
    if (!hubOpen || robotPanelMode !== "chat") return;
    const timer = window.setTimeout(() => agentInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [hubOpen, robotPanelMode]);

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
          if (notification.type === "new_booking") refreshBookingDataRef.current();
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
      supabase.rpc("admin_booking_dashboard_summary"),
    ]);
    const failed = results.some((result) => result.error);
    setLoadErrors((current) => ({ ...current, stats: failed ? t("admin.loadFailed") : undefined }));
    const summaryRows = results[12].data as BookingDashboardSummary[] | null;
    setBookingSummary(results[12].error ? null : summaryRows?.[0] ?? null);
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
    const requestId = ++bookingLoadRequestRef.current;
    const { data, error } = await supabase.rpc("admin_search_booking_dashboard", {
      p_query: bookingSearch || null,
      p_status: bookingStatusFilter || null,
      p_category: bookingCategory,
      p_created_from: bookingCreatedFrom || null,
      p_created_to: bookingCreatedTo || null,
      p_departure_from: bookingDepartureFrom || null,
      p_departure_to: bookingDepartureTo || null,
      p_carrier: bookingCarrier || null,
      p_currency: bookingCurrency || null,
      p_min_amount: bookingMinAmount ? Number(bookingMinAmount) : null,
      p_max_amount: bookingMaxAmount ? Number(bookingMaxAmount) : null,
      p_passenger_count: bookingPassengerCount ? Number(bookingPassengerCount) : null,
      p_page: bookingPage,
      p_page_size: 50,
    });
    if (requestId !== bookingLoadRequestRef.current) return;
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

  const loadBookingFacets = async () => {
    const [carrierResult, currencyResult] = await Promise.all([
      supabase.from("trips").select("carrier").not("carrier", "is", null).order("carrier").limit(500),
      supabase.from("bookings").select("currency").order("currency").limit(500),
    ]);
    if (carrierResult.error || currencyResult.error) {
      setLoadErrors((current) => ({ ...current, bookings: t("admin.loadFailed") }));
      return;
    }
    setBookingCarriers([...new Set((carrierResult.data ?? [])
      .map((row) => row.carrier)
      .filter((carrier): carrier is string => Boolean(carrier)))]);
    setBookingCurrencies([...new Set((currencyResult.data ?? [])
      .map((row) => row.currency)
      .filter((currency): currency is string => Boolean(currency)))]);
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
    const requestId = ++passengerLoadRequestRef.current;
    const { data, error } = await supabase.rpc("admin_search_passengers", {
      p_query: passengerSearch || null,
      p_locale: passengerLocaleFilter || null,
      p_page: passengerPage,
      p_page_size: 50,
    });
    if (requestId !== passengerLoadRequestRef.current) return;
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

  const saveRobotSettings = () => {
    const greeting = robotSettingsDraft.greeting.trim();
    if (!greeting || greeting.length > 300) {
      setActionMessage("Вітання має містити від 1 до 300 символів");
      return;
    }
    const nextPreferences = { ...robotSettingsDraft, greeting };
    try {
      window.localStorage.setItem("busnet_ai_robot_preferences", JSON.stringify(nextPreferences));
    } catch (error) {
      console.error("Could not save BUSNET AI preferences", error);
      setActionMessage(t("admin.actionFailed"));
      return;
    }
    setRobotPreferences(nextPreferences);
    setRobotSettingsDraft(nextPreferences);
    setActionMessage("Налаштування помічника BUSNET збережено");
  };

  const sendAgentMessage = () => {
    const text = agentDraft.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const taskId = `agent-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAgentMessages((current): AgentMessage[] => [
      ...current,
      { id: `${taskId}-user`, role: "user" as const, text, createdAt: now },
      {
        id: `${taskId}-assistant`,
        role: "assistant" as const,
        text: "Записала це як чернетку в робочий простір. Поки що я не аналізую базу й не виконую команди — інструменти помічника ще не підключені.",
        createdAt: new Date(Date.now() + 1).toISOString(),
      },
    ].slice(-100));
    setAgentTasks((current): AgentTask[] => [
      { id: taskId, title: text, status: "draft" as const, createdAt: now },
      ...current,
    ].slice(0, 100));
    setAgentDraft("");
  };

  useEffect(() => {
    if (loading || !authorized) return;
    if (tab === "bookings" && ["super_admin", "admin", "support"].includes(role)) {
      void loadBookings();
    }
  }, [
    authorized,
    bookingCarrier,
    bookingCategory,
    bookingCreatedFrom,
    bookingCreatedTo,
    bookingCurrency,
    bookingDepartureFrom,
    bookingDepartureTo,
    bookingMaxAmount,
    bookingMinAmount,
    bookingPage,
    bookingPassengerCount,
    bookingSearch,
    bookingStatusFilter,
    loading,
    role,
    tab,
  ]);

  useEffect(() => {
    if (loading || !authorized || tab !== "bookings" || !["super_admin", "admin", "support"].includes(role)) return;
    void loadBookingFacets();
  }, [authorized, loading, role, tab]);

  useEffect(() => {
    if (loading || !authorized) return;
    if (tab === "passengers" && ["super_admin", "admin", "support"].includes(role)) {
      void loadPassengers();
    }
  }, [authorized, loading, passengerLocaleFilter, passengerPage, passengerSearch, role, tab]);

  useEffect(() => {
    refreshBookingDataRef.current = () => {
      void loadStats();
      if (tab === "bookings" || tab === "overview") void loadBookings();
    };
  });

  useEffect(() => {
    if (!authorized || tab !== "bookings") return;
    const intervalId = window.setInterval(() => refreshBookingDataRef.current(), 60_000);
    return () => window.clearInterval(intervalId);
  }, [authorized, tab]);

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
    setBookingHistory([]);
    setBookingHistoryError("");
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
    void (async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id,actor_id,action,target_type,target_id,metadata,created_at")
        .eq("target_type", "booking")
        .eq("target_id", booking.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (requestId !== interactionLoadRequestRef.current) return;
      if (error || !data) {
        setBookingHistoryError(t("admin.loadFailed"));
        return;
      }
      setBookingHistory(data as unknown as AuditRow[]);
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
    setHubOpen(false);
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

  const persistKnowledgeEntries = (entries: KnowledgeEntry[]) => {
    try {
      window.localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(entries));
      setKnowledgeCenter({ entries, error: "" });
      return true;
    } catch {
      setKnowledgeCenter((current) => ({
        ...current,
        error: "Не вдалося зберегти зміни в локальному сховищі браузера.",
      }));
      return false;
    }
  };

  const openKnowledgeCreateForm = () => {
    setKnowledgeEditingId(null);
    setKnowledgeDraft(EMPTY_KNOWLEDGE_DRAFT);
    setKnowledgeFormError("");
    setKnowledgeFormOpen(true);
  };

  const openKnowledgeEditForm = (entry: KnowledgeEntry) => {
    setKnowledgeEditingId(entry.id);
    setKnowledgeDraft({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      status: entry.status,
      source: entry.source,
      sourceReference: entry.sourceReference,
      module: entry.module,
      scope: entry.scope,
    });
    setKnowledgeFormError("");
    setKnowledgeFormOpen(true);
  };

  const saveKnowledgeEntry = () => {
    if (!knowledgeDraft.title.trim() || !knowledgeDraft.content.trim()) {
      setKnowledgeFormError("Вкажіть назву та зміст запису.");
      return;
    }
    const now = new Date().toISOString();
    const previousEntry = knowledgeCenter.entries.find((entry) => entry.id === knowledgeEditingId);
    const entry: KnowledgeEntry = {
      ...knowledgeDraft,
      id: previousEntry?.id ?? `knowledge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: knowledgeDraft.title.trim(),
      content: knowledgeDraft.content.trim(),
      sourceReference: knowledgeDraft.sourceReference.trim(),
      module: knowledgeDraft.module.trim() || "Загальне",
      createdAt: previousEntry?.createdAt ?? now,
      updatedAt: now,
      isDemo: false,
    };
    const entries = previousEntry
      ? knowledgeCenter.entries.map((current) => current.id === entry.id ? entry : current)
      : [entry, ...knowledgeCenter.entries];
    if (persistKnowledgeEntries(entries)) {
      setKnowledgeFormOpen(false);
      setKnowledgeFormError("");
    }
  };

  const changeKnowledgeStatus = (entry: KnowledgeEntry, status: KnowledgeStatus) => {
    const entries = knowledgeCenter.entries.map((current) =>
      current.id === entry.id
        ? { ...current, status, updatedAt: new Date().toISOString() }
        : current,
    );
    persistKnowledgeEntries(entries);
  };

  const deleteKnowledgeEntry = (entry: KnowledgeEntry) => {
    if (!window.confirm(`Видалити запис «${entry.title}» з локального прототипу?`)) return;
    persistKnowledgeEntries(knowledgeCenter.entries.filter((current) => current.id !== entry.id));
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

  const knowledgeSearch = knowledgeQuery.trim().toLowerCase();
  const filteredKnowledgeEntries = knowledgeCenter.entries.filter((entry) => {
    if (knowledgeCategoryFilter !== "all" && entry.category !== knowledgeCategoryFilter) return false;
    if (knowledgeStatusFilter !== "all" && entry.status !== knowledgeStatusFilter) return false;
    if (!knowledgeSearch) return true;
    return [entry.title, entry.content, entry.module, entry.sourceReference]
      .some((value) => value.toLowerCase().includes(knowledgeSearch));
  });
  const knowledgeStatusCount = (status: KnowledgeStatus) =>
    knowledgeCenter.entries.filter((entry) => entry.status === status).length;

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
  const unreadNotificationCount = notifications.filter((item) => !item.read_at).length;

  return (
    <main className={`admin-dashboard${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <aside className="admin-dashboard__sidebar">
        <div className="admin-dashboard__brand">
          <button
            type="button"
            className="admin-dashboard__brand-toggle"
            aria-label={sidebarCollapsed ? "Розгорнути меню" : "Згорнути меню"}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Розгорнути меню" : "Згорнути меню"}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <Menu size={19} aria-hidden="true" />
          </button>
          <img
            src="/icons/busnet-192.png"
            alt=""
            aria-hidden="true"
            width={40}
            height={40}
          />
          <div>
            <p className="admin-dashboard__eyebrow">BUSNET UA</p>
            <h1>{t("admin.dashboard")}</h1>
          </div>
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
              <span className="admin-dashboard__nav-label">{label}</span>
              {id === "bookings" && notifications.filter((item) => item.type === "new_booking" && !item.read_at).length > 0 && (
                <span className="admin-dashboard__nav-count">
                  {notifications.filter((item) => item.type === "new_booking" && !item.read_at).length}
                </span>
              )}
              <span className="admin-dashboard__nav-tooltip" role="tooltip">{label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-dashboard__account">
          <div data-tooltip={role}><Users size={17} /><span>{role}</span></div>
          <button
            type="button"
            data-tooltip={t("admin.enableNotifications")}
            onClick={() => {
              if ("Notification" in window) {
                void Notification.requestPermission();
              }
            }}
          >
            <Bell size={17} /><span>{t("admin.enableNotifications")}</span>
          </button>
          <button type="button" data-tooltip={t("admin.signOut")} onClick={() => void signOut()}>
            <LogOut size={17} /><span>{t("admin.signOut")}</span>
          </button>
        </div>
      </aside>

      <section className="admin-dashboard__workspace">
        {(() => {
          const unreadCount = unreadNotificationCount;
          const hubSearch = hubQuery.trim().toLowerCase();
          const bookingResults = hubSearch
            ? bookings.filter((booking) => [
                booking.booking_number,
                booking.status,
                booking.trip_details?.from_city ?? "",
                booking.trip_details?.to_city ?? "",
                ...booking.booking_passengers.map((passenger) => passenger.full_name),
              ].some((value) => value.toLowerCase().includes(hubSearch))).slice(0, 4)
            : [];
          const passengerResults = hubSearch
            ? passengers.filter((passenger) => [
                passenger.full_name,
                passenger.email ?? "",
                passenger.phone ?? "",
              ].some((value) => value.toLowerCase().includes(hubSearch))).slice(0, 4)
            : [];
          const routeResults = hubSearch
            ? routes.filter((route) => [
                route.fromName ?? "",
                route.toName ?? "",
                route.provider_route_id ?? "",
              ].some((value) => value.toLowerCase().includes(hubSearch))).slice(0, 4)
            : [];
          const opensOnLeft = robotPosition.x > window.innerWidth / 2;

          return (
            <>
              {hubOpen && (
                <div
                  ref={hubPanelRef}
                  className={[
                    "busnet-hub__panel",
                    robotPanelMode === "chat" || robotPanelMode === "workspace" ? "is-expanded" : "",
                  ].filter(Boolean).join(" ")}
                  data-side={opensOnLeft ? "left" : "right"}
                  style={{
                    left: robotPanelMode === "chat" || robotPanelMode === "workspace"
                      ? undefined
                      : !opensOnLeft
                        ? Math.max(16, Math.min(robotPosition.x + 100, window.innerWidth - 390))
                        : undefined,
                    right: robotPanelMode === "chat" || robotPanelMode === "workspace"
                      ? undefined
                      : opensOnLeft ? window.innerWidth - robotPosition.x + 16 : undefined,
                    top: robotPanelMode === "chat" || robotPanelMode === "workspace"
                      ? undefined
                      : Math.max(16, Math.min(robotPosition.y - 260, window.innerHeight - 636)),
                  }}
                  role="dialog"
                  aria-label="Центр BUSNET"
                >
                  <header className="busnet-hub__header">
                    {robotPanelMode !== "launcher" && (
                      <button
                        type="button"
                        aria-label="Назад до меню"
                        onClick={() => setRobotPanelMode("launcher")}
                      >
                        <ArrowLeft size={17} />
                      </button>
                    )}
                    <div>
                      <p>ЦИФРОВИЙ СПІВРОБІТНИК BUSNET</p>
                      <h3>
                        {robotPanelMode === "launcher" && "Цифровий співробітник"}
                        {robotPanelMode === "quick-actions" && "Швидкі дії"}
                        {robotPanelMode === "chat" && "Чат із помічником"}
                        {robotPanelMode === "workspace" && "Робочий простір"}
                      </h3>
                    </div>
                    <button type="button" aria-label="Close" onClick={() => setHubOpen(false)}>
                      <X size={17} />
                    </button>
                  </header>

                  {robotPanelMode === "launcher" && (
                    <div className="busnet-intelligence__launcher">
                      <button type="button" onClick={() => setRobotPanelMode("quick-actions")}>
                        <span className="busnet-intelligence__card-icon"><TicketCheck size={19} /></span>
                        <span className="busnet-intelligence__card-copy">
                          <strong>01 · ШВИДКІ ДІЇ</strong>
                          <small>Швидкий доступ до функцій BUSNET</small>
                        </span>
                        {unreadCount > 0 && <span className="busnet-intelligence__count">{unreadCount}</span>}
                      </button>
                      <button type="button" onClick={() => setRobotPanelMode("chat")}>
                        <span className="busnet-intelligence__card-icon"><MessageCircle size={19} /></span>
                        <span className="busnet-intelligence__card-copy">
                          <strong>02 · ЧАТ ІЗ ПОМІЧНИКОМ</strong>
                          <small>Спілкування та чернетки завдань</small>
                        </span>
                      </button>
                      <button type="button" onClick={() => setRobotPanelMode("workspace")}>
                        <span className="busnet-intelligence__card-icon"><ClipboardList size={19} /></span>
                        <span className="busnet-intelligence__card-copy">
                          <strong>03 · РОБОЧИЙ ПРОСТІР</strong>
                          <small>Завдання, звіти та можливості</small>
                        </span>
                        {agentTasks.length > 0 && <span className="busnet-intelligence__count">{agentTasks.length}</span>}
                      </button>
                      <p className="busnet-intelligence__prototype-note">
                        Чат і задачі зберігаються в цьому браузері. Реальне виконання доручень поки не підключене.
                      </p>
                    </div>
                  )}

                  {robotPanelMode === "chat" && (
                    <section className="busnet-agent-chat">
                      <div className="busnet-agent-chat__messages" aria-live="polite">
                        {agentMessages.length === 0 && (
                          <article className="is-assistant">
                            <img src="/images/busnet-ai-assistant-robot.png" alt="" />
                            <div>
                              <strong>BUSNET ПОМІЧНИК</strong>
                              <p>{robotPreferences.greeting}</p>
                                <p className="is-note">Поки що можу приймати запити й зберігати їх як чернетки. Доступ до реальних даних та операцій ще не підключений.</p>
                            </div>
                          </article>
                        )}
                        {agentMessages.map((message) => (
                          <article className={`is-${message.role}`} key={message.id}>
                            {message.role === "assistant" && <img src="/images/busnet-ai-assistant-robot.png" alt="" />}
                            <div>
                              <strong>{message.role === "assistant" ? "BUSNET ПОМІЧНИК" : "Ви"}</strong>
                              <p>{message.text}</p>
                              <time>{new Date(message.createdAt).toLocaleString()}</time>
                            </div>
                          </article>
                        ))}
                      </div>
                      <div className="busnet-agent-chat__composer">
                        <p><Mic size={14} /> Голосове керування з’явиться на наступному етапі</p>
                        <div>
                          <textarea
                            ref={agentInputRef}
                            value={agentDraft}
                            maxLength={1000}
                            rows={2}
                            placeholder="Напишіть запит або доручення..."
                            aria-label="Повідомлення помічнику BUSNET"
                            onChange={(event) => setAgentDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                sendAgentMessage();
                              }
                            }}
                          />
                          <button
                            type="button"
                            disabled
                            title="Голосове керування ще не підключене"
                            aria-label="Голосове керування ще не підключене"
                          >
                            <Mic size={18} />
                          </button>
                          <button
                            type="button"
                            disabled={!agentDraft.trim()}
                            aria-label="Надіслати повідомлення"
                            onClick={sendAgentMessage}
                          >
                            <Send size={18} />
                          </button>
                        </div>
                      </div>
                    </section>
                  )}

                  {robotPanelMode === "workspace" && (
                    <section className="busnet-agent-workspace">
                      <nav aria-label="Робочий простір помічника">
                        {([
                          ["tasks", "Мої завдання", ListTodo],
                          ["reports", "Звіти", FileText],
                          ["activity", "Журнал дій", Activity],
                          ["capabilities", "Можливості", Settings],
                          ["knowledge", "База знань", BookOpen],
                        ] as Array<[AgentWorkspaceTab, string, typeof Settings]>).map(([id, label, Icon]) => (
                          <button
                            type="button"
                            key={id}
                            className={agentWorkspaceTab === id ? "is-active" : ""}
                            onClick={() => setAgentWorkspaceTab(id)}
                          >
                            <Icon size={16} />{label}
                          </button>
                        ))}
                      </nav>
                      <div className="busnet-agent-workspace__content">
                        {agentWorkspaceTab === "tasks" && (
                          <>
                            <div className="busnet-agent-workspace__heading">
                              <div><h4>Мої завдання</h4><p>Запити з чату, збережені як чернетки</p></div>
                              <span>{agentTasks.length}</span>
                            </div>
                            {agentTasks.length === 0 ? (
                              <div className="busnet-agent-workspace__empty">
                                <ListTodo size={26} />
                                <p>Поки немає завдань. Напишіть запит у чаті помічника.</p>
                                <button
                                  type="button"
                                  className="busnet-agent-workspace__chat-cta"
                                  onClick={() => setRobotPanelMode("chat")}
                                >
                                  <MessageCircle size={16} />Перейти до чату
                                </button>
                              </div>
                            ) : (
                              <div className="busnet-agent-workspace__tasks">
                                {agentTasks.map((task) => (
                                  <article key={task.id}>
                                    <span className="is-draft">Чернетка · не виконується</span>
                                    <p>{task.title}</p>
                                    <time>{new Date(task.createdAt).toLocaleString()}</time>
                                  </article>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                        {agentWorkspaceTab === "reports" && (
                          <div className="busnet-agent-workspace__empty"><FileText size={26} /><p>Звіти з’являться, коли робот отримає реальні інструменти виконання.</p></div>
                        )}
                        {agentWorkspaceTab === "activity" && (
                          agentMessages.length === 0 ? (
                            <div className="busnet-agent-workspace__empty"><Activity size={26} /><p>Історія взаємодій поки порожня.</p></div>
                          ) : (
                            <div className="busnet-agent-workspace__tasks">
                              {[...agentMessages].reverse().map((message) => (
                                <article key={message.id}>
                                  <span className={message.role === "assistant" ? "is-assistant" : "is-user"}>
                                    {message.role === "assistant" ? "BUSNET ПОМІЧНИК" : "Ви"}
                                  </span>
                                  <p>{message.text}</p>
                                  <time>{new Date(message.createdAt).toLocaleString()}</time>
                                </article>
                              ))}
                            </div>
                          )
                        )}
                        {agentWorkspaceTab === "capabilities" && (
                          <div className="busnet-agent-workspace__capabilities">
                            <article><TicketCheck size={17} /><span><strong>Навігація та швидкі дії</strong><small>Підключено до модулів адмінки</small></span><i className="is-ready">Доступно</i></article>
                            <article><Bell size={17} /><span><strong>Вхідні події</strong><small>Існуючі сповіщення та Realtime</small></span><i className="is-ready">Доступно</i></article>
                            <article><Search size={17} /><span><strong>Пошук BUSNET</strong><small>Пошук серед завантажених записів</small></span><i className="is-ready">Доступно</i></article>
                            <article><MessageCircle size={17} /><span><strong>Автоматизація та голос</strong><small>Інтеграція ще не налаштована</small></span><i>Незабаром</i></article>
                          </div>
                        )}
                        {agentWorkspaceTab === "knowledge" && <KnowledgeCenterPanel role={role} />}

                      </div>
                    </section>
                  )}

                  {robotPanelMode === "quick-actions" && (
                    <>
                  <div className="busnet-hub__search">
                    <Search size={17} />
                    <input
                      value={hubQuery}
                      onChange={(event) => setHubQuery(event.target.value)}
                      placeholder="Пошук: BN-00125, пасажир, AL-TRANS..."
                      aria-label="Глобальний пошук BUSNET"
                    />
                    <kbd>Ctrl K</kbd>
                  </div>

                  {hubSearch ? (
                    <div className="busnet-hub__search-results">
                      {bookingResults.map((booking) => (
                        <button
                          type="button"
                          key={booking.id}
                          onClick={() => {
                            openBooking(booking);
                            setHubOpen(false);
                          }}
                        >
                          <TicketCheck size={15} />
                          <span><strong>{booking.booking_number}</strong><small>{booking.status}</small></span>
                        </button>
                      ))}
                      {passengerResults.map((passenger) => (
                        <button type="button" key={passenger.id} onClick={() => {
                          navigate("/admin/passengers");
                          setHubOpen(false);
                        }}>
                          <Users size={15} />
                          <span><strong>{passenger.full_name}</strong><small>{passenger.phone || passenger.email || "Пасажир"}</small></span>
                        </button>
                      ))}
                      {routeResults.map((route) => (
                        <button type="button" key={route.id} onClick={() => {
                          navigate("/admin/routes");
                          setHubOpen(false);
                        }}>
                          <MapIcon size={15} />
                          <span><strong>{route.fromName ?? "Маршрут"} — {route.toName ?? ""}</strong><small>{route.provider_route_id || "AL-TRANS"}</small></span>
                        </button>
                      ))}
                      {bookingResults.length + passengerResults.length + routeResults.length === 0 && (
                        <p className="busnet-hub__empty">Нічого не знайдено</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="busnet-hub__overview">
                        <button type="button" onClick={() => navigate("/admin/bookings")}>
                          <span>Нові</span><strong>{stats.pending ?? 0}</strong>
                        </button>
                        <button type="button" onClick={() => navigate("/admin/cancellations")}>
                          <span>Скасування</span><strong>{stats.cancellations ?? 0}</strong>
                        </button>
                        <button type="button" onClick={() => navigate("/admin/audit")}>
                          <span>Критичні</span><strong>{stats.providerErrors ?? 0}</strong>
                        </button>
                      </div>

                      <section className="busnet-hub__section">
                        <h4>ШВИДКІ ДІЇ</h4>
                        <div className="busnet-hub__actions">
                          <button type="button" onClick={() => navigate("/admin/bookings")}><TicketCheck size={16} />Бронювання</button>
                          <button type="button" onClick={() => navigate("/admin/passengers")}><Users size={16} />Пасажири</button>
                          <button type="button" onClick={() => navigate("/admin/routes")}><MapIcon size={16} />Маршрути</button>
                          <button type="button" onClick={() => void syncCatalog()} disabled={syncing}><RefreshCw size={16} />Синхронізувати</button>
                        </div>
                      </section>

                      <section className="busnet-hub__section">
                        <div className="busnet-hub__section-title">
                          <h4>ОСТАННІ ПОДІЇ</h4>
                          {unreadCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                void Promise.all(
                                  notifications
                                    .filter((item) => !item.read_at)
                                    .map((item) => supabase.rpc("mark_admin_notification_read", { p_notification_id: item.id })),
                                ).then(() => {
                                  setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
                                });
                              }}
                            >
                              Прочитати всі
                            </button>
                          )}
                        </div>
                        <div className="busnet-hub__notifications">
                          {loadErrors.notifications ? (
                            <p className="busnet-hub__empty">{loadErrors.notifications}</p>
                          ) : notifications.length === 0 ? (
                            <p className="busnet-hub__empty">{t("admin.noNotifications")}</p>
                          ) : notifications.slice(0, 5).map((notification) => (
                            <button
                              type="button"
                              key={notification.id}
                              className={!notification.read_at ? "is-unread" : ""}
                              onClick={() => void openNotification(notification)}
                            >
                              <span className={`busnet-hub__event-dot is-${notification.type}`} />
                              <span><strong>{notification.title}</strong><small>{notification.message}</small></span>
                              <time>{new Date(notification.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                            </button>
                          ))}
                        </div>
                      </section>

                      <section className="busnet-hub__section">
                        <h4>СТАН СИСТЕМИ</h4>
                        <div className="busnet-hub__status">
                          <span><i className="is-online" />Supabase</span>
                          <span><i className={stats.providerErrors ? "is-warning" : "is-online"} />AL-TRANS</span>
                          <span><i className="is-online" />Події наживо</span>
                        </div>
                      </section>

                      <footer className="busnet-hub__footer">
                        <div className="busnet-hub__themes" aria-label="Тема інтерфейсу">
                          <button type="button" className={resolved === "light" ? "is-active" : ""} onClick={() => setMode("light")}><Sun size={15} />Світла</button>
                          <button type="button" className={resolved === "dark" ? "is-active" : ""} onClick={() => setMode("dark")}><Moon size={15} />Темна</button>
                        </div>
                        <button type="button" className="busnet-hub__settings" onClick={() => navigate("/admin/settings")}><SlidersHorizontal size={15} />Налаштування</button>
                      </footer>
                    </>
                  )}
                    </>
                  )}
                </div>
              )}
            </>
          );
        })()}
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
                : <BookingTable bookings={bookings.slice(0, 5)} onOpen={openBooking} t={t} i18nLanguage={i18n.language} />}
            </div>
          </>
        )}

        {tab === "bookings" && (
          <>
            <header className="admin-dashboard__header">
              <div>
                <p>{t("admin.bookingsSubtitle")}</p>
                <h2>{t("admin.tabs.bookings")}</h2>
                <span className="admin-dashboard__header-caption">{t("admin.bookingsDescription")}</span>
              </div>
            </header>
            {loadErrors.stats && <p className="admin-dashboard__error" role="alert">{loadErrors.stats}</p>}
            <div className="admin-dashboard__booking-stats">
              <article>
                <span className="is-blue"><TicketCheck size={18} /></span>
                <strong>{bookingSummary?.total_count ?? "—"}</strong>
                <p>{t("admin.bookingMetrics.total")}</p>
              </article>
              <article>
                <span className="is-red"><CircleAlert size={18} /></span>
                <strong>{bookingSummary?.attention_count ?? "—"}</strong>
                <p>{t("admin.bookingMetrics.attention")}</p>
              </article>
              <article>
                <span className="is-purple"><CalendarDays size={18} /></span>
                <strong>{bookingSummary?.upcoming_count ?? "—"}</strong>
                <p>{t("admin.bookingMetrics.upcoming")}</p>
              </article>
              <article>
                <span className="is-amber"><Clock3 size={18} /></span>
                <strong>{bookingSummary?.pending_count ?? "—"}</strong>
                <p>{t("admin.bookingMetrics.pending")}</p>
              </article>
              <article>
                <span className="is-green"><CheckCircle2 size={18} /></span>
                <strong>{bookingSummary?.confirmed_count ?? "—"}</strong>
                <p>{t("admin.bookingMetrics.confirmed")}</p>
              </article>
              <article>
                <span className="is-gray"><TicketCheck size={18} /></span>
                <strong>{bookingSummary?.cancelled_count ?? "—"}</strong>
                <p>{t("admin.bookingMetrics.cancelled")}</p>
              </article>
              <article>
                <span className="is-amber"><CircleAlert size={18} /></span>
                <strong>{bookingSummary?.cancellation_request_count ?? "—"}</strong>
                <p>{t("admin.bookingMetrics.cancellationRequests")}</p>
              </article>
            </div>
            <nav className="admin-dashboard__booking-tabs" aria-label={t("admin.bookingCategories.label")}>
              {([
                ["all", t("admin.bookingCategories.all"), bookingSummary?.total_count],
                ["attention", t("admin.bookingCategories.attention"), bookingSummary?.attention_count],
                ["upcoming", t("admin.bookingCategories.upcoming"), bookingSummary?.upcoming_count],
                ["completed", t("admin.bookingCategories.completed"), bookingSummary?.completed_count],
                ["cancelled", t("admin.bookingCategories.cancelled"), bookingSummary?.cancelled_count],
              ] as Array<[BookingCategory, string, number | undefined]>).map(([category, label, count]) => (
                <button
                  aria-pressed={bookingCategory === category}
                  className={bookingCategory === category ? "is-active" : ""}
                  key={category}
                  onClick={() => { setBookingPage(0); setBookingCategory(category); }}
                  type="button"
                >
                  {label}<span>{count ?? "—"}</span>
                </button>
              ))}
            </nav>
            <div className="admin-dashboard__toolbar admin-dashboard__toolbar--bookings">
              <label>
                <Search size={17} />
                <input value={bookingSearch} onChange={(event) => { setBookingPage(0); setBookingSearch(event.target.value); }} placeholder={t("admin.searchBookings")} />
              </label>
              <select value={bookingStatusFilter} onChange={(event) => { setBookingPage(0); setBookingStatusFilter(event.target.value); }} aria-label={t("admin.table.status")}>
                <option value="">{t("admin.allStatuses")}</option>
                {["pending", "confirmed", "cancelled", "expired", "refunded"].map((status) => <option key={status} value={status}>{t(`admin.status.${status}`)}</option>)}
              </select>
              <button
                aria-expanded={bookingFiltersOpen}
                className={`admin-dashboard__filter-toggle${bookingFiltersOpen ? " is-active" : ""}`}
                onClick={() => setBookingFiltersOpen((open) => !open)}
                type="button"
              >
                <Filter size={16} /> {t("admin.bookingFilters.toggle")}
              </button>
              <button className="admin-dashboard__export" type="button" onClick={exportBookingsCsv}>
                <Download size={16} /> {t("admin.exportCsv")}
              </button>
            </div>
            {bookingFiltersOpen && (
              <div className="admin-dashboard__booking-filters">
                <label>{t("admin.bookingFilters.createdFrom")}
                  <input aria-label={t("admin.bookingFilters.createdFrom")} type="date" value={bookingCreatedFrom} onChange={(event) => { setBookingPage(0); setBookingCreatedFrom(event.target.value); }} />
                </label>
                <label>{t("admin.bookingFilters.createdTo")}
                  <input aria-label={t("admin.bookingFilters.createdTo")} type="date" value={bookingCreatedTo} onChange={(event) => { setBookingPage(0); setBookingCreatedTo(event.target.value); }} />
                </label>
                <label>{t("admin.bookingFilters.departureFrom")}
                  <input aria-label={t("admin.bookingFilters.departureFrom")} type="date" value={bookingDepartureFrom} onChange={(event) => { setBookingPage(0); setBookingDepartureFrom(event.target.value); }} />
                </label>
                <label>{t("admin.bookingFilters.departureTo")}
                  <input aria-label={t("admin.bookingFilters.departureTo")} type="date" value={bookingDepartureTo} onChange={(event) => { setBookingPage(0); setBookingDepartureTo(event.target.value); }} />
                </label>
                <label>{t("admin.bookingFilters.carrier")}
                  <select value={bookingCarrier} onChange={(event) => { setBookingPage(0); setBookingCarrier(event.target.value); }}>
                    <option value="">{t("admin.bookingFilters.allCarriers")}</option>
                    {bookingCarriers.map((carrier) => <option key={carrier} value={carrier}>{carrier}</option>)}
                  </select>
                </label>
                <label>{t("admin.bookingFilters.currency")}
                  <select value={bookingCurrency} onChange={(event) => { setBookingPage(0); setBookingCurrency(event.target.value); }}>
                    <option value="">{t("admin.bookingFilters.allCurrencies")}</option>
                    {bookingCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                  </select>
                </label>
                <label>{t("admin.bookingFilters.minAmount")}
                  <input min="0" step="0.01" type="number" value={bookingMinAmount} onChange={(event) => { setBookingPage(0); setBookingMinAmount(event.target.value); }} />
                </label>
                <label>{t("admin.bookingFilters.maxAmount")}
                  <input min="0" step="0.01" type="number" value={bookingMaxAmount} onChange={(event) => { setBookingPage(0); setBookingMaxAmount(event.target.value); }} />
                </label>
                <label>{t("admin.bookingFilters.passengerCount")}
                  <input min="1" step="1" type="number" value={bookingPassengerCount} onChange={(event) => { setBookingPage(0); setBookingPassengerCount(event.target.value); }} />
                </label>
                <button
                  className="admin-dashboard__reset-filters"
                  onClick={() => {
                    setBookingPage(0);
                    setBookingSearch("");
                    setBookingStatusFilter("");
                    setBookingCategory("all");
                    setBookingCreatedFrom("");
                    setBookingCreatedTo("");
                    setBookingDepartureFrom("");
                    setBookingDepartureTo("");
                    setBookingCarrier("");
                    setBookingCurrency("");
                    setBookingMinAmount("");
                    setBookingMaxAmount("");
                    setBookingPassengerCount("");
                  }}
                  type="button"
                >
                  <RotateCcw size={15} /> {t("admin.bookingFilters.reset")}
                </button>
              </div>
            )}
            <div className="admin-dashboard__panel">
              <div className="admin-dashboard__booking-results">
                <span>{bookingTotal} {t("admin.results")}</span>
                {bookingCategory === "attention" && <span className="is-priority"><CircleAlert size={14} /> {t("admin.bookingCategories.attentionHint")}</span>}
              </div>
              {loadErrors.bookings
                ? <p className="admin-dashboard__error" role="alert">{loadErrors.bookings}</p>
                : <BookingTable bookings={filteredBookings} onOpen={openBooking} t={t} i18nLanguage={i18n.language} />}
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
                      <th>{t("admin.bookingTable.status")}</th>
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
            <section className="admin-dashboard__panel admin-dashboard__robot-settings">
              <header>
                <img src="/images/busnet-ai-assistant-robot.png" alt="" aria-hidden="true" />
                <div>
                  <p>BUSNET · ПОМІЧНИК</p>
                  <h3>Цифровий співробітник</h3>
                  <span>Візуальний прототип без команд та зовнішніх інтеграцій</span>
                </div>
              </header>
              <label className="admin-dashboard__robot-greeting">
                Привітання при вході
                <textarea
                  maxLength={300}
                  value={robotSettingsDraft.greeting}
                  onChange={(event) => setRobotSettingsDraft((current) => ({ ...current, greeting: event.target.value }))}
                />
                <small>{robotSettingsDraft.greeting.length}/300</small>
              </label>
              <div className="admin-dashboard__robot-options">
                <label>
                  <input
                    type="checkbox"
                    checked={robotSettingsDraft.enabled}
                    onChange={(event) => setRobotSettingsDraft((current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  Показувати плаваючого робота
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={robotSettingsDraft.greetOnEntry}
                    onChange={(event) => setRobotSettingsDraft((current) => ({ ...current, greetOnEntry: event.target.checked }))}
                  />
                  Вітати при вході в кабінет
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={robotSettingsDraft.animated}
                    onChange={(event) => setRobotSettingsDraft((current) => ({ ...current, animated: event.target.checked }))}
                  />
                  Увімкнути анімацію
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={robotSettingsDraft.draggable}
                    onChange={(event) => setRobotSettingsDraft((current) => ({ ...current, draggable: event.target.checked }))}
                  />
                  Дозволити переміщення
                </label>
              </div>
              <button type="button" onClick={saveRobotSettings}>Зберегти налаштування робота</button>
            </section>
          </>
        )}
        {robotPreferences.enabled && (
          <div
            className={`busnet-ai-robot${robotPreferences.animated ? " is-animated" : ""}`}
            style={{ left: robotPosition.x, top: robotPosition.y }}
          >
            <button
              ref={robotButtonRef}
              className={[
                "busnet-ai-robot__button",
                hubOpen ? "is-active" : "",
                unreadNotificationCount > 0 ? "has-alert" : "",
                (stats.providerErrors ?? 0) > 0 ? "has-critical" : "",
              ].filter(Boolean).join(" ")}
              type="button"
              aria-label="Відкрити центр BUSNET"
              aria-expanded={hubOpen}
              title="Центр BUSNET"
              onPointerDown={(event) => {
                if (!robotPreferences.draggable) return;
                robotDragRef.current = true;
                robotMovedRef.current = false;
                robotDragStartRef.current = { x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!robotDragRef.current) return;
                const start = robotDragStartRef.current;
                if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) {
                  robotMovedRef.current = true;
                }
                setRobotPosition({
                  x: Math.min(Math.max(event.clientX - 44, 16), Math.max(16, window.innerWidth - 88)),
                  y: Math.min(Math.max(event.clientY - 44, 16), Math.max(16, window.innerHeight - 88)),
                });
              }}
              onPointerUp={(event) => {
                if (!robotDragRef.current) return;
                robotDragRef.current = false;
                robotDragStartRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                if (!robotMovedRef.current) return;
                const finalPosition = {
                  x: Math.min(Math.max(event.clientX - 44, 16), Math.max(16, window.innerWidth - 88)),
                  y: Math.min(Math.max(event.clientY - 44, 16), Math.max(16, window.innerHeight - 88)),
                };
                setRobotPosition(finalPosition);
                try {
                  window.localStorage.setItem("busnet_ai_robot_position", JSON.stringify(finalPosition));
                } catch (error) {
                  console.error("Could not save BUSNET AI position", error);
                  setActionMessage(t("admin.actionFailed"));
                }
              }}
              onPointerCancel={() => {
                robotDragRef.current = false;
                robotDragStartRef.current = null;
              }}
              onClick={() => {
                if (robotMovedRef.current) {
                  robotMovedRef.current = false;
                  return;
                }
                setRobotGreetingOpen(false);
                if (hubOpen) {
                  setHubOpen(false);
                } else {
                  setRobotPanelMode("launcher");
                  setHubOpen(true);
                }
              }}
            >
              <img src="/images/busnet-ai-assistant-robot.png" alt="" draggable={false} />
              {unreadNotificationCount > 0 && (
                <span className="busnet-ai-robot__badge">
                  {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                </span>
              )}
            </button>
            {robotGreetingOpen && (
              <div
                className="busnet-ai-robot__greeting"
                role="status"
                aria-live="polite"
                style={{
                  left: robotPosition.x < window.innerWidth / 2
                    ? Math.max(16, Math.min(robotPosition.x + 92, window.innerWidth - 336))
                    : undefined,
                  right: robotPosition.x >= window.innerWidth / 2
                    ? window.innerWidth - robotPosition.x + 12
                    : undefined,
                  top: Math.min(Math.max(robotPosition.y - 20, 16), window.innerHeight - 170),
                }}
              >
                <header>
                  <span><i />BUSNET · ЦИФРОВИЙ ПОМІЧНИК</span>
                  <button
                    type="button"
                    aria-label="Закрити привітання"
                    onClick={() => {
                      setRobotGreetingOpen(false);
                      if (robotGreetingTimerRef.current !== null) window.clearTimeout(robotGreetingTimerRef.current);
                    }}
                  >
                    <X size={15} />
                  </button>
                </header>
                <p>{robotPreferences.greeting}</p>
              </div>
            )}
          </div>
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
                  <p>{t("admin.tabs.bookings")}</p>
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
                        <span>{t("admin.bookingDetailsSections.order")}</span>
                        <strong>{t(`admin.status.${selectedBooking.status}`)}</strong>
                        <p>{t("admin.bookingDetailsSections.created")}: {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedBooking.created_at))}</p>
                        {selectedBooking.expires_at && <p>{t("admin.table.expires")}: {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedBooking.expires_at))}</p>}
                        {selectedBooking.confirmed_at && <p>{t("admin.table.confirmed")}: {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedBooking.confirmed_at))}</p>}
                        {selectedBooking.provider_booking_id && <p>{t("admin.table.providerId")}: {selectedBooking.provider_booking_id}</p>}
                      </article>
                      <article>
                        <span>{t("admin.bookingDetailsSections.trip")}</span>
                        <strong>
                          {selectedBooking.trip_details?.from_city ?? "—"} → {selectedBooking.trip_details?.to_city ?? "—"}
                        </strong>
                        {selectedBooking.trip_details?.departure_at && <p>{t("admin.bookingTable.departure")}: {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedBooking.trip_details.departure_at))}</p>}
                        {selectedBooking.trip_details?.arrival_at && <p>{t("admin.bookingDetailsSections.arrival")}: {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedBooking.trip_details.arrival_at))}</p>}
                        {selectedBooking.trip_details?.carrier && <p>{t("admin.bookingTable.carrier")}: {selectedBooking.trip_details.carrier}</p>}
                        <p>{t("admin.table.tripId")}: {selectedBooking.trip_id}</p>
                      </article>
                      <article>
                        <span>{t("admin.bookingDetailsSections.finances")}</span>
                        <strong>{new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(Number(selectedBooking.total_amount))} {selectedBooking.currency}</strong>
                        <p>{t("admin.bookingDetailsSections.totalOrder")}</p>
                      </article>
                    </div>

                    <section className="admin-dashboard__booking-detail-section">
                      <h3>{t("admin.bookingDetailsSections.passengers")} ({selectedBooking.booking_passengers.length})</h3>
                      {selectedBooking.booking_passengers.map((item, index) => (
                        <article key={item.id ?? `${selectedBooking.id}-passenger-${index}`}>
                          <strong>{item.full_name}</strong>
                          {item.phone && <span><Phone size={14} /> {item.phone}</span>}
                          {item.email && <span><Mail size={14} /> {item.email}</span>}
                          {item.seat_number && <span>{t("admin.bookingDetailsSections.seat")}: {item.seat_number}</span>}
                          {item.nationality && <span>{t("admin.bookingDetailsSections.nationality")}: {item.nationality}</span>}
                          {item.document_type && <span>{t("admin.bookingDetailsSections.document")}: {item.document_type}{item.document_number ? ` · ${item.document_number}` : ""}</span>}
                        </article>
                      ))}
                    </section>

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

                    <section className="admin-dashboard__booking-history">
                      <h3>{t("admin.bookingDetailsSections.history")}</h3>
                      {bookingHistoryError ? (
                        <p className="admin-dashboard__error" role="alert">{bookingHistoryError}</p>
                      ) : bookingHistory.length === 0 ? (
                        <p>{t("admin.bookingDetailsSections.noHistory")}</p>
                      ) : (
                        <ol>
                          {bookingHistory.slice().reverse().map((entry) => (
                            <li key={entry.id}>
                              <strong>{entry.action}</strong>
                              <time dateTime={entry.created_at}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at))}</time>
                              <span>{entry.actor_id ? `${t("admin.bookingDetailsSections.admin")}: ${entry.actor_id.slice(0, 8)}` : ""}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>

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
  onOpen,
  t,
  i18nLanguage,
}: {
  bookings: BookingRow[];
  onOpen: (booking: BookingRow) => void;
  t: (key: string) => string;
  i18nLanguage: string;
}) {
  if (bookings.length === 0) return <p className="admin-dashboard__empty">{t("admin.noBookings")}</p>;
  return (
    <div className="admin-dashboard__table-wrap">
      <table className="admin-dashboard__table">
        <thead><tr>
          <th>{t("admin.table.booking")}</th>
          <th>{t("admin.table.passenger")}</th>
          <th>{t("admin.bookingTable.route")}</th>
          <th>{t("admin.bookingTable.departure")}</th>
          <th>{t("admin.bookingTable.carrier")}</th>
          <th>{t("admin.table.amount")}</th>
          <th>{t("admin.table.status")}</th>
        </tr></thead>
        <tbody>
          {bookings.map((booking) => {
            const passenger = booking.booking_passengers?.[0];
            return (
              <tr
                aria-label={`${booking.booking_number}, ${passenger?.full_name ?? ""}`}
                className="admin-dashboard__booking-row"
                key={booking.id}
                onClick={() => onOpen(booking)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(booking);
                  }
                }}
                tabIndex={0}
              >
                <td>
                  <strong>{booking.booking_number}</strong>
                  <span>{new Intl.DateTimeFormat(i18nLanguage, { dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.created_at))}</span>
                </td>
                <td>
                  <strong>{passenger?.full_name || "—"}</strong>
                  <span>{booking.booking_passengers.length > 1
                    ? `${booking.booking_passengers.length} ${t("admin.bookingTable.passengers")}`
                    : passenger?.phone || passenger?.email || "—"}</span>
                </td>
                <td>{booking.trip_details?.from_city ?? "—"} → {booking.trip_details?.to_city ?? "—"}</td>
                <td>{booking.trip_details?.departure_at
                  ? new Intl.DateTimeFormat(i18nLanguage, { dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.trip_details.departure_at))
                  : "—"}</td>
                <td>{booking.trip_details?.carrier ?? "—"}</td>
                <td><strong>{new Intl.NumberFormat(i18nLanguage, { maximumFractionDigits: 2 }).format(Number(booking.total_amount))} {booking.currency}</strong></td>
                <td>
                  <span className={`admin-dashboard__status admin-dashboard__status--${booking.status}`}>{t(`admin.status.${booking.status}`)}</span>
                  {booking.trip_details?.open_cancellation_request && (
                    <span className="admin-dashboard__booking-flag">{t("admin.bookingTable.cancellationRequested")}</span>
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
