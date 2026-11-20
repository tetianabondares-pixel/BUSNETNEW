import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  Camera,
  Clock3,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
  PhoneCall,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { BusnetLogo } from "@/components/BusnetLogo";
import { useTheme } from "@/theme";
import "./Footer.css";

const MOBILE_BREAKPOINT = "(max-width: 680px)";

const FOOTER_GROUPS = [
  {
    id: "routes",
    title: "footer.groups.routes",
    links: [
      { label: "footer.links.kyivWarsaw", href: "/#trip-search" },
      { label: "footer.links.lvivKrakow", href: "/#trip-search" },
      { label: "footer.links.schedule", href: "/#trip-search" },
      { label: "footer.links.partners", href: "/admin/login" },
    ],
  },
  {
    id: "help",
    title: "footer.groups.help",
    links: [
      { label: "footer.links.baggage", href: "/#faq" },
      { label: "footer.links.border", href: "/#faq" },
      { label: "footer.links.refunds", href: "/#faq" },
      { label: "footer.links.faq", href: "/#faq" },
    ],
  },
] as const;

export function Footer() {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_BREAKPOINT).matches,
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
    <footer className="site-footer" data-theme={resolved}>
      <div className="site-footer__content">
        <div className="site-footer__main">
          <div className="site-footer__brand">
            <Link aria-label={t("footer.homeLabel")} className="site-footer__logo-link" to="/">
              <BusnetLogo />
            </Link>
            <p className="site-footer__tagline">{t("footer.tagline")}</p>
            <div className="site-footer__socials" aria-label={t("footer.socialLabel")}>
              <a aria-label="Telegram" href="#trip-search"><Send size={17} /></a>
              <a aria-label="Viber" href="#faq"><MessageCircle size={17} /></a>
              <a aria-label="Instagram" href="#faq"><Camera size={17} /></a>
            </div>
          </div>

          <nav aria-label={t("footer.navigationLabel")} className="site-footer__navigation">
            {FOOTER_GROUPS.map((group) => {
              const isOpen = openGroup === group.id;
              const panelId = `footer-links-${group.id}`;
              return (
                <section className="site-footer__group" data-open={isOpen} key={group.id}>
                  <h2 className="site-footer__group-title site-footer__group-title--desktop">
                    {t(group.title)}
                  </h2>
                  <button
                    aria-controls={panelId}
                    aria-expanded={isOpen}
                    className="site-footer__group-toggle"
                    onClick={() => setOpenGroup((current) => current === group.id ? null : group.id)}
                    type="button"
                  >
                    <span>{t(group.title)}</span>
                    <ChevronDown aria-hidden="true" className="site-footer__chevron" size={18} />
                  </button>
                  <ul className="site-footer__links" hidden={isMobile && !isOpen} id={panelId}>
                    {group.links.map((link) => (
                      <li key={link.href + link.label}>
                        <a href={link.href}>{t(link.label)}</a>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </nav>

          <aside className="site-footer__support">
            <h2>{t("footer.support.title")}</h2>
            <p className="site-footer__online"><span /> {t("footer.support.online")}</p>
            <a className="site-footer__phone" href="mailto:support@busnet.ua">
              <Mail size={17} aria-hidden="true" />
              support@busnet.ua
            </a>
            <a className="site-footer__chat" href="/#faq">
              <PhoneCall size={17} aria-hidden="true" />
              {t("footer.support.chat")}
            </a>
            <p className="site-footer__hours"><Clock3 size={14} aria-hidden="true" /> {t("footer.support.hours")}</p>
          </aside>
        </div>

        <div className="site-footer__bottom">
          <p className="site-footer__copyright">{t("footer.rights", { year: new Date().getFullYear() })}</p>
          <nav className="site-footer__legal" aria-label={t("footer.legalLabel")}>
            <a href="/#faq">{t("footer.legal.offer")}</a>
            <a href="/#faq">{t("footer.legal.privacy")}</a>
            <a href="/#faq">{t("footer.legal.refunds")}</a>
          </nav>
          <p className="site-footer__payment">
            <ShieldCheck size={16} aria-hidden="true" />
            {t("footer.payment")}
          </p>
        </div>
      </div>
    </footer>
  );
}
