// Klien Upstash Redis via REST (fetch). Dipakai karena @upstash/redis tidak
// dapat dipasang di lingkungan build tanpa jaringan. Server-side only.
export const PREFIX = "friedchicken:v1:";
export const k = (...parts: (string | number)[]) => PREFIX + parts.join(":");

type Cmd = (string | number)[];

async function call<T>(body: unknown, path = ""): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Konfigurasi Redis belum diisi");
  const res = await fetch(url + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `Redis HTTP ${res.status}`);
  return json.result as T;
}

export const redis = {
  cmd: <T = unknown>(...c: Cmd) => call<T>(c),
  get: async <T = unknown>(key: string): Promise<T | null> => {
    const v = await call<string | null>(["GET", key]);
    return v == null ? null : (JSON.parse(v) as T);
  },
  set: (key: string, value: unknown) => call(["SET", key, JSON.stringify(value)]),
  /** Eksekusi Lua atomik. */
  eval: <T = unknown>(script: string, keys: string[], args: (string | number)[]) =>
    call<T>(["EVAL", script, keys.length, ...keys, ...args]),
};
