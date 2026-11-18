import type { ReactNode } from "react";

/** One drawn icon set: 20px grid, 1.5px stroke, round caps. Decorative, so hidden from assistive tech. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export const OverviewIcon = () => (
  <Icon>
    <rect x="3" y="3" width="6" height="7" rx="1.5" />
    <rect x="11" y="3" width="6" height="4" rx="1.5" />
    <rect x="3" y="12" width="6" height="5" rx="1.5" />
    <rect x="11" y="9" width="6" height="8" rx="1.5" />
  </Icon>
);

export const GroupsIcon = () => (
  <Icon>
    <circle cx="7.5" cy="7" r="2.5" />
    <path d="M2.5 16c.4-2.6 2.4-4 5-4s4.6 1.4 5 4" />
    <circle cx="14" cy="7.5" r="2" />
    <path d="M14.5 12c1.9.2 3.1 1.4 3.4 3.5" />
  </Icon>
);

export const StudentsIcon = () => (
  <Icon>
    <path d="M10 4 2.5 7.5 10 11l7.5-3.5L10 4Z" />
    <path d="M5.5 9.3V13c0 1 2 2.2 4.5 2.2s4.5-1.200 4.500-2.200V9.300" />
  </Icon>
);

export const AssignmentsIcon = () => (
  <Icon>
    <rect x="4" y="3" width="12" height="14" rx="2" />
    <path d="M7 8h6M7 11.500h6M7 14.500h3" />
  </Icon>
);

export const ReviewsIcon = () => (
  <Icon>
    <path d="M4 15.500V5a1.500 1.500 0 0 1 1.500-1.500h9A1.500 1.500 0 0 1 16 5v7a1.500 1.500 0 0 1-1.500 1.500H7L4 15.500Z" />
    <path d="M7.500 7.500h5M7.500 10.200h3" />
  </Icon>
);

export const SignOutIcon = () => (
  <Icon>
    <path d="M8 4H5.500A1.500 1.500 0 0 0 4 5.500v9A1.500 1.500 0 0 0 5.500 16H8" />
    <path d="M12 6.500 15.500 10 12 13.500M15.500 10H8" />
  </Icon>
);

export const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="M10 3 5 8l5 5" />
  </svg>
);

export const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="m6 3.500 4.500 4.500L6 12.500" />
  </svg>
);
