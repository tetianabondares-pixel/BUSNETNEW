import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";
import "../auth/PassengerAuth.css";

type AuthMode = "login" | "recovery" | "recovery-sent" | "reset";
type LoginField = "email" | "password" | "confirmPassword";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function AdminLoginPage() {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<LoginField, string>>>({});
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    return () => subscription.unsubscribe();
  }, []);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrors({});
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");

    const nextErrors: Partial<Record<LoginField, string>> = {};
    if (mode !== "reset") {
      if (!email.trim()) nextErrors.email = t("passengerAuth.required");
      else if (!isValidEmail(email.trim())) nextErrors.email = t("passengerAuth.invalidEmail");
    }
    if (mode === "login" || mode === "reset") {
      if (!password) nextErrors.password = t("passengerAuth.required");
      else if (mode === "reset" && password.length < 8) {
        nextErrors.password = t("passengerAuth.passwordWeak");
      }
    }
    if (mode === "reset") {
      if (!confirmPassword) nextErrors.confirmPassword = t("passengerAuth.required");
      else if (password !== confirmPassword) {
        nextErrors.confirmPassword = t("passengerAuth.passwordMismatch");
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      if (mode === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/admin/login`,
        });
        if (error) throw error;
        setMode("recovery-sent");
        setNotice(t("admin.recoverySent"));
        return;
      }

      if (mode === "reset") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        navigate("/admin");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      navigate("/admin");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
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

  const title = mode === "reset"
    ? t("admin.resetTitle")
    : mode === "recovery" || mode === "recovery-sent"
      ? t("admin.recoveryTitle")
      : t("admin.login");
  const subtitle = mode === "reset"
    ? t("admin.resetSubtitle")
    : mode === "recovery" || mode === "recovery-sent"
      ? t("admin.recoverySubtitle")
      : t("admin.loginSubtitle");
  const inputStyle = {
    background: tokens.colorBgInput,
    borderColor: tokens.colorBorder,
    color: tokens.colorText,
  };

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
          {mode === "recovery-sent" ? (
            <>
              <p
                className="passenger-auth__notice"
                role="status"
                style={{
                  background: tokens.colorBgSecondary,
                  borderColor: tokens.colorBorderSubtle,
                  color: tokens.colorTextSecondary,
                }}
              >
                {notice}
              </p>
              <button
                className="passenger-auth__text-link"
                onClick={() => changeMode("login")}
                type="button"
              >
                {t("admin.backToLogin")}
              </button>
            </>
          ) : (
            <>
              <form className="passenger-auth__form" onSubmit={handleSubmit} noValidate>
                {mode !== "reset" && (
                  <div className="passenger-auth__field">
                    <label htmlFor="admin-email">{t("passengerAuth.email")}</label>
                    <input
                      autoComplete="username"
                      id="admin-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? "admin-email-error" : undefined}
                      style={inputStyle}
                    />
                    {errors.email && (
                      <span className="passenger-auth__field-error" id="admin-email-error">
                        {errors.email}
                      </span>
                    )}
                  </div>
                )}

                {(mode === "login" || mode === "reset") && (
                  <div className="passenger-auth__field">
                    <label htmlFor="admin-password">
                      {mode === "reset" ? t("admin.newPassword") : t("passengerAuth.password")}
                    </label>
                    <div className="passenger-auth__password-input">
                      <input
                        autoComplete={mode === "reset" ? "new-password" : "current-password"}
                        id="admin-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby={errors.password ? "admin-password-error" : undefined}
                        style={inputStyle}
                      />
                      <button
                        aria-label={t(
                          showPassword ? "passengerAuth.hidePassword" : "passengerAuth.showPassword",
                        )}
                        className="passenger-auth__visibility"
                        onClick={() => setShowPassword((visible) => !visible)}
                        type="button"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.password && (
                      <span className="passenger-auth__field-error" id="admin-password-error">
                        {errors.password}
                      </span>
                    )}
                  </div>
                )}

                {mode === "reset" && (
                  <div className="passenger-auth__field">
                    <label htmlFor="admin-confirm-password">
                      {t("passengerAuth.confirmPassword")}
                    </label>
                    <div className="passenger-auth__password-input">
                      <input
                        autoComplete="new-password"
                        id="admin-confirm-password"
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        aria-invalid={Boolean(errors.confirmPassword)}
                        aria-describedby={
                          errors.confirmPassword ? "admin-confirm-password-error" : undefined
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
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <span
                        className="passenger-auth__field-error"
                        id="admin-confirm-password-error"
                      >
                        {errors.confirmPassword}
                      </span>
                    )}
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
                    ? t("admin.loginLoading")
                    : mode === "login"
                      ? t("admin.loginAction")
                      : mode === "recovery"
                        ? t("admin.recoveryAction")
                        : t("admin.resetAction")}
                </button>
              </form>

              {mode === "login" && (
                <button
                  className="passenger-auth__text-link"
                  onClick={() => changeMode("recovery")}
                  type="button"
                >
                  {t("admin.forgotPassword")}
                </button>
              )}
              {mode === "recovery" && (
                <button
                  className="passenger-auth__text-link"
                  onClick={() => changeMode("login")}
                  type="button"
                >
                  {t("admin.backToLogin")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
