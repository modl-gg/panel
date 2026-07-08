import { useEffect } from 'react';
import i18n from '@/lib/i18n';
import { useAuth } from '@/hooks/use-auth';
import { usePublicSettings } from '@/hooks/use-public-settings';
import { DEFAULT_LANGUAGE_CODE, isSupportedLanguage } from '@/lib/languages';

export function resolveLanguage(
  userLanguage: string | null | undefined,
  serverDefaultLanguage: string | null | undefined,
): string {
  return [userLanguage, serverDefaultLanguage, DEFAULT_LANGUAGE_CODE]
    .find((code) => isSupportedLanguage(code)) ?? DEFAULT_LANGUAGE_CODE;
}

export function useLanguagePreference() {
  const { user } = useAuth();
  const { data: publicSettings } = usePublicSettings();

  const userLanguage = user?.language;
  const serverDefaultLanguage = publicSettings?.defaultLanguage;

  useEffect(() => {
    const resolved = resolveLanguage(userLanguage, serverDefaultLanguage);
    if (resolved !== i18n.language) {
      i18n.changeLanguage(resolved);
    }
  }, [userLanguage, serverDefaultLanguage]);
}
