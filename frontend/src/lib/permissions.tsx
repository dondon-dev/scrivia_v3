/**
 * Permissions Provider — adapted for PocketBase.
 * Same public API as the Supabase version.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/lib/auth';
import { pb } from '@/lib/pb';
import { ROLE_PERMISSIONS, type UserRole } from '@/types/auth';

export interface PermissionOverride {
  role: string;
  permission: string;
  granted: boolean;
}

export interface PermissionsContextValue {
  loading: boolean;
  hasPermission: (permission: string) => boolean;
  rolePermissions: (role: UserRole) => string[];
  isGranted: (role: UserRole, permission: string) => boolean;
  isOverridden: (role: UserRole, permission: string) => boolean;
  setPermission: (role: UserRole, permission: string, granted: boolean) => Promise<{ error?: string }>;
  resetPermission: (role: UserRole, permission: string) => Promise<{ error?: string }>;
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
      const data = await pb.send('/api/permissions', { method: 'GET' });
      setOverrides(Array.isArray(data) ? (data as PermissionOverride[]) : []);
    } catch {
      setOverrides([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profile) { setOverrides([]); setLoading(false); return; }
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
      if (o.granted) merged.add(o.permission); else merged.delete(o.permission);
    }
    return [...merged];
  }, [overrides]);

  const setPermission = useCallback(async (role: UserRole, permission: string, granted: boolean) => {
    setOverrides((prev) => [
      ...prev.filter((o) => !(o.role === role && o.permission === permission)),
      { role, permission, granted },
    ]);
    try {
      await pb.send('/api/permissions/upsert', {
        method: 'POST',
        body: { p_role: role, p_permission: permission, p_granted: granted },
      });
    } catch {
      await refresh();
      return { error: 'Failed to update permission' };
    }
    return {};
  }, [refresh]);

  const resetPermission = useCallback(async (role: UserRole, permission: string) => {
    setOverrides((prev) => prev.filter((o) => !(o.role === role && o.permission === permission)));
    try {
      await pb.send('/api/permissions/delete', {
        method: 'POST',
        body: { p_role: role, p_permission: permission },
      });
    } catch {
      await refresh();
      return { error: 'Failed to reset permission' };
    }
    return {};
  }, [refresh]);

  const value = useMemo<PermissionsContextValue>(() => ({
    loading, hasPermission, rolePermissions, isGranted, isOverridden,
    setPermission, resetPermission, refresh,
  }), [loading, hasPermission, rolePermissions, isGranted, isOverridden, setPermission, resetPermission, refresh]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionProvider');
  return ctx;
}
