import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";

/**
 * Booking page stub.
 * Will host BookingStepper. No online payment integration.
 */
export function BookingPage() {
  const { t } = useTranslation();
  const { tokens } = useTheme();

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "3rem 1.5rem",
        minHeight: "50vh",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>
        {t("booking.title")}
      </h1>
      <p style={{ color: tokens.colorTextSecondary }}>
        {t("booking.placeholder")}
      </p>
    </section>
  );
}
