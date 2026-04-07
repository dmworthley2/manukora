import { Anthropic } from "@anthropic-ai/sdk";
import { ANALYST_SYSTEM_PROMPT } from "./prompts.js";
import { withTimeout } from "../lib/timeout.js";
/**
 * Analyst node: Transform FactBundle → BriefingDraft with citations.
 * Timeout: 2 minutes
 * Returns: updated state with analystDraft
 */
export async function runAnalystNode(state, env) {
    if (!env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is required for analyst node");
    }
    const client = new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
    });
    const factBundleJson = JSON.stringify(state.factBundle, null, 2);
    let userMessage;
    if (state.auditResult && state.auditResult.corrections.length > 0) {
        // Revision: Use audit feedback to fix the draft
        const correctionsJson = JSON.stringify(state.auditResult.corrections, null, 2);
        userMessage = `The previous briefing draft has issues. Fix them using the auditor's corrections:

Corrections Required:
${correctionsJson}

Revise the briefing to address each correction. Ensure every numerical claim cites the exact FactBundle field.

FactBundle (period: ${state.period}):
${factBundleJson}

Generate the corrected briefing JSON with all sections and citations as specified in the system prompt.`;
    }
    else {
        // Initial generation
        userMessage = `Transform this FactBundle into a narrative briefing with 5 sections, ensuring every numerical claim cites the exact FactBundle field.

FactBundle (period: ${state.period}):
${factBundleJson}

Generate the briefing JSON with sections and citations as specified in the system prompt.`;
    }
    try {
        const response = await withTimeout(client.messages.create({
            model: env.LLM_MODEL,
            max_tokens: 2000,
            temperature: env.LLM_TEMPERATURE,
            system: ANALYST_SYSTEM_PROMPT,
            messages: [
                {
                    role: "user",
                    content: userMessage,
                },
            ],
        }), 120000);
        // Extract JSON from response
        if (!response.content || response.content.length === 0) {
            throw new Error("Empty response from Analyst");
        }
        const firstContent = response.content[0] || null;
        if (!firstContent || firstContent.type !== "text") {
            throw new Error("Expected text response from Analyst");
        }
        // Type guard: assert content is TextBlock
        const textContent = firstContent;
        // Parse JSON from response (may be wrapped in markdown code block)
        let jsonStr = textContent.text;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonStr = jsonMatch[1];
        }
        const briefing = JSON.parse(jsonStr);
        return {
            analystDraft: briefing,
            iterationCount: state.iterationCount + 1,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("timeout")) {
            return {
                error: "Analyst node timeout (2 minutes exceeded)",
                timeout: true,
            };
        }
        throw new Error(`Analyst node failed: ${message}`);
    }
}
//# sourceMappingURL=analyst-node.js.map