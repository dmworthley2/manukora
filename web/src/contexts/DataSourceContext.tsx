"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface DataSourceContextType {
  hasUploadedData: boolean;
  setHasUploadedData: (value: boolean) => void;
  latestReportRunId: string | null;
  setLatestReportRunId: (id: string) => void;
}

const DataSourceContext = createContext<DataSourceContextType | undefined>(
  undefined
);

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [hasUploadedData, setHasUploadedData] = useState(false);
  const [latestReportRunId, setLatestReportRunId] = useState<string | null>(null);

  return (
    <DataSourceContext.Provider value={{ hasUploadedData, setHasUploadedData, latestReportRunId, setLatestReportRunId }}>
      {children}
    </DataSourceContext.Provider>
  );
}

export function useDataSource() {
  const context = useContext(DataSourceContext);
  if (!context) {
    throw new Error("useDataSource must be used within DataSourceProvider");
  }
  return context;
}
