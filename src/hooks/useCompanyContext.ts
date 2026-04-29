import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type UserRole = 'super_admin' | 'admin' | 'user';

const STORAGE_KEY = 'gg-selected-company-id';

export interface CompanyContext {
  role: UserRole;
  companyId: string | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isMember: boolean;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  loading: boolean;
}

export function useCompanyContext(): CompanyContext {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole>('user');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);

  const setSelectedCompanyId = (id: string | null) => {
    setSelectedCompanyIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  };

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role, company_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setRole((data.role as UserRole) || 'user');
        setCompanyId((data as any).company_id ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin';
  const isMember = role === 'user';

  return {
    role,
    companyId,
    isSuperAdmin,
    isAdmin,
    isMember,
    selectedCompanyId: isSuperAdmin ? selectedCompanyId : companyId,
    setSelectedCompanyId,
    loading,
  };
}
