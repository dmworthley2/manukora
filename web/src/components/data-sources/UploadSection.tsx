"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectorCard } from "./ConnectorCard";
import { useDatasetUpload } from "@/hooks/useDatasetUpload";
import { useToast } from "@/hooks/useToast";
import type { UploadRow } from "@/types/upload";

export interface UploadSectionProps {
  onUploadSuccess?: (upload: UploadRow) => void;
}

const CONNECTORS = [
  {
    id: "shopify",
    name: "Shopify",
    description: "Direct inventory sync",
    status: "coming-soon" as const,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Payment data integration",
    status: "coming-soon" as const,
  },
];

export function UploadSection({ onUploadSuccess }: UploadSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const { upload, isUploading, error } = useDatasetUpload();
  const { toast } = useToast();

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleFile = async (file: File) => {
    const result = await upload(file);
    if (result) {
      toast({
        title: "Upload successful",
        description: `${file.name} uploaded (${result.rowCount} rows)`,
      });
      onUploadSuccess?.(result);
    } else {
      toast({
        title: "Upload failed",
        description: error || "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleConnectorClick = (name: string) => {
    toast({
      title: `${name} integration`,
      description: "Coming soon! Stay tuned.",
    });
  };

  return (
    <div className="space-y-8">
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          dragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-xl font-semibold mb-2">Upload New Data</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
          Drag and drop your CSV file or click to browse
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          className="hidden"
          aria-label="Select CSV file"
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? "Uploading..." : "Select CSV File"}
        </Button>
      </div>

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CONNECTORS.map((connector) => (
          <ConnectorCard
            key={connector.id}
            name={connector.name}
            description={connector.description}
            status={connector.status}
            icon={connector.id === "shopify" ? "🛍️" : "💳"}
            onClick={() => handleConnectorClick(connector.name)}
          />
        ))}
      </div>
    </div>
  );
}
