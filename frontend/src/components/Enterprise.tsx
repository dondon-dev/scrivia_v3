import { motion } from 'framer-motion';
import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, ArrowUpRight, Sparkles } from 'lucide-react';
import { useCountUpValue, fadeUpItem } from '@/lib/motion';

// ── Sparkline ───────────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  id?: string;
}

/** Pure-SVG mini sparkline with a progressive draw animation. */
export function Sparkline({ data, width = 64, height = 22, stroke = 'url(#nexoraSpark)', id }: SparklineProps) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - 3 - ((v - min) / range) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const gradId = `nexoraSpark-${id ?? Math.round(Math.random() * 1e6)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00C896" />
          <stop offset="100%" stopColor="#0F4CFF" />
        </linearGradient>
      </defs>
      <motion.polyline
        points={pts.join(' ')}
        fill="none"
        stroke={gradId}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
    </svg>
  );
}

// ── KPI Card (premium) ──────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  sublabel?: string;
  trend?: { value: string; direction: 'up' | 'down' | 'neutral' };
  accent?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate' | 'cyan';
  onClick?: () => void;
  delay?: number;
  /** Raw numeric value — when provided the number animates (count-up). */
  raw?: number;
  /** Formatter for the animated value (defaults to locale string). */
  format?: (n: number) => string;
  /** Mini trend series rendered as a sparkline. */
  spark?: number[];
  /** Extra detail revealed on hover (analytics preview). */
  hint?: string;
}

const ACCENT_MAP: Record<NonNullable<KpiCardProps['accent']>, { iconBg: string; iconColor: string; bar: string; spark: string }> = {
  blue: { iconBg: 'bg-deped-100 dark:bg-deped-900/40', iconColor: 'text-deped-700 dark:text-deped-300', bar: 'from-nexora-400 to-nexora-600', spark: '#0F4CFF' },
  emerald: { iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconColor: 'text-emerald-700 dark:text-emerald-300', bar: 'from-aurora-400 to-aurora-600', spark: '#00C896' },
  amber: { iconBg: 'bg-amber-100 dark:bg-amber-900/40', iconColor: 'text-amber-700 dark:text-amber-300', bar: 'from-amber-400 to-amber-600', spark: '#F59E0B' },
  rose: { iconBg: 'bg-rose-100 dark:bg-rose-900/40', iconColor: 'text-rose-700 dark:text-rose-300', bar: 'from-rose-400 to-rose-600', spark: '#F43F5E' },
  slate: { iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-700 dark:text-slate-300', bar: 'from-slate-400 to-slate-600', spark: '#64748B' },
  cyan: { iconBg: 'bg-cyan-100 dark:bg-cyan-900/40', iconColor: 'text-cyan-700 dark:text-cyan-300', bar: 'from-cyan-400 to-cyan-600', spark: '#06B6D4' },
};

export function KpiCard({
  label, value, icon: Icon, sublabel, trend, accent = 'blue', onClick, delay = 0,
  raw, format, spark, hint,
}: KpiCardProps) {
  const colors = ACCENT_MAP[accent];
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : null;
  const count = raw !== undefined ? useCountUpValue(raw, 900) : null;
  const display = count !== null ? (format ? format(count) : Math.round(count).toLocaleString()) : value;

  return (
    <motion.div
      variants={fadeUpItem}
      custom={delay}
      whileHover={onClick ? { y: -6 } : { y: -3 }}
      onClick={onClick}
      className={`nexora-card nexora-card-hover p-3 group relative overflow-hidden ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* hover glow wash */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br from-nexora-500/0 to-nexora-500/10 dark:from-nexora-500/0 dark:to-nexora-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="flex items-start justify-between gap-3 relative">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-0.5 tabular truncate leading-tight">{display}</p>
          {sublabel && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sublabel}</p>}
        </div>
        <div className={`w-8 h-8 rounded-lg ${colors.iconBg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-4 h-4 ${colors.iconColor}`} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 relative">
        <div className="flex items-center gap-2 min-w-0">
          {trend && TrendIcon && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              trend.direction === 'up'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                : trend.direction === 'down'
                  ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              <TrendIcon className="w-3 h-3" />
              {trend.value}
            </span>
          )}
          {hint && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {hint}
            </p>
          )}
        </div>
        {spark && spark.length > 1 && (
          <Sparkline data={spark} stroke={colors.spark} id={label.replace(/\s+/g, '')} />
        )}
      </div>
    </motion.div>
  );
}

// ── Hero Header (Executive Command Center) ──────────────────────────────────

export interface HeroChip {
  icon: LucideIcon;
  label: string;
}

export interface HeroAction {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  primary?: boolean;
}

