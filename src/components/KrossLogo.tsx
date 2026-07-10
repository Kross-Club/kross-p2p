export function KrossIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
      <rect width="500" height="500" rx="110" fill="#060C1A"/>
      <defs>
        <linearGradient id="kg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7DE8FF"/>
          <stop offset="100%" stopColor="#00BFFF"/>
        </linearGradient>
      </defs>
      {/* Left vertical bar */}
      <rect x="118" y="88" width="56" height="324" fill="url(#kg)" rx="6"/>
      {/* Upper diagonal arm */}
      <polygon points="174,88 346,88 260,252 174,252" fill="url(#kg)"/>
      {/* Lower diagonal arm */}
      <polygon points="174,248 260,248 346,412 174,412" fill="url(#kg)"/>
    </svg>
  )
}
