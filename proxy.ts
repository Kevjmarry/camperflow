import { createServerClient } from "@supabase/ssr";
import { NextResponse, NextRequest } from "next/server";

const SUPPORTED_LOCALES = ["en", "de"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(value: string | undefined | null): value is SupportedLocale {
  return value === "en" || value === "de";
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1) Locale from URL (wins)
  const firstSegment = pathname.split("/")[1] || "";
  const localeFromPath = isSupportedLocale(firstSegment) ? firstSegment : null;

  // 2) Locale from cookie (fallback)
  const cookieLocaleRaw = request.cookies.get("NEXT_LOCALE")?.value ?? null;
  const cookieLocale = isSupportedLocale(cookieLocaleRaw) ? cookieLocaleRaw : null;

  // 3) Active locale
  const activeLocale: SupportedLocale = localeFromPath ?? cookieLocale ?? "en";

  // 4) Force next-intl locale header from activeLocale
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-next-intl-locale", activeLocale);

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // 5) If URL has /en or /de, sync cookie to match
  if (localeFromPath && cookieLocale !== localeFromPath) {
    response.cookies.set("NEXT_LOCALE", localeFromPath, { path: "/" });
  }

  // 6) Base path for auth checks (strip leading /{locale})
  let basePath = pathname;
  if (localeFromPath) {
    basePath = pathname.slice(localeFromPath.length + 1); // remove "/en" or "/de"
    if (!basePath.startsWith("/")) basePath = "/" + basePath;
    if (basePath === "") basePath = "/";
  }

  // Supabase server client in middleware context
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isStaff = false;
  if (user) {
    const { data: staffProfile } = await supabase
      .from("staff_profiles")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    isStaff =
      staffProfile !== null &&
      (staffProfile.role === "staff" || staffProfile.role === "admin");
  }

  // Staff login page logic (locale-safe)
  if (basePath === "/staff/login") {
    if (user && isStaff) {
      return NextResponse.redirect(new URL(`/${activeLocale}/staff`, request.url));
    }
    return response;
  }

  // Protect all staff routes except login
  const isStaffRoute = basePath === "/staff" || basePath.startsWith("/staff/");
  if (isStaffRoute) {
    if (!user || !isStaff) {
      return NextResponse.redirect(new URL(`/${activeLocale}/`, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