interface HeroHeaderProps {
  greeting: string;
  /** Secondary line under the greeting, e.g. current payroll cycle. */
  title?: string;
  date?: string;
  chips?: HeroChip[];
  actions?: HeroAction[];
  /** Right-side highlight metric. */
  metric?: { label: string; value: string };
  /** Small live badge next to the greeting (e.g. cycle status). */
  liveLabel?: string;
  liveTone?: 'green' | 'amber' | 'blue';
  /** Scope control pinned to the right of the date/cycle row, e.g. the
   *  payroll GroupFilter dropdown. */
  filter?: ReactNode;
}

const LIVE_TONES = {
  green: 'bg-aurora-500',
  amber: 'bg-amber-400',
  blue: 'bg-nexora-400',
};

export function HeroHeader({ greeting, title, date, chips, actions, metric, liveLabel, liveTone = 'green', filter }: HeroHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="nexora-hero rounded-3xl text-white shadow-nexora-lg"
    >
      {/* Drifting aurora blobs — clipped to the rounded card in their own layer
          so the hero itself can stay overflow-visible for dropdown menus. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div className="hero-blob w-48 h-48 -top-16 -right-10 bg-aurora-500/20" style={{ animationDelay: '0s' }} />
        <div className="hero-blob w-40 h-40 -bottom-20 -left-8 bg-nexora-400/20" style={{ animationDelay: '-3s' }} />
      </div>

      <div className="relative p-3 sm:p-4">
        {/* Top row — date + cycle badge on the left, the optional scope control
            (e.g. the payroll GroupFilter) pinned to the right of the same line. */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {date && <p className="text-[13px] font-medium text-white/70">{date}</p>}
            {liveLabel && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 ring-1 ring-white/20 text-[11px] font-semibold uppercase tracking-wider">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ripple-ping absolute inline-flex h-full w-full rounded-full ${LIVE_TONES[liveTone]}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${LIVE_TONES[liveTone]}`} />
                </span>
                {liveLabel}
              </span>
            )}
          </div>
          {filter}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold mt-1.5 leading-tight tracking-tight">
              {greeting}
              <span className="ml-2 inline-flex items-center gap-1 align-middle">
                <Sparkles className="w-5 h-5 text-aurora-300" />
              </span>
            </h1>
            {title && <p className="text-[12px] text-white/70 mt-1 max-w-2xl leading-snug">{title}</p>}
            {chips && chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {chips.map((c, i) => {
                  const ChipIcon = c.icon;
                  return (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 ring-1 ring-white/15 text-[11px] font-medium backdrop-blur-sm">
                      <ChipIcon className="w-3.5 h-3.5 text-aurora-200" />
                      {c.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {metric && (
              <div className="hidden md:block text-right mr-2">
                <p className="text-[11px] uppercase tracking-wider text-white/60">{metric.label}</p>
                <p className="text-xl font-bold tabular mt-0.5">{metric.value}</p>
              </div>
            )}
            {actions?.map((a, i) => {
              const A = a.icon;
              return (
                <button
                  key={i}
                  onClick={a.onClick}
                  className={a.primary ? 'nexora-btn' : 'nexora-btn-secondary'}
                >
                  <A className="w-4 h-4" />
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Quick Action ────────────────────────────────────────────────────────────

interface QuickActionProps {
  label: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  onClick: () => void;
  delay?: number;
}

export function QuickAction({ label, desc, icon: Icon, color, onClick, delay = 0 }: QuickActionProps) {
  return (
    <motion.button
      variants={fadeUpItem}
      custom={delay}
      onClick={onClick}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.98 }}
      className="nexora-card nexora-card-hover p-5 text-left group relative overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-nexora-500 to-aurora-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{label}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{desc}</p>
      <div className="flex items-center gap-1 text-xs text-nexora-600 dark:text-nexora-300 mt-3 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
        Open <ArrowUpRight className="w-3.5 h-3.5" />
      </div>
    </motion.button>
  );
}

// ── Section Header ──────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, icon: Icon, action, className }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-deped-600 dark:text-deped-400" />}
        <h3 className="section-heading text-sm">{title}</h3>
      </div>
      {action}
    </div>
  );
}

// ── Empty State ─────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
        <Icon className="w-7 h-7 text-slate-300 dark:text-slate-600" />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export function LoadingSkeleton({ rows = 3, className }: LoadingSkeletonProps) {
  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
        </div>
      ))}
    </div>
  );
}

// ── Progress Bar ────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  color?: string;
}

export function ProgressBar({ value, max, label, color = 'bg-deped-600' }: ProgressBarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-slate-600 dark:text-slate-300">{label}</span>
          <span className="tabular font-semibold text-slate-700 dark:text-slate-200">{value.toLocaleString()}</span>
        </div>
      )}
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color} transition-colors`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
        />
      </div>
    </div>
  );
}
