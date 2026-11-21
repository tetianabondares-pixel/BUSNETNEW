import { useEffect, useRef, useState } from "react";
import { CalendarDays, Wifi } from "lucide-react";
import { useTranslation } from "react-i18next";
import { contentRecord, contentString, usePublicContent } from "@/lib/public-content";
import "./HowItWorks.css";

interface HowItWorksProps { isDark: boolean; }

const steps = [
  { title: "howItWorks.steps.0.title", description: "howItWorks.steps.0.description" },
  { title: "howItWorks.steps.1.title", description: "howItWorks.steps.1.description" },
  { title: "howItWorks.steps.2.title", description: "howItWorks.steps.2.description" },
] as const;

export function HowItWorks({ isDark }: HowItWorksProps) {
  const { t } = useTranslation();
  const content = usePublicContent("howItWorks");
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const renderVisual = (index: number) => {
    if (index === 0) {
      return (
        <div className="how-it-works__visual how-it-works__visual--route" aria-hidden="true">
          <div className="how-it-works__route-chip">
            <span>{t("howItWorks.visual.routeFrom")}</span><span className="how-it-works__route-arrow">→</span><span>{t("howItWorks.visual.routeTo")}</span>
          </div>
          <div className="how-it-works__date-chip"><CalendarDays size={12} /> {t("howItWorks.visual.date")}</div>
        </div>
      );
    }
    if (index === 1) {
      return (
        <div className="how-it-works__visual how-it-works__visual--trip" aria-hidden="true">
          <div><strong>08:30</strong><span>Alfa Bus</span></div>
          <div className="how-it-works__wifi"><Wifi size={12} /> Wi-Fi</div>
          <strong>₴1 240</strong>
        </div>
      );
    }
    return (
      <div className="how-it-works__visual how-it-works__visual--ticket" aria-hidden="true">
        <div className="how-it-works__qr"><span /><span /><span /><span /></div>
        <div><strong>BUSNET</strong><span>{t("howItWorks.visual.payment")}</span></div>
      </div>
    );
  };

  return (
    <section aria-labelledby="how-it-works-title" className="how-it-works"
      data-theme={isDark ? "dark" : "light"} data-visible={isVisible}
      id="how-it-works" ref={sectionRef}>
      <div className="how-it-works__content">
        <h2 className="how-it-works__title" id="how-it-works-title">{contentString(content, "title", t("howItWorks.title"))}</h2>
        <p className="how-it-works__subtitle">{contentString(content, "subtitle", t("howItWorks.subtitle"))}</p>
        <ol className="how-it-works__steps">
          {steps.map(({ title, description }, index) => {
            const stepContent = Array.isArray(content?.steps)
              ? contentRecord(content.steps[index])
              : null;
            return (
            <li className="how-it-works__step" key={title}>
              <span className="how-it-works__marker" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {renderVisual(index)}
              <h3 className="how-it-works__step-title">{contentString(stepContent, "title", t(title))}</h3>
              <p className="how-it-works__description">{contentString(stepContent, "description", t(description))}</p>
            </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
