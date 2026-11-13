import { sign } from "./game.ts";

// A value carried by the player and signed with BATTLE_KEY, so the Worker can store
// nothing and still trust what comes back: a run in progress (worker/src/run.ts) and
// a finished run's team (worker/src/team.ts). The purpose is signed with the value,
// so a token made for one can never pass for the other.

/** Why a token was refused: not shaped like a token at all, or signed for other contents. */
export class BrokenSeal extends Error {
  readonly reason: "not-a-token" | "changed";
  constructor(reason: "not-a-token" | "changed") {
    super(reason);
    this.reason = reason;
  }
}

/** How a value is written into a token: plain JSON, or deflated first so a token in a link stays short. */
export type Packing = "plain" | "deflated";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): Uint8Array {
  const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

async function packed(value: unknown, packing: Packing): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return toBase64Url(packing === "deflated" ? await through(bytes, new CompressionStream("deflate-raw")) : bytes);
}

async function unpacked(payload: string, packing: Packing): Promise<unknown> {
  const bytes = fromBase64Url(payload);
  return JSON.parse(new TextDecoder().decode(packing === "deflated" ? await through(bytes, new DecompressionStream("deflate-raw")) : bytes));
}

export async function seal(value: unknown, key: string, purpose: string, packing: Packing = "plain"): Promise<string> {
  const payload = await packed(value, packing);
  return `${payload}.${await sign(key, `${purpose}.${payload}`)}`;
}

// Compared in constant time, so the answer's timing says nothing about the signature.
async function verify(key: string, purpose: string, payload: string, signature: string): Promise<void> {
  const expected = await sign(key, `${purpose}.${payload}`);
  let difference = expected.length ^ signature.length;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
  if (difference !== 0) throw new BrokenSeal("changed");
}

/** The value a token was sealed with. The caller checks its version. */
export async function unseal(token: string, key: string, purpose: string, packing: Packing = "plain"): Promise<unknown> {
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) throw new BrokenSeal("not-a-token");
  await verify(key, purpose, payload, signature);
  try {
    return await unpacked(payload, packing);
  } catch {
    throw new BrokenSeal("not-a-token");
  }
}
