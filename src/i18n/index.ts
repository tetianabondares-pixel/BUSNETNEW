import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import uk from "./locales/uk.json";
import en from "./locales/en.json";
import it from "./locales/it.json";

i18n.use(initReactI18next).init({
  resources: {
    uk: { translation: uk },
    en: { translation: en },
    it: { translation: it },
  },
  lng: "uk",
  fallbackLng: "uk",
  interpolation: { escapeValue: false },
});

export default i18n;
