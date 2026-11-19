import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import "./PassengerAuth.css";

type AuthView = "login" | "register" | "recovery";
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
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const location = useLocation();

  const [showRecovery, setShowRecovery] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = location.pathname === "/register";
  const isRecovery = showRecovery;
  const title = isRecovery
    ? t("passengerAuth.recoveryTitle")
    : isRegister
      ? t("passengerAuth.registerTitle")
      : t("passengerAuth.loginTitle");
  const subtitle = isRecovery
    ? t("passengerAuth.recoverySubtitle")
    : isRegister
      ? t("passengerAuth.registerSubtitle")
      : t("passengerAuth.loginSubtitle");

  const validate = () => {
    const nextErrors: Partial<Record<FieldName, string>> = {};
    if (isRegister && fullName.trim().length < 2) {
      nextErrors.fullName = t(
        fullName.trim() ? "passengerAuth.nameTooShort" : "passengerAuth.required",
      );
    }
    if (!email.trim()) {
      nextErrors.email = t("passengerAuth.required");
    } else if (!isValidEmail(email.trim())) {
      nextErrors.email = t("passengerAuth.invalidEmail");
    }
    if (!isRecovery && !password) {
      nextErrors.password = t("passengerAuth.required");
    } else if (isRegister && passwordRules.some((rule) => !rule.test(password))) {
      nextErrors.password = t("passengerAuth.passwordWeak");
    }
    if (isRegister && !confirmPassword) {
      nextErrors.confirmPassword = t("passengerAuth.required");
    } else if (isRegister && password !== confirmPassword) {
      nextErrors.confirmPassword = t("passengerAuth.passwordMismatch");
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    if (!validate()) return;

    // The new project has no configured Auth backend; never simulate success.
    setNotice(t("passengerAuth.authUnavailable"));
  };

  const changeView = (nextView: AuthView) => {
    setShowRecovery(nextView === "recovery");
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
          <p
            className="passenger-auth__backend-status"
            role="status"
            aria-label={t("passengerAuth.authStatusLabel")}
            style={{
              background: tokens.colorBgSecondary,
              borderColor: tokens.colorBorderSubtle,
              color: tokens.colorWarning,
            }}
          >
            {t("passengerAuth.authUnavailable")}
          </p>

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

            {!isRecovery && (
              <div className="passenger-auth__field">
                <label htmlFor="password">{t("passengerAuth.password")}</label>
                <div className="passenger-auth__password-input">
                  <input
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={
                      [
                        errors.password ? "password-error" : null,
                        isRegister ? "password-requirements" : null,
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

                {isRegister && (
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

            {isRegister && (
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
                    isRecovery
                      ? "passengerAuth.recoveryAction"
                      : isRegister
                        ? "passengerAuth.registerAction"
                        : "passengerAuth.loginAction",
                  )}
            </button>
          </form>

          {!isRegister && !isRecovery && (
            <button
              className="passenger-auth__text-link"
              onClick={() => changeView("recovery")}
              type="button"
            >
              {t("passengerAuth.forgotPassword")}
            </button>
          )}

          {isRecovery ? (
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
              <Link to="/login" onClick={() => changeView("login")}>
                {t("passengerAuth.loginLink")}
              </Link>
            </p>
          ) : (
            <p className="passenger-auth__switch" style={{ color: tokens.colorTextSecondary }}>
              {t("passengerAuth.registerPrompt")}{" "}
              <Link to="/register" onClick={() => changeView("register")}>
                {t("passengerAuth.registerLink")}
              </Link>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
