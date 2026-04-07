import { useState, useEffect } from "react";
import type { UploadRow } from "@/types/upload";

export function useDatasets() {
  const [datasets, setDatasets] = useState<UploadRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDatasets = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/uploads?limit=50");

      if (!response.ok) {
        throw new Error("Failed to fetch datasets");
      }

      const data: UploadRow[] = await response.json();
      setDatasets(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setDatasets([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  const refetch = () => {
    fetchDatasets();
  };

  return {
    datasets,
    isLoading,
    error,
    refetch,
  };
}
