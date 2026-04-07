/**
 * Briefing Blackboard Service
 * Section-level state management for analyst-auditor collaboration.
 * Manages master briefing state with conflict tracking.
 */
import { log } from "../lib/log.js";
// ============================================================================
// CREATE & INITIALIZE
// ============================================================================
/**
 * Create a new briefing blackboard for a report run.
 * Initializes with empty sections and overall_status = "in-progress".
 */
export async function createBlackboard(client, reportRunId, iteration = 1) {
    try {
        const insert = {
            report_run_id: reportRunId,
            iteration,
            overall_status: "in-progress",
            sections: {},
            conflicts: [],
            approval_summary: { total: 0, approved: 0, escalated: 0, pending: 0 },
        };
        const { data, error } = await client
            .from("briefing_blackboard")
            .insert([insert])
            .select("id")
            .maybeSingle();
        if (error || !data) {
            const msg = `Failed to create blackboard: ${error?.message || "No data returned"}`;
            log.error(msg);
            return { success: false, error: msg };
        }
        log.info(`Created blackboard for report_run ${reportRunId}`, { blackboardId: data.id });
        return { success: true, blackboardId: data.id };
    }
    catch (err) {
        const msg = `Blackboard creation error: ${err instanceof Error ? err.message : String(err)}`;
        log.error(msg);
        return { success: false, error: msg };
    }
}
/**
 * Submit analyst draft: all 5 sections at once.
 * Creates briefing_section rows and updates blackboard state.
 */
export async function submitAnalystDraft(client, blackboardId, sections) {
    try {
        // Insert all sections
        const sectionInserts = sections.map((s) => ({
            blackboard_id: blackboardId,
            section_id: s.section_id,
            title: s.title,
            analyst_draft: s.analyst_draft,
            analyst_reasoning: s.analyst_reasoning,
            analyst_submitted_at: new Date().toISOString(),
        }));
        const { error: insertError } = await client
            .from("briefing_section")
            .insert(sectionInserts);
        if (insertError) {
            const msg = `Failed to insert sections: ${insertError.message}`;
            log.error(msg);
            return { success: false, error: msg };
        }
        // Update blackboard state
        const blackboardUpdate = {
            overall_status: "under-review",
            analyst_submitted_at: new Date().toISOString(),
            approval_summary: {
                total: sections.length,
                approved: 0,
                escalated: 0,
                pending: sections.length,
            },
        };
        const { error: updateError } = await client
            .from("briefing_blackboard")
            .update(blackboardUpdate)
            .eq("id", blackboardId);
        if (updateError) {
            const msg = `Failed to update blackboard: ${updateError.message}`;
            log.error(msg);
            return { success: false, error: msg };
        }
        log.info(`Submitted analyst draft with ${sections.length} sections`, {
            blackboardId,
        });
        return { success: true };
    }
    catch (err) {
        const msg = `Analyst draft submission error: ${err instanceof Error ? err.message : String(err)}`;
        log.error(msg);
        return { success: false, error: msg };
    }
}
/**
 * Submit auditor review: challenges per section.
 * Updates briefing_section rows with auditor feedback.
 */
export async function submitAuditorChallenges(client, blackboardId, reviews) {
    try {
        const now = new Date().toISOString();
        let approvedCount = 0;
        let pendingCount = 0;
        // Update each section with auditor review
        for (const review of reviews) {
            const update = {
                auditor_status: review.auditor_status,
                auditor_challenges: (review.auditor_challenges || null),
                auditor_notes: review.auditor_notes || null,
                auditor_reviewed_at: now,
            };
            const { error } = await client
                .from("briefing_section")
                .update(update)
                .eq("blackboard_id", blackboardId)
                .eq("section_id", review.section_id);
            if (error) {
                const msg = `Failed to update section ${review.section_id}: ${error.message}`;
                log.error(msg);
                return { success: false, error: msg };
            }
            if (review.auditor_status === "approved") {
                approvedCount++;
            }
            else {
                pendingCount++;
            }
        }
        // Update blackboard summary
        const blackboardUpdate = {
            overall_status: "responding",
            auditor_completed_review_at: now,
            approval_summary: {
                total: reviews.length,
                approved: approvedCount,
                escalated: 0,
                pending: pendingCount,
            },
        };
        const { error: updateError } = await client
            .from("briefing_blackboard")
            .update(blackboardUpdate)
            .eq("id", blackboardId);
        if (updateError) {
            const msg = `Failed to update blackboard: ${updateError.message}`;
            log.error(msg);
            return { success: false, error: msg };
        }
        log.info(`Submitted auditor challenges for ${reviews.length} sections`, {
            blackboardId,
            approvedCount,
            pendingCount,
        });
        return { success: true };
    }
    catch (err) {
        const msg = `Auditor review submission error: ${err instanceof Error ? err.message : String(err)}`;
        log.error(msg);
        return { success: false, error: msg };
    }
}
/**
 * Submit analyst responses to auditor challenges.
 * Updates briefing_section rows with analyst feedback.
 */
