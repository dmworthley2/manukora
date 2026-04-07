/**
 * Executes a promise with a timeout.
 * If the promise doesn't settle within timeoutMs, rejects with a timeout error.
 */
export async function withTimeout(promise, timeoutMs) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`Operation timeout after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}
//# sourceMappingURL=timeout.js.map