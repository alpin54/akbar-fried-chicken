import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";

function scrypt(pw: string, salt: Buffer): Promise<Buffer> {
  return new Promise((res, rej) =>
    _scrypt(pw, salt, 64, (e, key) => (e ? rej(e) : res(key as Buffer))),
  );
}

/** Format: scrypt$<saltHex>$<hashHex> */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(pw, Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
