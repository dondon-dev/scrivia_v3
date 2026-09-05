import type { CSSProperties } from 'react';

/**
 * Official SCRIVIA CLOUD™ brand mark — matches the official 512px artwork:
 *   - A bold gradient "S" drawn as a single smooth stroke with round caps
 *   - A white fountain-pen nib overlay centered on the S, with a cyan
 *     breather dot
 *   - Three digital pixels ascending to the northeast
 *   - Turquoise → cyan → blue gradient throughout, with a soft drop shadow
 *
 * `light` renders the dark-background variant (brighter gradient) for navy
 * surfaces like the sidebar and auth headers.
 */
export function ScriviaLogo({
  className = 'w-10 h-10',
  light = false,
  style,
  id,
}: {
  className?: string;
  light?: boolean;
  style?: CSSProperties;
  id?: string;
}) {
  const gid = id ?? 'scrivia-mark';
  // Official artwork gradient: turquoise (#00FFD5) → cyan (#00BFFF) →
  // blue (#0080FF) → deep blue (#0000FF) at 0 / 35 / 70 / 100%.
  const stops = light
    ? ['#2EFFE0', '#3FD6FF', '#6EA8FF']
    : ['#00FFD5', '#00BFFF', '#0080FF', '#0000FF'];
  const offsets = light ? [0, 0.55, 1] : [0, 0.35, 0.7, 1];

  return (
    <svg viewBox="0 0 64 64" className={className} style={style} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          {stops.map((c, i) => (
            <stop key={i} offset={`${offsets[i] * 100}%`} stopColor={c} />
          ))}
        </linearGradient>
        <filter id={`${gid}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.25" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Main S shape (scaled from the official 512px artwork) */}
      <path
        d="M42.5 13.75C36.25 7.5 21.25 7.5 16.25 16.25C11.875 23.75 17.5 30.625 28.125 32.5C40 34.75 44.375 38.125 44.375 43.75C44.375 50.625 37.5 54.375 28.75 54.375C21.875 54.375 16.25 51.875 11.875 47.5"
        stroke={`url(#${gid})`}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${gid}-shadow)`}
      />

      {/* Pen nib overlay — centered on the S */}
      <g transform="translate(32 32)">
        <path d="M0 -5L4.375 0L0 8.125L-4.375 0Z" fill="#FFFFFF" opacity={0.95} />
        <circle cx={0} cy={1.5} r={1} fill={light ? '#3FD6FF' : '#00BFFF'} />
      </g>

      {/* Digital pixels — northeast */}
      <rect x={46.25} y={14.375} width={2.25} height={2.25} rx={0.375} fill={light ? '#2EFFE0' : '#00FFD5'} />
      <rect x={49.375} y={11.875} width={1.75} height={1.75} rx={0.25} fill={light ? '#3FD6FF' : '#00BFFF'} />
      <rect x={51.875} y={9.375} width={1.25} height={1.25} rx={0.25} fill={light ? '#6EA8FF' : '#0080FF'} />
    </svg>
  );
}

/**
 * Official SCRIVIA CLOUD™ wordmark lockup:
 *   SCRIVIA™ (serif) / CLOUD (gradient text flanked by colored rules) /
 *   "SMART PAYROLL. SECURE FUTURE."
 */
export function ScriviaWordmark({
  light = false,
  tagline = true,
  align = 'left',
  size = 'md',
  className = '',
}: {
  light?: boolean;
  tagline?: boolean;
  align?: 'left' | 'center';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const wordColor = light ? 'text-white' : 'text-[#102A43]';
  const tmColor = light ? 'text-[#3FD6FF]' : 'text-[#0080FF]';
  const cloudGrad = light ? 'from-[#2EFFE0] to-[#6EA8FF]' : 'from-[#00BFFF] to-[#0080FF]';
  const ruleL = light ? 'bg-[#2EFFE0]' : 'bg-[#00BFFF]';
  const ruleR = light ? 'bg-[#6EA8FF]' : 'bg-[#0080FF]';
  const tagColor = light ? 'text-slate-300/90' : 'text-slate-500';

  const t = size === 'sm'
    ? { word: 'text-[15px]', cloud: 'text-[10px] tracking-[0.28em]', rule: 'w-5', tag: 'text-[9px]' }
    : { word: 'text-[20px]', cloud: 'text-[12px] tracking-[0.3em]', rule: 'w-7', tag: 'text-[10px]' };

  return (
    <div className={`leading-none ${align === 'center' ? 'text-center' : ''} ${className}`}>
      <p className={`font-serif font-bold tracking-[0.12em] ${t.word} ${wordColor}`}>
        SCRIVIA
        <sup className={`text-[0.5em] align-super ml-1 ${tmColor}`}>™</sup>
      </p>
      <p className={`mt-1.5 flex items-center gap-2 ${align === 'center' ? 'justify-center' : ''}`}>
        <span className={`h-px ${t.rule} ${ruleL}`} />
        <span
          className={`font-display font-bold uppercase ${t.cloud} bg-gradient-to-r ${cloudGrad} bg-clip-text text-transparent`}
        >
          Cloud
        </span>
        <span className={`h-px ${t.rule} ${ruleR}`} />
      </p>
      {tagline && (
        <p className={`mt-1.5 uppercase ${t.tag} tracking-[0.14em] ${tagColor}`}>
          Smart Payroll. Secure Future.
        </p>
      )}
    </div>
  );
}
