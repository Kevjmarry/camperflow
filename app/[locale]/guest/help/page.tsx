import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}

const sections = [
  {
    title: "Using water",
    body: "Fill the fresh water tank before departure — the filler point is usually on the exterior. Use the onboard pump (switch near the sink) to get water flowing. Only drink from the tank if it has been confirmed safe; otherwise use bottled water. Empty the grey waste tank at designated service points before returning the vehicle.",
  },
  {
    title: "Toilet basics",
    body: "Add the recommended chemical dose before first use (amount varies by product — check the label). Use toilet paper marked as cassette-safe or biodegradable. Empty the cassette at a designated chemical disposal point, not in a standard drain. Rinse with clean water after emptying and re-add chemical before replacing.",
  },
  {
    title: "Electricity & hookup",
    body: "Electrical setup varies by vehicle. Some run solely on a leisure battery (charged while driving); others support 230V shore power (EHU) via a campsite bollard; some include an inverter for running mains appliances from the battery. Check during handover which systems your vehicle has. High-draw appliances like kettles or hair dryers will drain a leisure battery quickly — use them on hookup where possible.",
  },
  {
    title: "Gas / cooking safety",
    body: "Gas rules depend on your vehicle's setup — some have automatic crash shut-off valves, others require manual isolation. Check with the rental company whether gas should be turned off at the bottle while driving. If you smell gas: stop using burners, open windows and doors, avoid operating electrical switches, and leave the vehicle. Some vehicles have a gas detector fitted — do not obstruct or disable it.",
  },
  {
    title: "Heating / hot water",
    body: "Heating and hot water systems vary widely — your vehicle may use LPG gas, diesel (e.g. Webasto or Eberspächer), electric hookup, or a combination. Ask during handover how to operate yours. Hot water may come from a dedicated boiler, via the engine coolant circuit, or from a combi system. Allow time for the system to heat up, and check the relevant switch or thermostat if hot water is slow.",
  },
  {
    title: "Fridge basics",
    body: "Turn the fridge on several hours before loading it — cooling from warm takes time. On the road the fridge typically runs from the vehicle alternator (12V); on a campsite switch to 230V hookup for efficiency. Keep the fridge level where possible. Do not overfill: air needs to circulate. Check the manual for the correct gas/electric mode if your fridge has a 3-way setting.",
  },
  {
    title: "Before driving off",
    body: "Before moving off, complete these checks: retract and lock the step; close and secure all roof vents, windows, and skylights; stow loose items and secure cupboard latches; check that the TV aerial is lowered; disconnect EHU cable and stow it; check that the handbrake is released. Walk around the vehicle and check all storage compartments are locked.",
  },
  {
    title: "While driving / height awareness",
    body: "Know your vehicle's height — it is usually marked on the cab sun visor. Low bridges, car parks, and drive-throughs are the most common hazards. Take wide corners slowly: the rear overhang swings outward on tight turns. Be aware that the vehicle is heavier and longer than a car — braking distances are greater. Avoid sudden lane changes and allow extra space in traffic.",
  },
];

export default async function GuestHelpPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { code: codeRaw } = await searchParams;
  const code = decodeURIComponent(codeRaw || "").trim();
  const tBooking = await getTranslations("guestBooking");

  if (!code) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{tBooking("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{tBooking("contactUs")}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
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
        className="surface"
        style={{
          padding: "var(--space-6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        <div>
          <h1 style={{ marginBottom: "var(--space-2)" }}>Vehicle Guide</h1>
          <p style={{ fontSize: "14px", color: "rgb(var(--text-secondary))", margin: 0 }}>
            General guidance for using your campervan or motorhome. Exact features and controls
            vary between vehicles — always refer to any handover notes provided by the rental
            company for specifics.
          </p>
        </div>
        <span
          style={{
            background: "rgb(var(--brand-light))",
            color: "rgb(var(--brand))",
            padding: "var(--space-2) var(--space-4)",
            borderRadius: "var(--radius-xl)",
            fontSize: "14px",
            fontWeight: "500",
            flexShrink: 0,
          }}
        >
          {tBooking("guestAccess")}
        </span>
      </div>

      {/* Warning banner */}
      <div
        style={{
          padding: "var(--space-4) var(--space-5)",
          borderRadius: "var(--radius)",
          background: "rgb(var(--warning) / 0.1)",
          border: "1px solid rgb(var(--warning) / 0.3)",
          display: "flex",
          gap: "var(--space-3)",
          alignItems: "flex-start",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--warning))" strokeWidth="2" style={{ flexShrink: 0, marginTop: "1px" }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01" />
        </svg>
        <p style={{ fontSize: "14px", lineHeight: "1.5", color: "rgb(var(--text-secondary))", margin: 0 }}>
          <strong style={{ color: "rgb(var(--text))" }}>Always follow the instructions given during handover.</strong>{" "}
          This guide is general and may not match your exact vehicle. When in doubt, contact the rental company.
        </p>
      </div>

      {/* Accordion sections */}
      <div className="surface" style={{ padding: "var(--space-6)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {sections.map((section, i) => (
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
                {section.title}
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
                <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--text-secondary))", margin: 0 }}>
                  {section.body}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
