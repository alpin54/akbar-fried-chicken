"use client";

import { Input } from "@/components/ui/input";
import { formatRupiah, parseRupiah } from "@/lib/money";
import * as React from "react";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
};

/** Input Rupiah: tampil "Rp15.000", nilai ke form tetap angka bulat (atau null bila kosong). */
export function CurrencyInput({ value, onValueChange, ...props }: Props) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value == null ? "" : formatRupiah(value)}
      onChange={(e) => {
        const n = parseRupiah(e.target.value);
        onValueChange(n === null ? null : Math.min(n, 1_000_000_000));
        // Setelah format ulang, letakkan kursor di akhir agar tidak melompat.
        requestAnimationFrame(() => {
          const el = ref.current;
          if (el) el.setSelectionRange(el.value.length, el.value.length);
        });
      }}
    />
  );
}
