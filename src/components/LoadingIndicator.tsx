interface LoadingIndicatorProps {
  size?: number;
  color?: string;
  label?: string;
}

/**
 * Premium Rotating Dots Loader
 *
 * Four rounded dots at corners of a square that rotates and shrinks/expands.
 * Inspired by the CSS rotating dots pattern, adapted for fintech/platform style.
 * Uses teal #078A8C as default brand color with subtle bloom effects.
 */
export default function LoadingIndicator({ size = 48, color = '#078A8C', label }: LoadingIndicatorProps) {
  const dotSize = size * 0.22;
  const containerSize = size * 0.85;
  const halfContainer = containerSize / 2;
  const offset = -dotSize / 2;

  // Four colors matching the article's vibrant palette, muted for fintech
  const dotColors = [
    color,                    // primary teal
    `${color}cc`,             // slightly transparent
    `${color}99`,             // more transparent
    `${color}70`,             // lightest
  ];

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className="loading-dots-container"
        style={{
          width: containerSize,
          height: containerSize,
          position: 'relative',
        }}
      >
        {/* Subtle bloom glow behind the loader */}
        <div
          className="absolute rounded-full"
          style={{
            width: containerSize * 1.6,
            height: containerSize * 1.6,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
            animation: 'bloomPulse 2s ease-in-out infinite',
          }}
        />

        {/* Four dots at corners */}
        {[
          { left: offset, top: offset },           // top-left
          { right: offset, top: offset },           // top-right
          { left: offset, bottom: offset },         // bottom-left
          { right: offset, bottom: offset },        // bottom-right
        ].map((pos, i) => (
          <div
            key={i}
            className="loading-dot"
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: '50%',
              backgroundColor: dotColors[i],
              position: 'absolute',
              boxShadow: `0 0 ${dotSize}px ${color}30`,
              animation: `dotFade 1.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite`,
              animationDelay: `${i * 0.15}s`,
              ...pos,
            }}
          />
        ))}
      </div>

      {label && (
        <p
          className="text-sm font-medium tracking-wide"
          style={{ color }}
        >
          {label}
        </p>
      )}

      <style>{`
        .loading-dots-container {
          animation: rotateAndShrink 1.25s ease-in-out infinite;
        }

        @keyframes rotateAndShrink {
          0% {
            transform: rotate(0deg) scale(1);
          }
          50% {
            transform: rotate(180deg) scale(0.7);
          }
          100% {
            transform: rotate(360deg) scale(1);
          }
        }

        @keyframes dotFade {
          0%, 100% {
            opacity: 0.3;
            transform: scale(0.7);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
        }

        @keyframes bloomPulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(0.8);
            opacity: 0.4;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}
