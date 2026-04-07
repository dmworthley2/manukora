import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ExecutiveSummaryContent from "./content";

// This page requires dynamic data and query parameters, so it's not statically generated
export const dynamic = "force-dynamic";

export default function ExecutiveSummaryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>Executive Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Loading briefing...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <ExecutiveSummaryContent />
    </Suspense>
  );
}
