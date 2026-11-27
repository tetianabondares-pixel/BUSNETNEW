import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import "./GlobalDeleteExperience.css";

type DeletePhase = "idle" | "confirming" | "deleting" | "success" | "error";

export type DeleteExperienceRequest = {
  objectName: string;
  objectType: string;
  consequence: string;
  execute: () => Promise<void>;
};

type DeleteExperienceContextValue = {
  requestDelete: (request: DeleteExperienceRequest) => void;
};

const DeleteExperienceContext = createContext<DeleteExperienceContextValue | null>(null);

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DeleteExperienceProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [request, setRequest] = useState<DeleteExperienceRequest | null>(null);
  const [phase, setPhase] = useState<DeletePhase>("idle");
  const [failure, setFailure] = useState("");
  const activeRequestRef = useRef<DeleteExperienceRequest | null>(null);
  const executionRef = useRef(false);
  const phaseRef = useRef(phase);
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  phaseRef.current = phase;

  const requestDelete = useCallback((nextRequest: DeleteExperienceRequest) => {
    if (activeRequestRef.current) return;
    activeRequestRef.current = nextRequest;
    openerRef.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setFailure("");
    setRequest(nextRequest);
    setPhase("confirming");
  }, []);

  const closeExperience = useCallback(() => {
    if (phaseRef.current === "deleting") return;
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    activeRequestRef.current = null;
    executionRef.current = false;
    setRequest(null);
    setPhase("idle");
    setFailure("");
    const opener = openerRef.current;
    openerRef.current = null;
    window.requestAnimationFrame(() => opener?.focus());
  }, []);

  useEffect(() => {
    if (!request) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => cancelButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (phaseRef.current === "confirming" || phaseRef.current === "error")) {
        event.preventDefault();
        closeExperience();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled)",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [request, closeExperience]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const executeDelete = async () => {
    const currentRequest = activeRequestRef.current;
    if (
      executionRef.current ||
      !currentRequest ||
      (phaseRef.current !== "confirming" && phaseRef.current !== "error")
    ) return;
    executionRef.current = true;
    setFailure("");
    setPhase("deleting");
    const startedAt = Date.now();
    try {
      await currentRequest.execute();
      const animationDuration = prefersReducedMotion() ? 400 : 2600;
      const remaining = Math.max(0, animationDuration - (Date.now() - startedAt));
      if (remaining > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
      setPhase("success");
      closeTimerRef.current = window.setTimeout(closeExperience, prefersReducedMotion() ? 450 : 750);
    } catch (error) {
      executionRef.current = false;
      setFailure(errorMessage(error, t("admin.deleteExperience.errorFallback")));
      setPhase("error");
    }
  };

  const particles = Array.from({ length: 16 }, (_, index) => ({
    id: index,
    left: `${8 + ((index * 37) % 84)}%`,
    top: `${10 + ((index * 53) % 76)}%`,
    delay: `${(index % 8) * -0.37}s`,
  }));
  const title = phase === "success"
    ? t("admin.deleteExperience.successTitle")
    : phase === "deleting"
      ? t("admin.deleteExperience.deletingTitle")
      : phase === "error"
        ? t("admin.deleteExperience.errorTitle")
        : t("admin.deleteExperience.confirmTitle");

  return (
    <DeleteExperienceContext value={{ requestDelete }}>
      {children}
      {request && (
        <div className={`global-delete-experience is-${phase}`}>
          <div
            ref={dialogRef}
            className="global-delete-experience__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="global-delete-title"
            aria-describedby="global-delete-description"
          >
            <div className="global-delete-experience__scene" aria-hidden="true">
              <div className="global-delete-experience__stars">
                {particles.map((particle) => (
                  <span
                    className="global-delete-experience__particle"
                    key={particle.id}
                    style={{
                      left: particle.left,
                      top: particle.top,
                      animationDelay: particle.delay,
                    }}
                  />
                ))}
              </div>
              <div className="global-delete-experience__ring global-delete-experience__ring--outer" />
              <div className="global-delete-experience__ring global-delete-experience__ring--inner" />
              <div className="global-delete-experience__target">
                <span>{request.objectType}</span>
                <strong>{request.objectName}</strong>
              </div>
              <img
                className="global-delete-experience__bin"
                src="/images/busnet-trash-bin-icon.png"
                alt=""
              />
              <div className="global-delete-experience__success-wave" />
            </div>

            <section className="global-delete-experience__content">
              <div className={`global-delete-experience__status is-${phase}`} aria-live="polite">
                {phase === "success" ? (
                  <span className="global-delete-experience__success-mark" aria-hidden="true">✓</span>
                ) : (
                  <span className="global-delete-experience__status-dot" aria-hidden="true" />
                )}
                <span>
                  {phase === "success"
                    ? t("admin.deleteExperience.successStatus")
                    : `BUSNET · ${request.objectType}`}
                </span>
              </div>
              <h2 id="global-delete-title">{title}</h2>
              <p className="global-delete-experience__object-name">{request.objectName}</p>
              <p id="global-delete-description" className="global-delete-experience__description">
                {phase === "error"
                  ? failure
                  : phase === "success"
                    ? t("admin.deleteExperience.successDescription")
                    : phase === "deleting"
                      ? t("admin.deleteExperience.deletingDescription")
                      : request.consequence}
              </p>

              <div className="global-delete-experience__actions">
                {phase === "confirming" && (
                  <>
                    <button
                      type="button"
                      className="global-delete-experience__cancel"
                      onClick={closeExperience}
                      ref={cancelButtonRef}
                    >
                      {t("admin.deleteExperience.cancel")}
                    </button>
                    <button
                      type="button"
                      className="global-delete-experience__confirm"
                      onClick={() => void executeDelete()}
                    >
                      {t("admin.deleteExperience.delete")}
                    </button>
                  </>
                )}
                {phase === "deleting" && (
                  <button type="button" className="global-delete-experience__confirm" disabled>
                    <span className="global-delete-experience__spinner" aria-hidden="true" />
                    {t("admin.deleteExperience.deleting")}
                  </button>
                )}
                {phase === "success" && (
                  <p className="global-delete-experience__success-text">
                    {t("admin.deleteExperience.successTitle")}
                  </p>
                )}
                {phase === "error" && (
                  <>
                    <button
                      type="button"
                      className="global-delete-experience__cancel"
                      onClick={closeExperience}
                      ref={cancelButtonRef}
                    >
                      {t("admin.deleteExperience.close")}
                    </button>
                    <button
                      type="button"
                      className="global-delete-experience__confirm"
                      onClick={() => void executeDelete()}
                    >
                      {t("admin.deleteExperience.retry")}
                    </button>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </DeleteExperienceContext>
  );
}

export function useDeleteExperience(): DeleteExperienceContextValue {
  const context = useContext(DeleteExperienceContext);
  if (!context) {
    throw new Error("useDeleteExperience must be used inside DeleteExperienceProvider.");
  }
  return context;
}
