interface LoadingIndicatorProps {
  size?: number;
  color?: string;
  label?: string;
}

// Pre-computed positions for 4 dots (0°, 90°, 180°, 270°)
const DOT_POSITIONS = [
  { x: 0, y: -1 },    // top
  { x: 1, y: 0 },     // right
  { x: 0, y: 1 },     // bottom
  { x: -1, y: 0 },    // left
];

export default function LoadingIndicator({ size = 48, color = '#078A8C', label }: LoadingIndicatorProps) {
  const dotSize = size * 0.16;
  const radius = size * 0.34;

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Soft bloom glow */}
        <div
          className="absolute inset-0 rounded-full opacity-15"
          style={{
            backgroundColor: color,
            filter: `blur(${size * 0.3}px)`,
            animation: 'bloomPulse 1.4s ease-in-out infinite',
          }}
        />

        {/* Four dots */}
        {DOT_POSITIONS.map((pos, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: dotSize,
              height: dotSize,
              backgroundColor: color,
              top: '50%',
              left: '50%',
              marginTop: -dotSize / 2,
              marginLeft: -dotSize / 2,
              boxShadow: `0 0 ${dotSize * 0.8}px ${color}40`,
              animation: `dotRadial 1.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite`,
              animationDelay: `${i * 0.15}s`,
              ['--tx' as string]: `${pos.x * radius}px`,
              ['--ty' as string]: `${pos.y * radius}px`,
            }}
          />
        ))}
      </div>

      {label && (
        <p className="text-sm font-medium tracking-wide" style={{ color }}>
          {label}
        </p>
      )}

      <style>{`
        @keyframes dotRadial {
          0%, 100% {
            transform: translate(0, 0) scale(0.35);
            opacity: 0.25;
          }
          50% {
            transform: translate(var(--tx), var(--ty)) scale(1);
            opacity: 1;
          }
        }
        @keyframes bloomPulse {
          0%, 100% {
            transform: scale(0.6);
            opacity: 0.08;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.18;
          }
        }
      `}</style>
    </div>
  );
}
