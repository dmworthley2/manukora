"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";
import type { UploadRow } from "@/types/upload";

export interface DatasetHistoryProps {
  uploads: UploadRow[];
  isLoading?: boolean;
  onAnalyze?: (uploadId: string) => void;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

export function DatasetHistory({
  uploads,
  isLoading = false,
  onAnalyze,
}: DatasetHistoryProps) {
  if (isLoading) {
    return (
      <div data-testid="loading-skeleton" className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-12 bg-muted rounded animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No datasets yet. Upload a CSV to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-semibold">Dataset History</h3>
        <button className="text-sm text-primary hover:underline">
          View Archive
        </button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File Name</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {uploads.map((upload) => (
            <TableRow key={upload.id}>
              <TableCell className="font-medium">{upload.original_filename}</TableCell>
              <TableCell>{formatDate(upload.created_at)}</TableCell>
              <TableCell>{formatFileSize(upload.byte_size)}</TableCell>
              <TableCell>-</TableCell>
              <TableCell>
                <Badge variant="default">Uploaded</Badge>
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button
                  size="sm"
                  onClick={() => onAnalyze?.(upload.id)}
                >
                  Analyze
                </Button>
                <button className="p-1 hover:bg-muted rounded">
                  <Eye className="w-4 h-4" />
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
