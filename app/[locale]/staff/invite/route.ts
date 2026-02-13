import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { email, profile_id } = await request.json();

    if (!email || !profile_id) {
      return NextResponse.json(
        { error: "Email and profile_id are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // 1. Authenticate caller using cookie-based server client
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get caller's staff profile
    const { data: callerProfile, error: profileError } = await supabase
      .from("staff_profiles")
      .select("company_id, role, can_manage")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileError || !callerProfile) {
      return NextResponse.json(
        { error: "Staff profile not found" },
        { status: 403 }
      );
    }

    // 3. Enforce permission: admin OR can_manage
    const isAllowed =
      callerProfile.role === "admin" || callerProfile.can_manage === true;

    if (!isAllowed) {
      return NextResponse.json(
        { error: "Insufficient permissions to send invites" },
        { status: 403 }
      );
    }

    // 4. Verify target profile exists and belongs to same company
    const { data: targetProfile, error: targetError } = await supabase
      .from("staff_profiles")
      .select("company_id, auth_user_id")
      .eq("profile_id", profile_id)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return NextResponse.json(
        { error: "Target profile not found" },
        { status: 404 }
      );
    }

    if (targetProfile.company_id !== callerProfile.company_id) {
      return NextResponse.json(
        { error: "Cannot invite staff from another company" },
        { status: 403 }
      );
    }

    if (targetProfile.auth_user_id !== null) {
      return NextResponse.json(
        { error: "This staff member already has login enabled" },
        { status: 409 }
      );
    }

    // 5. Create admin client and invite user
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const inviteOptions: { redirectTo?: string } = {};
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      inviteOptions.redirectTo = process.env.NEXT_PUBLIC_SITE_URL;
    }

    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(
        normalizedEmail,
        Object.keys(inviteOptions).length > 0 ? inviteOptions : undefined
      );

    if (inviteError) {
      console.error("Invite error:", inviteError);
      return NextResponse.json(
        { error: inviteError.message || "Failed to send invite" },
        { status: 500 }
      );
    }

    if (!inviteData?.user?.id) {
      return NextResponse.json(
        { error: "No user ID returned from invite" },
        { status: 500 }
      );
    }

    // 6. Update staff_profiles.auth_user_id only if currently NULL
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("staff_profiles")
      .update({ auth_user_id: inviteData.user.id })
      .eq("profile_id", profile_id)
      .is("auth_user_id", null)
      .select();

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to link user to profile" },
        { status: 500 }
      );
    }

    // Check if update affected any rows
    if (!updateData || updateData.length === 0) {
      return NextResponse.json(
        {
          error:
            "Staff member already has login enabled or profile was modified",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      user_id: inviteData.user.id,
    });
  } catch (error: any) {
    console.error("Invite API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}