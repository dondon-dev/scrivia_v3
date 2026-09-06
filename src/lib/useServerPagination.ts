import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, fetchAll } from '@/lib/pb';

interface ServerPageResult<T> {
  rows: T[];
  data?: T[];
  total: number;
}

interface ServerPaginationFallback<T> {
  collection: string;
  /**
   * Map raw rows read from the collection into the final row type. Useful when
   * the RPC returns joined fields that the fallback must reconstruct
   * client-side. Receives all raw rows (pre-pagination) and the params that
   * would have been sent to the RPC; returns the enriched rows.
   */
  enrich?: (rows: any[], params: Record<string, unknown>) => T[] | Promise<T[]>;
  clientFilter?: (row: T, params: Record<string, unknown>) => boolean;
  sort?: (a: T, b: T) => number;
}

interface UseServerPaginationOptions<T> {
  pageSize?: number;
  debounceMs?: number;
  /**
   * Hardcoded PocketBase collection fallback: when the RPC endpoint is
   * unavailable (or returns the wrong shape), read the collection directly so
   * Employee Records are never lost to a backend mismatch.
   */
  fallback?: ServerPaginationFallback<T>;
}

interface UseServerPaginationResult<T> {
  rows: T[];
  total: number;
  page: number;
  totalPages: number;
  setPage: (p: number) => void;
  loading: boolean;
  refresh: () => void;
}

/**
 * Server-side pagination + search hook.
 * Calls an RPC that returns { rows, total } for the requested page.
 * Falls back to a hardcoded PocketBase collection read when the RPC is
 * unavailable — Employee Records must survive backend mismatches.
 */
export function useServerPagination<T>(
  rpcName: string,
  params: Record<string, unknown>,
  { pageSize = 10, debounceMs = 300, fallback }: UseServerPaginationOptions<T> = {},
): UseServerPaginationResult<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setPage = useCallback((p: number) => {
    setPageState(Math.max(0, Math.min(p, totalPages - 1)));
  }, [totalPages]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Debounce search param changes
  const searchValue = params.p_search as string | undefined;
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPageState(0);
    }, debounceMs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchValue, debounceMs]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const rpcParams = {
        ...params,
        p_page: page,
        p_page_size: pageSize,
        p_count_only: false,
      };
      const applyFallback = async () => {
        if (!fallback) {
          if (!cancelled) { setRows([]); setTotal(0); }
          return;
        }
        try {
          let all = await fetchAll<T>(() => supabase.from(fallback.collection).select('*'));
          if (fallback.enrich) all = await fallback.enrich(all as any[], rpcParams);
          let filtered = all;
          if (fallback.clientFilter) {
            filtered = filtered.filter((row) => fallback.clientFilter!(row, rpcParams));
          }
          if (fallback.sort) filtered = [...filtered].sort(fallback.sort);
          const totalCount = filtered.length;
          const start = Math.min(page * pageSize, totalCount);
          const paged = filtered.slice(start, start + pageSize);
          if (!cancelled) { setRows(paged); setTotal(totalCount); }
        } catch {
          if (!cancelled) { setRows([]); setTotal(0); }
        }
      };
      const { data, error } = await supabase.rpc(rpcName, rpcParams);
      if (cancelled) return;
      if (error) {
        await applyFallback();
      } else if (data) {
        const result = data as ServerPageResult<T>;
        // Accept both { rows, total } (canonical) and { data, total } (Go handler).
        const rpcRows = result.rows ?? result.data ?? [];
        // An empty page with a nonzero fallback available + a suspiciously
        // empty RPC result means the backend didn't understand the params —
        // fall back to the hardcoded collection read instead of showing nothing.
        if (rpcRows.length === 0 && fallback) {
          await applyFallback();
        } else {
          setRows(rpcRows);
          setTotal(result.total ?? 0);
        }
      } else if (fallback) {
        await applyFallback();
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpcName, JSON.stringify(params), page, pageSize, refreshKey]);

  return { rows, total, page, totalPages, setPage, loading, refresh };
}
