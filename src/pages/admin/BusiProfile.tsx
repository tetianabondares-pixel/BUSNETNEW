import { useCallback, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  CircleAlert,
  Clock3,
  MessageCircle,
  type LucideIcon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  getAssistantCapabilities,
  getCapabilityDisplayStatus,
  type AssistantCapability,
  type CapabilityDisplayStatus,
} from "@/lib/assistantCapabilities";
import { getKnowledgeStats } from "@/lib/knowledgeCenter";
import type { KnowledgeStats } from "@/lib/knowledgeCenterModel";

type ProfileSnapshot = {
  knowledgeStats: KnowledgeStats | null;
  capabilities: AssistantCapability[] | null;
};

type ProfileErrors = {
  knowledge: string;
  capabilities: string;
};

type ProfileStatus = "ready" | "working" | "error";

type BusiProfileData = {
  snapshot: ProfileSnapshot | null;
  errors: ProfileErrors;
  loading: boolean;
  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
};

type CapabilityCounts = Record<CapabilityDisplayStatus, number>;

const EMPTY_ERRORS: ProfileErrors = { knowledge: "", capabilities: "" };

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useBusiProfileData(): BusiProfileData {
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);
  const [errors, setErrors] = useState<ProfileErrors>(EMPTY_ERRORS);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback(async (force: boolean) => {
    if (inFlightRef.current) return inFlightRef.current;
    if (loadedRef.current && !force) return;

    setLoading(true);
    const request = (async () => {
      const [knowledgeResult, capabilitiesResult] = await Promise.allSettled([
        getKnowledgeStats(),
        getAssistantCapabilities(),
      ]);

      const nextSnapshot: ProfileSnapshot = {
        knowledgeStats: knowledgeResult.status === "fulfilled" ? knowledgeResult.value : null,
        capabilities: capabilitiesResult.status === "fulfilled" ? capabilitiesResult.value : null,
      };
      const nextErrors: ProfileErrors = {
        knowledge: knowledgeResult.status === "rejected"
          ? errorText(knowledgeResult.reason, "Не вдалося завантажити статистику бази знань.")
          : "",
        capabilities: capabilitiesResult.status === "rejected"
          ? errorText(capabilitiesResult.reason, "Не вдалося завантажити реєстр можливостей.")
          : "",
      };

      setSnapshot(nextSnapshot);
      setErrors(nextErrors);
      loadedRef.current = true;
    })();

    inFlightRef.current = request;
    try {
      await request;
    } finally {
      inFlightRef.current = null;
      setLoading(false);
    }
  }, []);

  const ensureLoaded = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);

  return { snapshot, errors, loading, ensureLoaded, refresh };
}

function capabilityCounts(capabilities: AssistantCapability[]): CapabilityCounts {
  return capabilities.reduce<CapabilityCounts>((counts, capability) => {
    counts[getCapabilityDisplayStatus(capability)] += 1;
    return counts;
  }, {
    planned: 0,
    in_development: 0,
    verified: 0,
    operational: 0,
    retired: 0,
    stale_evidence: 0,
  });
}

function latestConfirmation(capabilities: AssistantCapability[]) {
  const candidates: Array<{
    title: string;
    status: "verified" | "operational";
    completedAt: string;
    reference: string;
  }> = [];

  for (const capability of capabilities) {
    const status = getCapabilityDisplayStatus(capability);
    if (status === "operational" && capability.operationalCheck) {
      candidates.push({
        title: capability.title,
        status,
        completedAt: capability.operationalCheck.completedAt,
        reference: capability.operationalCheck.executionReference,
      });
      continue;
    }
    if (status === "verified" && capability.testRun) {
      candidates.push({
        title: capability.title,
        status,
        completedAt: capability.testRun.completedAt,
        reference: capability.testRun.testReference,
      });
    }
  }

  return candidates
    .filter((candidate) => Number.isFinite(new Date(candidate.completedAt).getTime()))
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))[0] ?? null;
}

function profileStatus(busy: boolean, lastRequestFailed: boolean): ProfileStatus {
  if (busy) return "working";
  if (lastRequestFailed) return "error";
  return "ready";
}

