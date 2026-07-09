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
      <rect x="110" y="90" width="52" height="320" fill="url(#kg)" rx="4"/>
      <polygon points="162,250 162,90 360,90 285,250" fill="url(#kg)"/>
      <polygon points="162,250 162,410 360,410 285,250" fill="url(#kg)"/>
      <polygon points="175,112 310,112 250,240 175,240" fill="#060C1A"/>
      <polygon points="175,260 250,260 310,388 175,388" fill="#060C1A"/>
    </svg>
  )
}
