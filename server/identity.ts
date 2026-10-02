import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Participant } from "../src/shared.js";
const derive = promisify(scrypt);
export function ownsSeat(p: Participant, token?: string) {
  return (
    !!token &&
    (p.tokenHash === token || p.tokenAliases?.includes(token) === true)
  );
}
export function validPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,6}$/.test(pin);
}
export async function pinHash(
  pin: string,
  salt = randomBytes(16).toString("hex"),
) {
  const result = (await derive(pin, salt, 32)) as Buffer;
  return `${salt}:${result.toString("hex")}`;
}
export async function verifyPin(pin: string, encoded: string) {
  const candidate = await pinHash(pin, encoded.split(":")[0]);
  return (
    candidate.length === encoded.length &&
    timingSafeEqual(Buffer.from(candidate), Buffer.from(encoded))
  );
}