function statusLabel(status: ProfileStatus): string {
  if (status === "working") return "Виконує запит";
  if (status === "error") return "Помилка останнього запиту";
  return "Готовий у цій адмін-сесії";
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="busi-profile__metric">
      <span className="busi-profile__metric-icon"><Icon size={16} aria-hidden="true" /></span>
      <span className="busi-profile__metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ProfileStatusBadge({ status }: { status: ProfileStatus }) {
  const Icon = status === "working" ? Activity : status === "error" ? CircleAlert : CheckCircle2;
  return (
    <span className={`busi-profile__status is-${status}`} role="status" aria-live="polite">
      <Icon size={13} aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

function metricValue(value: number | null, loading: boolean, failed: boolean): string {
  if (loading && value === null) return "…";
  if (failed || value === null) return "—";
  return String(value);
}

function ProfileMetrics({
  snapshot,
  errors,
  loading,
}: Pick<BusiProfileData, "snapshot" | "errors" | "loading">) {
  const knowledge = snapshot?.knowledgeStats ?? null;
  const capabilities = snapshot?.capabilities ?? null;
  const counts = capabilities ? capabilityCounts(capabilities) : null;
  const verifiedSkills = counts ? counts.verified + counts.operational : null;

  return (
    <div className="busi-profile__metrics">
      <Metric
        icon={BookOpen}
        label="Знання"
        value={metricValue(knowledge?.verified ?? null, loading, Boolean(errors.knowledge))}
        detail={knowledge ? `перевірено з ${knowledge.total} доступних записів` : "Перевірені записи бази знань"}
      />
      <Metric
        icon={Wrench}
        label="Навички"
        value={metricValue(verifiedSkills, loading, Boolean(errors.capabilities))}
        detail={counts
          ? `${counts.operational} працюють · ${counts.verified} підтверджені тестами`
          : "Навички з актуальними доказами"}
      />
      <Metric
        icon={Sparkles}
        label="Досвід"
        value="—"
        detail="Не вимірюється: немає серверного журналу задач"
      />
      <Metric
        icon={ShieldCheck}
        label="Надійність"
        value="—"
        detail="Не вимірюється: перевірки виконання не підключені"
      />
    </div>
  );
}

function ProfileDataErrors({ errors }: { errors: ProfileErrors }) {
  if (!errors.knowledge && !errors.capabilities) return null;
  return (
    <div className="busi-profile__errors" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      <div>
        {errors.knowledge && <p><strong>База знань:</strong> {errors.knowledge}</p>}
        {errors.capabilities && <p><strong>Навички:</strong> {errors.capabilities}</p>}
      </div>
    </div>
  );
}

export function BusiProfilePeek({
  data,
  busy,
  lastRequestFailed,
  onClose,
  onOpenProfile,
  onOpenQuickActions,
  onOpenWorkspace,
  onOpenChat,
  style,
}: {
  data: BusiProfileData;
  busy: boolean;
  lastRequestFailed: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenQuickActions: () => void;
  onOpenWorkspace: () => void;
  onOpenChat: () => void;
  style?: CSSProperties;
}) {
  const status = profileStatus(busy, lastRequestFailed);
  const knowledgeCount = data.snapshot?.knowledgeStats?.verified ?? null;
  const capabilities = data.snapshot?.capabilities;
  const counts = capabilities ? capabilityCounts(capabilities) : null;
  const skillCount = counts ? counts.verified + counts.operational : null;

  return (
    <section
      id="busi-profile-peek-card"
      className="busi-profile-peek"
      aria-label="BUSI — AI-асистент BUSNET"
      style={style}
    >
      <header className="busi-profile-peek__header">
        <span className="busi-profile-peek__brand">
          <strong>BUSI</strong>
          <small>AI-асистент BUSNET</small>
        </span>
        <ProfileStatusBadge status={status} />
        <button type="button" aria-label="Закрити картку BUSI" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="busi-profile-peek__hero">
        <div className="busi-profile-peek__avatar-stage">
          <img
            className="busi-profile-peek__avatar"
            src="/images/busnet-ai-assistant-robot.png"
            alt="BUSI"
          />
        </div>
        <div className="busi-profile-peek__greeting">
          <span>ЦИФРОВИЙ СПІВРОБІТНИК BUSNET</span>
          <strong>{status === "working" ? "Обробляю твій запит" : status === "error" ? "Запит потребує уваги" : "Привіт! Я BUSI"}</strong>
          <p>
            {status === "working"
              ? "Працюю в цій адмін-сесії."
              : status === "error"
                ? "Останній запит завершився помилкою. Спробуй ще раз у чаті."
                : "Відповім за перевіреною базою BUSNET або допоможу знайти пасажира."}
          </p>
        </div>
      </div>
      <div className="busi-profile-peek__stats">
        <span><BookOpen size={14} aria-hidden="true" />Перевірені знання <strong>{metricValue(knowledgeCount, data.loading, Boolean(data.errors.knowledge))}</strong></span>
        <span><Wrench size={14} aria-hidden="true" />Навички з актуальними доказами <strong>{metricValue(skillCount, data.loading, Boolean(data.errors.capabilities))}</strong></span>
      </div>
      <p className="busi-profile-peek__motto">
        <Sparkles size={14} aria-hidden="true" />
        Моє правило: краще спиратися на перевірені дані, ніж вигадувати.
      </p>
      <ProfileDataErrors errors={data.errors} />
      <div className="busi-profile-peek__actions">
        <button type="button" onClick={onOpenProfile}>
          <Sparkles size={15} aria-hidden="true" />Профіль BUSI
        </button>
        <button type="button" onClick={onOpenQuickActions}>
          <Zap size={15} aria-hidden="true" />Швидкі дії
        </button>
        <button type="button" onClick={onOpenChat}>
          <MessageCircle size={15} aria-hidden="true" />Чат із BUSI
        </button>
        <button type="button" onClick={onOpenWorkspace}>
          <ClipboardList size={15} aria-hidden="true" />Робочий простір
        </button>
      </div>
    </section>
  );
}

export function BusiProfilePanel({
  data,
  busy,
  lastRequestFailed,
}: {
  data: BusiProfileData;
  busy: boolean;
  lastRequestFailed: boolean;
}) {
  const status = profileStatus(busy, lastRequestFailed);
  const capabilities = data.snapshot?.capabilities;
  const counts = capabilities ? capabilityCounts(capabilities) : null;
  const latest = capabilities ? latestConfirmation(capabilities) : null;
  const knowledge = data.snapshot?.knowledgeStats ?? null;

  return (
    <section className="busi-profile" aria-labelledby="busi-profile-title">
      <header className="busi-profile__heading">
        <div className="busi-profile__identity">
          <img src="/images/busnet-ai-assistant-robot.png" alt="" />
          <span>
            <strong id="busi-profile-title">BUSI</strong>
            <small>AI-асистент BUSNET · ЦИФРОВИЙ СПІВРОБІТНИК</small>
          </span>
        </div>
        <div className="busi-profile__heading-actions">
          <ProfileStatusBadge status={status} />
          <button type="button" onClick={() => void data.refresh()} disabled={data.loading}>
            <RefreshCw size={15} className={data.loading ? "is-spinning" : ""} aria-hidden="true" />
            Оновити
          </button>
        </div>
      </header>

      <section className="busi-profile__learning" aria-label="Прогрес навчання">
        <div className="busi-profile__progress-mark" aria-hidden="true">—</div>
        <div>
          <span>ПРОГРЕС НАВЧАННЯ</span>
          <strong>Не вимірюється</strong>
          <p>Немає затвердженої формули прогресу; локальна історія задач не є спільним доказом навчання.</p>
        </div>
      </section>

      <ProfileMetrics snapshot={data.snapshot} errors={data.errors} loading={data.loading} />
      <ProfileDataErrors errors={data.errors} />

      <section className="busi-profile__evolution">
        <article>
          <span><CheckCircle2 size={14} aria-hidden="true" /> ОСТАННЄ ПІДТВЕРДЖЕННЯ НАВИЧКИ</span>
          {latest ? (
            <>
              <strong>{latest.title}</strong>
              <small>
                {latest.status === "operational" ? "Перевірено в роботі" : "Тести пройдені"}
                {" · "}{new Date(latest.completedAt).toLocaleString("uk-UA")}
                {" · "}{latest.reference}
              </small>
            </>
          ) : (
            <p>{data.errors.capabilities ? "Дані тимчасово недоступні." : "Поки немає актуальних підтверджень навичок."}</p>
          )}
        </article>
        <article>
          <span><Target size={14} aria-hidden="true" /> НАСТУПНА ЦІЛЬ</span>
          <strong>{counts ? `${counts.planned} можливостей у плані` : "—"}</strong>
          <small>Пріоритети цілей ще не задані, тому BUSI не обирає наступну ціль довільно.</small>
        </article>
      </section>

      <section className="busi-profile__capabilities" aria-label="Статус можливостей">
        <div className="busi-profile__section-title">
          <div><Wrench size={15} aria-hidden="true" /><strong>НАВИЧКИ BUSI</strong></div>
          <small>Актуальні докази, а не самооцінка агента</small>
        </div>
        {counts ? (
          <div className="busi-profile__status-grid">
            <span>Працюють <strong>{counts.operational}</strong></span>
            <span>Підтверджені <strong>{counts.verified}</strong></span>
            <span>У розробці <strong>{counts.in_development}</strong></span>
            <span>Заплановані <strong>{counts.planned}</strong></span>
            {counts.stale_evidence > 0 && <span className="is-warning">Застарілі підтвердження <strong>{counts.stale_evidence}</strong></span>}
          </div>
        ) : (
          <p className="busi-profile__unavailable">
            {data.errors.capabilities || (data.loading ? "Завантаження реєстру…" : "Дані про можливості недоступні.")}
          </p>
        )}
      </section>

      <p className="busi-profile__footnote">
        База знань показує записи, доступні вашій ролі. Статус BUSI відображає лише цю адмін-сесію; глобальний статус «У мережі» не налаштований.
        {knowledge && ` У базі знань: ${knowledge.needsVerification} записів очікують перевірки.`}
      </p>
      {data.loading && <span className="busi-profile__loading" role="status"><Clock3 size={14} />Оновлення даних профілю…</span>}
    </section>
  );
}
