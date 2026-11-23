import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";
import "./PassengerAuth.css";

type AuthView = "login" | "register" | "recovery" | "reset";
type FieldName = "fullName" | "email" | "password" | "confirmPassword";

const passwordRules = [
  { key: "passwordMinLength", test: (password: string) => password.length >= 8 },
  { key: "passwordLowercase", test: (password: string) => /[a-z]/.test(password) },
  { key: "passwordUppercase", test: (password: string) => /[A-Z]/.test(password) },
  { key: "passwordNumber", test: (password: string) => /\d/.test(password) },
] as const;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function PassengerAuthPage() {
  const { t, i18n } = useTranslation();
  const { tokens } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [showRecovery, setShowRecovery] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setShowRecovery(false);
        setShowReset(true);
        setErrors({});
        setNotice("");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let stored: {
      email?: string;
      fullName?: string;
      phone?: string;
    } | null = null;
    try {
      stored = JSON.parse(localStorage.getItem("busnet_pending_claim") ?? "null");
    } catch {
      stored = null;
    }
    const pending = location.state as {
      pendingBooking?: { bookingId: string; claimToken: string };
      pendingPassenger?: { email?: string; fullName?: string; phone?: string };
    } | null;
    const passenger = pending?.pendingPassenger ?? stored;
    if (passenger?.email) setEmail(passenger.email);
    if (passenger?.fullName) setFullName(passenger.fullName);
    if (passenger?.phone) setPhone(passenger.phone);
  }, [location.state]);

  const isRegister = location.pathname === "/register";
  const isRecovery = showRecovery;
  const isReset = showReset;
  const title = isReset
    ? t("passengerAuth.resetTitle")
    : isRecovery
      ? t("passengerAuth.recoveryTitle")
      : isRegister
        ? t("passengerAuth.registerTitle")
        : t("passengerAuth.loginTitle");
  const subtitle = isReset
    ? t("passengerAuth.resetSubtitle")
    : isRecovery
      ? t("passengerAuth.recoverySubtitle")
      : isRegister
        ? t("passengerAuth.registerSubtitle")
        : t("passengerAuth.loginSubtitle");

  const claimPendingBooking = async () => {
    const pendingState = location.state as {
      pendingBooking?: { bookingId: string; claimToken: string };
    } | null;
    let pending = pendingState?.pendingBooking;
    if (!pending) {
      try {
        pending = JSON.parse(localStorage.getItem("busnet_pending_claim") ?? "null");
      } catch {
        pending = undefined;
      }
    }
    if (!pending?.bookingId || !pending.claimToken) return false;
    const { data, error } = await supabase.rpc("claim_guest_booking", {
      p_booking_id: pending.bookingId,
      p_claim_token: pending.claimToken,
    });
    if (error || data !== true) throw new Error("CLAIM_FAILED");
    localStorage.removeItem("busnet_pending_claim");
    return true;
  };

  const validate = () => {
    const nextErrors: Partial<Record<FieldName, string>> = {};
    if (isRegister && fullName.trim().length < 2) {
      nextErrors.fullName = t(
        fullName.trim() ? "passengerAuth.nameTooShort" : "passengerAuth.required",
      );
    }
    if (!isReset && !email.trim()) {
      nextErrors.email = t("passengerAuth.required");
    } else if (!isReset && !isValidEmail(email.trim())) {
      nextErrors.email = t("passengerAuth.invalidEmail");
    }
    if (!isRecovery && !password) {
      nextErrors.password = t("passengerAuth.required");
    } else if ((isRegister || isReset) && passwordRules.some((rule) => !rule.test(password))) {
      nextErrors.password = t("passengerAuth.passwordWeak");
    }
    if ((isRegister || isReset) && !confirmPassword) {
      nextErrors.confirmPassword = t("passengerAuth.required");
    } else if ((isRegister || isReset) && password !== confirmPassword) {
      nextErrors.confirmPassword = t("passengerAuth.passwordMismatch");
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      if (isReset) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        navigate("/account", { replace: true });
        return;
      }

      if (isRecovery) {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/login` },
        );
        if (error) throw error;
        setNotice(t("passengerAuth.recoverySent"));
        return;
      }

      if (isRegister) {
        const nameParts = fullName.trim().split(/\s+/);
        const firstName = nameParts.shift() ?? "";
        const lastName = nameParts.join(" ");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            data: {
              full_name: fullName.trim(),
              phone: phone.trim() || null,
              firstName,
              lastName,
              role: "passenger",
              preferred_locale: i18n.language?.startsWith("it")
                ? "it"
                : i18n.language?.startsWith("en")
                  ? "en"
                  : "uk",
              preferred_language: i18n.language?.startsWith("it")
                ? "it"
                : i18n.language?.startsWith("en")
                  ? "en"
                  : "uk",
            },
          },
        });
        if (error) throw error;

        if (data.session) {
          try {
            await claimPendingBooking();
          } catch {
            setNotice(t("passengerAuth.claimFailed"));
          }
          navigate(getPostAuthPath(), { replace: true, state: getPostAuthState() });
        } else {
          setNotice(t("passengerAuth.registrationSent"));
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      try {
        await claimPendingBooking();
      } catch {
        setNotice(t("passengerAuth.claimFailed"));
      }
      navigate(getPostAuthPath(), { replace: true, state: getPostAuthState() });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("passengerAuth.serverError");

      if (/invalid login credentials|invalid email or password/i.test(message)) {
        setNotice(t("passengerAuth.invalidCredentials"));
      } else if (/email not confirmed/i.test(message)) {
        setNotice(t("passengerAuth.emailNotConfirmed"));
      } else if (/fetch|network/i.test(message)) {
        setNotice(t("passengerAuth.networkError"));
      } else {
        setNotice(t("passengerAuth.serverError"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPostAuthPath = () => {
    const state = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
    const destination = state?.from;
    if (!destination?.pathname || ["/auth", "/login", "/register"].includes(destination.pathname)) {
      return "/account";
    }
    return `${destination.pathname}${destination.search ?? ""}${destination.hash ?? ""}`;
  };

  const getPostAuthState = () => {
    const state = location.state as { pendingTrip?: unknown } | null;
    return state?.pendingTrip ? { pendingTrip: state.pendingTrip } : undefined;
  };

  const changeView = (nextView: AuthView) => {
    setShowRecovery(nextView === "recovery");
    setShowReset(nextView === "reset");
    setErrors({});
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  const inputStyle = {
    background: tokens.colorBgInput,
    borderColor: tokens.colorBorder,
    color: tokens.colorText,
  };

  const renderError = (field: FieldName) =>
    errors[field] ? (
      <span className="passenger-auth__field-error" id={`${field}-error`}>
        {errors[field]}
      </span>
    ) : null;

  return (
    <section className="passenger-auth">
      <div className="passenger-auth__container">
        <h1 className="passenger-auth__title" style={{ color: tokens.colorText }}>
          {title}
        </h1>
        <p
          className="passenger-auth__subtitle"
          style={{ color: tokens.colorTextSecondary }}
        >
          {subtitle}
        </p>

        <div
          className="passenger-auth__card"
          style={{
            background: tokens.colorBgCard,
            borderColor: tokens.colorBorder,
            boxShadow: tokens.shadowCard,
          }}
        >
          <form className="passenger-auth__form" onSubmit={handleSubmit} noValidate>
            {isRegister && (
              <div className="passenger-auth__field">
                <label htmlFor="fullName">{t("passengerAuth.fullName")}</label>
                <input
                  autoComplete="name"
                  id="fullName"
                  name="fullName"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  aria-invalid={Boolean(errors.fullName)}
                  aria-describedby={errors.fullName ? "fullName-error" : undefined}
                  style={inputStyle}
                />
                {renderError("fullName")}
              </div>
            )}

            {isRegister && (
              <div className="passenger-auth__field">
                <label htmlFor="phone">{t("passengerAuth.phone")}</label>
                <input
                  autoComplete="tel"
                  id="phone"
                  maxLength={32}
                  name="phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {!isReset && (
              <div className="passenger-auth__field">
                <label htmlFor="email">{t("passengerAuth.email")}</label>
                <input
                  autoComplete="email"
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  style={inputStyle}
                />
                {renderError("email")}
              </div>
            )}

            {!isRecovery && (
              <div className="passenger-auth__field">
                <label htmlFor="password">
                  {isReset ? t("passengerAuth.newPassword") : t("passengerAuth.password")}
                </label>
                <div className="passenger-auth__password-input">
                  <input
                    autoComplete={isRegister || isReset ? "new-password" : "current-password"}
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={
                      [
                        errors.password ? "password-error" : null,
                        isRegister || isReset ? "password-requirements" : null,
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    style={inputStyle}
                  />
                  <button
                    aria-label={t(
                      showPassword
                        ? "passengerAuth.hidePassword"
                        : "passengerAuth.showPassword",
                    )}
                    className="passenger-auth__visibility"
                    onClick={() => setShowPassword((visible) => !visible)}
                    type="button"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {renderError("password")}

                {(isRegister || isReset) && (
                  <div
                    className="passenger-auth__requirements"
                    id="password-requirements"
                  >
                    <p>{t("passengerAuth.passwordRequirementsTitle")}</p>
                    <ul aria-live="polite">
                      {passwordRules.map((rule) => (
                        <li
                          key={rule.key}
                          className={
                            rule.test(password)
                              ? "passenger-auth__requirement--met"
                              : undefined
                          }
                        >
                          {t(`passengerAuth.${rule.key}`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {(isRegister || isReset) && (
              <div className="passenger-auth__field">
                <label htmlFor="confirmPassword">
                  {t("passengerAuth.confirmPassword")}
                </label>
                <div className="passenger-auth__password-input">
                  <input
                    autoComplete="new-password"
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    aria-invalid={Boolean(errors.confirmPassword)}
                    aria-describedby={
                      errors.confirmPassword ? "confirmPassword-error" : undefined
                    }
                    style={inputStyle}
                  />
                  <button
                    aria-label={t(
                      showConfirmPassword
                        ? "passengerAuth.hidePassword"
                        : "passengerAuth.showPassword",
                    )}
                    className="passenger-auth__visibility"
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    type="button"
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
                {renderError("confirmPassword")}
              </div>
            )}

            {notice && (
              <p
                className="passenger-auth__notice"
                role="alert"
                style={{
                  background: tokens.colorBgSecondary,
                  borderColor: tokens.colorBorderSubtle,
                  color: tokens.colorWarning,
                }}
              >
                {notice}
              </p>
            )}

            <button
              className="passenger-auth__submit"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? t("passengerAuth.loading")
                : t(
                    isReset
                      ? "passengerAuth.resetAction"
                      : isRecovery
                        ? "passengerAuth.recoveryAction"
                        : isRegister
                          ? "passengerAuth.registerAction"
                          : "passengerAuth.loginAction",
                  )}
            </button>
          </form>

          {!isRegister && !isRecovery && !isReset && (
            <button
              className="passenger-auth__text-link"
              onClick={() => changeView("recovery")}
              type="button"
            >
              {t("passengerAuth.forgotPassword")}
            </button>
          )}

          {isRecovery || isReset ? (
            <button
              className="passenger-auth__text-link"
              onClick={() => changeView("login")}
              type="button"
            >
              {t("passengerAuth.backToLogin")}
            </button>
          ) : isRegister ? (
            <p className="passenger-auth__switch" style={{ color: tokens.colorTextSecondary }}>
              {t("passengerAuth.loginPrompt")}{" "}
              <Link to="/login" state={location.state} onClick={() => changeView("login")}>
                {t("passengerAuth.loginLink")}
              </Link>
            </p>
          ) : (
            <p className="passenger-auth__switch" style={{ color: tokens.colorTextSecondary }}>
              {t("passengerAuth.registerPrompt")}{" "}
              <Link to="/register" state={location.state} onClick={() => changeView("register")}>
                {t("passengerAuth.registerLink")}
              </Link>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
