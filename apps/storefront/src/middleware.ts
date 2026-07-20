import { defaultLocale, routingLocales } from "@gayrat/i18n";
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = routingLocales.some(
    (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
  );
  if (hasLocale) {
    const locale = pathname.split("/")[1];
    const res = NextResponse.next();
    if (locale === "ar" || locale === "he" || locale === "fa") {
      res.headers.set("x-locale-dir", "rtl");
    }
    return res;
  }
  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|.*\\..*).*)"],
};
