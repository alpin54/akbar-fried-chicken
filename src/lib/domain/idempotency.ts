import { createHash } from "node:crypto";

/** JSON kanonik (kunci diurutkan) agar payload yang sama selalu menghasilkan hash yang sama. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** Hash payload permintaan. Key sama + hash berbeda = konflik. */
export const payloadHash = (v: unknown) =>
  createHash("sha256").update(canonicalJson(v)).digest("hex").slice(0, 32);
