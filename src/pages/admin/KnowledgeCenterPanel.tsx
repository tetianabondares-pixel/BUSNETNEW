import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  BookOpen,
  Check,
  Clock3,
  FileText,
  History,
  Plus,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  archiveKnowledgeEntry,
  getKnowledgeConflicts,
  getKnowledgeHistory,
  getKnowledgeProposals,
  getKnowledgeStats,
  getLegacyKnowledgeImportState,
  getKnowledgeCurrentUserId,
  importLegacyKnowledge,
  proposeKnowledge,
  reportKnowledgeConflict,
  resolveKnowledgeConflict,
  restoreKnowledgeVersion,
  reviewKnowledgeProposal,
  searchKnowledge,
} from "@/lib/knowledgeCenter";
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_SCOPES,
  KNOWLEDGE_SOURCES,
  KNOWLEDGE_STATUSES,
  type KnowledgeCategory,
  type KnowledgeConflict,
  type KnowledgeConflictDecision,
  type KnowledgeEntry,
  type KnowledgeProposal,
  type KnowledgeProposalInput,
  type KnowledgeReviewDecision,
  type KnowledgeScope,
  type KnowledgeSearchFilters,
  type KnowledgeSourceType,
  type KnowledgeStats,
  type KnowledgeVersion,
} from "@/lib/knowledgeCenterModel";

type Props = { role: string };
type FormMode =
  | { kind: "create" }
  | { kind: "update"; entry: KnowledgeEntry }
  | { kind: "conflict"; entry: KnowledgeEntry };
type Draft = Omit<KnowledgeProposalInput, "action" | "entryId" | "baseVersion" | "ownerId"> & {
  scope: KnowledgeScope;
  sourceTaskId: string;
  conflictSummary: string;
};

const MODULES = [
  { id: "systems", label: "Системи" },
  { id: "operations.bookings", label: "Бронювання" },
  { id: "operations.passengers", label: "Пасажири" },
  { id: "operations.carriers", label: "Перевізники" },
  { id: "operations.routes", label: "Маршрути" },
  { id: "analytics", label: "Аналітика" },
  { id: "platform.content", label: "Контент платформи" },
];

const EMPTY_DRAFT: Draft = {
  category: "busnet_knowledge",
  scope: "shared",
  department: "systems",
  module: "systems",
  title: "",
  summary: "",
  content: "",
  sourceType: "owner_input",
  sourceReference: "",
  sourceRevision: null,
  evidence: "",
  confidence: 0.7,
  sourceTaskId: "",
  conflictSummary: "",
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Не вдалося виконати операцію Knowledge Center.";
}

function dateText(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("uk-UA");
}

function categoryLabel(value: KnowledgeCategory): string {
  return KNOWLEDGE_CATEGORIES.find((category) => category.id === value)?.label ?? value;
}

function statusLabel(value: string): string {
  return KNOWLEDGE_STATUSES.find((status) => status.id === value)?.label ?? value;
}

function sourceLabel(value: KnowledgeSourceType): string {
  return KNOWLEDGE_SOURCES.find((source) => source.id === value)?.label ?? value;
}

function scopeLabel(value: KnowledgeScope): string {
  return KNOWLEDGE_SCOPES.find((scope) => scope.id === value)?.label ?? value;
}

function departmentForModule(module: string): string {
  const separator = module.indexOf(".");
  return separator === -1 ? module : module.slice(0, separator);
}

function initialDraft(entry?: KnowledgeEntry): Draft {
  if (!entry) return { ...EMPTY_DRAFT };
  const source = entry.sources[0];
  return {
    category: entry.category,
    scope: entry.scope,
    department: entry.department,
    module: entry.module,
    title: entry.title,
    summary: entry.summary,
    content: entry.content,
    sourceType: source?.sourceType ?? "owner_input",
    sourceReference: source?.sourceReference ?? "",
    sourceRevision: source?.sourceRevision ?? null,
    evidence: source?.evidence ?? "",
    confidence: entry.confidence,
    sourceTaskId: entry.sourceTaskId ?? "",
    conflictSummary: "",
  };
}

