import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}

interface GuestBooking {
  company_id: string | null;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface CompanyFaqInfo {
  faq_items: FaqItem[] | null;
}

export default async function GuestFaqPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { code: codeRaw } = await searchParams;
  const code = decodeURIComponent(codeRaw || "").trim();
  const supabase = await createClient();
  const tBooking = await getTranslations("guestBooking");
  const t = await getTranslations("guestFaq");

  if (!code) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{tBooking("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{tBooking("contactUs")}</p>
      </div>
    );
  }

  const { data: booking, error: bookingError } = await supabase
    .rpc("get_guest_booking_by_code", { p_code: code })
    .maybeSingle<GuestBooking>();

  if (bookingError || !booking) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{tBooking("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{tBooking("contactUs")}</p>
      </div>
    );
  }

  let faqItems: FaqItem[] = [];
  if (booking.company_id) {
    const { data } = await supabase
      .from("company_settings")
      .select("faq_items")
      .eq("id", booking.company_id)
      .maybeSingle<CompanyFaqInfo>();
    if (data?.faq_items) faqItems = data.faq_items;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <style>{`
        .gfaq-sp { padding: var(--space-4); }
        @media (min-width: 768px) { .gfaq-sp { padding: var(--space-6); } }
      `}</style>
      {/* Back link */}
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

      {/* Title bar */}
      <div
        className="surface gfaq-sp"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        <h1>{t("title")}</h1>
        <span
          style={{
            background: "rgb(var(--brand-light))",
            color: "rgb(var(--brand))",
            padding: "var(--space-2) var(--space-4)",
            borderRadius: "var(--radius-xl)",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          {tBooking("guestAccess")}
        </span>
      </div>

      {/* FAQ list */}
      <div className="surface gfaq-sp">
        {faqItems.length === 0 ? (
          <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
            {t("empty")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {faqItems.map((item, i) => (
              <details
                key={i}
                style={{
                  border: "1px solid rgb(var(--border-light))",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                }}
              >
                <summary
                  style={{
                    padding: "var(--space-4) var(--space-5)",
                    cursor: "pointer",
                    fontSize: "15px",
                    fontWeight: "500",
                    color: "rgb(var(--text))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    userSelect: "none",
                    listStyle: "none",
                    background: "rgb(var(--app-bg))",
                  }}
                >
                  {item.question}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.45 }}>
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div
                  style={{
                    padding: "var(--space-4) var(--space-5)",
                    borderTop: "1px solid rgb(var(--border-light))",
                  }}
                >
                  <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--text-secondary))", whiteSpace: "pre-wrap", margin: 0 }}>
                    {item.answer}
                  </p>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
