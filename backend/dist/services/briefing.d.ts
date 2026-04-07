import { SupabaseClient } from "@supabase/supabase-js";
import type { BriefingState } from "../agents/types.js";
/**
 * Save approved briefing to Supabase Storage.
 * Path pattern: outputs/{yyyy}/{mm}/{runId}/briefing.md
 */
export declare function saveBriefingToStorage(client: SupabaseClient, state: BriefingState, reportRunId: string): Promise<string | null>;
/**
 * Update report_runs record with briefing status and metadata.
 */
export declare function updateReportRunWithBriefing(client: SupabaseClient, reportRunId: string, state: BriefingState, storagePath: string | null): Promise<void>;
/**
 * Main entry point: Save all briefing artifacts and update database.
 * Called after workflow completes (approved or failed).
 */
export declare function finalizeBriefing(client: SupabaseClient, reportRunId: string, state: BriefingState): Promise<void>;
//# sourceMappingURL=briefing.d.ts.map