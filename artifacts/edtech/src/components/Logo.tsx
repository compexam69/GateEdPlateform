import { useId } from "react";

interface LogoProps {
  /** Diameter in pixels */
  size?: number;
  className?: string;
}

/**
 * One Step Coaching Classes — SVG badge logo.
 *
 * Colors adapt to the active CSS theme via HSL custom properties:
 *   --secondary  → teal ring & book pages
 *   --warning    → sun rays & gold stripe
 *   --card       → inner circle background
 *   --card-foreground → ring text, book outlines, stars
 *
 * IDs are scoped per-instance via useId() so multiple logos on the
 * same page (sidebar + mobile drawer) never conflict.
 */
export function Logo({ size = 40, className = "" }: LogoProps) {
  const uid = useId();
  const topId  = `${uid}-top`;
  const botId  = `${uid}-bot`;

  // Sun ray endpoints (10 rays, starting from 12-o'clock)
  const rays = Array.from({ length: 10 }, (_, i) => {
    const angle = (i * 36 - 90) * (Math.PI / 180);
    return {
      x1: 100 + Math.cos(angle) * 10,
      y1:  79 + Math.sin(angle) * 10,
      x2: 100 + Math.cos(angle) * 22,
      y2:  79 + Math.sin(angle) * 22,
    };
  });

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      aria-label="One Step Coaching Classes"
      role="img"
    >
      <defs>
        {/* Counter-clockwise arc → text along the TOP of the ring */}
        <path id={topId} d="M 20,100 A 80,80 0 0,0 180,100" fill="none" />
        {/* Clockwise arc → text along the BOTTOM of the ring */}
        <path id={botId} d="M 20,100 A 80,80 0 0,1 180,100" fill="none" />
      </defs>

      {/* ── Outer teal ring ─────────────────────────────────────── */}
      <circle cx="100" cy="100" r="97" fill="hsl(var(--secondary))" />

      {/* ── Inner background circle ──────────────────────────────── */}
      <circle cx="100" cy="100" r="67" fill="hsl(var(--card))" />

      {/* ── Ring text: ONE STEP COACHING (top arc = clockwise through top) ── */}
      <text
        fontWeight="900"
        fontSize="14.5"
        letterSpacing="0.6"
        fill="hsl(var(--card-foreground))"
      >
        <textPath href={`#${botId}`} startOffset="50%" textAnchor="middle">
          ONE STEP COACHING
        </textPath>
      </text>

      {/* ── Ring text: CLASSES (bottom arc = counter-clockwise through bottom) ── */}
      <text
        fontWeight="900"
        fontSize="15.5"
        letterSpacing="2.5"
        fill="hsl(var(--card-foreground))"
      >
        <textPath href={`#${topId}`} startOffset="50%" textAnchor="middle">
          CLASSES
        </textPath>
      </text>

      {/* ── Left 4-pointed sparkle star ─────────────────────────── */}
      <path
        d="M13,100 L15.7,97.3 L21,100 L15.7,102.7 L13,108 L10.3,102.7 L5,100 L10.3,97.3Z"
        fill="hsl(var(--card-foreground))"
      />

      {/* ── Right 4-pointed sparkle star ────────────────────────── */}
      <path
        d="M187,100 L189.7,97.3 L195,100 L189.7,102.7 L187,108 L184.3,102.7 L179,100 L184.3,97.3Z"
        fill="hsl(var(--card-foreground))"
      />

      {/* ══ Open Book ════════════════════════════════════════════════ */}

      {/* Left page */}
      <path
        d="M100,95 C80,87 54,91 47,107 C54,117 80,119 100,115Z"
        fill="hsl(var(--secondary))"
        stroke="hsl(var(--card-foreground))"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Right page */}
      <path
        d="M100,95 C120,87 146,91 153,107 C146,117 120,119 100,115Z"
        fill="hsl(var(--secondary))"
        stroke="hsl(var(--card-foreground))"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Gold accent stripe — left page */}
      <path
        d="M100,98 C82,91 57,95 48,108"
        stroke="hsl(var(--warning))"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Gold accent stripe — right page */}
      <path
        d="M100,98 C118,91 143,95 152,108"
        stroke="hsl(var(--warning))"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Book spine — vertical centre line */}
      <line
        x1="100" y1="95" x2="100" y2="116"
        stroke="hsl(var(--card-foreground))"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Book spine — curved bottom */}
      <path
        d="M47,107 Q100,131 153,107"
        stroke="hsl(var(--card-foreground))"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />

      {/* ══ Rising Sun ══════════════════════════════════════════════ */}

      {/* Sun core */}
      <circle cx="100" cy="79" r="7" fill="hsl(var(--warning))" />

      {/* Sun rays */}
      {rays.map((r, i) => (
        <line
          key={i}
          x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
          stroke="hsl(var(--warning))"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ))}

      {/* ══ Fountain-pen Nib ════════════════════════════════════════ */}

      {/* Nib body (tapered diamond) */}
      <path
        d="M100,119 L109,130 L100,143 L91,130Z"
        fill="none"
        stroke="hsl(var(--secondary))"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Nib shoulder line */}
      <path
        d="M91,130 L100,120 L109,130"
        fill="none"
        stroke="hsl(var(--secondary))"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Centre slit */}
      <line
        x1="100" y1="125" x2="100" y2="141"
        stroke="hsl(var(--secondary))"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
