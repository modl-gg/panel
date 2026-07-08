import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { SupportedLanguageCode } from '@/lib/languages';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import hi from '@/locales/hi.json';
import it from '@/locales/it.json';
import ja from '@/locales/ja.json';
import nl from '@/locales/nl.json';
import pt from '@/locales/pt.json';
import ru from '@/locales/ru.json';
import zh from '@/locales/zh.json';

const translations: Record<SupportedLanguageCode, Record<string, unknown>> = {
  en,
  de,
  es,
  fr,
  hi,
  it,
  ja,
  nl,
  pt,
  ru,
  zh,
};

const resources = Object.fromEntries(
  Object.entries(translations).map(([code, translation]) => [code, { translation }]),
);

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
