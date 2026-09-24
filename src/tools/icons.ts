/**
 * Shapes for the middle of a QR code, drawn as SVG fragments on a 24×24 grid.
 *
 * They are markup rather than single paths so each one can use the primitive
 * that suits it — a circle stays a circle instead of four bezier guesses — and
 * every stroke and fill takes `currentColor`, so one colour drives the lot.
 */
export interface Icon {
  id: string;
  label: string;
  body: string;
}

const stroke = (width = 2): string =>
  `fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;

export const ICONS: readonly Icon[] = [
  {
    id: "music",
    label: "Music note",
    body:
      `<path d="M9 18V5l10-2v13" ${stroke(2.2)}/>` +
      `<ellipse cx="6.4" cy="18" rx="3.2" ry="2.6" fill="currentColor"/>` +
      `<ellipse cx="16.4" cy="16" rx="3.2" ry="2.6" fill="currentColor"/>`,
  },
  {
    id: "heart",
    label: "Heart",
    body:
      `<path d="M12 20.6C5.8 16.6 2.6 13.1 2.6 9.6A5 5 0 0 1 12 7a5 5 0 0 1 9.4 2.6c0 3.5-3.2 7-9.4 11z" fill="currentColor"/>`,
  },
  {
    id: "star",
    label: "Star",
    body: `<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z" fill="currentColor"/>`,
  },
  {
    id: "smile",
    label: "Smiley",
    body:
      `<circle cx="12" cy="12" r="9.4" ${stroke(2)}/>` +
      `<circle cx="8.8" cy="9.8" r="1.4" fill="currentColor"/>` +
      `<circle cx="15.2" cy="9.8" r="1.4" fill="currentColor"/>` +
      `<path d="M7.8 14.4a5.2 5.2 0 0 0 8.4 0" ${stroke(2)}/>`,
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    body:
      `<path d="M2.6 8.6a14.5 14.5 0 0 1 18.8 0" ${stroke(2.3)}/>` +
      `<path d="M6 12.4a9.5 9.5 0 0 1 12 0" ${stroke(2.3)}/>` +
      `<path d="M9.4 16.2a4.5 4.5 0 0 1 5.2 0" ${stroke(2.3)}/>` +
      `<circle cx="12" cy="19.8" r="1.7" fill="currentColor"/>`,
  },
  {
    id: "mail",
    label: "Envelope",
    body:
      `<rect x="2.6" y="5" width="18.8" height="14" rx="2.6" ${stroke(2)}/>` +
      `<path d="M3.8 7.4l8.2 5.8 8.2-5.8" ${stroke(2)}/>`,
  },
  {
    id: "phone",
    label: "Phone",
    body:
      `<rect x="6" y="2.4" width="12" height="19.2" rx="2.6" ${stroke(2)}/>` +
      `<circle cx="12" cy="18.4" r="1.3" fill="currentColor"/>`,
  },
  {
    id: "chat",
    label: "Speech bubble",
    body:
      `<path d="M4 4h16a1.6 1.6 0 0 1 1.6 1.6v9.2A1.6 1.6 0 0 1 20 16.4H9.6L5 20.2v-3.8h-1A1.6 1.6 0 0 1 2.4 14.8V5.6A1.6 1.6 0 0 1 4 4z" ${stroke(2)}/>`,
  },
  {
    id: "link",
    label: "Link",
    body:
      `<path d="M9.6 14.4l4.8-4.8" ${stroke(2.2)}/>` +
      `<path d="M13.2 6.6l1.8-1.8a4.1 4.1 0 0 1 5.8 5.8L19 12.4" ${stroke(2.2)}/>` +
      `<path d="M10.8 17.4L9 19.2a4.1 4.1 0 0 1-5.8-5.8L5 11.6" ${stroke(2.2)}/>`,
  },
  {
    id: "globe",
    label: "Globe",
    body:
      `<circle cx="12" cy="12" r="9.4" ${stroke(2)}/>` +
      `<path d="M2.6 12h18.8" ${stroke(2)}/>` +
      `<path d="M12 2.6c2.6 3 2.6 15.8 0 18.8" ${stroke(2)}/>` +
      `<path d="M12 2.6c-2.6 3-2.6 15.8 0 18.8" ${stroke(2)}/>`,
  },
  {
    id: "pin",
    label: "Map pin",
    body:
      `<path d="M12 21.6S19 14.4 19 9.6A7 7 0 0 0 5 9.6c0 4.8 7 12 7 12z" ${stroke(2)}/>` +
      `<circle cx="12" cy="9.4" r="2.6" fill="currentColor"/>`,
  },
  {
    id: "home",
    label: "House",
    body:
      `<path d="M3 11.2L12 3.4l9 7.8" ${stroke(2.2)}/>` +
      `<path d="M5.4 10.4V20.4h13.2V10.4" ${stroke(2.2)}/>`,
  },
  {
    id: "user",
    label: "Person",
    body:
      `<circle cx="12" cy="8" r="4.2" ${stroke(2)}/>` +
      `<path d="M4.4 20.6a7.6 7.6 0 0 1 15.2 0" ${stroke(2)}/>`,
  },
  {
    id: "camera",
    label: "Camera",
    body:
      `<path d="M3.4 7.6h3.4l1.6-2.6h7.2l1.6 2.6h3.4a1.6 1.6 0 0 1 1.6 1.6v8.6a1.6 1.6 0 0 1-1.6 1.6H3.4a1.6 1.6 0 0 1-1.6-1.6V9.2a1.6 1.6 0 0 1 1.6-1.6z" ${stroke(2)}/>` +
      `<circle cx="12" cy="13.2" r="3.6" ${stroke(2)}/>`,
  },
  {
    id: "play",
    label: "Play",
    body: `<path d="M7.4 4.6l12.4 7.4-12.4 7.4z" fill="currentColor"/>`,
  },
  {
    id: "headphones",
    label: "Headphones",
    body:
      `<path d="M3.6 15.4v-3a8.4 8.4 0 0 1 16.8 0v3" ${stroke(2.2)}/>` +
      `<rect x="2.4" y="14.2" width="4.6" height="7" rx="2.3" fill="currentColor"/>` +
      `<rect x="17" y="14.2" width="4.6" height="7" rx="2.3" fill="currentColor"/>`,
  },
  {
    id: "bolt",
    label: "Lightning",
    body: `<path d="M13.6 1.8L4 13.8h6L9.4 22.2 20 10.2h-6.6z" fill="currentColor"/>`,
  },
  {
    id: "leaf",
    label: "Leaf",
    body:
      `<path d="M20.8 3.2C9.6 3.2 3.4 8.4 3.4 15.4c0 2 .6 3.8 1.8 5.2" ${stroke(2.2)}/>` +
      `<path d="M20.8 3.2c0 11.6-3.2 17.6-10.2 17.6-1 0-2-.2-3-.6C9.8 13.2 14 8.8 20.8 3.2z" fill="currentColor"/>`,
  },
  {
    id: "coffee",
    label: "Coffee",
    body:
      `<path d="M3.6 8.4h13v6.8a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5z" ${stroke(2)}/>` +
      `<path d="M16.6 10.4h2a2.6 2.6 0 0 1 0 5.2h-2" ${stroke(2)}/>` +
      `<path d="M7 2.6v2.4M11 2.6v2.4" ${stroke(2)}/>`,
  },
  {
    id: "gift",
    label: "Gift",
    body:
      `<rect x="3" y="9.2" width="18" height="11.6" rx="2" ${stroke(2)}/>` +
      `<path d="M3 13.4h18M12 9.2v11.6" ${stroke(2)}/>` +
      `<path d="M12 9.2c-1.2-3-2.6-4.6-4.2-4.6a2.1 2.1 0 0 0 0 4.6z" ${stroke(2)}/>` +
      `<path d="M12 9.2c1.2-3 2.6-4.6 4.2-4.6a2.1 2.1 0 0 1 0 4.6z" ${stroke(2)}/>`,
  },
  {
    id: "cart",
    label: "Shopping cart",
    body:
      `<path d="M2.6 3.6h2.8l2.6 11.2h9.8l2.2-8.2H6.6" ${stroke(2)}/>` +
      `<circle cx="9" cy="19.2" r="1.8" fill="currentColor"/>` +
      `<circle cx="17.2" cy="19.2" r="1.8" fill="currentColor"/>`,
  },
  {
    id: "tag",
    label: "Price tag",
    body:
      `<path d="M2.6 11.4V3.6a1 1 0 0 1 1-1h7.8l9.8 9.8-8.8 8.8z" ${stroke(2)}/>` +
      `<circle cx="7" cy="7" r="1.7" fill="currentColor"/>`,
  },
  {
    id: "calendar",
    label: "Calendar",
    body:
      `<rect x="3" y="5" width="18" height="16" rx="2.4" ${stroke(2)}/>` +
      `<path d="M3 10h18M8 3v4M16 3v4" ${stroke(2)}/>`,
  },
  {
    id: "clock",
    label: "Clock",
    body:
      `<circle cx="12" cy="12" r="9.4" ${stroke(2)}/>` +
      `<path d="M12 6.4V12l4 2.6" ${stroke(2)}/>`,
  },
  {
    id: "lock",
    label: "Padlock",
    body:
      `<rect x="4.4" y="10" width="15.2" height="11.2" rx="2.4" ${stroke(2)}/>` +
      `<path d="M8 10V7a4 4 0 0 1 8 0v3" ${stroke(2)}/>`,
  },
  {
    id: "cloud",
    label: "Cloud",
    body: `<path d="M7 19.4a4.7 4.7 0 0 1-.4-9.4 6.2 6.2 0 0 1 11.6-.6 4.4 4.4 0 0 1-.6 10z" ${stroke(2)}/>`,
  },
  {
    id: "send",
    label: "Paper plane",
    body:
      `<path d="M21.4 3.2L2.6 11.6l7.4 2.6 2.6 7.4z" ${stroke(2)}/>` +
      `<path d="M21.4 3.2L10 14.2" ${stroke(2)}/>`,
  },
  {
    id: "check",
    label: "Tick",
    body: `<path d="M4.2 12.6l5.4 5.4L20 6.2" ${stroke(2.8)}/>`,
  },
];

export const ICON_IDS = ICONS.map((icon) => icon.id);

export function findIcon(id: string): Icon | undefined {
  return ICONS.find((icon) => icon.id === id);
}
