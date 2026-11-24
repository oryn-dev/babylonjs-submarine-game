const svg = (body: string, size = 24) => `<svg viewBox="0 0 ${size} ${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  claw: svg('<path d="M12 3v5M12 8c-5 1-6 5-5 9l2.5 3M12 8c5 1 6 5 5 9l-2.5 3M12 8v6"/><circle cx="12" cy="8" r="1.6" fill="currentColor"/>'),
  sonar: svg('<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M7.5 16.5a6.4 6.4 0 0 1 0-9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.5 19.5a10.6 10.6 0 0 1 0-15M19.5 4.5a10.6 10.6 0 0 1 0 15"/>'),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3.4"/>'),
  sound: svg('<path d="M4 10v4h4l5 4V6l-5 4z" fill="currentColor"/><path d="M16.5 9a4.5 4.5 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>'),
  mute: svg('<path d="M4 10v4h4l5 4V6l-5 4z" fill="currentColor"/><path d="M17 9.5l5 5M22 9.5l-5 5"/>'),
  hull: svg('<path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z"/>'),
  battery: svg('<rect x="3" y="7" width="15" height="10" rx="2.5"/><path d="M21 10.5v3M11.5 8.8L9 12.2h3l-2.500 3.200"/>'),
  lights: svg('<path d="M3 10h5l5-3v10l-5-3H3z" fill="currentColor" fill-opacity=".3"/><path d="M13 7v10M16.500 9.500l5-2.500M16.500 12h5M16.500 14.500l5 2.500"/>'),
  arm: svg('<path d="M4 20l5-7 5 1 3-5"/><circle cx="9" cy="13" r="1.800"/><circle cx="14" cy="14" r="1.800"/><path d="M14.500 6.500L17 9l4-1M17 9V4.500"/>'),
  hold: svg('<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>'),
  ship: svg('<path d="M3 14h18l-3 5.500H6zM8 14V8h6l3 6M10 8V4.500"/>'),
  coin: svg('<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500v9M14.800 9.400c-.6-.9-1.600-1.200-2.800-1.200-1.600 0-2.800.7-2.800 1.900 0 2.600 5.800 1.200 5.800 3.900 0 1.200-1.300 1.900-3 1.900-1.300 0-2.500-.4-3.100-1.400"/>'),
  page: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M9.500 11h5M9.500 15h5"/>'),
  star: svg('<path d="M12 3.500l2.600 5.600 6 .7-4.500 4.100 1.200 6-5.300-3-5.300 3 1.200-6L3.400 9.800l6-.7z"/>'),
  lantern: svg('<path d="M8 9h8l1 9H7zM9.500 9V6.500a2.500 2.500 0 0 1 5 0V9M6 21h12"/><circle cx="12" cy="13.500" r="1.800" fill="currentColor"/>'),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName) {
  const span = document.createElement("span");
  span.className = "ds-icon";
  span.innerHTML = ICONS[name];
  return span;
}
