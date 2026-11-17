const fmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** Format integer Rupiah, e.g. 15000 -> "Rp15.000" */
export function formatRupiah(value: number): string {
  return fmt.format(Math.trunc(value)).replace(/\s/g, "");
}

/** Parse user text ("Rp15.000", "15000") to integer; empty -> null */
export function parseRupiah(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  return digits === "" ? null : Number.parseInt(digits, 10);
}
