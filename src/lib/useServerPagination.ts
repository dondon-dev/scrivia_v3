import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface ServerPageResult<T> {
  rows: T[];
  total: number;
}

interface UseServerPaginationOptions {
  pageSize?: number;
  debounceMs?: number;
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
  { pageSize = 10, debounceMs = 300 }: UseServerPaginationOptions = {},
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
        setRows([]);
        setTotal(0);
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
