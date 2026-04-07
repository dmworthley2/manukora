"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface DataSourceContextType {
  hasUploadedData: boolean;
  setHasUploadedData: (value: boolean) => void;
}

const DataSourceContext = createContext<DataSourceContextType | undefined>(
  undefined
);

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [hasUploadedData, setHasUploadedData] = useState(false);

  return (
    <DataSourceContext.Provider value={{ hasUploadedData, setHasUploadedData }}>
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
