import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import FeedbackFunnel from "@/components/guest/FeedbackFunnel";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}

interface GuestBooking {
  company_id: string | null;
}

export default async function GuestFeedbackPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { code: codeRaw } = await searchParams;
  const code = decodeURIComponent(codeRaw || "").trim();
  const supabase = await createClient();
  const t = await getTranslations({ locale, namespace: "guestFeedback" });
  const tBooking = await getTranslations({ locale, namespace: "guestBooking" });

  if (!code) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "rgb(var(--muted))", fontSize: "14px" }}>{t("noCode")}</p>
      </div>
    );
  }

  const { data: booking } = await supabase
    .rpc("get_guest_booking_by_code", { p_code: code })
    .maybeSingle<GuestBooking>();

  if (!booking) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "rgb(var(--muted))", fontSize: "14px" }}>{t("notFound")}</p>
      </div>
    );
  }

  let googleReviewUrl: string | null = null;
  if (booking.company_id) {
    const { data } = await supabase
      .from("company_settings")
      .select("google_review_url")
      .eq("id", booking.company_id)
      .maybeSingle();
    googleReviewUrl = (data as any)?.google_review_url ?? null;
  }

  const messages = {
    positive:        t("positive"),
    negative:        t("negative"),
    positiveHeading: t("positiveHeading"),
    positiveBody:    t("positiveBody"),
    reviewCta:       t("reviewCta"),
    negativeHeading: t("negativeHeading"),
    negativeBody:    t("negativeBody"),
    placeholder:     t("placeholder"),
    submit:          t("submit"),
    submitting:      t("submitting"),
    doneHeading:     t("doneHeading"),
    doneBody:        t("doneBody"),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <style>{`
        .gfeedback-sp { padding: var(--space-5); }
        @media (min-width: 768px) { .gfeedback-sp { padding: var(--space-6); } }
      `}</style>

      <div>
        <Link
          href={`/${locale}/guest?code=${encodeURIComponent(code)}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            fontSize: "14px",
            fontWeight: "500",
            color: "rgb(var(--text-secondary))",
            textDecoration: "none",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {tBooking("back")}
        </Link>
      </div>

      <div className="surface page-surface" style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        <div className="surface gfeedback-sp" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <h1>{t("title")}</h1>
          <p style={{ color: "rgb(var(--muted))", fontSize: "15px", margin: 0 }}>{t("subtitle")}</p>
        </div>
        <div className="surface gfeedback-sp">
          <FeedbackFunnel
            bookingCode={code}
            googleReviewUrl={googleReviewUrl}
            messages={messages}
          />
        </div>
      </div>
    </div>
  );
}
