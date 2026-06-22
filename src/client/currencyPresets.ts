// Common currency + number-format pairings for the onboarding and Settings
// dropdowns, so a user picks a familiar option instead of typing a raw BCP-47
// locale code. "Other" (handled in the UI) falls back to manual entry.
export interface CurrencyPreset {
  label: string;
  currency: string; // ISO 4217
  locale: string; // BCP 47
}

export const CURRENCY_PRESETS: CurrencyPreset[] = [
  { label: 'Euro — Netherlands (€ 1.234,56)', currency: 'EUR', locale: 'nl-NL' },
  { label: 'Euro — Germany (1.234,56 €)', currency: 'EUR', locale: 'de-DE' },
  { label: 'Euro — France (1 234,56 €)', currency: 'EUR', locale: 'fr-FR' },
  { label: 'Euro — Ireland (€1,234.56)', currency: 'EUR', locale: 'en-IE' },
  { label: 'US Dollar ($1,234.56)', currency: 'USD', locale: 'en-US' },
  { label: 'British Pound (£1,234.56)', currency: 'GBP', locale: 'en-GB' },
  { label: 'Swiss Franc (CHF 1’234.56)', currency: 'CHF', locale: 'de-CH' },
  { label: 'Swedish Krona (1 234,56 kr)', currency: 'SEK', locale: 'sv-SE' },
  { label: 'Canadian Dollar ($1,234.56)', currency: 'CAD', locale: 'en-CA' },
  { label: 'Australian Dollar ($1,234.56)', currency: 'AUD', locale: 'en-AU' },
];

export const presetKey = (currency: string, locale: string) => `${currency}|${locale}`;

export const isPreset = (currency: string, locale: string) =>
  CURRENCY_PRESETS.some((p) => presetKey(p.currency, p.locale) === presetKey(currency, locale));