export function KnowledgeCenterPanel({ role }: Props) {
  const [filters, setFilters] = useState<KnowledgeSearchFilters>({
    query: "",
    category: "all",
    status: "all",
    module: "",
    scope: "all",
  });
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [proposals, setProposals] = useState<KnowledgeProposal[]>([]);
  const [conflicts, setConflicts] = useState<KnowledgeConflict[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [conflictNotes, setConflictNotes] = useState<Record<string, string>>({});
  const [historyEntry, setHistoryEntry] = useState<KnowledgeEntry | null>(null);
  const [history, setHistory] = useState<KnowledgeVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [legacyCount, setLegacyCount] = useState(0);
  const [legacyImportComplete, setLegacyImportComplete] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [searchResult, proposalRows, conflictRows, currentStats] = await Promise.all([
        searchKnowledge(filters, 100),
        getKnowledgeProposals(),
        getKnowledgeConflicts(),
        getKnowledgeStats(),
      ]);
      setEntries(searchResult.items);
      setProposals(proposalRows);
      setConflicts(conflictRows);
      setStats(currentStats);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshKey]);

  useEffect(() => {
    try {
      const legacy = getLegacyKnowledgeImportState();
      setLegacyCount(legacy.entries.length);
      setLegacyImportComplete(legacy.completed);
    } catch (legacyError) {
      setError(errorText(legacyError));
    }
  }, [refreshKey]);

  const isCurator = role === "super_admin";

  const refresh = () => setRefreshKey((current) => current + 1);

  const beginCreate = () => {
    setDraft({ ...EMPTY_DRAFT });
    setFormMode({ kind: "create" });
    setFormError("");
    setMessage("");
  };

  const beginUpdate = (entry: KnowledgeEntry) => {
    setDraft(initialDraft(entry));
    setFormMode({ kind: "update", entry });
    setFormError("");
    setMessage("");
  };

  const beginConflict = (entry: KnowledgeEntry) => {
    setDraft({
      ...initialDraft(entry),
      title: "",
      content: "",
      sourceReference: "",
      evidence: "",
      conflictSummary: "",
    });
    setFormMode({ kind: "conflict", entry });
    setFormError("");
    setMessage("");
  };

  const saveDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim() || !draft.content.trim() || !draft.sourceReference.trim()) {
      setFormError("Заповніть назву, зміст і джерело.");
      return;
    }
    if (!Number.isFinite(draft.confidence) || draft.confidence < 0 || draft.confidence > 1) {
      setFormError("Достовірність має бути числом від 0 до 1.");
      return;
    }
    if (draft.sourceTaskId.trim() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.sourceTaskId.trim())) {
      setFormError("ID задачі має бути UUID.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const ownerId = draft.scope === "owner"
        ? formMode?.kind === "update" || formMode?.kind === "conflict"
          ? formMode.entry.ownerId
          : await getKnowledgeCurrentUserId()
        : null;
      if (formMode?.kind === "conflict") {
        if (!draft.conflictSummary.trim()) {
          setFormError("Опишіть, у чому саме полягає суперечність.");
          setSaving(false);
          return;
        }
        await reportKnowledgeConflict({
          entryId: formMode.entry.id,
          baseVersion: formMode.entry.currentVersion,
          summary: draft.conflictSummary,
          reportedTitle: draft.title,
          reportedContent: draft.content,
          sourceType: draft.sourceType,
          sourceReference: draft.sourceReference,
          sourceRevision: draft.sourceRevision,
          evidence: draft.evidence,
          confidence: draft.confidence,
          sourceTaskId: draft.sourceTaskId.trim() || null,
        });
        setMessage("Суперечність зареєстрована. Поточна версія вилучена з перевірених знань до розгляду куратора.");
      } else {
        const input: KnowledgeProposalInput = {
          ...draft,
          action: formMode?.kind === "update" ? "update" : "create",
          entryId: formMode?.kind === "update" ? formMode.entry.id : null,
          baseVersion: formMode?.kind === "update" ? formMode.entry.currentVersion : null,
          ownerId,
          sourceTaskId: draft.sourceTaskId.trim() || null,
        };
        const result = await proposeKnowledge(input);
        setMessage(result.status === "conflict"
          ? "Виявлено зміну базової версії. Конфлікт збережено для перевірки."
          : "Пропозицію збережено. Вона не стане робочим правилом до перевірки куратором.");
      }
      setFormMode(null);
      refresh();
    } catch (saveError) {
      setFormError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const importLegacy = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const importedCount = await importLegacyKnowledge();
      setLegacyImportComplete(true);
      setMessage(importedCount > 0
        ? `Створено пропозиції для ${importedCount} локальних записів. Локальна резервна копія збережена.`
        : "Локальні записи вже перенесені або їх немає. Резервна копія залишилася в браузері.");
      refresh();
    } catch (importError) {
      setError(errorText(importError));
    } finally {
      setSaving(false);
    }
  };

  const reviewProposal = async (proposal: KnowledgeProposal, decision: KnowledgeReviewDecision) => {
    const note = reviewNotes[proposal.id]?.trim() ?? "";
    if (decision !== "verify" && !note) {
      setError("Для відкладення або відхилення вкажіть примітку куратора.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await reviewKnowledgeProposal(proposal.id, decision, note);
      setMessage(decision === "verify"
        ? "Підтверджена версія збережена з ID куратора та джерелом перевірки."
        : decision === "defer"
          ? "Пропозиція залишена на перевірці."
          : "Пропозицію відхилено; вона збережена в історії.");
      refresh();
    } catch (reviewError) {
      setError(errorText(reviewError));
    } finally {
      setSaving(false);
    }
  };

  const resolveConflict = async (conflict: KnowledgeConflict, decision: KnowledgeConflictDecision) => {
    const note = conflictNotes[conflict.id]?.trim() ?? "";
    if (!note) {
      setError("Додайте пояснення до рішення щодо суперечності.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await resolveKnowledgeConflict(conflict.id, decision, note);
      setMessage("Рішення збережено новою версією та записано в аудит.");
      refresh();
    } catch (resolveError) {
      setError(errorText(resolveError));
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (entry: KnowledgeEntry) => {
    setHistoryEntry(entry);
    setHistory([]);
    setHistoryLoading(true);
    setError("");
    try {
      setHistory(await getKnowledgeHistory(entry.id));
    } catch (historyError) {
      setError(errorText(historyError));
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreVersion = async (entry: KnowledgeEntry, version: KnowledgeVersion) => {
    if (!window.confirm(`Створити нову версію на основі версії ${version.versionNo}? Попередня історія залишиться незмінною.`)) return;
    setSaving(true);
    setError("");
    try {
      await restoreKnowledgeVersion(entry.id, version.versionNo, `Куратор відновив версію ${version.versionNo}.`);
      setMessage(`Створено нову версію на основі версії ${version.versionNo}.`);
      await openHistory(entry);
      refresh();
    } catch (restoreError) {
      setError(errorText(restoreError));
    } finally {
      setSaving(false);
    }
  };

  const archiveEntry = async (entry: KnowledgeEntry) => {
    if (!window.confirm(`Архівувати «${entry.title}»? Запис залишиться в історії та не буде видалений.`)) return;
    setSaving(true);
    setError("");
    try {
      await archiveKnowledgeEntry(entry.id, "Архівовано куратором з Knowledge Center.");
      setMessage("Запис архівовано новою версією; історію не видалено.");
      refresh();
    } catch (archiveError) {
      setError(errorText(archiveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="busnet-knowledge">
      <header className="busnet-knowledge__header">
        <div>
          <span>BUSNET · KNOWLEDGE CENTER</span>
          <h4>Центр знань</h4>
          <p>Версійовані знання, джерела, перевірки та зв’язок із майбутнім Intelligence Engine</p>
        </div>
        <button type="button" className="busnet-knowledge__primary" onClick={beginCreate} disabled={saving}>
          <Plus size={16} />Додати знання
        </button>
      </header>

      <div className="busnet-knowledge__prototype-note" role="note">
        <strong>Серверне сховище підключене в коді · автоматичне навчання вимкнене</strong>
        <span>Неперевірені пропозиції не видаються як робочі правила. Підтвердження доступне лише Knowledge Curator; документи та worker-авторизація ще не підключені.</span>
      </div>

      {error && <p className="busnet-knowledge__error" role="alert">{error}</p>}
      {message && <p className="busnet-knowledge__success" role="status">{message}</p>}

      {legacyCount > 0 && (
        <div className="busnet-knowledge__legacy">
          <div>
            <strong>{legacyImportComplete ? "Локальна резервна копія збережена" : `Знайдено локальних записів: ${legacyCount}`}</strong>
            <span>{legacyImportComplete
              ? "Перенесення завершене; localStorage не очищався."
              : "Перенесуться лише створені користувачем записи. Демо-приклади не імпортуються."}</span>
          </div>
          {!legacyImportComplete && (
            <button type="button" onClick={() => void importLegacy()} disabled={saving}>
              Перенести як пропозиції
            </button>
          )}
        </div>
      )}

      <div className="busnet-knowledge__stats">
        <article><span>Записів</span><strong>{loading && !stats ? "—" : stats?.total ?? "—"}</strong></article>
        <article><span>Перевірено</span><strong>{stats?.verified ?? "—"}</strong></article>
        <article><span>На перевірці</span><strong>{proposals.filter((item) => item.status === "pending" || item.status === "needs_verification").length}</strong></article>
        <article><span>Відкриті суперечності</span><strong>{stats?.openConflicts ?? "—"}</strong></article>
      </div>

      {formMode && (
        <form className="busnet-knowledge__form" onSubmit={(event) => void saveDraft(event)}>
          <div className="busnet-knowledge__form-heading">
            <div>
              <h5>
                {formMode.kind === "create" ? "Нова пропозиція знання"
                  : formMode.kind === "update" ? "Запропонувати нову версію"
                    : "Повідомити про суперечність"}
              </h5>
              <p>Підтверджений запис не перезаписується: зміна створить окрему версію після review.</p>
            </div>
            <button type="button" aria-label="Закрити форму" onClick={() => setFormMode(null)}>
              <X size={17} />
            </button>
          </div>
          <div className="busnet-knowledge__form-grid">
            {formMode.kind === "conflict" && (
              <label className="is-wide">
                Суть суперечності
                <input
                  required
                  maxLength={1000}
                  value={draft.conflictSummary}
                  onChange={(event) => setDraft((current) => ({ ...current, conflictSummary: event.target.value }))}
                  placeholder="Наприклад, нове джерело суперечить перевіреній версії"
                />
              </label>
            )}
            <label>
              Назва
              <input
                required
                maxLength={200}
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Назва запису або нового факту"
              />
            </label>
            <label>
              Категорія
              <select
                value={draft.category}
                disabled={formMode.kind === "conflict"}
                onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as KnowledgeCategory }))}
              >
                {KNOWLEDGE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              Модуль
              <select
                value={draft.module}
                disabled={formMode.kind === "conflict"}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  module: event.target.value,
                  department: departmentForModule(event.target.value),
                }))}
              >
                {MODULES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                {!MODULES.some((item) => item.id === draft.module) && <option value={draft.module}>{draft.module}</option>}
              </select>
            </label>
            <label>
              Видимість
              <select
                value={draft.scope}
                disabled={formMode.kind !== "create"}
                onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value as KnowledgeScope }))}
              >
                {KNOWLEDGE_SCOPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              Джерело
              <select
                value={draft.sourceType}
                onChange={(event) => setDraft((current) => ({ ...current, sourceType: event.target.value as KnowledgeSourceType }))}
              >
                {KNOWLEDGE_SOURCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              Достовірність (0–1)
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={draft.confidence}
                onChange={(event) => setDraft((current) => ({ ...current, confidence: Number(event.target.value) }))}
              />
            </label>
            <label className="is-wide">
              Джерело / посилання
              <input
                required
                maxLength={2048}
                value={draft.sourceReference}
                onChange={(event) => setDraft((current) => ({ ...current, sourceReference: event.target.value }))}
                placeholder="URL, шлях документа, задача або пояснення адміністратора"
              />
            </label>
            <label>
              Версія джерела
              <input
                maxLength={200}
                value={draft.sourceRevision ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, sourceRevision: event.target.value || null }))}
                placeholder="Commit, версія документа тощо"
              />
            </label>
            <label>
              ID задачі (необов’язково)
              <input
                value={draft.sourceTaskId}
                onChange={(event) => setDraft((current) => ({ ...current, sourceTaskId: event.target.value }))}
                placeholder="UUID задачі"
              />
            </label>
            <label className="is-wide">
              Короткий опис
              <input
                maxLength={1000}
                value={draft.summary}
                onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
                placeholder="Короткий підсумок для пошуку"
              />
            </label>
            <label className="is-wide">
              Зміст
              <textarea
                required
                maxLength={20000}
                rows={4}
                value={draft.content}
                onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
                placeholder="Зафіксуйте факт, правило, рішення або нове джерело"
              />
            </label>
            <label className="is-wide">
              Доказ / уривок
              <textarea
                maxLength={10000}
                rows={3}
                value={draft.evidence}
                onChange={(event) => setDraft((current) => ({ ...current, evidence: event.target.value }))}
                placeholder="Цитата, перевірка або інший доказ"
              />
            </label>
          </div>
          {formError && <p className="busnet-knowledge__error" role="alert">{formError}</p>}
          <div className="busnet-knowledge__form-actions">
            <button type="button" onClick={() => setFormMode(null)}>Скасувати</button>
            <button type="submit" className="busnet-knowledge__primary" disabled={saving}>
              {saving ? "Збереження…" : formMode.kind === "conflict" ? "Зареєструвати суперечність" : "Надіслати на перевірку"}
            </button>
          </div>
        </form>
      )}

      <div className="busnet-knowledge__layout">
        <nav className="busnet-knowledge__categories" aria-label="Категорії знань">
          <button
            type="button"
            className={filters.category === "all" ? "is-active" : ""}
            onClick={() => setFilters((current) => ({ ...current, category: "all" }))}
          >
            <span>Усі записи</span><i>{stats?.total ?? "—"}</i>
          </button>
          {KNOWLEDGE_CATEGORIES.map((category) => (
            <button
              type="button"
              key={category.id}
              className={filters.category === category.id ? "is-active" : ""}
              onClick={() => setFilters((current) => ({ ...current, category: category.id }))}
            >
              <span>{category.label}</span>
              <i>{entries.filter((entry) => entry.category === category.id).length}</i>
            </button>
          ))}
        </nav>

        <div className="busnet-knowledge__main">
          <div className="busnet-knowledge__filters">
            <label>
              <Search size={16} aria-hidden="true" />
              <input
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="Пошук у перевірених та доступних записах"
                aria-label="Пошук у базі знань"
              />
            </label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as KnowledgeSearchFilters["status"] }))}
              aria-label="Фільтр за статусом"
            >
              <option value="all">Усі доступні статуси</option>
              {KNOWLEDGE_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
            </select>
          </div>
          <div className="busnet-knowledge__filters busnet-knowledge__filters--module">
            <select
              value={filters.module}
              onChange={(event) => setFilters((current) => ({ ...current, module: event.target.value }))}
              aria-label="Фільтр за модулем"
            >
              <option value="">Усі доступні модулі</option>
              {MODULES.map((module) => <option key={module.id} value={module.id}>{module.label}</option>)}
            </select>
            <select
              value={filters.scope}
              onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value as KnowledgeSearchFilters["scope"] }))}
              aria-label="Фільтр за областю доступу"
            >
              <option value="all">Усі області</option>
              {KNOWLEDGE_SCOPES.map((scope) => <option key={scope.id} value={scope.id}>{scope.label}</option>)}
            </select>
          </div>

          {filters.category === "document" && (
            <div className="busnet-knowledge__document-note">
              Метадані джерел зберігаються у версіях. Файли не завантажуються, доки не буде окремо налаштовано приватне Storage та його ACL.
            </div>
          )}

          {loading ? (
            <div className="busnet-knowledge__empty"><Clock3 size={24} /><strong>Завантаження Knowledge Center…</strong></div>
          ) : entries.length === 0 ? (
            <div className="busnet-knowledge__empty">
              <BookOpen size={25} />
              <strong>Доступних записів немає</strong>
              <span>Нові дані з’являться після перевірки пропозиції. Демо-записи не показуються як реальні знання.</span>
            </div>
          ) : (
            <div className="busnet-knowledge__entries">
              {entries.map((entry) => (
                <article className={`busnet-knowledge__entry is-${entry.status}`} key={entry.id}>
                  <div className="busnet-knowledge__entry-topline">
                    <span>{categoryLabel(entry.category)} · {scopeLabel(entry.scope)}</span>
                    <span className="busnet-knowledge__status">{statusLabel(entry.status)}</span>
                  </div>
                  <h5>{entry.title}</h5>
                  {entry.summary && <strong className="busnet-knowledge__summary">{entry.summary}</strong>}
                  <p>{entry.content}</p>
                  <div className="busnet-knowledge__entry-meta">
                    <span>{entry.module} · {entry.department}</span>
                    <span>Версія {entry.currentVersion}</span>
                    <span>Оновлено: {dateText(entry.updatedAt)}</span>
                    {entry.status === "verified" && (
                      <span>
                        Підтверджено {dateText(entry.verifiedAt)} · адмін {entry.verifiedBy} · версія {entry.verifiedVersion}
                      </span>
                    )}
                    {entry.sources.map((source, index) => (
                      <span key={`${entry.id}-source-${index}`}>
                        {sourceLabel(source.sourceType)}: {source.sourceReference}
                        {source.sourceRevision ? ` · ${source.sourceRevision}` : ""}
                      </span>
                    ))}
                  </div>
                  <div className="busnet-knowledge__entry-actions">
                    <button type="button" onClick={() => void openHistory(entry)} disabled={saving}>
                      <History size={14} />Версії
                    </button>
                    <button type="button" onClick={() => beginUpdate(entry)} disabled={saving || entry.status === "archived"}>
                      Запропонувати зміну
                    </button>
                    <button type="button" onClick={() => beginConflict(entry)} disabled={saving || entry.status === "archived"}>
                      <TriangleAlert size={14} />Суперечність
                    </button>
                    {isCurator && entry.status !== "archived" && (
                      <button type="button" className="is-danger" onClick={() => void archiveEntry(entry)} disabled={saving}>
                        <Archive size={14} />Архівувати
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="busnet-knowledge__queue">
        <div className="busnet-knowledge__section-heading">
          <div><span>REVIEW QUEUE</span><h5>Пропозиції на перевірку</h5></div>
          <span>{proposals.length}</span>
        </div>
        {proposals.length === 0 ? (
          <p className="busnet-knowledge__queue-empty">Немає очікуваних пропозицій.</p>
        ) : proposals.map((proposal) => (
          <article className="busnet-knowledge__proposal" key={proposal.id}>
            <div className="busnet-knowledge__entry-topline">
              <span>{categoryLabel(proposal.category)} · {proposal.module}</span>
              <span className="busnet-knowledge__status">{statusLabel(proposal.status)}</span>
            </div>
            <h6>{proposal.title}</h6>
            <p>{proposal.content}</p>
            <small>
              {sourceLabel(proposal.sourceType)} · {proposal.sourceReference} · достовірність {proposal.confidence}
              {proposal.baseVersion ? ` · на основі версії ${proposal.baseVersion}` : ""}
            </small>
            {proposal.status === "conflict" ? (
              <p className="busnet-knowledge__queue-warning">Є пов’язана відкрита суперечність; використайте блок рішень нижче.</p>
            ) : isCurator ? (
              <div className="busnet-knowledge__review-actions">
                <textarea
                  value={reviewNotes[proposal.id] ?? ""}
                  onChange={(event) => setReviewNotes((current) => ({ ...current, [proposal.id]: event.target.value }))}
                  placeholder="Примітка куратора (обов’язкова для відкладання/відхилення)"
                  rows={2}
                />
                <button type="button" onClick={() => void reviewProposal(proposal, "verify")} disabled={saving}>
                  <ShieldCheck size={14} />Перевірити й підтвердити
                </button>
                <button type="button" onClick={() => void reviewProposal(proposal, "defer")} disabled={saving || !(reviewNotes[proposal.id] ?? "").trim()}>
                  <Clock3 size={14} />Потребує перевірки
                </button>
                <button type="button" className="is-danger" onClick={() => void reviewProposal(proposal, "reject")} disabled={saving || !(reviewNotes[proposal.id] ?? "").trim()}>
                  <X size={14} />Відхилити
                </button>
              </div>
            ) : (
              <small>Рішення доступне лише Knowledge Curator.</small>
            )}
          </article>
        ))}
      </section>

      <section className="busnet-knowledge__conflicts">
        <div className="busnet-knowledge__section-heading">
          <div><span>CONFLICT REVIEW</span><h5>Суперечності</h5></div>
          <span>{conflicts.length}</span>
        </div>
        {conflicts.length === 0 ? (
          <p className="busnet-knowledge__queue-empty">Відкритих суперечностей немає.</p>
        ) : conflicts.map((conflict) => {
          const entry = entries.find((item) => item.id === conflict.entryId);
          return (
            <article className="busnet-knowledge__proposal is-conflict" key={conflict.id}>
              <div className="busnet-knowledge__entry-topline">
                <span>Запис: {entry?.title ?? conflict.entryId}</span>
                <span className="busnet-knowledge__status">Потребує рішення</span>
              </div>
              <h6>{conflict.summary}</h6>
              <p><strong>Нове джерело пропонує:</strong> {conflict.proposedTitle} — {conflict.proposedContent}</p>
              <small>{sourceLabel(conflict.sourceType)} · {conflict.sourceReference} · достовірність {conflict.confidence}</small>
              {isCurator ? (
                <div className="busnet-knowledge__review-actions">
                  <textarea
                    value={conflictNotes[conflict.id] ?? ""}
                    onChange={(event) => setConflictNotes((current) => ({ ...current, [conflict.id]: event.target.value }))}
                    placeholder="Підстава рішення та джерело перевірки"
                    rows={2}
                  />
                  <button type="button" onClick={() => void resolveConflict(conflict, "accept_reported")} disabled={saving || !(conflictNotes[conflict.id] ?? "").trim()}>
                    Прийняти нове джерело
                  </button>
                  <button type="button" onClick={() => void resolveConflict(conflict, "reaffirm_current")} disabled={saving || !(conflictNotes[conflict.id] ?? "").trim()}>
                    Підтвердити поточну версію
                  </button>
                  <button type="button" className="is-danger" onClick={() => void resolveConflict(conflict, "dismiss")} disabled={saving || !(conflictNotes[conflict.id] ?? "").trim()}>
                    Відхилити конфлікт
                  </button>
                </div>
              ) : (
                <small>Рішення доступне лише Knowledge Curator.</small>
              )}
            </article>
          );
        })}
      </section>

      <section className="busnet-knowledge__evolution">
        <div>
          <span>KNOWLEDGE EVOLUTION</span>
          <h5>Розвиток знань</h5>
          <p>Рахується з серверних записів; використання прив’язується до версії та майбутнього task ID.</p>
        </div>
        <div className="busnet-knowledge__evolution-counts">
          <span><strong>{stats?.openConflicts ?? "—"}</strong> конфліктів</span>
          <span><strong>{stats?.usageCount ?? "—"}</strong> використань</span>
          <span><strong>{stats?.needsVerification ?? "—"}</strong> очікують перевірки</span>
        </div>
      </section>

      {historyEntry && (
        <section className="busnet-knowledge__history">
          <div className="busnet-knowledge__section-heading">
            <div><span>IMMUTABLE VERSION HISTORY</span><h5>{historyEntry.title}</h5></div>
            <button type="button" onClick={() => setHistoryEntry(null)} aria-label="Закрити історію"><X size={16} /></button>
          </div>
          {historyLoading ? (
            <p>Завантаження історії…</p>
          ) : history.length === 0 ? (
            <p>Історія версій порожня або недоступна.</p>
          ) : history.map((version) => (
            <article className="busnet-knowledge__version" key={version.id}>
              <div>
                <strong>Версія {version.versionNo} · {statusLabel(version.status)}</strong>
                <small>{dateText(version.createdAt)} · автор дії {version.createdBy}</small>
                {version.status === "verified" && (
                  <small>Підтвердив {version.verifiedBy} · {dateText(version.verifiedAt)} · джерело: {version.verificationSource}</small>
                )}
              </div>
              <p>{version.changeNote}</p>
              <details>
                <summary>{version.title}</summary>
                <p>{version.content}</p>
                {version.sources.map((source, index) => (
                  <small key={`${version.id}-source-${index}`}>
                    {sourceLabel(source.sourceType)} · {source.sourceReference} · {source.evidence}
                  </small>
                ))}
              </details>
              {isCurator && version.versionNo !== historyEntry.currentVersion && (
                <button type="button" onClick={() => void restoreVersion(historyEntry, version)} disabled={saving}>
                  <Check size={14} />Відновити як нову версію
                </button>
              )}
            </article>
          ))}
        </section>
      )}

      <p className="busnet-knowledge__api-note">
        <FileText size={14} /> API для майбутнього Engine: пошук, пропозиції, конфлікти та фіксація використаної версії доступні як окремі RPC. Task ID зараз зберігається без FK — серверного Task Engine ще немає.
      </p>
    </section>
  );
}
