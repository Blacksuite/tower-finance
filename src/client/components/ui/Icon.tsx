// Minimal inline stroke icon set (lucide-style geometry, 24x24 grid).
import type { SVGProps } from 'react';

const PATHS: Record<string, JSX.Element> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V21h13V9.5" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M3 4h2.5l2.2 11h9.8l2-8H6.1" />
    </>
  ),
  bolt: <path d="M13 2 5 13h5.5L11 22l8-11h-5.5L13 2z" />,
  car: (
    <>
      <path d="M4 16v-4l2-6h12l2 6v4" />
      <path d="M2.5 16h19" />
      <circle cx="7" cy="18.5" r="1.6" />
      <circle cx="17" cy="18.5" r="1.6" />
    </>
  ),
  shield: <path d="M12 2.5 4.5 5.5v6c0 5 3.5 8 7.5 10 4-2 7.5-5 7.5-10v-6L12 2.5z" />,
  repeat: (
    <>
      <path d="M17 2.5 21 6.5l-4 4" />
      <path d="M21 6.5H8a5 5 0 0 0-5 5" />
      <path d="M7 21.5 3 17.5l4-4" />
      <path d="M3 17.5h13a5 5 0 0 0 5-5" />
    </>
  ),
  utensils: (
    <>
      <path d="M7 2.5v8M4.5 2.5v5a2.5 2.5 0 0 0 5 0v-5M7 10.5V21.5" />
      <path d="M17.5 2.5c-2 1.5-2.7 5-2.7 8h2.7v11" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 9V6.5h18V9a2.5 2.5 0 0 0 0 6v2.5H3V15a2.5 2.5 0 0 0 0-6z" />
      <path d="M13 6.5v11" strokeDasharray="2.4 2.6" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 13H6L5 8z" />
      <path d="M8.5 10V6a3.5 3.5 0 0 1 7 0v4" />
    </>
  ),
  heart: <path d="M12 20.5S3.5 15 3.5 8.8C3.5 6 5.7 4 8.2 4c1.6 0 3 .8 3.8 2.1A4.5 4.5 0 0 1 15.8 4c2.5 0 4.7 2 4.7 4.8 0 6.2-8.5 11.7-8.5 11.7z" />,
  plane: <path d="M21 4 3 11l7 2.5L12.5 21l3-7L21 4z" />,
  tag: (
    <>
      <path d="M3 3h8l10 10-8 8L3 11V3z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h13v3" />
      <path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z" />
      <circle cx="16.5" cy="14.5" r="1.2" />
    </>
  ),
  vault: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5" />
    </>
  ),
  trend: <path d="M3 17.5 9.5 11l4 4L21 7M21 12V7h-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  trash: (
    <>
      <path d="M4 6.5h16M9 6.5V4.5h6v2M6.5 6.5 7.5 21h9l1-14.5" />
      <path d="M10 10.5v7M14 10.5v7" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8.5V20l-4-2v-4.5L3 5z" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 2.8V6M16 2.8V6" />
    </>
  ),
  layers: <path d="m12 3 9 5-9 5-9-5 9-5zM3.8 12.8 12 17.4l8.2-4.6M3.8 16.8 12 21.4l8.2-4.6" />,
  download: <path d="M12 3v11M7.5 10.5 12 15l4.5-4.5M4 18.5V21h16v-2.5" />,
  upload: <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 18.5V21h16v-2.5" />,
  pencil: <path d="M4 20h4L20.5 7.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l3 3" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.8,
  ...rest
}: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name] ?? PATHS.tag}
    </svg>
  );
}

/** Best-effort icon for a category name (custom categories fall back to a tag). */
export function categoryIcon(name: string): IconName {
  const n = name.toLowerCase();
  if (/(hous|rent|huur|woning|mortgage|hypotheek)/.test(n)) return 'home';
  if (/(grocer|boodschap|supermark)/.test(n)) return 'cart';
  if (/(utilit|energ|gas|water|electr)/.test(n)) return 'bolt';
  if (/(transport|fuel|car|auto|ov|train)/.test(n)) return 'car';
  if (/(insur|verzeker)/.test(n)) return 'shield';
  if (/(subscript|abonnement)/.test(n)) return 'repeat';
  if (/(dining|restaurant|eten|food|lunch)/.test(n)) return 'utensils';
  if (/(entertain|leisure|fun|uitgaan)/.test(n)) return 'ticket';
  if (/(shop|kleding|clothes)/.test(n)) return 'bag';
  if (/(health|zorg|medical|sport|gym)/.test(n)) return 'heart';
  if (/(travel|reizen|vakantie|holiday)/.test(n)) return 'plane';
  return 'tag';
}
