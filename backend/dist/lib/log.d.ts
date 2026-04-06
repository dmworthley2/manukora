/** Minimal structured logging — no PII or file contents. */
export declare const log: {
    info: (msg: string, meta?: Record<string, string | number | undefined>) => void;
    warn: (msg: string, meta?: Record<string, string | number | undefined>) => void;
    error: (msg: string, meta?: Record<string, string | number | undefined>) => void;
};
//# sourceMappingURL=log.d.ts.map