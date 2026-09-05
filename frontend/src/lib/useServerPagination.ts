import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, fetchAll } from '@/lib/pb';

interface ServerPageResult<T> {
  rows: T[];
  total: number;
}

interface ServerPaginationFallback<T> {
  collection: string;
  /**
   * Map raw rows read from the collection into the final row type. Useful when
   * the RPC returns joined fields (e.g. employee names) that the fallback must
   * reconstruct client-side. Receives all raw rows (pre-pagination) and the
   * params that would have been sent to the RPC; returns the enriched rows.
   */
  enrich?: (rows: any[], params: Record<string, unknown>) => T[] | Promise<T[]>;
  clientFilter?: (row: T, params: Record<string, unknown>) => boolean;
  sort?: (a: T, b: T) => number;
}

interface UseServerPaginationOptions<T> {
  pageSize?: number;
  debounceMs?: number;
  /**
   * When the RPC endpoint is unavailable (e.g. the custom PocketBase backend
   * routes are not deployed), fall back to reading the full collection and
   * applying the filter/paging on the client so the UI still works.
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
 * The browser only receives `pageSize` rows per page — never the full table.
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
      const { data, error } = await supabase.rpc(rpcName, rpcParams);
      if (cancelled) return;
      if (error) {
        // RPC unavailable — fall back to reading the collection directly.
        if (fallback) {
          try {
            let all = await fetchAll<T>(() => supabase.from(fallback.collection).select('*'));
            if (fallback.enrich) all = await fallback.enrich(all as any[], rpcParams);
            let filtered = all;
            if (fallback.clientFilter) {
              filtered = filtered.filter((row) => fallback.clientFilter!(row, rpcParams));
            }
            const total = filtered.length;
            const start = Math.min(page * pageSize, total);
            let rows = filtered.slice(start, start + pageSize);
            if (fallback.sort) {
              const sorted = [...filtered].sort(fallback.sort);
              rows = sorted.slice(start, start + pageSize);
              filtered = sorted;
            }
            if (filtered.length) setRows(rows as T[]);
            else setRows([]);
            setTotal(total);
          } catch {
            setRows([]);
            setTotal(0);
          }
        } else {
          setRows([]);
          setTotal(0);
        }
      } else if (data) {
        const result = data as ServerPageResult<T>;
        setRows(result.rows ?? []);
        setTotal(result.total ?? 0);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpcName, JSON.stringify(params), page, pageSize, refreshKey]);

  return { rows, total, page, totalPages, setPage, loading, refresh };
}
