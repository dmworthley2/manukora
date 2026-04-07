"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadSection } from "@/components/data-sources/UploadSection";
import { DatasetHistory } from "@/components/data-sources/DatasetHistory";
import { InfoSection } from "@/components/data-sources/InfoSection";
import { useDatasets } from "@/hooks/useDatasets";
import { useToast } from "@/hooks/useToast";
import type { UploadRow } from "@/types/upload";

interface ProcessResponse {
  success: boolean;
  reportRunId: string;
  uploadId: string;
  factBundle: unknown;
  warnings: string[];
  inventoryDataInserted: boolean;
}

export default function DataSourcesPage() {
  const router = useRouter();
  const { datasets, isLoading, refetch } = useDatasets();
  const { toast } = useToast();
  const [uploads, setUploads] = useState<UploadRow[]>([]);

  // Sync with fetched datasets
  useEffect(() => {
    setUploads(datasets);
  }, [datasets]);

  const handleUploadSuccess = async (response: ProcessResponse) => {
    // Refetch uploads to stay in sync with newly processed data
    refetch();
  };

  const handleAnalyze = async (uploadId: string) => {
    try {
      // Create report run
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          period: "current",
          status: "pending",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create report");
      }

      const report = await response.json();

      // Redirect to analysis page
      router.push(`/dashboard?reportId=${report.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {/* Header */}
      <section className="border-b py-12">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-2">
            Systems & Operations Planning
          </p>
          <h1 className="text-5xl font-bold mb-4">Data Sources</h1>
          <p className="text-lg text-muted-foreground">
            Upload and manage your datasets for analysis
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
        {/* Upload Section */}
        <UploadSection onUploadSuccess={handleUploadSuccess} />

        {/* Dataset History */}
        <DatasetHistory
          uploads={uploads}
          isLoading={isLoading}
          onAnalyze={handleAnalyze}
        />

        {/* Info Section */}
        <InfoSection />
      </div>
    </>
  );
}
