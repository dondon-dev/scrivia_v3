import type { CSSProperties } from 'react';

interface LoadingIndicatorProps {
  size?: number;
  color?: string;
  label?: string;
}

/**
 * Border-Box Morphing Loader
 *
 * Three outlined boxes (one long bar + two squares) that fold/unfold around a
 * 112×112 grid, creating the classic "bouncing blocks" loading animation.
 * Converted from the original Stylus design to plain CSS.
 *
 *  - duration: 4s
 *  - timing: ease-in-out
 *  - iteration: infinite
 *
 * The whole 112px design is scaled to `size`, and the border colour is driven
 * by the `color` prop so it stays theme-adaptive.
 */
export default function LoadingIndicator({ size = 64, color = '#078A8C', label }: LoadingIndicatorProps) {
  const DESIGN = 112;
  const scale = size / DESIGN;

  return (
    <div
      className="loading-morph-wrapper"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: 'transparent',
      }}
    >
      {/* Layout box sized to `size`; inner design is 112px scaled to fit. */}
      <div className="ld-morph-outer" style={{ width: size, height: size, position: 'relative' }} aria-hidden="true">
        <div
          className="ld-morph"
          style={{ transform: `scale(${scale})`, '--ld-color': color } as CSSProperties}
        >
          <div className="ld-morph-box1" />
          <div className="ld-morph-box2" />
          <div className="ld-morph-box3" />
        </div>
      </div>

      {label && (
        <span
          style={{
            fontSize: Math.max(9, size * 0.16),
            fontWeight: 600,
            letterSpacing: '0.02em',
            color,
            lineHeight: 1,
          }}
        >
          {label}
        </span>
      )}

      <style>{`
        .ld-morph {
          --duration: 4s;
          --ld-color: #078A8C;
          width: 112px;
          height: 112px;
          position: absolute;
          top: 0;
          left: 0;
          transform-origin: 0 0;
        }

        .ld-morph-box1,
        .ld-morph-box2,
        .ld-morph-box3 {
          border: 16px solid var(--ld-color);
          box-sizing: border-box;
          position: absolute;
          display: block;
        }

        .ld-morph-box1 {
          width: 112px;
          height: 48px;
          margin-top: 64px;
          margin-left: 0px;
          animation: ld-anime1 var(--duration) ease-in-out infinite;
        }

        .ld-morph-box2 {
          width: 48px;
          height: 48px;
          margin-top: 0px;
          margin-left: 0px;
          animation: ld-anime2 var(--duration) ease-in-out infinite;
        }

        .ld-morph-box3 {
          width: 48px;
          height: 48px;
          margin-top: 0px;
          margin-left: 64px;
          animation: ld-anime3 var(--duration) ease-in-out infinite;
        }

        @keyframes ld-anime1 {
          0%    { width: 112px; height: 48px;  margin-top: 64px; margin-left: 0px; }
          12.5% { width: 48px;  height: 48px;  margin-top: 64px; margin-left: 0px; }
          25%   { width: 48px;  height: 48px;  margin-top: 64px; margin-left: 0px; }
          37.5% { width: 48px;  height: 48px;  margin-top: 64px; margin-left: 0px; }
          50%   { width: 48px;  height: 48px;  margin-top: 64px; margin-left: 0px; }
          62.5% { width: 48px;  height: 48px;  margin-top: 64px; margin-left: 0px; }
          75%   { width: 48px;  height: 112px; margin-top: 0px;  margin-left: 0px; }
          87.5% { width: 48px;  height: 48px;  margin-top: 0px;  margin-left: 0px; }
          100%  { width: 48px;  height: 48px;  margin-top: 0px;  margin-left: 0px; }
        }

        @keyframes ld-anime2 {
          0%    { width: 48px;  height: 48px; margin-top: 0px; margin-left: 0px; }
          12.5% { width: 48px;  height: 48px; margin-top: 0px; margin-left: 0px; }
          25%   { width: 48px;  height: 48px; margin-top: 0px; margin-left: 0px; }
          37.5% { width: 48px;  height: 48px; margin-top: 0px; margin-left: 0px; }
          50%   { width: 112px; height: 48px; margin-top: 0px; margin-left: 0px; }
          62.5% { width: 48px;  height: 48px; margin-top: 0px; margin-left: 64px; }
          75%   { width: 48px;  height: 48px; margin-top: 0px; margin-left: 64px; }
          87.5% { width: 48px;  height: 48px; margin-top: 0px; margin-left: 64px; }
          100%  { width: 48px;  height: 48px; margin-top: 0px; margin-left: 64px; }
        }

        @keyframes ld-anime3 {
          0%    { width: 48px;  height: 48px;  margin-top: 0px;  margin-left: 64px; }
          12.5% { width: 48px;  height: 48px;  margin-top: 0px;  margin-left: 64px; }
          25%   { width: 48px;  height: 112px; margin-top: 0px;  margin-left: 64px; }
          37.5% { width: 48px;  height: 48px;  margin-top: 64px; margin-left: 64px; }
          50%   { width: 48px;  height: 48px;  margin-top: 64px; margin-left: 64px; }
          62.5% { width: 48px;  height: 48px;  margin-top: 64px; margin-left: 64px; }
          75%   { width: 48px;  height: 48px;  margin-top: 64px; margin-left: 64px; }
          87.5% { width: 48px;  height: 48px;  margin-top: 64px; margin-left: 64px; }
          100%  { width: 112px; height: 48px;  margin-top: 64px; margin-left: 0px; }
        }
      `}</style>
    </div>
  );
}