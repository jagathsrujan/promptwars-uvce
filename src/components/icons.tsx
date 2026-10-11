import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function svgProps(props: IconProps) {
  const { className, ...rest } = props;
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: className ?? "h-5 w-5",
    ...rest,
  };
}

export function IconBank(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m3 10 9-7 9 7v2H3Z" />
      <path d="M5 12v7M9.5 12v7M14.5 12v7M19 12v7" />
      <path d="M3 21h18" />
    </svg>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
      <rect x="13.5" y="12.5" width="7.5" height="8.5" rx="1.5" />
      <rect x="3" y="16" width="7.5" height="5" rx="1.5" />
    </svg>
  );
}

export function IconTransfer(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M8 4 4 8l4 4" />
      <path d="M4 8h16" />
      <path d="m16 20 4-4-4-4" />
      <path d="M20 16H4" />
    </svg>
  );
}

export function IconStatement(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M1 14h6M9 8h6M17 16h6" />
    </svg>
  );
}

export function IconSignOut(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.4 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17.3 17.3 0 0 1-3 3.9" />
      <path d="M6.6 6.8A16.2 16.2 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1.02" />
    </svg>
  );
}

export function IconSnowflake(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M12 2v20" />
      <path d="m4.9 6.5 14.2 11" />
      <path d="m19.1 6.5-14.2 11" />
      <path d="M9.5 3.8 12 6.3l2.5-2.5" />
      <path d="M9.5 20.2 12 17.7l2.5 2.5" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M10.3 4 2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M16.5 12h.01" />
    </svg>
  );
}

export function IconCard(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

export function IconArrowUpRight(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export function IconArrowDownLeft(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M17 7 7 17" />
      <path d="M16 17H7V8" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 10.9 10.1 9Z" />
      <path d="M19 3v4M21 5h-4" />
    </svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function IconChat(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={`animate-spin-smooth inline-block rounded-full border-2 border-current border-t-transparent ${className ?? "h-4 w-4"}`}
      aria-hidden
    />
  );
}
