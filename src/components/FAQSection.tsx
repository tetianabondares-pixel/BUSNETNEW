import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import "./FAQSection.css";

const FAQ_ITEMS = ["search", "notFound", "chooseTrip", "booking"] as const;

export function FAQSection() {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const [openItem, setOpenItem] = useState<number | null>(0);

  return (
    <section
      aria-labelledby="faq-title"
      className="faq-section"
      data-theme={resolved}
      id="faq"
    >
      <div className="faq-section__content">
        <div className="faq-section__intro">
          <h2 className="faq-section__title" id="faq-title">
            {t("faq.title")}
          </h2>
          <p className="faq-section__subtitle">{t("faq.subtitle")}</p>
        </div>

        <div className="faq-section__list">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openItem === index;
            const buttonId = `faq-question-${item}`;
            const panelId = `faq-answer-${item}`;

            return (
              <article
                className="faq-section__item"
                data-open={isOpen}
                key={item}
              >
                <h3 className="faq-section__question-heading">
                  <button
                    aria-controls={panelId}
                    aria-expanded={isOpen}
                    className="faq-section__question"
                    id={buttonId}
                    onClick={() =>
                      setOpenItem((current) =>
                        current === index ? null : index,
                      )
                    }
                    type="button"
                  >
                    <span>{t(`faq.items.${item}.question`)}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className="faq-section__chevron"
                      size={20}
                    />
                  </button>
                </h3>
                <div
                  aria-hidden={!isOpen}
                  aria-labelledby={buttonId}
                  className="faq-section__panel"
                  data-open={isOpen}
                  id={panelId}
                  inert={!isOpen}
                  role="region"
                >
                  <div className="faq-section__panel-inner">
                    <p>{t(`faq.items.${item}.answer`)}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
