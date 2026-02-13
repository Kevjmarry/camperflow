"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PageContainer from "@/components/PageContainer";

interface ChecklistInstance {
  id: string;
  checklist_type: string;
  status: string;
  due_at: string | null;
  created_at: string;
  booking_id: string;
}

interface ChecklistInstanceItem {
  id: string;
  template_item_id: string;
  is_completed: boolean;
  position: number;
}

interface ChecklistTemplateItem {
  id: string;
  label: string;
  description: string | null;
  section: string | null;
}

export default function ChecklistDetailPage() {
  const params = useParams();
  const locale = params.locale as string;
  const id = params.id as string;

  const [checklist, setChecklist] = useState<ChecklistInstance | null>(null);
  const [items, setItems] = useState<ChecklistInstanceItem[]>([]);
  const [templateMap, setTemplateMap] = useState<Map<string, ChecklistTemplateItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchChecklist = async () => {
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from("checklist_instances")
        .select("id, checklist_type, status, due_at, created_at, booking_id")
        .eq("id", id)
        .single();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setChecklist(data);

      // Fetch instance items
      const { data: itemsData } = await supabase
        .from("checklist_instance_items")
        .select("id, template_item_id, is_completed, position")
        .eq("instance_id", id)
        .order("position", { ascending: true });

      if (itemsData && itemsData.length > 0) {
        setItems(itemsData);

        // Get all template_item_ids from instance items
        const templateItemIds = itemsData.map(item => item.template_item_id);

        // Fetch template items that match these IDs
        const { data: templateData } = await supabase
          .from("checklist_template_items")
          .select("id, label, description, section")
          .in("id", templateItemIds);

        if (templateData) {
          const map = new Map<string, ChecklistTemplateItem>();
          templateData.forEach((item) => {
            map.set(item.id, item);
          });
          setTemplateMap(map);
        }
      } else {
        setItems([]);
      }
      
      setLoading(false);
    };

    fetchChecklist();
  }, [id]);

  const updateStatus = async (newStatus: string) => {
    const supabase = createClient();
    
    const { error } = await supabase
      .from("checklist_instances")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      alert("Failed to update status");
      return;
    }

    setChecklist((prev) => (prev ? { ...prev, status: newStatus } : null));
  };

  const handleStart = () => {
    updateStatus("in_progress");
  };

  const handleComplete = () => {
    updateStatus("completed");
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "not_started":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const isOverdue = (dueAt: string | null) => {
    if (!dueAt) return false;
    return new Date(dueAt) < new Date();
  };

  const formatChecklistTitle = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1) + " checklist";
  };

  if (loading) {
    return (
      <PageContainer>
        <div style={{ padding: "var(--space-8)" }}>Loading...</div>
      </PageContainer>
    );
  }

  if (notFound || !checklist) {
    return (
      <PageContainer>
        <div style={{ padding: "var(--space-8)" }}>
          <p style={{ marginBottom: "var(--space-6)", color: "var(--text-secondary)" }}>
            Checklist not found
          </p>
          <Link href={`/${locale}/staff`} className="btn">
            Back to Dashboard
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div style={{ padding: "var(--space-8)" }}>
        <div style={{ marginBottom: "var(--space-6)" }}>
          <Link
            href={`/${locale}/staff/bookings/${checklist.booking_id}`}
            style={{ color: "var(--primary)", textDecoration: "none" }}
          >
            ← Back to Booking
          </Link>
        </div>

        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "var(--space-4)",
            }}
          >
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
              {formatChecklistTitle(checklist.checklist_type)}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              {checklist.status === "not_started" && (
                <button onClick={handleStart} className="btn btn-secondary">
                  Start
                </button>
              )}
              {checklist.status === "in_progress" && (
                <button onClick={handleComplete} className="btn btn-primary">
                  Complete
                </button>
              )}
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(
                  checklist.status
                )}`}
              >
                {checklist.status.replace("_", " ")}
              </span>
            </div>
          </div>

          {checklist.due_at && isOverdue(checklist.due_at) && (
            <div
              className="surface"
              style={{
                padding: "var(--space-4)",
                marginBottom: "var(--space-4)",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
              }}
            >
              <span style={{ color: "#991b1b", fontWeight: 500 }}>Overdue:</span>{" "}
              <span style={{ color: "#7f1d1d" }}>
                {new Date(checklist.due_at).toLocaleString()}
              </span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "var(--space-8)",
              fontSize: "0.875rem",
              color: "var(--text-secondary)",
              marginBottom: "var(--space-8)",
            }}
          >
            <div>
              <span style={{ fontWeight: 500 }}>Due date:</span>{" "}
              {checklist.due_at ? (
                <span>{new Date(checklist.due_at).toLocaleString()}</span>
              ) : (
                <span>No due date</span>
              )}
            </div>
            <div>
              <span style={{ fontWeight: 500 }}>Created:</span>{" "}
              <span>{new Date(checklist.created_at).toLocaleString()}</span>
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "var(--space-6)",
            }}
          >
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                marginBottom: "var(--space-4)",
              }}
            >
              Checklist items
            </h2>

            {items.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                No items yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {items.map((item) => {
                  const template = templateMap.get(item.template_item_id);
                  if (!template) return null;
                  
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        gap: "var(--space-3)",
                        alignItems: "flex-start",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.is_completed}
                        disabled
                        style={{ marginTop: "0.25rem" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{template.label}</div>
                        {template.description && (
                          <div
                            style={{
                              fontSize: "0.875rem",
                              color: "var(--text-secondary)",
                              marginTop: "var(--space-1)",
                            }}
                          >
                            {template.description}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}