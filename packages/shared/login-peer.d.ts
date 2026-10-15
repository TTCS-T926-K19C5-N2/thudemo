export const LOGIN_PEER_HEADER: string;
export function canonicalPeer(ip: string | undefined): string;
export function signLoginPeer(
  ip: string,
  secret: string | undefined,
  now?: number,
): string;
export function verifyLoginPeer(
  header: unknown,
  secret: string | undefined,
  now?: number,
): string;
