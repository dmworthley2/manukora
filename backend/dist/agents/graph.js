import { runAnalystNode } from "./analyst-node.js";
import { runAuditorNode } from "./auditor-node.js";
import { runAnalystResponseNode } from "./analyst-response-node.js";
import { runAuditorFinalizerNode } from "./auditor-finalizer-node.js";
import { createBlackboard, submitAnalystDraft, submitAuditorChallenges, submitAnalystResponses, finalizeAuditorDecisions, } from "../services/briefing-blackboard.js";
/**
 * Blackboard pattern graph executor: Section-level collaboration.
 * Flow:
 *   START → Create Blackboard
 *        → Analyst (generate 5 sections)
 *        → Submit Analyst Draft
 *        → Auditor (review 5 sections)
 *        → Submit Auditor Challenges
 *        → Router (any challenged? → continue : finalize)
 *        → Analyst Response (respond to challenges)
 *        → Submit Analyst Responses
 *        → Auditor Finalizer (make final calls)
 *        → Finalize Decisions
 *        → [max 2 iterations]
 */
export async function executeGraph(initialState, env, client) {
    // Validate required environment for agent execution
    if (!env.ANTHROPIC_API_KEY) {
        return {
            ...initialState,
            error: "ANTHROPIC_API_KEY environment variable is required for briefing generation",
        };
    }
    let state = { ...initialState };
    // Phase: initializing → analyst-drafting → auditor-reviewing → analyst-responding → auditor-finalizing → complete
    try {
        // Create blackboard if not exists
        state = { ...state, phase: "initializing" };
        if (!state.blackboardId && client) {
            const result = await createBlackboard(client, state.reportRunId, state.iterationCount + 1);
            if (!result.success || !result.blackboardId) {
                return {
                    ...state,
                    error: `Failed to create blackboard: ${result.error}`,
                };
            }
            state = { ...state, blackboardId: result.blackboardId };
        }
        // ========== ITERATION LOOP: MAX 2 ==========
        while (state.iterationCount < 2) {
            // PHASE 1: ANALYST DRAFTING
            state = { ...state, phase: "analyst-drafting" };
            try {
                const analystUpdate = await runAnalystNode(state, env);
                state = { ...state, ...analystUpdate };
                if (state.error || state.timeout) {
                    return state;
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error";
                return { ...state, error: `Analyst failed: ${message}` };
            }
            // Submit analyst draft to blackboard
            if (client && state.blackboardId && state.analystDraft) {
                const submitResult = await submitAnalystDraft(client, state.blackboardId, Array.from(state.analystDraft));
                if (!submitResult.success) {
                    return {
                        ...state,
                        error: `Failed to submit analyst draft: ${submitResult.error}`,
                    };
                }
            }
            // PHASE 2: AUDITOR REVIEWING
            state = { ...state, phase: "auditor-reviewing" };
            try {
                const auditorUpdate = await runAuditorNode(state, env);
                state = { ...state, ...auditorUpdate };
                if (state.error || state.timeout) {
                    return state;
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error";
                return { ...state, error: `Auditor review failed: ${message}` };
            }
            // Submit auditor challenges to blackboard
            if (client && state.blackboardId && state.auditorReviews) {
                const submitResult = await submitAuditorChallenges(client, state.blackboardId, Array.from(state.auditorReviews));
                if (!submitResult.success) {
                    return {
                        ...state,
                        error: `Failed to submit auditor challenges: ${submitResult.error}`,
                    };
                }
            }
            // Check if all sections are approved (no challenges)
            const allApproved = state.auditorReviews?.every(r => r.auditor_status === "approved") ?? false;
            if (allApproved && state.iterationCount > 0) {
                // Already iterated once and now approved - finalize immediately
                state = { ...state, phase: "auditor-finalizing" };
                try {
                    // Auditor makes final decisions (all approved, no escalations)
                    const finalDecisions = state.auditorReviews.map(review => ({
                        section_id: review.section_id,
                        is_approved: true,
                    }));
                    if (client && state.blackboardId) {
                        const finalizeResult = await finalizeAuditorDecisions(client, state.blackboardId, finalDecisions);
                        if (!finalizeResult.success) {
                            return {
                                ...state,
                                error: `Failed to finalize decisions: ${finalizeResult.error}`,
                            };
                        }
                        state = { ...state, overall_status: "approved", is_final: true, phase: "complete" };
                    }
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error";
                    return { ...state, error: `Finalization failed: ${message}` };
                }
                return state;
            }
            // If any challenges exist, analyst needs to respond (unless max iterations reached)
            if (!allApproved && state.iterationCount < 1) {
                // PHASE 3: ANALYST RESPONDING
                state = { ...state, phase: "analyst-responding" };
                try {
                    const responseUpdate = await runAnalystResponseNode(state, env);
                    state = { ...state, ...responseUpdate };
                    if (state.error || state.timeout) {
                        return state;
                    }
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error";
                    return { ...state, error: `Analyst response failed: ${message}` };
                }
                // Submit analyst responses to blackboard
                if (client && state.blackboardId && state.analystResponses) {
                    const submitResult = await submitAnalystResponses(client, state.blackboardId, Array.from(state.analystResponses));
                    if (!submitResult.success) {
                        return {
                            ...state,
                            error: `Failed to submit analyst responses: ${submitResult.error}`,
                        };
                    }
                }
                // PHASE 4: AUDITOR FINALIZING
                state = { ...state, phase: "auditor-finalizing" };
                try {
                    const finalizerUpdate = await runAuditorFinalizerNode(state, env);
                    state = { ...state, ...finalizerUpdate };
                    if (state.error || state.timeout) {
                        return state;
                    }
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error";
                    return { ...state, error: `Auditor finalization failed: ${message}` };
                }
                // Finalize decisions in blackboard
                if (client && state.blackboardId && state.auditorFinalDecisions) {
                    const finalizeResult = await finalizeAuditorDecisions(client, state.blackboardId, Array.from(state.auditorFinalDecisions));
                    if (!finalizeResult.success) {
                        return {
                            ...state,
                            error: `Failed to finalize decisions: ${finalizeResult.error}`,
                        };
                    }
                    // Set overall status based on escalations
                    const hasEscalations = finalizeResult.totalEscalated > 0;
                    state = {
                        ...state,
                        overall_status: hasEscalations ? "escalated-to-ceo" : "approved",
                        is_final: true,
                        phase: "complete",
                        approval_summary: {
                            total: finalizeResult.totalApproved + finalizeResult.totalEscalated,
                            approved: finalizeResult.totalApproved,
                            escalated: finalizeResult.totalEscalated,
                            pending: 0,
                        },
                    };
                }
                return state; // Exit after first iteration with response/finalization
            }
            // If all approved on first iteration, finalize
            if (allApproved) {
                state = { ...state, phase: "auditor-finalizing" };
                try {
                    // Auditor makes final decisions (all approved)
                    const finalDecisions = state.auditorReviews.map(review => ({
                        section_id: review.section_id,
                        is_approved: true,
                    }));
                    if (client && state.blackboardId) {
                        const finalizeResult = await finalizeAuditorDecisions(client, state.blackboardId, finalDecisions);
                        if (!finalizeResult.success) {
                            return {
                                ...state,
                                error: `Failed to finalize decisions: ${finalizeResult.error}`,
                            };
                        }
                        state = {
                            ...state,
                            overall_status: "approved",
                            is_final: true,
                            phase: "complete",
                            approval_summary: {
                                total: finalizeResult.totalApproved,
                                approved: finalizeResult.totalApproved,
                                escalated: 0,
                                pending: 0,
                            },
                        };
                    }
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error";
                    return { ...state, error: `Finalization failed: ${message}` };
                }
                return state;
            }
        }
        // Max iterations reached
        return {
            ...state,
            error: "Max iterations (2) reached without full approval",
            phase: "complete",
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
            ...state,
            error: `Graph execution failed: ${message}`,
            phase: "complete",
        };
    }
}
//# sourceMappingURL=graph.js.map