import { useState, useEffect } from "react";
import type { UploadRow } from "@manukora/backend";

export function useUploads() {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUploads = async () => {
      try {
        const response = await fetch("/api/uploads");
        if (!response.ok) {
          throw new Error(`Failed to fetch uploads: ${response.statusText}`);
        }
        const data = await response.json();
        setUploads(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setUploads([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUploads();
  }, []);

  const uploadCsv = async (file: File, period?: string) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (period) formData.append("period", period);

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const result = await response.json();
      // Refresh uploads list
      const uploadsResponse = await fetch("/api/uploads");
      if (uploadsResponse.ok) {
        setUploads(await uploadsResponse.json());
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      throw err;
    }
  };

  return { uploads, loading, error, uploadCsv };
}
