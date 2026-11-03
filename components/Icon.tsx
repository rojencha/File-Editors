const P: Record<string, string> = {
  upload: "M12 16V4m0 0L7 9m5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  download: "M12 4v12m0 0 5-5m-5 5-5-5M4 20h16",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.3-4.3",
  x: "M6 6l12 12M18 6 6 18",
  check: "M5 12l5 5 9-10",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  rotate: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  rotateL: "M4 11a8 8 0 1 1 2.3 5.7M4 4v7h7",
  right: "M5 12h14m-6-6 6 6-6 6",
  up: "M12 19V5m-6 6 6-6 6 6",
  down: "M12 5v14m-6-6 6 6 6-6",
  left: "M19 12H5m6-6-6 6 6 6",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  lock: "M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5m0-8h.01",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  play: "M7 4l13 8-13 8z",
  pause: "M8 4v16M16 4v16",
  crop: "M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14",
  move: "M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20",
  cloud: "M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.6 1.5A3.5 3.5 0 0 1 17.5 18z",
  device: "M3 14l3-9h12l3 9M3 14v5h18v-5zM3 14h18M7 17h.01",
  flip: "M12 3v18M8 7 3 12l5 5zm8 0 5 5-5 5z",
  swap: "M7 7h13l-4-4M17 17H4l4 4",
  stack: "M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  all: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  save: "M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7",
  zip: "M6 2h8l4 4v16H6zM12 2v2m0 2v2m0 2v2m-1 3h2v3h-2z",
};

export function Icon({ name, size = 18, className }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={P[name] ?? P.file} />
    </svg>
  );
}
