"use client";

import { useRef, useState } from "react";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectorCard } from "./ConnectorCard";
import { useDatasetUpload } from "@/hooks/useDatasetUpload";
import { useToast } from "@/hooks/useToast";
import { useDataSource } from "@/contexts/DataSourceContext";
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const { upload, isUploading, error } = useDatasetUpload();
  const { toast } = useToast();
  const { setHasUploadedData } = useDataSource();

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
    setSelectedFile(file);
    const result = await upload(file);
    if (result) {
      setUploadedFile({ name: file.name, size: file.size });
      setSelectedFile(null);
      setHasUploadedData(true);
      toast({
        title: "Upload successful",
        description: `${file.name} uploaded successfully`,
      });
      onUploadSuccess?.(result);
    } else {
      setSelectedFile(null);
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
            : error
              ? "border-destructive/50 bg-destructive/5"
              : uploadedFile
                ? "border-green-500/50 bg-green-50"
                : "border-border hover:border-primary/50"
        }`}
        onDragEnter={!isUploading ? handleDrag : undefined}
        onDragLeave={!isUploading ? handleDrag : undefined}
        onDragOver={!isUploading ? handleDrag : undefined}
        onDrop={!isUploading ? handleDrop : undefined}
      >
        {uploadedFile ? (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-600" />
            <h3 className="text-xl font-semibold mb-2 text-green-900">Upload Complete</h3>
            <p className="text-sm text-green-700 mb-6">
              <span className="font-medium">{uploadedFile.name}</span>
              {" • "}
              {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setUploadedFile(null);
                fileInputRef.current?.click();
              }}
            >
              Upload Another File
            </Button>
          </>
        ) : error ? (
          <>
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h3 className="text-xl font-semibold mb-2">Upload Failed</h3>
            <p className="text-sm text-destructive mb-6">{error}</p>
            <Button
              onClick={() => {
                setSelectedFile(null);
                fileInputRef.current?.click();
              }}
            >
              Try Again
            </Button>
          </>
        ) : isUploading ? (
          <>
            <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Uploading...</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {selectedFile?.name} • {(selectedFile!.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <div className="text-sm text-muted-foreground">
              Please wait while your file is being processed
            </div>
          </>
        ) : (
          <>
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Upload New Data</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
              Drag and drop your CSV file or click to browse
            </p>
            <Button
              onClick={() => fileInputRef.current?.click()}
            >
              Select CSV File
            </Button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          className="hidden"
          aria-label="Select CSV file"
        />
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
