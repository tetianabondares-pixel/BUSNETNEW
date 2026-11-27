import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, Clock3, RefreshCw, Save, Search, Wrench } from "lucide-react";
import {
  getAssistantCapabilities,
  getCapabilityDisplayStatus,
  updateAssistantCapability,
  type AssistantCapability,
  type CapabilityDisplayStatus,
  type CapabilityLifecycleStatus,
  type CapabilityToolStatus,
} from "@/lib/assistantCapabilities";

type StatusFilter = "all" | CapabilityDisplayStatus;
type AdminRole = "super_admin" | "admin" | "content_manager" | "support" | "provider_operator";

const STATUS_LABELS: Record<CapabilityDisplayStatus, string> = {
  planned: "Запланировано",
  in_development: "В разработке",
  verified: "Тесты пройдены",
  operational: "Работает",
  retired: "Отключено",
  stale_evidence: "Доказательства устарели",
};

const MODULE_LABELS: Record<string, string> = {
  "operations.bookings": "Бронирования",
  "operations.passengers": "Пассажиры",
  "operations.routes": "Маршруты",
  "operations.carriers": "Перевозчики",
  analytics: "Аналитика",
  systems: "Системы",
};

function matchesSearch(capability: AssistantCapability, query: string): boolean {
  const searchText = [
    capability.key,
    capability.module,
    capability.title,
    capability.acceptanceCriteria,
    capability.toolId ?? "",
    capability.toolVersion ?? "",
    capability.tool?.handlerReference ?? "",
    capability.testRun?.testReference ?? "",
    ...capability.testRuns.map((run) => `${run.suiteName} ${run.testReference} ${run.commitSha}`),
    ...capability.operationalChecks.map((check) => check.executionReference),
  ].join(" ").toLocaleLowerCase();
  return searchText.includes(query.toLocaleLowerCase());
}

