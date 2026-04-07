/**
 * Executes a promise with a timeout.
 * If the promise doesn't settle within timeoutMs, rejects with a timeout error.
 */
export declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T>;
//# sourceMappingURL=timeout.d.ts.map