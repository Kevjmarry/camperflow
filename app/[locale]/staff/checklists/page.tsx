"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

type ChecklistInstance = {
  id: string;
  status: string;
  booking_number?: string;
  customer_name?: string;
  return_at?: string;
  vehicle_id?: string;
  vehicle_name?: string;
  vehicle_plate?: string;
};

type Vehicle = {
  id: string;
  name: string;
  registration_plate: string;
};

type IssueFlag = {
  id: string;
  checklist_instance_id: string;
  checklist_instance_item_id: string;
  severity: string;
  note: string | null;
  created_at: string;
};

type EnrichedIssue = IssueFlag & {
  checklist_type?: string;
  booking_number?: string;
  customer_name?: string;
  item_label?: string;
};

export default function ChecklistsPage() {
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const type = searchParams.get("type") || "";
  const range = searchParams.get("range") || "";

  const [checklistInstances, setChecklistInstances] = useState<ChecklistInstance[]>([]);
  const [openIssues, setOpenIssues] = useState<EnrichedIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingIssues, setLoadingIssues] = useState(true);

  // Fetch open issues
  useEffect(() => {
    async function fetchOpenIssues() {
      setLoadingIssues(true);

      const { data: issuesData } = await supabase
        .from("issue_flags")
        .select("id, checklist_instance_id, checklist_instance_item_id, severity, note, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (issuesData && issuesData.length > 0) {
        const instanceIds = [...new Set(issuesData.map(i => i.checklist_instance_id))];
        const instanceItemIds = [...new Set(issuesData.map(i => i.checklist_instance_item_id))];

        // Fetch checklist instances
        const { data: instancesData } = await supabase
          .from("checklist_instances")
          .select("id, checklist_type, booking_id")
          .in("id", instanceIds);

        const instanceMap = new Map(instancesData?.map(inst => [inst.id, inst]) || []);

        // Fetch bookings
        const bookingIds = [...new Set(instancesData?.map(inst => inst.booking_id).filter(Boolean) || [])];
        const bookingMap = new Map();

        if (bookingIds.length > 0) {
          const { data: bookingsData } = await supabase
            .from("bookings")
            .select("id, booking_number, customer_name")
            .in("id", bookingIds);

          bookingsData?.forEach(b => bookingMap.set(b.id, b));
        }

        // Fetch checklist instance items
        const { data: instanceItemsData } = await supabase
          .from("checklist_instance_items")
          .select("id, template_item_id")
          .in("id", instanceItemIds);

        const instanceItemMap = new Map(instanceItemsData?.map(item => [item.id, item]) || []);

        // Fetch template items
        const templateItemIds = [...new Set(instanceItemsData?.map(item => item.template_item_id).filter(Boolean) || [])];
        const templateItemMap = new Map();

        if (templateItemIds.length > 0) {
          const { data: templateItemsData } = await supabase
            .from("checklist_template_items")
            .select("id, label")
            .in("id", templateItemIds);

          templateItemsData?.forEach(t => templateItemMap.set(t.id, t));
        }

        // Enrich issues
        const enrichedIssues: EnrichedIssue[] = issuesData.map(issue => {
          const instance = instanceMap.get(issue.checklist_instance_id);
          const booking = instance?.booking_id ? bookingMap.get(instance.booking_id) : null;
          const instanceItem = instanceItemMap.get(issue.checklist_instance_item_id);
          const templateItem = instanceItem?.template_item_id ? templateItemMap.get(instanceItem.template_item_id) : null;

          return {
            ...issue,
            checklist_type: instance?.checklist_type,
            booking_number: booking?.booking_number,
            customer_name: booking?.customer_name,
            item_label: templateItem?.label,
          };
        });

        setOpenIssues(enrichedIssues);
      } else {
        setOpenIssues([]);
      }

      setLoadingIssues(false);
    }

    fetchOpenIssues();
  }, []);

  // Fetch cleaning checklists
  useEffect(() => {
    async function fetchChecklists() {
      setLoading(true);

      if (type === "cleaning" && range === "today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch checklist instances with booking join
        const { data: instancesData } = await supabase
          .from("checklist_instances")
          .select(`
            id,
            status,
            booking_id,
            bookings!inner (
              id,
              booking_number,
              customer_name,
              return_at,
              vehicle_id,
              status
            )
          `)
          .eq("checklist_type", "cleaning")
          .in("bookings.status", ["confirmed", "on_rent"])
          .gte("bookings.return_at", today.toISOString())
          .lt("bookings.return_at", tomorrow.toISOString());

        if (instancesData && instancesData.length > 0) {
          // Extract vehicle IDs
          const vehicleIds = [...new Set(
            instancesData
              .map(inst => {
                const booking = Array.isArray(inst.bookings) ? inst.bookings[0] : inst.bookings;
                return booking?.vehicle_id;
              })
              .filter((id): id is string => id !== null && id !== undefined)
          )];

          const vehicleMap = new Map<string, Vehicle>();

          if (vehicleIds.length > 0) {
            const { data: vehiclesData } = await supabase
              .from("vehicles")
              .select("id, name, registration_plate")
              .in("id", vehicleIds);

            vehiclesData?.forEach(v => vehicleMap.set(v.id, v));
          }

          // Transform data
          const enrichedInstances: ChecklistInstance[] = instancesData.map(inst => {
            const booking = Array.isArray(inst.bookings) ? inst.bookings[0] : inst.bookings;
            return {
              id: inst.id,
              status: inst.status,
              booking_number: booking?.booking_number,
              customer_name: booking?.customer_name,
              return_at: booking?.return_at,
              vehicle_id: booking?.vehicle_id,
              vehicle_name: booking?.vehicle_id ? vehicleMap.get(booking.vehicle_id)?.name : undefined,
              vehicle_plate: booking?.vehicle_id ? vehicleMap.get(booking.vehicle_id)?.registration_plate : undefined,
            };
          });

          // Sort by return_at ascending
          enrichedInstances.sort((a, b) => {
            if (!a.return_at) return 1;
            if (!b.return_at) return -1;
            return new Date(a.return_at).getTime() - new Date(b.return_at).getTime();
          });

          setChecklistInstances(enrichedInstances);
        } else {
          setChecklistInstances([]);
        }
      } else {
        setChecklistInstances([]);
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'info':
        return { backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc' };
      case 'attention':
        return { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };
      case 'urgent':
        return { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' };
      default:
        return { backgroundColor: 'rgb(var(--surface))', color: 'rgb(var(--muted))', border: '1px solid rgb(var(--border))' };
    }
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

          {/* Open Issues Section */}
          {!loadingIssues && openIssues.length > 0 && (
            <div className="surface" style={{ padding: "var(--space-6)" }}>
              <h2 style={{ fontSize: "18px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                Open Issues ({openIssues.length})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {openIssues.map((issue) => (
                  <Link
                    key={issue.id}
                    href={`/${locale}/staff/checklists/${issue.checklist_instance_id}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-2)",
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "var(--space-3)" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "16px", fontWeight: 500, color: "rgb(var(--text))", marginBottom: "var(--space-1)" }}>
                          {issue.item_label || "Checklist Item"}
                        </div>
                        <div style={{ fontSize: "14px", color: "rgb(var(--muted))", display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                          <span>{issue.checklist_type || "Unknown"}</span>
                          {issue.booking_number && (
                            <>
                              <span>•</span>
                              <span>{issue.booking_number}</span>
                            </>
                          )}
                          {issue.customer_name && (
                            <>
                              <span>•</span>
                              <span>{issue.customer_name}</span>
                            </>
                          )}
                          <span
                            style={{
                              ...getSeverityStyle(issue.severity),
                              padding: "2px 8px",
                              borderRadius: "var(--radius-sm)",
                              fontSize: "12px",
                              fontWeight: 500,
                              textTransform: "uppercase",
                            }}
                          >
                            {issue.severity}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", color: "rgb(var(--muted))", textAlign: "right", whiteSpace: "nowrap" }}>
                        {formatDate(issue.created_at)}
                      </div>
                    </div>
                    {issue.note && (
                      <div style={{ fontSize: "14px", color: "rgb(var(--text-secondary))", fontStyle: "italic", paddingTop: "var(--space-1)" }}>
                        "{issue.note}"
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

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

          {/* Checklists List */}
          <div className="surface" style={{ padding: "var(--space-6)" }}>
            <h2 style={{ fontSize: "18px", marginBottom: "var(--space-4)" }}>
              {type === "cleaning" && range === "today" ? "Returns Today" : "Checklists"}
            </h2>

            {loading ? (
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
                Loading checklists...
              </p>
            ) : checklistInstances.length === 0 ? (
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
                {type === "cleaning" && range === "today"
                  ? "No vehicles returning today"
                  : "No checklists found"}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {checklistInstances.map((instance) => (
                  <Link
                    key={instance.id}
                    href={`/${locale}/staff/checklists/${instance.id}`}
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
                        {instance.vehicle_name || "Unassigned Vehicle"}
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          color: "rgb(var(--muted))",
                          marginTop: "var(--space-1)",
                        }}
                      >
                        {instance.vehicle_plate || "-"} • {instance.booking_number || "No booking"}
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
                        {instance.return_at ? `Return: ${formatTime(instance.return_at)}` : "-"}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "rgb(var(--muted))",
                          marginTop: "2px",
                        }}
                      >
                        {instance.status}
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