function CapabilityStatus({ status }: { status: CapabilityDisplayStatus }) {
  const Icon = status === "operational" || status === "verified" ? CheckCircle2
    : status === "stale_evidence" ? CircleAlert
      : status === "planned" ? Clock3 : Wrench;
  return (
    <span className={`busnet-capability__status is-${status}`}>
      <Icon size={13} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function AssistantCapabilitiesPanel({ role }: { role: AdminRole | "" }) {
  const [capabilities, setCapabilities] = useState<AssistantCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [mutationFeedback, setMutationFeedback] = useState<{ key: string; message: string; isError: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getAssistantCapabilities()
      .then((items) => {
        if (active) setCapabilities(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error
            ? loadError.message
            : "Не вдалося завантажити реєстр можливостей BUSNET.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const counts = useMemo(() => capabilities.reduce<Record<CapabilityDisplayStatus, number>>(
    (result, capability) => {
      result[getCapabilityDisplayStatus(capability)] += 1;
      return result;
    },
    { planned: 0, in_development: 0, verified: 0, operational: 0, retired: 0, stale_evidence: 0 },
  ), [capabilities]);

  const modules = useMemo(
    () => [...new Set(capabilities.map((capability) => capability.module))].sort(),
    [capabilities],
  );
  const visibleCapabilities = useMemo(() => capabilities.filter((capability) => (
    (moduleFilter === "all" || capability.module === moduleFilter) &&
    (statusFilter === "all" || getCapabilityDisplayStatus(capability) === statusFilter) &&
    matchesSearch(capability, query.trim())
  )), [capabilities, moduleFilter, query, statusFilter]);

  async function saveCapability(event: FormEvent<HTMLFormElement>, capability: AssistantCapability) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const status = formData.get("status");
    const toolStatus = formData.get("toolStatus");
    const clearTool = formData.get("clearTool") === "on";
    if (
      status !== "planned" &&
      status !== "in_development" &&
      status !== "verified" &&
      status !== "operational" &&
      status !== "retired"
    ) {
      setMutationFeedback({ key: capability.key, message: "Невідомий статус можливості.", isError: true });
      return;
    }
    if (toolStatus !== "" && toolStatus !== "candidate" && toolStatus !== "active" && toolStatus !== "retired") {
      setMutationFeedback({ key: capability.key, message: "Невідомий статус інструмента.", isError: true });
      return;
    }

    const field = (name: string) => {
      const value = formData.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    setSavingKey(capability.key);
    setMutationFeedback(null);
    try {
      await updateAssistantCapability({
        capabilityKey: capability.key,
        status: status as CapabilityLifecycleStatus,
        toolId: clearTool ? null : field("toolId"),
        toolVersion: clearTool ? null : field("toolVersion"),
        handlerReference: clearTool ? null : field("handlerReference"),
        testRunId: clearTool ? null : field("testRunId"),
        operationalCheckId: clearTool ? null : field("operationalCheckId"),
        toolStatus: (toolStatus || null) as CapabilityToolStatus | null,
        clearTool,
      });
      setMutationFeedback({ key: capability.key, message: "Зміни збережено в реєстрі та журналі аудиту.", isError: false });
      setRefreshKey((current) => current + 1);
    } catch (saveError: unknown) {
      setMutationFeedback({
        key: capability.key,
        message: saveError instanceof Error ? saveError.message : "Не вдалося зберегти зміни.",
        isError: true,
      });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="busnet-capability">
      <header className="busnet-capability__heading">
        <div>
          <span>BUSNET CAPABILITY ENGINE</span>
          <h4>Мої можливості</h4>
          <p>Реальна готовність визначається зв’язком із зареєстрованим інструментом і результатами тестів, а не Knowledge Center.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading}>
          <RefreshCw size={15} className={loading ? "is-spinning" : ""} />
          Оновити
        </button>
      </header>

      <div className="busnet-capability__stats" aria-label="Статус можливостей">
        <article><span>Працює</span><strong>{counts.operational}</strong></article>
        <article><span>Тести пройдені</span><strong>{counts.verified}</strong></article>
        <article><span>В розробці</span><strong>{counts.in_development}</strong></article>
        <article><span>У плані</span><strong>{counts.planned}</strong></article>
        {counts.stale_evidence > 0 && (
          <article className="is-warning"><span>Докази застаріли</span><strong>{counts.stale_evidence}</strong></article>
        )}
      </div>

      <div className="busnet-capability__notice" role="note">
        «Тести пройдені» вимагає свіжого успішного тесту для точної версії інструмента; «Працює» також вимагає перевірки реального виконання.
        Запис доступний лише через service role, але runner identity є заявленою міткою, а не доказом походження. CI та execution service ще не підключені.
      </div>

      <div className="busnet-capability__filters">
        <label>
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Пошук за назвою, інструментом або тестом"
            aria-label="Пошук можливостей"
          />
        </label>
        <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} aria-label="Фільтр за модулем">
          <option value="all">Усі модулі</option>
          {modules.map((module) => <option key={module} value={module}>{MODULE_LABELS[module] ?? module}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} aria-label="Фільтр за станом">
          <option value="all">Усі стани</option>
          {(Object.keys(STATUS_LABELS) as CapabilityDisplayStatus[]).map((status) => (
            <option key={status} value={status}>{STATUS_LABELS[status]}</option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="busnet-capability__empty is-error" role="alert">
          <CircleAlert size={20} />
          <strong>Реєстр можливостей недоступний</strong>
          <span>{error}</span>
          <span>Переконайтеся, що міграцію Capability Engine застосовано до цього середовища.</span>
        </div>
      ) : loading ? (
        <div className="busnet-capability__empty" role="status"><RefreshCw size={19} /><strong>Завантаження реєстру…</strong></div>
      ) : visibleCapabilities.length === 0 ? (
        <div className="busnet-capability__empty">
          <Wrench size={20} />
          <strong>{capabilities.length === 0 ? "Реєстр поки порожній" : "За цими фільтрами нічого не знайдено"}</strong>
          <span>{capabilities.length === 0
            ? "Перевірте, що міграцію та seed Capability Engine застосовано до цього середовища."
            : "Змініть пошуковий запит або фільтри."}</span>
        </div>
      ) : (
        <div className="busnet-capability__list">
          {visibleCapabilities.map((capability) => {
            const displayStatus = getCapabilityDisplayStatus(capability);
            return (
              <article className="busnet-capability__item" key={capability.key}>
                <div className="busnet-capability__item-heading">
                  <div>
                    <span>{MODULE_LABELS[capability.module] ?? capability.module} · {capability.key}</span>
                    <h5>{capability.title}</h5>
                  </div>
                  <CapabilityStatus status={displayStatus} />
                </div>
                <p>{capability.acceptanceCriteria}</p>
                {capability.tool ? (
                  <div className="busnet-capability__evidence">
                    <span><Wrench size={13} />{capability.tool.id} · v{capability.tool.version}</span>
                    <span>{capability.tool.handlerReference} · {capability.tool.status}</span>
                    {capability.testRun && (
                      <span>
                        Запуск тестів: {capability.testRun.result} · {capability.testRun.suiteName} · {capability.testRun.testReference}
                        {" · "}{capability.testRun.testsRun} тестів · {new Date(capability.testRun.completedAt).toLocaleString()}
                        {" · commit "}{capability.testRun.commitSha.slice(0, 8)}
                        {" · runner label "}{capability.testRun.runnerIdentity}
                      </span>
                    )}
                    {capability.operationalCheck && (
                      <span>
                        Перевірка виконання: {capability.operationalCheck.result} · {capability.operationalCheck.executionReference}
                        {" · "}{new Date(capability.operationalCheck.completedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="busnet-capability__evidence">
                    <span>Інструмент і довірені докази ще не зареєстровані.</span>
                  </div>
                )}
                {role === "super_admin" && (
                  <details className="busnet-capability__manage">
                    <summary>Керувати статусом і прив’язкою інструмента</summary>
                    <form onSubmit={(event) => void saveCapability(event, capability)}>
                      <label>
                        Статус можливості
                        <select name="status" defaultValue={capability.lifecycleStatus}>
                          <option value="planned">Заплановано</option>
                          <option value="in_development">В розробці</option>
                          <option value="verified">Тести пройдені</option>
                          <option value="operational">Працює</option>
                          <option value="retired">Вимкнено</option>
                        </select>
                      </label>
                      <label>
                        ID інструмента
                        <input name="toolId" defaultValue={capability.toolId ?? ""} placeholder="booking_search" />
                      </label>
                      <label>
                        Версія інструмента
                        <input name="toolVersion" defaultValue={capability.toolVersion ?? ""} placeholder="1.0.0" />
                      </label>
                      <label>
                        Посилання на handler у коді
                        <input name="handlerReference" defaultValue={capability.tool?.handlerReference ?? ""} placeholder="src/..." />
                      </label>
                      <label>
                        Зміна статусу інструмента (за замовчуванням — без змін)
                        <select name="toolStatus" defaultValue="">
                          <option value="">Не змінювати</option>
                          <option value="candidate">В розробці</option>
                          <option value="active">Активний (потрібен свіжий тест)</option>
                          <option value="retired">Вимкнений</option>
                        </select>
                      </label>
                      <label>
                        Довірений CI-запуск для цієї capability / версії
                        <select name="testRunId" defaultValue={capability.testRunId ?? ""}>
                          <option value="">Немає тестового доказу</option>
                          {capability.testRuns.map((run) => (
                            <option key={run.id} value={run.id}>
                              {run.result} · {run.suiteName} · {new Date(run.completedAt).toLocaleString()} · {run.commitSha.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="busnet-capability__unlink">
                        <input name="clearTool" type="checkbox" />
                        Явно відв’язати інструмент і доказові посилання (історію не видаляти)
                      </label>
                      <label>
                        Довірена перевірка реального виконання
                        <select name="operationalCheckId" defaultValue={capability.operationalCheckId ?? ""}>
                          <option value="">Немає перевірки виконання</option>
                          {capability.operationalChecks.map((check) => (
                            <option key={check.id} value={check.id}>
                              {check.result} · {check.executionReference} · {new Date(check.completedAt).toLocaleString()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p>
                        Докази створює тільки service-role runner після виконання тестів. У цьому локальному проекті CI та execution runner ще не підключені;
                        ручне введення посилань або дат не може підтвердити статуси «Тести пройдені» чи «Працює».
                      </p>
                      <button type="submit" disabled={savingKey !== null}>
                        <Save size={14} />
                        {savingKey === capability.key ? "Збереження…" : "Зберегти"}
                      </button>
                      {mutationFeedback?.key === capability.key && (
                        <span className={mutationFeedback.isError ? "is-error" : "is-success"} role={mutationFeedback.isError ? "alert" : "status"}>
                          {mutationFeedback.message}
                        </span>
                      )}
                    </form>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
      <p className="busnet-capability__footer">
        Показано {visibleCapabilities.length} із {capabilities.length} можливостей · нові напрямки додаються як плани, не як робочі функції.
      </p>
    </section>
  );
}
