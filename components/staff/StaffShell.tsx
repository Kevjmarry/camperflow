"use client";

import { usePathname } from "next/navigation";
import StaffNav from "@/components/staff/StaffNav";
import MobileBottomNav from "@/components/staff/MobileBottomNav";

const AUTH_PATHS = ["/staff/login", "/staff/reset", "/staff/invite/accept"];

export default function StaffShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.some((p) => pathname?.endsWith(p));

  return (
    <div data-zone="staff" style={{ display: "contents" }}>
      {!isAuthPage && <StaffNav />}
      {children}
      {!isAuthPage && <MobileBottomNav />}
    </div>
  );
}
