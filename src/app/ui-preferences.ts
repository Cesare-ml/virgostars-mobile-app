/** Device-only presentation choices. Never add chart or account data here. */
export type UiTheme = 'light' | 'dark';
export type UiLocale = 'it' | 'en';
export type UiPreferences = Readonly<{theme: UiTheme; locale: UiLocale}>;
export interface UiPreferencesStorage {getItem(key: string): string | null; setItem(key: string, value: string): void;}
export const UI_PREFERENCES_KEY = 'virgostars.mobile.ui-preferences.v1';
export const DEFAULT_UI_PREFERENCES: UiPreferences = Object.freeze({theme:'light', locale:'en'});
export function deviceLocale(language:unknown = typeof navigator === 'undefined' ? '' : navigator.language):UiLocale {
  return typeof language === 'string' && /^it(?:[-_]|$)/i.test(language) ? 'it' : 'en';
}
export function defaultUiPreferences():UiPreferences {return {theme:'light',locale:deviceLocale()};}

export function loadUiPreferences(storage: UiPreferencesStorage | null): UiPreferences {
  try {
    const raw = storage?.getItem(UI_PREFERENCES_KEY);
    if (!raw || raw.length > 512) return defaultUiPreferences();
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return defaultUiPreferences();
    const value = data as Record<string, unknown>;
    if (value['version'] !== 1) return defaultUiPreferences();
    return {theme: value['theme'] === 'dark' ? 'dark' : 'light', locale: value['locale'] === 'it' ? 'it' : value['locale'] === 'en' ? 'en' : deviceLocale()};
  } catch { return defaultUiPreferences(); }
}

export function saveUiPreferences(storage: UiPreferencesStorage | null, preferences: UiPreferences): boolean {
  try {
    if (!storage || !preferences) return false;
    const theme = preferences.theme, locale = preferences.locale;
    if ((theme !== 'dark' && theme !== 'light') || (locale !== 'it' && locale !== 'en')) return false;
    storage.setItem(UI_PREFERENCES_KEY, JSON.stringify({version:1, theme, locale}));
    return true;
  } catch { return false; }
}
