import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import "./FinalCta.css";

export function FinalCta() {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const navigate = useNavigate();

  const focusSearch = () => {
    navigate("/");
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      window.setTimeout(() => {
        document.querySelector<HTMLInputElement>("#search-from")?.focus();
      }, 350);
    }, 20);
  };

  return (
    <section className="final-cta" data-theme={resolved} aria-labelledby="final-cta-title">
      <div className="final-cta__glow final-cta__glow--one" aria-hidden="true" />
      <div className="final-cta__glow final-cta__glow--two" aria-hidden="true" />
      <div className="final-cta__inner">
        <div className="final-cta__copy">
          <h2 id="final-cta-title">{t("finalCta.title")}</h2>
          <p>{t("finalCta.subtitle")}</p>
          <ul className="final-cta__benefits" aria-label={t("finalCta.benefitsLabel")}>
            <li><Check size={15} aria-hidden="true" /> {t("finalCta.routes")}</li>
            <li><Check size={15} aria-hidden="true" /> {t("finalCta.cancellation")}</li>
            <li><Check size={15} aria-hidden="true" /> {t("finalCta.support")}</li>
          </ul>
        </div>
        <button className="final-cta__button" type="button" onClick={focusSearch}>
          <Search size={19} aria-hidden="true" />
          <span>{t("finalCta.action")}</span>
          <ArrowRight className="final-cta__arrow" size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
