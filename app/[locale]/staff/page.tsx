"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

type Booking = {
  id: string;
  booking_number: string;
  return_at: string;
  vehicle_id: string | null;
  vehicle_name?: string;
  vehicle_plate?: string;
};

type Vehicle = {
  id: string;
  name: string;
  registration_plate: string;
};

export default function StaffPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const supabase = createClient();
  const t = useTranslations("staff.dashboard");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [activeChecklists, setActiveChecklists] = useState(0);
  const [loadingChecklists, setLoadingChecklists] = useState(true);

  useEffect(() => {
    async function checkAdminStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("staff_profiles")
        .select("role, can_manage")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const adminStatus =
        profile?.role === "admin" || profile?.can_manage === true;

      setIsAdmin(adminStatus);
      setLoading(false);
    }

    checkAdminStatus();
  }, [supabase]);

  useEffect(() => {
    async function fetchActiveChecklists() {
      setLoadingChecklists(true);

      const { count } = await supabase
        .from("checklist_instances")
        .select("id", { count: "exact", head: true })
        .neq("status", "completed");

      setActiveChecklists(count || 0);
      setLoadingChecklists(false);
    }

    fetchActiveChecklists();
  }, [supabase]);

  useEffect(() => {
    async function fetchUpcomingReturns() {
      setLoadingBookings(true);

      // Fetch bookings with upcoming returns
      const { data: bookingsData } = await supabase
        .from("bookings")
        .select("id, booking_number, return_at, vehicle_id")
        .in("status", ["confirmed", "on_rent"])
        .gte("return_at", new Date().toISOString())
        .order("return_at", { ascending: true });

      if (!bookingsData || bookingsData.length === 0) {
        setLoadingBookings(false);
        return;
      }

      // Fetch vehicles to map names (filter out null vehicle_ids)
      const vehicleIds = [...new Set(bookingsData.map(b => b.vehicle_id).filter((id): id is string => id !== null))];
      
      const vehicleMap = new Map<string, Vehicle>();
      
      if (vehicleIds.length > 0) {
        const { data: vehiclesData } = await supabase
          .from("vehicles")
          .select("id, name, registration_plate")
          .in("id", vehicleIds);

        vehiclesData?.forEach(v => vehicleMap.set(v.id, v));
      }

      // Merge data
      const enrichedBookings = bookingsData.map(b => ({
        ...b,
        vehicle_name: b.vehicle_id ? vehicleMap.get(b.vehicle_id)?.name : undefined,
        vehicle_plate: b.vehicle_id ? vehicleMap.get(b.vehicle_id)?.registration_plate : undefined,
      }));

      setBookings(enrichedBookings);
      setLoadingBookings(false);
    }

    fetchUpcomingReturns();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push(`/${locale}`);
    router.refresh();
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  // Group bookings by date (next 14 days) and future months
  const now = new Date();
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const next14Days: Map<string, Booking[]> = new Map();
  const futureMonths: Map<string, Booking[]> = new Map();

  bookings.forEach(booking => {
    const returnDate = new Date(booking.return_at);
    
    if (returnDate <= fourteenDaysFromNow) {
      // Next 14 days - group by date
      const dateKey = returnDate.toISOString().split('T')[0];
      if (!next14Days.has(dateKey)) {
        next14Days.set(dateKey, []);
      }
      next14Days.get(dateKey)!.push(booking);
    } else {
      // Future - group by month
      const monthKey = `${returnDate.getFullYear()}-${String(returnDate.getMonth() + 1).padStart(2, '0')}`;
      if (!futureMonths.has(monthKey)) {
        futureMonths.set(monthKey, []);
      }
      futureMonths.get(monthKey)!.push(booking);
    }
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const bookingDate = new Date(date);
    bookingDate.setHours(0, 0, 0, 0);

    if (bookingDate.getTime() === today.getTime()) {
      return "Today";
    } else if (bookingDate.getTime() === tomorrow.getTime()) {
      return "Tomorrow";
    }
    
    return date.toLocaleDateString(locale, { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString(locale, { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatMonthYear = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  };

  return (
    <PageContainer maxWidth="900px" showSignOut={false}>
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "var(--space-4)",
            }}
          >
            <div>
              <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                {t("title")}
              </h1>
              <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
                {t("subtitle")}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="btn btn-ghost"
              style={{
                fontSize: "14px",
                padding: "var(--space-2) var(--space-4)",
                minHeight: "36px",
              }}
            >
              {t("signOut")}
            </button>
          </div>

          {/* DASHBOARD GRID */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            <Link href={`/${locale}/staff/bookings`} className="surface" style={cardStyle}>
              {iconBookings}
              <div>
                <h3 style={cardTitle}>{t("cards.bookings.title")}</h3>
                <p style={cardText}>{t("cards.bookings.desc")}</p>
              </div>
            </Link>

            <Link href={`/${locale}/staff/vehicles`} className="surface" style={cardStyle}>
              {iconVehicles}
              <div>
                <h3 style={cardTitle}>{t("cards.vehicles.title")}</h3>
                <p style={cardText}>{t("cards.vehicles.desc")}</p>
              </div>
            </Link>

            <Link href={`/${locale}/staff/checklists`} className="surface" style={cardStyle}>
              {iconCleanings}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <div style={{ flex: 1 }}>
                  <h3 style={cardTitle}>Checklists</h3>
                  <p style={cardText}>Operational tasks</p>
                </div>
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "rgb(var(--brand))",
                    backgroundColor: "rgb(var(--brand-light))",
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    minWidth: "48px",
                    textAlign: "center",
                  }}
                >
                  {loadingChecklists ? "…" : activeChecklists}
                </div>
              </div>
            </Link>

            <Link href={`/${locale}/staff/team`} className="surface" style={cardStyle}>
              {iconTeam}
              <div>
                <h3 style={cardTitle}>{t("cards.team.title")}</h3>
                <p style={cardText}>{t("cards.team.desc")}</p>
              </div>
            </Link>

            <Link href={`/${locale}/staff/customers`} className="surface" style={cardStyle}>
              {iconCustomers}
              <div>
                <h3 style={cardTitle}>{t("cards.customers.title")}</h3>
                <p style={cardText}>{t("cards.customers.desc")}</p>
              </div>
            </Link>

            <Link href={`/${locale}/staff/company`} className="surface" style={cardStyle}>
              {iconCompany}
              <div>
                <h3 style={cardTitle}>{t("cards.company.title")}</h3>
                <p style={cardText}>{t("cards.company.desc")}</p>
              </div>
            </Link>
          </div>

          {/* UPCOMING RETURNS SECTION */}
          <div className="surface" style={{ padding: "var(--space-6)" }}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "var(--space-4)" 
            }}>
              <h2 style={{ fontSize: "18px", margin: 0 }}>
                Upcoming Returns
              </h2>
              <Link 
                href={`/${locale}/staff/bookings`}
                style={{
                  fontSize: "14px",
                  color: "rgb(var(--brand))",
                  textDecoration: "none"
                }}
              >
                View all bookings
              </Link>
            </div>

            {loadingBookings ? (
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
                Loading upcoming returns...
              </p>
            ) : bookings.length === 0 ? (
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
                No upcoming returns scheduled
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                {/* NEXT 14 DAYS */}
                {next14Days.size > 0 && (
                  <div>
                    <h3 style={{ 
                      fontSize: "16px", 
                      marginBottom: "var(--space-3)",
                      color: "rgb(var(--text))"
                    }}>
                      Next 14 Days
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                      {Array.from(next14Days.entries())
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([dateKey, dayBookings]) => (
                          <div key={dateKey}>
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "var(--space-2)",
                              marginBottom: "var(--space-2)",
                              padding: "var(--space-2) 0",
                              borderBottom: "1px solid rgb(var(--border))"
                            }}>
                              <span style={{ 
                                fontSize: "14px", 
                                fontWeight: 600,
                                color: "rgb(var(--text))"
                              }}>
                                {formatDate(dateKey)}
                              </span>
                              <span style={{
                                fontSize: "12px",
                                color: "rgb(var(--muted))",
                                backgroundColor: "rgb(var(--brand-light))",
                                padding: "2px 8px",
                                borderRadius: "var(--radius-sm)"
                              }}>
                                {dayBookings.length} {dayBookings.length === 1 ? 'return' : 'returns'}
                              </span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                              {dayBookings.map(booking => (
                                <Link
                                  key={booking.id}
                                  href={`/${locale}/staff/bookings/${booking.id}`}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "var(--space-3)",
                                    backgroundColor: "rgb(var(--surface))",
                                    borderRadius: "var(--radius-md)",
                                    textDecoration: "none",
                                    border: "1px solid rgb(var(--border))",
                                    transition: "all 0.2s ease"
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
                                  <div>
                                    <div style={{ 
                                      fontSize: "14px", 
                                      fontWeight: 500,
                                      color: "rgb(var(--text))"
                                    }}>
                                      {booking.vehicle_name || 'Unassigned'}
                                    </div>
                                    <div style={{ 
                                      fontSize: "12px", 
                                      color: "rgb(var(--muted))",
                                      marginTop: "2px"
                                    }}>
                                      {booking.vehicle_plate || '—'} • {booking.booking_number}
                                    </div>
                                  </div>
                                  <div style={{ 
                                    fontSize: "14px", 
                                    fontWeight: 500,
                                    color: "rgb(var(--brand))"
                                  }}>
                                    {formatTime(booking.return_at)}
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* FUTURE RETURNS */}
                {futureMonths.size > 0 && (
                  <div>
                    <h3 style={{ 
                      fontSize: "16px", 
                      marginBottom: "var(--space-3)",
                      color: "rgb(var(--text))"
                    }}>
                      Future Returns
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {Array.from(futureMonths.entries())
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([monthKey, monthBookings]) => {
                          const isExpanded = expandedMonths.has(monthKey);
                          return (
                            <div key={monthKey}>
                              <button
                                onClick={() => toggleMonth(monthKey)}
                                style={{
                                  width: "100%",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: "var(--space-3)",
                                  backgroundColor: "rgb(var(--surface))",
                                  border: "1px solid rgb(var(--border))",
                                  borderRadius: "var(--radius-md)",
                                  cursor: "pointer",
                                  transition: "all 0.2s ease"
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "rgb(var(--brand-light))";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "rgb(var(--surface))";
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                  <span style={{ 
                                    fontSize: "14px", 
                                    fontWeight: 500,
                                    color: "rgb(var(--text))"
                                  }}>
                                    {formatMonthYear(monthKey)}
                                  </span>
                                  <span style={{
                                    fontSize: "12px",
                                    color: "rgb(var(--muted))",
                                    backgroundColor: "rgb(var(--brand-light))",
                                    padding: "2px 8px",
                                    borderRadius: "var(--radius-sm)"
                                  }}>
                                    {monthBookings.length}
                                  </span>
                                </div>
                                <svg
                                  width="16"
                                  height="16"
                                  stroke="currentColor"
                                  fill="none"
                                  style={{
                                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                    transition: "transform 0.2s ease"
                                  }}
                                >
                                  <path strokeWidth="2" d="M4 6l4 4 4-4" />
                                </svg>
                              </button>
                              {isExpanded && (
                                <div style={{ 
                                  marginTop: "var(--space-2)",
                                  display: "flex", 
                                  flexDirection: "column", 
                                  gap: "var(--space-2)",
                                  paddingLeft: "var(--space-4)"
                                }}>
                                  {monthBookings.map(booking => (
                                    <Link
                                      key={booking.id}
                                      href={`/${locale}/staff/bookings/${booking.id}`}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "var(--space-3)",
                                        backgroundColor: "rgb(var(--surface))",
                                        borderRadius: "var(--radius-md)",
                                        textDecoration: "none",
                                        border: "1px solid rgb(var(--border))",
                                        transition: "all 0.2s ease"
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
                                      <div>
                                        <div style={{ 
                                          fontSize: "14px", 
                                          fontWeight: 500,
                                          color: "rgb(var(--text))"
                                        }}>
                                          {booking.vehicle_name || 'Unassigned'}
                                        </div>
                                        <div style={{ 
                                          fontSize: "12px", 
                                          color: "rgb(var(--muted))",
                                          marginTop: "2px"
                                        }}>
                                          {booking.vehicle_plate || '—'} • {booking.booking_number}
                                        </div>
                                      </div>
                                      <div style={{ 
                                        fontSize: "13px", 
                                        color: "rgb(var(--text))"
                                      }}>
                                        {formatDate(booking.return_at)} {formatTime(booking.return_at)}
                                      </div>
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {!loading && (
            <div
              style={{
                borderTop: "1px solid rgb(var(--border))",
                paddingTop: "var(--space-6)",
              }}
            >
              <h2 style={{ fontSize: "18px", marginBottom: "var(--space-4)" }}>
                {t("quickActions.title")}
              </h2>
              {isAdmin ? (
                <div style={{ display: "flex", gap: "var(--space-3)" }}>
                  <Link href={`/${locale}/staff/bookings/new`} className="btn btn-primary">
                    {t("quickActions.newBooking")}
                  </Link>
                  <Link href={`/${locale}/staff/vehicles/new`} className="btn btn-secondary">
                    {t("quickActions.addVehicle")}
                  </Link>
                </div>
              ) : (
                <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
                  {t("quickActions.nonAdminHint")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

/* shared styles + icons */

const cardStyle = {
  padding: "var(--space-6)",
  textDecoration: "none",
  display: "flex",
  flexDirection: "column" as const,
  gap: "var(--space-3)",
};

const cardTitle = {
  fontSize: "18px",
  marginBottom: "var(--space-2)",
  color: "rgb(var(--text))",
};

const cardText = {
  fontSize: "14px",
  color: "rgb(var(--muted))",
};

const iconWrap = {
  width: "48px",
  height: "48px",
  borderRadius: "var(--radius-lg)",
  background: "rgb(var(--brand-light))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const iconBookings = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M8 7V3m8 4V3M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z" />
    </svg>
  </div>
);

const iconVehicles = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  </div>
);

const iconCleanings = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M3 6h18M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m3 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6h14z" />
    </svg>
  </div>
);

const iconTeam = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M17 20H7m10 0v-2a4 4 0 00-8 0v2m4-10a4 4 0 110-8 4 4 0 010 8z" />
    </svg>
  </div>
);

const iconCustomers = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M15 7a3 3 0 11-6 0 3 3 0 016 0zM7 20a5 5 0 0110 0" />
    </svg>
  </div>
);

const iconCompany = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M7 21V3h10v18M7 9h10" />
    </svg>
  </div>
);