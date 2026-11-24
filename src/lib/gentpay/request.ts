import { keccak256, stringToHex } from "viem";

/*
 * Request hashes bind a payment to ONE request. The agent, the provider route and the site compute them the same way:
 *   requestHash = keccak256(utf8("gentpay-req-v1|<providerId>|<METHOD>|<path?query>|<nonce>"))
 * The nonce is chosen by the agent (32 random bytes, hex). The provider recomputes the hash from the request it is serving, so a
 * receipt paid for one URL cannot unlock another. The contract refuses a second payment for the same hash inside the same task.
 */

export const REQUEST_VERSION = "gentpay-req-v1";

export function requestHash(providerId: number | bigint, method: string, pathWithQuery: string, nonce: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) throw new Error("nonce must be 32 bytes of hex");
  const m = method.toUpperCase();
  if (!/^[A-Z]{3,7}$/.test(m)) throw new Error("bad method");
  if (!pathWithQuery.startsWith("/") || pathWithQuery.length > 512) throw new Error("bad path");
  return keccak256(stringToHex(`${REQUEST_VERSION}|${BigInt(providerId)}|${m}|${pathWithQuery}|${nonce.toLowerCase()}`));
}

/** Header the agent sends with the retried request: "<taskId>:<nonce>". */
export const RECEIPT_HEADER = "x-gentpay-receipt";

export function parseReceiptHeader(v: string | null): { taskId: bigint; nonce: `0x${string}` } | null {
  if (!v) return null;
  const m = /^(\d{1,18}):(0x[0-9a-fA-F]{64})$/.exec(v.trim());
  if (!m) return null;
  return { taskId: BigInt(m[1]), nonce: m[2].toLowerCase() as `0x${string}` };
}

export function randomNonce(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
