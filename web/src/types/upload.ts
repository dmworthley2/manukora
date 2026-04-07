import type { UploadRow } from "@manukora/backend";

export type { UploadRow };

export interface UploadState {
  isUploading: boolean;
  error: string | null;
  success: boolean;
}

export interface UploadResponse {
  id: string;
  filename: string;
  contentType: string;
  fileSize: number;
  rowCount: number;
  createdAt: string;
}

export interface ConnectorType {
  id: string;
  name: string;
  description: string;
  status: "available" | "coming-soon";
}
