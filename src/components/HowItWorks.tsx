import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, Route, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./HowItWorks.css";

interface HowItWorksProps {
  isDark: boolean;
}

const steps = [
  {
    title: "howItWorks.steps.0.title",
    description: "howItWorks.steps.0.description",
    Icon: Search,
  },
  {
    title: "howItWorks.steps.1.title",
    description: "howItWorks.steps.1.description",
    Icon: Route,
  },
  {
    title: "howItWorks.steps.2.title",
    description: "howItWorks.steps.2.description",
    Icon: ClipboardCheck,
  },
] as const;

export function HowItWorks({ isDark }: HowItWorksProps) {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(section);

    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-labelledby="how-it-works-title"
      className="how-it-works"
      data-theme={isDark ? "dark" : "light"}
      data-visible={isVisible}
      id="how-it-works"
      ref={sectionRef}
    >
      <div className="how-it-works__content">
        <h2 className="how-it-works__title" id="how-it-works-title">
          {t("howItWorks.title")}
        </h2>
        <p className="how-it-works__subtitle">{t("howItWorks.subtitle")}</p>

        <ol className="how-it-works__steps">
          {steps.map(({ title, description, Icon }, index) => (
            <li className="how-it-works__step" key={title}>
              <span aria-hidden="true" className="how-it-works__number">
                {index + 1}
              </span>
              <Icon
                aria-hidden="true"
                className="how-it-works__icon"
                size={21}
                strokeWidth={1.8}
              />
              <h3 className="how-it-works__step-title">{t(title)}</h3>
              <p className="how-it-works__description">{t(description)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
