export function Star({ size = 44, glow = true, className = '' }: { size?: number; glow?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`${glow ? 'star-glow' : ''} ${className}`} aria-label="Flicky">
      <path
        d="M50 2 C53.5 33 67 46.5 98 50 C67 53.5 53.5 67 50 98 C46.5 67 33 53.5 2 50 C33 46.5 46.5 33 50 2Z"
        fill="#fff"
      />
    </svg>
  );
}
