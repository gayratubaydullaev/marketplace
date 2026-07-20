import { defaultLocale, locales, type Locale } from "@gayrat/i18n";
import { getRequestConfig } from "next-intl/server";

async function loadMessages(locale: string) {
  try {
    return (await import(`../../../../packages/i18n/src/messages/${locale}.json`)).default;
  } catch {
    try {
      return (await import(`../../../../packages/i18n/src/messages/en.json`)).default;
    } catch {
      return (await import(`../../../../packages/i18n/src/messages/uz.json`)).default;
    }
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !(locales as readonly string[]).includes(locale)) {
    locale = defaultLocale;
  }
  return {
    locale,
    messages: await loadMessages(locale),
  };
});

export type { Locale };
