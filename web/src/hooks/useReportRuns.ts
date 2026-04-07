import { useState, useEffect } from "react";
import type { ReportRunRow } from "@manukora/backend";

export function useReportRuns() {
  const [runs, setRuns] = useState<ReportRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        const response = await fetch("/api/reports");
        if (!response.ok) {
          throw new Error(`Failed to fetch reports: ${response.statusText}`);
        }
        const data = await response.json();
        setRuns(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setRuns([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, []);

  return { runs, loading, error };
}
