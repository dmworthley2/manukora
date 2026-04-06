/** Period format: `YYYY-MM` (e.g. `2026-03`). */
export function parsePeriodFolder(period: string): { year: string; month: string } {
  const parts = period.trim().split("-");
  if (parts.length !== 2 || parts[0]?.length !== 4 || parts[1]?.length !== 2) {
    throw new Error(`period must be YYYY-MM, got: ${period}`);
  }
  return { year: parts[0], month: parts[1] };
}

export function uploadObjectKey(uploadId: string, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}/${m}/${uploadId}.csv`;
}

export function outputPrefix(period: string, runId: string): string {
  const { year, month } = parsePeriodFolder(period);
  return `${year}/${month}/${runId}`;
}
