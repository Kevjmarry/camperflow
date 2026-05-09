"use client";

function isNetworkError(error: Error): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = error.message?.toLowerCase() ?? "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed")
  );
}

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (isNetworkError(error)) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "rgb(var(--app-bg))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-4)",
        }}
      >
        <div
          className="surface page-surface"
          style={{ maxWidth: 420, width: "100%", textAlign: "center" }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgb(var(--brand-light))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto var(--space-6)",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgb(var(--brand-2))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          </div>

          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "rgb(var(--text))",
              margin: "0 0 var(--space-2)",
            }}
          >
            You&apos;re offline
          </h2>

          <p
            style={{
              fontSize: 14,
              color: "rgb(var(--muted))",
              margin: "0 auto var(--space-6)",
              maxWidth: 300,
              lineHeight: 1.6,
            }}
          >
            This page isn&apos;t available without an internet connection.
          </p>

          <button onClick={reset} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "var(--space-8)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          backgroundColor: "rgb(var(--error) / 0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "var(--space-5)",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgb(var(--error))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "rgb(var(--text))",
          margin: 0,
          marginBottom: "var(--space-2)",
        }}
      >
        Something went wrong
      </h2>

      <p
        style={{
          fontSize: 14,
          color: "rgb(var(--text-secondary))",
          margin: 0,
          marginBottom: "var(--space-6)",
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        An unexpected error occurred. Please try again.
      </p>

      <button
        onClick={reset}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "var(--space-2) var(--space-5)",
          backgroundColor: "rgb(var(--brand))",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius)",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}
