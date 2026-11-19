import React from "react";
import { Star, MapPin, CreditCard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";

export function TrustStats() {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const iconColor = isDark ? "#38BDF8" : "#087DFF";
  const titleColor = isDark ? "#FFFFFF" : "#172033";
  const descColor = isDark ? "#8B9AAF" : "#66758A";
  const dividerColor = isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(16, 24, 40, 0.08)";

  const items = [
    {
      icon: <Star size={17} color={iconColor} strokeWidth={2} />,
      val: t("stats.ratingVal"),
      label: t("stats.ratingLabel"),
    },
    {
      icon: <MapPin size={17} color={iconColor} strokeWidth={2} />,
      val: t("stats.citiesVal"),
      label: t("stats.citiesLabel"),
    },
    {
      icon: <CreditCard size={17} color={iconColor} strokeWidth={2} />,
      val: t("stats.paymentVal"),
      label: t("stats.paymentLabel"),
    },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "1.25rem",
        padding: "0.25rem 0",
        marginTop: "1.25rem",
      }}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.val}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {item.icon}
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: titleColor,
                  letterSpacing: "-0.01em",
                }}
              >
                {item.val}
              </span>
              <span
                style={{
                  fontSize: "0.68rem",
                  color: descColor,
                  fontWeight: 400,
                  marginTop: "1px",
                }}
              >
                {item.label}
              </span>
            </div>
          </div>

          {/* Divider between stats */}
          {index < items.length - 1 && (
            <div
              style={{
                width: "1px",
                height: "24px",
                background: dividerColor,
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
