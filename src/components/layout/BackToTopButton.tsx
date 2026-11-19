import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import "./BackToTopButton.css";

const VISIBILITY_THRESHOLD = 320;

export function BackToTopButton() {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      setIsVisible(window.scrollY > VISIBILITY_THRESHOLD);
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  if (!isVisible) return null;

  const scrollToTop = () => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <button
      aria-label={t("backToTop.label")}
      className="back-to-top"
      data-theme={resolved}
      onClick={scrollToTop}
      type="button"
    >
      <ArrowUp aria-hidden="true" size={21} strokeWidth={2.2} />
    </button>
  );
}
