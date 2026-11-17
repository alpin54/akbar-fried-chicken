"use client";

import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 1280; // xl breakpoint — matches TailAdmin sidebar's xl:translate-x-0

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT;
// Di server lebar layar tidak diketahui: perilaku sama seperti sebelumnya (false).
const getServerSnapshot = () => false;

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
