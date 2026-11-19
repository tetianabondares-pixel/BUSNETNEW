import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import { BusnetLogo } from "@/components/BusnetLogo";
import "./Footer.css";

const FOOTER_GROUPS = [
  {
    id: "passengers",
    title: "footer.groups.passengers",
    links: [
      { label: "footer.links.findTrip", href: "/#trip-search" },
      { label: "footer.links.howItWorks", href: "/#how-it-works" },
    ],
  },
  {
    id: "help",
    title: "footer.groups.help",
    links: [{ label: "footer.links.faq", href: "/#faq" }],
  },
] as const;

const MOBILE_BREAKPOINT = "(max-width: 680px)";

export function Footer() {
  const { t } = useTranslation();
  const { tokens, resolved } = useTheme();
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(MOBILE_BREAKPOINT).matches,
  );
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT);
    const updateViewport = () => setIsMobile(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  return (
    <footer
      className="site-footer"
      data-theme={resolved}
      style={{
        backgroundColor: tokens.colorBgDeep,
        borderColor: tokens.colorBorderSubtle,
        color: tokens.colorText,
      }}
    >
      <div className="site-footer__content">
        <div className="site-footer__main">
          <div className="site-footer__brand">
            <Link
              aria-label={t("footer.homeLabel")}
              className="site-footer__logo-link"
              to="/"
            >
              <BusnetLogo />
            </Link>
          </div>

          <nav
            aria-label={t("footer.navigationLabel")}
            className="site-footer__navigation"
          >
            {FOOTER_GROUPS.filter((group) => group.links.length > 0).map(
              (group) => {
                const isOpen = openGroup === group.id;
                const panelId = `footer-links-${group.id}`;

                return (
                  <section
                    className="site-footer__group"
                    data-open={isOpen}
                    key={group.id}
                  >
                    <h2 className="site-footer__group-title site-footer__group-title--desktop">
                      {t(group.title)}
                    </h2>
                    <button
                      aria-controls={panelId}
                      aria-expanded={isOpen}
                      className="site-footer__group-toggle"
                      onClick={() =>
                        setOpenGroup((current) =>
                          current === group.id ? null : group.id,
                        )
                      }
                      type="button"
                    >
                      <span>{t(group.title)}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className="site-footer__chevron"
                        size={18}
                      />
                    </button>
                    <ul
                      className="site-footer__links"
                      hidden={isMobile && !isOpen}
                      id={panelId}
                    >
                      {group.links.map((link) => (
                        <li key={link.href}>
                          <a href={link.href}>{t(link.label)}</a>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              },
            )}
          </nav>
        </div>

        <p className="site-footer__copyright">
          {t("footer.rights", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
