export interface SupportedLanguage {
  code: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en', nativeName: 'English' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'es', nativeName: 'Español' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'hi', nativeName: 'हिन्दी' },
  { code: 'it', nativeName: 'Italiano' },
  { code: 'ja', nativeName: '日本語' },
  { code: 'nl', nativeName: 'Nederlands' },
  { code: 'pt', nativeName: 'Português' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'zh', nativeName: '中文' },
] as const satisfies readonly SupportedLanguage[];

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE_CODE: SupportedLanguageCode = 'en';

export function isSupportedLanguage(code: string | null | undefined): code is SupportedLanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code);
}
