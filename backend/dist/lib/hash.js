import { createHash } from "node:crypto";
export function sha256Hex(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return createHash("sha256").update(buf).digest("hex");
}
//# sourceMappingURL=hash.js.map