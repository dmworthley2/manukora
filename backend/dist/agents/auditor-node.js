import { Anthropic } from "@anthropic-ai/sdk";
import { AUDITOR_SYSTEM_PROMPT } from "./prompts.js";
import { withTimeout } from "../lib/timeout.js";
/**
 * Auditor node: Blackboard pattern - review analyst sections per section.
 * Generates AuditorReview[] per section with challenges and notes.
 * Timeout: 2 minutes (one pass for all 5 sections)
 * Returns: updated state with auditorReviews
 */
export async function runAuditorNode(state, env) {
    if (!state.analystDraft || !Array.isArray(state.analystDraft) || state.analystDraft.length === 0) {
        throw new Error("No analyst draft sections to audit");
    }
    if (!env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is required for auditor node");
    }
    const client = new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
    });
    const sectionsJson = JSON.stringify(state.analystDraft, null, 2);
    const factBundleJson = JSON.stringify(state.factBundle, null, 2);
    const userMessage = `Review these 5 analyst-drafted sections against the FactBundle. For each section, conduct the 5 checks: (1) Numerical Accuracy, (2) Data Integrity, (3) Assumption Surfacing, (4) Trade-off Justification, (5) Policy Compliance.

Analyst Sections:
${sectionsJson}

FactBundle (source of truth):
${factBundleJson}

Return an array of auditorReview objects, one per section. For each section:
- auditor_status: "approved" | "challenged" | "escalated"
- auditor_challenges: array of challenge objects with id, type, claim, question, evidence, severity, requestedAction
- auditor_notes: summary of findings

Use "approved" if all 5 checks pass. Use "challenged" if issues exist but are not blockers (analyst can respond). Use "escalated" if a critical policy violation exists.`;
    try {
        const response = await withTimeout(client.messages.create({
            model: env.LLM_MODEL,
            max_tokens: 3000,
            temperature: 0.1, // Strict verification mode (override env default)
            system: AUDITOR_SYSTEM_PROMPT,
            messages: [
                {
                    role: "user",
                    content: userMessage,
                },
            ],
        }), 120000);
        // Extract JSON from response
        if (!response.content || response.content.length === 0) {
            throw new Error("Empty response from Auditor");
        }
        const firstContent = response.content[0] || null;
        if (!firstContent || firstContent.type !== "text") {
            throw new Error("Expected text response from Auditor");
        }
        // Type guard: assert content is TextBlock
        const textContent = firstContent;
        // Parse JSON from response (may be wrapped in markdown code block)
        let jsonStr = textContent.text;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonStr = jsonMatch[1];
        }
        const reviewsResponse = JSON.parse(jsonStr);
        // Validate we got reviews for all sections
        if (!reviewsResponse.reviews || !Array.isArray(reviewsResponse.reviews)) {
            throw new Error("Invalid auditor response format: expected { reviews: AuditorReview[] }");
        }
        if (reviewsResponse.reviews.length !== 5) {
            throw new Error(`Expected 5 section reviews from auditor, got ${reviewsResponse.reviews.length}`);
        }
        return {
            auditorReviews: reviewsResponse.reviews,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("timeout")) {
            return {
                error: "Auditor node timeout (2 minutes exceeded)",
                timeout: true,
            };
        }
        throw new Error(`Auditor node failed: ${message}`);
    }
}
//# sourceMappingURL=auditor-node.js.map