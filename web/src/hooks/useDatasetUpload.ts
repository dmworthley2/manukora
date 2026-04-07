import { useState } from "react";
import type { UploadRow } from "@/types/upload";

interface ValidationResult {
  valid: boolean;
  error: string | null;
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

  const upload = async (file: File): Promise<UploadRow | null> => {
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

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      const result: UploadRow = await response.json();
      setSuccess(true);
      setError(null);

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
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
