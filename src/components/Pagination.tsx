import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';

const DEFAULT_PAGE_SIZE = 10;

export function usePagination<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE, resetKey?: unknown) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => { setPage(0); }, [resetKey]);
  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [totalPages, page]);

  const pagedItems = useMemo(
    () => items.slice(page * pageSize, (page + 1) * pageSize),
    [items, page, pageSize],
  );

  return { page, setPage, totalPages, pagedItems, total: items.length, pageSize };
}

interface PaginationProps {
  pagination?: {
    page: number;
    setPage: (page: number) => void;
    totalPages: number;
    total: number;
    pageSize?: number;
  };
  page?: number;
  totalPages?: number;
  total?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  label?: string;
}

export function Pagination(props: PaginationProps) {
  const page = props.pagination ? props.pagination.page : (props.page ?? 0);
  const totalPages = props.pagination ? props.pagination.totalPages : (props.totalPages ?? 1);
  const total = props.pagination ? props.pagination.total : (props.total ?? 0);
  const pageSize = props.pagination ? (props.pagination.pageSize ?? DEFAULT_PAGE_SIZE) : (props.pageSize ?? DEFAULT_PAGE_SIZE);
  const onPageChange = props.pagination ? props.pagination.setPage : (props.onPageChange ?? (() => {}));
  const label = props.label ?? 'records';

  if (total === 0) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  const btn = (icon: ReactNode, labelText: string, onClick: () => void, disabled: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={labelText}
      title={labelText}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex-wrap text-xs">
      <p className="text-slate-500 dark:text-slate-400">
        Showing <span className="font-medium text-slate-700 dark:text-slate-200">{start}</span>–
        <span className="font-medium text-slate-700 dark:text-slate-200">{end}</span> of{' '}
        <span className="font-medium text-slate-700 dark:text-slate-200">{(total ?? 0).toLocaleString()}</span> {label}
      </p>
      <div className="flex items-center gap-2">
        {btn(<ChevronFirst className="w-4 h-4" />, 'First page', () => onPageChange(0), page === 0)}
        {btn(<ChevronLeft className="w-4 h-4" />, 'Previous page', () => onPageChange(Math.max(0, page - 1)), page === 0)}
        <span className="text-slate-600 dark:text-slate-300 px-2">
          Page <span className="font-semibold text-slate-800 dark:text-slate-100">{page + 1}</span> of{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-100">{(totalPages ?? 1).toLocaleString()}</span>
        </span>
        {btn(<ChevronRight className="w-4 h-4" />, 'Next page', () => onPageChange(Math.min(totalPages - 1, page + 1)), page >= totalPages - 1)}
        {btn(<ChevronLast className="w-4 h-4" />, 'Last page', () => onPageChange(totalPages - 1), page >= totalPages - 1)}
      </div>
    </div>
  );
}
