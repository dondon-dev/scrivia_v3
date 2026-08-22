import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { ROLE_PERMISSIONS, type UserRole } from '@/types/auth';

/**
 * DB-backed editable role permissions.
 *
 * The code-defined `ROLE_PERMISSIONS` map in src/types/auth.ts is the *default*
 * matrix. The `role_permissions` table stores only *overrides* on top of it:
 *   effective(role, permission) = override row if present, else code default.
 *
 * The provider loads the overrides once per session (after the profile is
 * known), exposes the merged view, and writes through super_admin-only RPCs.
 * If the table/RPC is unavailable (migration not applied), the code defaults
 * remain authoritative — the app keeps working.
 */

export interface PermissionOverride {
  role: string;
  permission: string;
  granted: boolean;
}

export interface PermissionsContextValue {
  /** True while the overrides are being fetched from the database. */
  loading: boolean;
  /** Effective check bound to the signed-in user's role. */
  hasPermission: (permission: string) => boolean;
  /** Effective granted-permission list for a role. */
  rolePermissions: (role: UserRole) => string[];
  /** Effective granted state for a specific role × permission cell. */
  isGranted: (role: UserRole, permission: string) => boolean;
  /** Whether a role × permission cell has a DB override (differs from default). */
  isOverridden: (role: UserRole, permission: string) => boolean;
  /** Persist an override (grant or revoke). Server enforces super_admin. */
  setPermission: (role: UserRole, permission: string, granted: boolean) => Promise<{ error?: string }>;
  /** Delete an override, restoring the code default. */
  resetPermission: (role: UserRole, permission: string) => Promise<{ error?: string }>;
  /** Re-fetch overrides from the database. */
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

function defaultGranted(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_role_permissions');
      if (error) throw error;
      setOverrides((data ?? []) as PermissionOverride[]);
    } catch (err) {
      // Table/RPC not available yet — code defaults remain authoritative.
      console.warn('[permissions] overrides unavailable, using code defaults', err);
      setOverrides([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profile) {
      setOverrides([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
  }, [profile, refresh]);

  const isGranted = useCallback((role: UserRole, permission: string) => {
    const ov = overrides.find((o) => o.role === role && o.permission === permission);
    if (ov) return ov.granted;
    return defaultGranted(role, permission);
  }, [overrides]);

  const isOverridden = useCallback((role: UserRole, permission: string) => {
    return overrides.some((o) => o.role === role && o.permission === permission);
  }, [overrides]);

  const hasPermission = useCallback((permission: string) => {
    if (!profile) return false;
    return isGranted(profile.role, permission);
  }, [profile, isGranted]);

  const rolePermissions = useCallback((role: UserRole) => {
    const merged = new Set<string>(ROLE_PERMISSIONS[role] ?? []);
    for (const o of overrides) {
      if (o.role !== role) continue;
      if (o.granted) merged.add(o.permission);
      else merged.delete(o.permission);
    }
    return [...merged];
  }, [overrides]);

  const setPermission = useCallback(async (role: UserRole, permission: string, granted: boolean) => {
    // Optimistic update; the RPC is the source of truth.
    setOverrides((prev) => [
      ...prev.filter((o) => !(o.role === role && o.permission === permission)),
      { role, permission, granted },
    ]);
    const { error } = await supabase.rpc('upsert_role_permission', {
      p_role: role,
      p_permission: permission,
      p_granted: granted,
    });
    if (error) {
      await refresh();
      return { error: error.message };
    }
    return {};
  }, [refresh]);

  const resetPermission = useCallback(async (role: UserRole, permission: string) => {
    setOverrides((prev) => prev.filter((o) => !(o.role === role && o.permission === permission)));
    const { error } = await supabase.rpc('delete_role_permission', {
      p_role: role,
      p_permission: permission,
    });
    if (error) {
      await refresh();
      return { error: error.message };
    }
    return {};
  }, [refresh]);

  const value = useMemo<PermissionsContextValue>(() => ({
    loading,
    hasPermission,
    rolePermissions,
    isGranted,
    isOverridden,
    setPermission,
    resetPermission,
    refresh,
  }), [loading, hasPermission, rolePermissions, isGranted, isOverridden, setPermission, resetPermission, refresh]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionProvider');
  return ctx;
}
