'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistItemType } from './types';

interface UseChecklistUserProps {
  supabase: SupabaseClient<any>;
  localItems: ChecklistItemType[];
}

export function useChecklistUser({ supabase, localItems }: UseChecklistUserProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [initialsByUserId, setInitialsByUserId] = useState<Record<string, string>>({});

  const fetchInitialsForUsers = useCallback(
    async (userIds: string[]) => {
      if (userIds.length === 0) return;
      const query = supabase
        .from('staff_profiles')
        .select('auth_user_id,first_name,last_name')
        .in('auth_user_id', userIds);
      if (companyId) query.eq('company_id', companyId);
      const { data } = await query;
      if (!data) return;
      const newEntries: Record<string, string> = {};
      for (const profile of data) {
        const first = profile.first_name?.charAt(0)?.toUpperCase() || '';
        const last = profile.last_name?.charAt(0)?.toUpperCase() || '';
        newEntries[profile.auth_user_id] = first || last ? first + last : '?';
      }
      setInitialsByUserId((prev) => ({ ...prev, ...newEntries }));
    },
    [supabase, companyId]
  );

  // Load initials for checked items whenever localItems changes
  useEffect(() => {
    const checkedByIds = localItems
      .filter((it) => it.checked && it.checked_by)
      .map((it) => it.checked_by as string);
    const missing = [...new Set(checkedByIds)].filter((id) => !(id in initialsByUserId));
    if (missing.length > 0) fetchInitialsForUsers(missing);
  }, [localItems, initialsByUserId, fetchInitialsForUsers]);

  // Load current user profile on mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('first_name,last_name,company_id')
        .eq('auth_user_id', user.id)
        .single();
      if (profile) {
        setCompanyId(profile.company_id ?? null);
        const first = profile.first_name?.charAt(0)?.toUpperCase() || '';
        const last = profile.last_name?.charAt(0)?.toUpperCase() || '';
        setInitialsByUserId((prev) => ({ ...prev, [user.id]: first || last ? first + last : '?' }));
      }
    };
    fetchUserProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { userId, companyId, initialsByUserId, fetchInitialsForUsers };
}
