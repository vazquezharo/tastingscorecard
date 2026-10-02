import type { Participant } from "../src/shared.js";
export function ownsSeat(p: Participant, token?: string) {
  return (
    !!token &&
    (p.tokenHash === token || p.tokenAliases?.includes(token) === true)
  );
}
