import { Suspense } from "react";
import ExecutiveSummaryContent from "./content";

export const dynamic = "force-dynamic";

export default function ExecutiveSummaryPage() {
  return (
    <Suspense>
      <ExecutiveSummaryContent />
    </Suspense>
  );
}
