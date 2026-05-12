import StaffShell from '@/components/staff/StaffShell'
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

async function ensureStaffCompanyId() {
  try {
    const cookieStore = await cookies();
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || user.is_anonymous) return;
    if (user.user_metadata?.company_id) return;

    const { data: staffProfile } = await supabase
      .from("staff_profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!staffProfile) return;

    let companyId: string | null = null;

    try {
    } catch {
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .limit(1)
        .single();
      companyId = company?.id || null;
    }

    if (!companyId) return;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        company_id: companyId,
      },
    });

    console.warn(`Auto-assigned company_id ${companyId} to staff user ${user.id}`);
  } catch (error) {
    // Silent fail to not break app load
  }
}

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureStaffCompanyId();

  return <StaffShell>{children}</StaffShell>;
}