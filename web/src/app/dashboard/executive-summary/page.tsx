import { Suspense } from "react";
import ExecutiveSummaryContent from "./content";

// This page requires dynamic data and query parameters, so it's not statically generated
export const dynamic = "force-dynamic";

export default function ExecutiveSummaryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fdf9ef] flex items-center justify-center">
          <div className="text-center">
            <p className="text-[#4d4635]">Loading briefing...</p>
          </div>
        </div>
      }
    >
      <ExecutiveSummaryContent />
    </Suspense>
  );
}
