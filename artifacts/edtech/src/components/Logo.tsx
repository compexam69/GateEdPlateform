interface LogoProps {
  /** Diameter in pixels */
  size?: number;
  className?: string;
}

export function Logo({ size = 40, className = "" }: LogoProps) {
  return (
    <img
      src="/logo.jpeg"
      alt="One Step Coaching Classes"
      width={size}
      height={size}
      className={`rounded-full object-cover shrink-0 ${className}`}
      draggable={false}
    />
  );
}
