"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import PageContainer from "../../../components/PageContainer";
import { createClient } from "../../../lib/supabase/client";

interface StaffProfile {
  id: string;
  auth_user_id: string;
  company_id: string;
  role: string;
  name: string | null;
  can_manage: boolean;
  can_clean: boolean;
  can_mechanical: boolean;
  photo_url: string | null;
}

export default function StaffTeamPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");

        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userRes?.user) {
          setError("Not authenticated");
          setLoading(false);
          return;
        }

        const user = userRes.user;
        setCurrentAuthUserId(user.id);

        const { data: currentProfile, error: profileErr } = await supabase
          .from("staff_profiles")
          .select("company_id")
          .eq("auth_user_id", user.id)
          .single();

        if (profileErr || !currentProfile?.company_id) {
          setError("No staff profile found");
          setLoading(false);
          return;
        }

        const { data: staffProfiles, error: staffErr } = await supabase
          .from("staff_profiles")
          .select(
            "id, auth_user_id, company_id, role, name, can_manage, can_clean, can_mechanical, photo_url"
          )
          .eq("company_id", currentProfile.company_id)
          .order("role", { ascending: false })
          .order("created_at", { ascending: true });

        if (staffErr) throw staffErr;

        setStaff((staffProfiles || []) as StaffProfile[]);
      } catch (err: any) {
        setError(err?.message || "Failed to load staff");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [supabase]);

  return (
    <PageContainer maxWidth="1200px">
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          <div>
            <Link
              href="/staff"
              style={{
                fontSize: "14px",
                color: "rgb(var(--brand))",
                textDecoration: "none",
                marginBottom: "var(--space-2)",
                display: "inline-block",
              }}
            >
              ← Back to dashboard
            </Link>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              Staff team
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {staff.length} {staff.length === 1 ? "member" : "members"}
            </p>
          </div>

          {error && (
            <div
              style={{
                padding: "var(--space-4)",
                background: "rgb(var(--error) / 0.1)",
                border: "1px solid rgb(var(--error) / 0.3)",
                borderRadius: "var(--radius)",
                color: "rgb(var(--error))",
                fontSize: "14px",
              }}
            >
              {error}
            </div>
          )}

          {loading && (
            <div
              style={{
                textAlign: "center",
                padding: "var(--space-8)",
                color: "rgb(var(--muted))",
              }}
            >
              Loading staff...
            </div>
          )}

          {!loading && !error && staff.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "var(--space-4)",
              }}
            >
              {staff.map((member) => (
                <StaffCard
                  key={member.id}
                  member={member}
                  isCurrentUser={member.auth_user_id === currentAuthUserId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

function StaffCard({
  member,
  isCurrentUser,
}: {
  member: StaffProfile;
  isCurrentUser: boolean;
}) {
  const getTypeLabel = (): string => {
    if (member.can_manage) {
      return "Manager";
    }
    
    const capabilities: string[] = [];
    if (member.can_clean) capabilities.push("Cleaner");
    if (member.can_mechanical) capabilities.push("Mechanical");
    
    if (capabilities.length > 0) {
      return capabilities.join(" + ");
    }
    
    return "";
  };

  const displayName =
    member.name && member.name.trim().length > 0
      ? member.name
      : member.role.charAt(0).toUpperCase() + member.role.slice(1);

  const typeLabel = getTypeLabel();

  const cardBody = (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            overflow: "hidden",
            background: "rgb(var(--border))",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {member.photo_url ? (
            <Image
              src={member.photo_url}
              alt="Staff photo"
              width={48}
              height={48}
            />
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgb(var(--muted))"
              strokeWidth="2"
            >
              <circle cx="12" cy="7" r="4" />
              <path d="M20 21a8 8 0 0 0-16 0" />
            </svg>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
          >
            <div style={{ fontWeight: 600, color: "rgb(var(--text))" }}>
              {displayName}
            </div>
            {isCurrentUser && (
              <span
                style={{
                  fontSize: "12px",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  background: "rgb(var(--brand) / 0.12)",
                  color: "rgb(var(--brand))",
                  fontWeight: 600,
                }}
              >
                You
              </span>
            )}
          </div>

          {typeLabel && (
            <div
              style={{
                fontSize: "12px",
                color: member.can_manage ? "rgb(var(--accent))" : "rgb(var(--muted))",
                fontWeight: member.can_manage ? 600 : 400,
                marginTop: 2,
              }}
            >
              {typeLabel}
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <Link
      href={`/staff/team/${member.id}`}
      className="surface"
      style={{
        padding: "var(--space-5)",
        textDecoration: "none",
        display: "block",
        cursor: "pointer",
      }}
    >
      {cardBody}
    </Link>
  );
}