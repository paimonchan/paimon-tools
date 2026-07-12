/**
 * BrandMark — a custom glyph instead of a stock icon. Stylized `{ }` braces
 * (the universal sign for "data") on a honey gradient tile. The braces are
 * drawn as SVG paths so the corners stay crisp at any size.
 */
export default function BrandMark({ size = 36, className = '' }) {
  return (
    <div
      className={`accent-gradient relative flex items-center justify-center rounded-xl shadow-inner ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" className="text-ink-950">
        {/* Curly braces, weight tuned to read as a single mark */}
        <path
          d="M9 3.5c-2.5 0-3.5 1-3.5 3.2 0 1.7-.4 2.8-1.5 3.3-.4.2-.4.8 0 1 1.1.5 1.5 1.6 1.5 3.3 0 2.2 1 3.2 3.5 3.2"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15 3.5c2.5 0 3.5 1 3.5 3.2 0 1.7.4 2.8 1.5 3.3.4.2.4.8 0 1-1.1.5-1.5 1.6-1.5 3.3 0 2.2-1 3.2-3.5 3.2"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
