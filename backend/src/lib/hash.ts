import { createHash } from "node:crypto";

export function sha256Hex(data: Buffer | Uint8Array): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return createHash("sha256").update(buf).digest("hex");
}
