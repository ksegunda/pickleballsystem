// Custom illustration built from plain SVG primitives (no traced paths) —
// echoes the actual logo's own visual vocabulary (paddle, textured face,
// ball, partial ring, motion lines) at hero scale, rather than an
// unrelated abstract graphic.
export function HeroIllustration() {
  return (
    <div className="motion-safe:animate-float">
      <svg viewBox="0 0 480 480" className="mx-auto w-full max-w-md" aria-hidden="true">
        <defs>
          <pattern id="paddleDots" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="2.4" fill="rgba(255,255,255,0.4)" />
          </pattern>
          <radialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#B4E1EB" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#B4E1EB" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="240" cy="240" r="220" fill="url(#heroGlow)" />

        {/* Partial rings, echoing the logo mark's ring accent */}
        <circle
          cx="240" cy="240" r="192" fill="none"
          stroke="#F9E8A2" strokeWidth="16" strokeLinecap="round"
          strokeDasharray="150 650" transform="rotate(-50 240 240)"
        />
        <circle
          cx="240" cy="240" r="192" fill="none"
          stroke="#95BDD7" strokeWidth="16" strokeLinecap="round"
          strokeDasharray="130 650" transform="rotate(145 240 240)"
        />

        {/* Dashed court line */}
        <ellipse
          cx="235" cy="345" rx="150" ry="24" fill="none"
          stroke="#78A4CB" strokeOpacity="0.4" strokeWidth="3" strokeDasharray="7 9"
        />

        {/* Motion lines trailing the ball */}
        <g stroke="#95BDD7" strokeWidth="7" strokeLinecap="round" opacity="0.65">
          <line x1="55" y1="185" x2="128" y2="185" />
          <line x1="42" y1="210" x2="115" y2="210" />
          <line x1="60" y1="235" x2="122" y2="235" />
        </g>

        {/* Paddle handle */}
        <rect
          x="224" y="298" width="32" height="112" rx="16"
          fill="#1E3A5F" transform="rotate(30 240 300)"
        />

        {/* Paddle head */}
        <path
          d="M178 152 Q166 258 238 302 Q322 250 300 148 Q288 88 238 84 Q188 88 178 152 Z"
          fill="#78A4CB"
        />
        <path
          d="M178 152 Q166 258 238 302 Q322 250 300 148 Q288 88 238 84 Q188 88 178 152 Z"
          fill="url(#paddleDots)"
        />

        {/* Ball */}
        <circle cx="348" cy="196" r="44" fill="#F9E8A2" />
        <circle cx="332" cy="180" r="5.5" fill="#B8912A" opacity="0.55" />
        <circle cx="360" cy="188" r="4.5" fill="#B8912A" opacity="0.55" />
        <circle cx="342" cy="210" r="5" fill="#B8912A" opacity="0.55" />
        <circle cx="365" cy="212" r="4" fill="#B8912A" opacity="0.55" />
        <circle cx="352" cy="168" r="3.5" fill="#B8912A" opacity="0.55" />
      </svg>
    </div>
  );
}
