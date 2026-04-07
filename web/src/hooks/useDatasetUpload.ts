import { useState } from "react";
import type { UploadRow } from "@/types/upload";

interface ValidationResult {
  valid: boolean;
  error: string | null;
}

interface ProcessResponse {
  success: boolean;
  reportRunId: string;
  uploadId: string;
  factBundle: unknown;
  warnings: string[];
  inventoryDataInserted: boolean;
}

export function useDatasetUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const validateFile = (file: File): ValidationResult => {
    if (!file.name.endsWith(".csv")) {
      return { valid: false, error: "Only CSV files are accepted" };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size must be under 50MB (${(file.size / 1024 / 1024).toFixed(2)}MB provided)`,
      };
    }

    return { valid: true, error: null };
  };

  const upload = async (file: File): Promise<ProcessResponse | null> => {
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return null;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();

        // Build detailed error message
        let errorMsg = data.error || "Processing failed";
        if (data.details && Array.isArray(data.details)) {
          errorMsg = data.details.join(" | ");
        } else if (data.details) {
          errorMsg = JSON.stringify(data.details);
        }

        console.error("[Upload] Error response:", data);
        throw new Error(errorMsg);
      }

      const result: ProcessResponse = await response.json();
      setSuccess(true);
      setError(null);

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Processing failed";
      console.error("[Upload] Error:", message);
      setError(message);
      setSuccess(false);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    isUploading,
    error,
    success,
    validateFile,
    upload,
  };
}
