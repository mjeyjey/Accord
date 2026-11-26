import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  download: <path d="M12 4v11M7 11l5 5 5-5M4 20h16" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  sliders: <><path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>,
  chart: <path d="M5 20V11M12 20V4M19 20v-6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bell: <><path d="M6 9a6 6 0 1112 0c0 6 2 7.5 2 7.5H4S6 15 6 9z" /><path d="M10 20a2 2 0 004 0" /></>,
  megaphone: <><path d="M3 11v2a1 1 0 001 1h3l9 4V6L7 10H4a1 1 0 00-1 1z" /><path d="M19 9a4 4 0 010 6" /><path d="M7 14l1.5 6h2.2L9.4 15.5" /></>,
  logout: <path d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4M16 8l4 4-4 4M20 12H9" />,
  chat: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>,
  alert: <><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></>,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  door: <path d="M5 21V4h10v17M3 21h18M12 12h.01" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5M17 11a3 3 0 100-6M18 14.8c2 .6 3.2 2.3 3.5 5" /></>,
   layers: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  message: <><path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H10l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z" /><path d="M8 10h8M8 13h5" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11h14V8M10 12h4" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
} satisfies Record<string, ReactNode>;;

export type IconName = keyof typeof P;

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}