"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

export default function GuestPage() {
  const t = useTranslations("guest");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  useEffect(() => {
    if (code) {
      // Hard navigation to ensure company theme applies correctly
      window.location.href = `/${locale}/guest/bookings/${code}`;
    }
  }, [code, locale]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h1 className="text-3xl font-bold text-center">{t("title")}</h1>
          <p className="mt-4 text-center text-gray-600">
            {t("invalidCode")}
          </p>
        </div>
      </div>
    </div>
  );
}
