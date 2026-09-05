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
export default function LoadingIndicator({ size = 64, color = '#078A8C', label }: LoadingIndicatorProps) {
  const dotSize = size * 0.25;
  const containerSize = size * 0.85;
  const halfContainer = containerSize / 2;
  const offset = -dotSize / 2;

  return (
    <div className="flex flex-col items-center justify-center gap-3" style={{ background: 'transparent' }}>
      <div
        className="loading-dots-container"
        style={{
          width: containerSize,
          height: containerSize,
          position: 'relative',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          boxShadow: 'none',
        }}
      >


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
              backgroundColor: color,
              position: 'absolute',
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
            opacity: 1;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
        }


      `}</style>
    </div>
  );
}
