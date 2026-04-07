import { SupabaseClient } from "@supabase/supabase-js";
import { isWorkflowApproved } from "../agents/orchestration.js";
/**
 * Convert briefing sections to markdown format.
 * Returns markdown-formatted briefing ready for storage and display.
 */
function formatBriefingAsMarkdown(state) {
    if (!state.analystDraft) {
        return "No briefing generated";
    }
    const lines = [];
    // Header with metadata
    lines.push(`# Executive Briefing`);
    lines.push(`**Period**: ${state.period}`);
    lines.push(`**Generated**: ${state.analystDraft.generatedAt}`);
    if (state.iterationCount > 1) {
        lines.push(`**Iterations**: ${state.iterationCount - 1}`);
    }
    lines.push("");
    // Sections
    for (const section of state.analystDraft.sections) {
        lines.push(`## ${section.title}`);
        lines.push(section.content);
        lines.push("");
    }
    return lines.join("\n");
}
/**
 * Save approved briefing to Supabase Storage.
 * Path pattern: outputs/{yyyy}/{mm}/{runId}/briefing.md
 */
export async function saveBriefingToStorage(client, state, reportRunId) {
    if (!isWorkflowApproved(state)) {
        return null; // Don't store unapproved briefings
    }
    const markdown = formatBriefingAsMarkdown(state);
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const path = `outputs/${yyyy}/${mm}/${reportRunId}/briefing.md`;
    try {
        const { error } = await client.storage
            .from("outputs")
            .upload(path, new TextEncoder().encode(markdown), {
            contentType: "text/markdown",
            upsert: true,
        });
        if (error) {
            throw new Error(`Storage upload failed: ${error.message}`);
        }
        return path;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`Failed to save briefing: ${message}`);
        return null;
    }
}
/**
 * Update report_runs record with briefing status and metadata.
 */
export async function updateReportRunWithBriefing(client, reportRunId, state, storagePath) {
    const briefingStatus = isWorkflowApproved(state)
        ? "completed"
        : state.timeout
            ? "timeout"
            : "failed";
    const metadata = {
        briefingIterations: state.iterationCount - 1, // User-friendly count (0, 1, 2)
        briefingStatus,
        ...(state.error && { briefingError: state.error }),
        ...(isWorkflowApproved(state) && {
            auditApprovedAt: new Date().toISOString(),
            briefingPath: storagePath,
        }),
    };
    const { error } = await client
        .from("report_runs")
        .update({
        metadata,
    })
        .eq("id", reportRunId);
    if (error) {
        console.error(`Failed to update report_runs: ${error.message}`);
    }
}
/**
 * Main entry point: Save all briefing artifacts and update database.
 * Called after workflow completes (approved or failed).
 */
export async function finalizeBriefing(client, reportRunId, state) {
    // Save to storage if approved
    const storagePath = await saveBriefingToStorage(client, state, reportRunId);
    // Update database record
    await updateReportRunWithBriefing(client, reportRunId, state, storagePath);
}
//# sourceMappingURL=briefing.js.map