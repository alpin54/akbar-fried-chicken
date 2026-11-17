"use client";
import { useRef } from "react";

/** Key sama untuk percobaan ulang yang identik; panggil reset() saat isi form berubah atau sukses. */
export function useIdemKey() {
  const ref = useRef<string | null>(null);
  return {
    get: () => (ref.current ??= crypto.randomUUID()),
    reset: () => {
      ref.current = null;
    },
  };
}
