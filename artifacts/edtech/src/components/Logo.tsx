interface LogoProps {
  /** Diameter in pixels */
  size?: number;
  className?: string;
}

export function Logo({ size = 40, className = "" }: LogoProps) {
  return (
    <div
      className={`rounded-full overflow-hidden shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src="/logo.jpeg"
        alt="One Step EdPlateform"
        width={size}
        height={size}
        className="w-full h-full object-cover scale-150"
        draggable={false}
      />
    </div>
  );
}
