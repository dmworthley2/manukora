/** Minimal structured logging — no PII or file contents. */
export const log = {
  info: (msg: string, meta?: Record<string, string | number | undefined>) => {
    console.log(JSON.stringify({ level: "info", msg, ...meta }));
  },
  warn: (msg: string, meta?: Record<string, string | number | undefined>) => {
    console.warn(JSON.stringify({ level: "warn", msg, ...meta }));
  },
  error: (msg: string, meta?: Record<string, string | number | undefined>) => {
    console.error(JSON.stringify({ level: "error", msg, ...meta }));
  },
};
