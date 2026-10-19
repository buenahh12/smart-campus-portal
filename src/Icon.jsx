export default function Icon({ name, size = 20 }) {
  const paths = {
    alert: <path d="M12 3 2 21h20L12 3Zm0 7v5m0 3h.01" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    building: (
      <path d="M4 21V5l8-3 8 3v16M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M2 21h20" />
    ),
    bot: (
      <path d="M8 9h8a4 4 0 0 1 4 4v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4a4 4 0 0 1 4-4Zm4-6v3m-5 7h.01m10 0h.01M8 16h8" />
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    cube: <path d="m12 2 9 5-9 5-9-5 9-5Zm9 5v10l-9 5-9-5V7m9 5v10" />,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8" /></>,
    location: (
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    plus: <path d="M12 5v14M5 12h14" />,
    mic: (
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3m-4 0h8" />
    ),
    route: (
      <path d="M5 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 15c5 0 4-6 9-6" />
    ),
    scan: <path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5M8 12h8" />,
    shield: (
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Zm-3-10 2 2 4-5" />
    ),
    sparkle: (
      <path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2L12 3Zm6 11 .6 2.4L21 17l-2.4.6L18 20l-.6-2.4L15 17l2.4-.6L18 14Z" />
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