export async function submitAnalystResponses(client, blackboardId, responses) {
    try {
        const now = new Date().toISOString();
        for (const response of responses) {
            const update = {
                analyst_response: response.analyst_response,
                analyst_responded_at: now,
                resolution_type: response.resolution_type,
                analyst_position: response.analyst_position || null,
            };
            const { error } = await client
                .from("briefing_section")
                .update(update)
                .eq("blackboard_id", blackboardId)
                .eq("section_id", response.section_id);
            if (error) {
                const msg = `Failed to update section ${response.section_id}: ${error.message}`;
                log.error(msg);
                return { success: false, error: msg };
            }
        }
        // Update blackboard timeline
        const blackboardUpdate = {
            analyst_completed_response_at: now,
        };
        const { error: updateError } = await client
            .from("briefing_blackboard")
            .update(blackboardUpdate)
            .eq("id", blackboardId);
        if (updateError) {
            const msg = `Failed to update blackboard: ${updateError.message}`;
            log.error(msg);
            return { success: false, error: msg };
        }
        log.info(`Submitted analyst responses for ${responses.length} sections`, {
            blackboardId,
        });
        return { success: true };
    }
    catch (err) {
        const msg = `Analyst response submission error: ${err instanceof Error ? err.message : String(err)}`;
        log.error(msg);
        return { success: false, error: msg };
    }
}
/**
 * Finalize auditor decisions: mark sections as approved or escalated.
 * Creates conflicts array if any sections are escalated.
 * Sets is_final = true and overall_status = "approved" or "escalated-to-ceo".
 */
export async function finalizeAuditorDecisions(client, blackboardId, decisions) {
    try {
        let approvedCount = 0;
        let escalatedCount = 0;
        const conflicts = [];
        // Update each section and track escalations
        for (const decision of decisions) {
            const update = {
                is_approved: decision.is_approved,
                escalation_reason: decision.escalation_reason || null,
                auditor_position: decision.auditor_position || null,
            };
            const { error } = await client
                .from("briefing_section")
                .update(update)
                .eq("blackboard_id", blackboardId)
                .eq("section_id", decision.section_id);
            if (error) {
                const msg = `Failed to finalize section ${decision.section_id}: ${error.message}`;
                log.error(msg);
                return { success: false, totalApproved: 0, totalEscalated: 0, conflicts: [], error: msg };
            }
            if (decision.is_approved) {
                approvedCount++;
            }
            else {
                escalatedCount++;
                if (decision.escalation_reason) {
                    conflicts.push({
                        section_id: decision.section_id,
                        reason: decision.escalation_reason,
                    });
                }
            }
        }
        // Finalize blackboard
        const overallStatus = escalatedCount > 0 ? "escalated-to-ceo" : "approved";
        const blackboardUpdate = {
            overall_status: overallStatus,
            is_final: true,
            approval_summary: {
                total: decisions.length,
                approved: approvedCount,
                escalated: escalatedCount,
                pending: 0,
            },
            conflicts: conflicts.map((c) => ({
                section_id: c.section_id,
                escalation_reason: c.reason,
            })),
        };
        const { error: updateError } = await client
            .from("briefing_blackboard")
            .update(blackboardUpdate)
            .eq("id", blackboardId);
        if (updateError) {
            const msg = `Failed to finalize blackboard: ${updateError.message}`;
            log.error(msg);
            return { success: false, totalApproved: 0, totalEscalated: 0, conflicts: [], error: msg };
        }
        log.info(`Finalized auditor decisions`, {
            blackboardId,
            approvedCount,
            escalatedCount,
            overallStatus,
        });
        return {
            success: true,
            totalApproved: approvedCount,
            totalEscalated: escalatedCount,
            conflicts,
        };
    }
    catch (err) {
        const msg = `Auditor finalization error: ${err instanceof Error ? err.message : String(err)}`;
        log.error(msg);
        return { success: false, totalApproved: 0, totalEscalated: 0, conflicts: [], error: msg };
    }
}
// ============================================================================
// QUERIES
// ============================================================================
/**
 * Get full blackboard state for a report run (latest iteration).
 */
export async function getBlackboard(client, reportRunId) {
    try {
        const { data, error } = await client
            .from("briefing_blackboard")
            .select("*")
            .eq("report_run_id", reportRunId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) {
            log.error(`Failed to fetch blackboard: ${error.message}`);
            return null;
        }
        return data;
    }
    catch (err) {
        log.error(`Blackboard fetch error: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
/**
 * Get all sections for a blackboard.
 */
export async function listSections(client, blackboardId) {
    try {
        const { data, error } = await client
            .from("briefing_section")
            .select("*")
            .eq("blackboard_id", blackboardId)
            .order("section_id");
        if (error) {
            log.error(`Failed to fetch sections: ${error.message}`);
            return [];
        }
        return data || [];
    }
    catch (err) {
        log.error(`Sections fetch error: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
}
/**
 * Get a single section by ID.
 */
export async function getSection(client, blackboardId, sectionId) {
    try {
        const { data, error } = await client
            .from("briefing_section")
            .select("*")
            .eq("blackboard_id", blackboardId)
            .eq("section_id", sectionId)
            .maybeSingle();
        if (error) {
            log.error(`Failed to fetch section ${sectionId}: ${error.message}`);
            return null;
        }
        return data || null;
    }
    catch (err) {
        log.error(`Section fetch error: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
//# sourceMappingURL=briefing-blackboard.js.map