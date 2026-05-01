import Link from "next/link";
import { ReactNode } from "react";

interface BackLinkProps {
  href: string;
  children: ReactNode;
}

export default function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link
      href={href}
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
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M10 12L6 8L10 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {children}
    </Link>
  );
}
