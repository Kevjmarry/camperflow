"use client";

import { useEffect } from "react";
import { usePathname, useParams, useRouter } from "next/navigation";
import StaffNav from "@/components/staff/StaffNav";
import StaffMobileHeader from "@/components/staff/StaffMobileHeader";
import MobileBottomNav from "@/components/staff/MobileBottomNav";
import { useTheme } from "@/contexts/ThemeContext";

const AUTH_PATHS = ["/staff/login", "/staff/reset", "/staff/invite/accept"];

// Pages reachable without core_operations_access
const CORE_EXEMPT_SEGMENTS = ["/staff/addons", "/staff/company"];

export default function StaffShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const { company, loading } = useTheme();

  const isAuthPage = AUTH_PATHS.some((p) => pathname?.endsWith(p));

  useEffect(() => {
    if (loading) return;
    if (company?.core_operations_access !== false) return;
    if (isAuthPage) return;

    const isExempt = CORE_EXEMPT_SEGMENTS.some(
      (seg) => pathname?.endsWith(seg) || pathname?.includes(seg + "/")
    );
    if (!isExempt) {
      router.replace(`/${locale}/staff/addons`);
    }
  }, [loading, company?.core_operations_access, pathname, isAuthPage, locale, router]);

  return (
    <div data-zone="staff" style={{ display: "contents" }}>
      {!isAuthPage && <StaffMobileHeader />}
      {!isAuthPage && <StaffNav />}
      {children}
      {!isAuthPage && <MobileBottomNav />}
    </div>
  );
}
