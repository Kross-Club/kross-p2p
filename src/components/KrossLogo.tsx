export function KrossIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
      <rect width="500" height="500" fill="#020617"/>
      <defs>
        <linearGradient id="kg" gradientUnits="userSpaceOnUse" x1="100" y1="100" x2="400" y2="400">
          <stop offset="0%" stopColor="#38BDF8"/>
          <stop offset="100%" stopColor="#A5E9FF"/>
        </linearGradient>
      </defs>
      {/* Hollow K — gradient stroke with background-colored inner stroke */}
      <g strokeLinecap="square" strokeLinejoin="miter" fill="none">
        <g stroke="url(#kg)" strokeWidth="38">
          <path d="M145 125 L145 300"/>
          <path d="M365 125 L150 380"/>
          <path d="M260 275 L365 378"/>
        </g>
        <g stroke="#020617" strokeWidth="18">
          <path d="M145 125 L145 300"/>
          <path d="M365 125 L150 380"/>
          <path d="M260 275 L365 378"/>
        </g>
      </g>
    </svg>
  )
}
