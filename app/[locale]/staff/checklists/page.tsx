"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

type Booking = {
  id: string;
  booking_number: string;
  return_at: string;
  pickup_at: string;
  vehicle_id: string | null;
  status: string;
};

type Vehicle = {
  id: string;
  name: string;
  registration_plate: string;
};

export default function ChecklistsPage() {
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const type = searchParams.get("type") || "";
  const range = searchParams.get("range") || "";

  const [bookings, setBookings] = useState<(Booking & { vehicle_name?: string; vehicle_plate?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchChecklists() {
      setLoading(true);

      if (type === "cleaning" && range === "today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const { data: bookingsData } = await supabase
          .from("bookings")
          .select("id, booking_number, return_at, pickup_at, vehicle_id, status")
          .in("status", ["confirmed", "on_rent"])
          .gte("return_at", today.toISOString())
          .lt("return_at", tomorrow.toISOString())
          .order("return_at", { ascending: true });

        if (bookingsData && bookingsData.length > 0) {
          const vehicleIds = [...new Set(bookingsData.map(b => b.vehicle_id).filter((id): id is string => id !== null))];
          const vehicleMap = new Map<string, Vehicle>();

          if (vehicleIds.length > 0) {
            const { data: vehiclesData } = await supabase
              .from("vehicles")
              .select("id, name, registration_plate")
              .in("id", vehicleIds);

            vehiclesData?.forEach(v => vehicleMap.set(v.id, v));
          }

          const enrichedBookings = bookingsData.map(b => ({
            ...b,
            vehicle_name: b.vehicle_id ? vehicleMap.get(b.vehicle_id)?.name : undefined,
            vehicle_plate: b.vehicle_id ? vehicleMap.get(b.vehicle_id)?.registration_plate : undefined,
          }));

          setBookings(enrichedBookings);
        }
      }

      setLoading(false);
    }

    fetchChecklists();
  }, [supabase, type, range]);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTitle = () => {
    if (type === "cleaning" && range === "today") {
      return "Cleaning Checklists - Today";
    }
    return "Checklists";
  };

  const showUnsupportedMessage = type !== "cleaning" || range !== "today";

  return (
    <PageContainer maxWidth="900px" showSignOut={false}>
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {/* Header */}
          <div>
            <Link
              href={`/${locale}/staff`}
              style={{
                fontSize: "14px",
                color: "rgb(var(--brand))",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginBottom: "var(--space-4)",
              }}
            >
              <svg width="16" height="16" stroke="currentColor" fill="none">
                <path strokeWidth="2" d="M10 6L6 10l4 4" />
              </svg>
              Back to Dashboard
            </Link>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              {getTitle()}
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {type === "cleaning" && range === "today"
                ? "Vehicles returning today requiring cleaning"
                : "View and manage checklists"}
            </p>
          </div>

          {/* Unsupported params message */}
          {showUnsupportedMessage && (
            <div
              style={{
                padding: "var(--space-4)",
                backgroundColor: "rgb(var(--surface))",
                border: "1px solid rgb(var(--border))",
                borderRadius: "var(--radius-md)",
                fontSize: "14px",
                color: "rgb(var(--muted))",
              }}
            >
              Currently supported: <code style={{ padding: "2px 6px", backgroundColor: "rgb(var(--brand-light))", borderRadius: "var(--radius-sm)" }}>?type=cleaning&range=today</code>
            </div>
          )}

          {/* Bookings List */}
          <div className="surface" style={{ padding: "var(--space-6)" }}>
            <h2 style={{ fontSize: "18px", marginBottom: "var(--space-4)" }}>
              {type === "cleaning" && range === "today" ? "Returns Today" : "Checklists"}
            </h2>

            {loading ? (
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
                Loading checklists...
              </p>
            ) : bookings.length === 0 ? (
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
                {type === "cleaning" && range === "today"
                  ? "No vehicles returning today"
                  : "No checklists found"}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {bookings.map((booking) => (
                  <Link
                    key={booking.id}
                    href={`/${locale}/staff/bookings/${booking.id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "var(--space-4)",
                      backgroundColor: "rgb(var(--surface))",
                      borderRadius: "var(--radius-md)",
                      textDecoration: "none",
                      border: "1px solid rgb(var(--border))",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgb(var(--brand-light))";
                      e.currentTarget.style.borderColor = "rgb(var(--brand))";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "rgb(var(--surface))";
                      e.currentTarget.style.borderColor = "rgb(var(--border))";
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: "16px",
                          fontWeight: 500,
                          color: "rgb(var(--text))",
                        }}
                      >
                        {booking.vehicle_name || "Unassigned Vehicle"}
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          color: "rgb(var(--muted))",
                          marginTop: "var(--space-1)",
                        }}
                      >
                        {booking.vehicle_plate || "—"} • {booking.booking_number}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "rgb(var(--brand))",
                        }}
                      >
                        Return: {formatTime(booking.return_at)}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "rgb(var(--muted))",
                          marginTop: "2px",
                        }}
                      >
                        {booking.status}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}