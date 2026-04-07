import { Anthropic } from "@anthropic-ai/sdk";
import type { BriefingState, AuditorChallenge } from "./types.js";
import type { AnalystSectionResponse } from "../services/briefing-blackboard.js";
import { ANALYST_SYSTEM_PROMPT } from "./prompts.js";
import { withTimeout } from "../lib/timeout.js";

/**
 * Analyst response node: Blackboard pattern - analyst responds to auditor challenges.
 * Generates AnalystSectionResponse[] per section with analyst_response and resolution_type.
 * Timeout: 2 minutes
 * Returns: updated state with analystResponses
 */
export async function runAnalystResponseNode(
  state: BriefingState,
  env: { ANTHROPIC_API_KEY?: string; LLM_MODEL: string; LLM_TEMPERATURE: number },
): Promise<Partial<BriefingState>> {
  if (!state.auditorReviews || !Array.isArray(state.auditorReviews) || state.auditorReviews.length === 0) {
    throw new Error("No auditor reviews to respond to");
  }

  if (!state.analystDraft || !Array.isArray(state.analystDraft) || state.analystDraft.length === 0) {
    throw new Error("No analyst draft to reference for responses");
  }

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required for analyst response node");
  }

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });

  // Build challenge summary for context
  const challengeSummary = state.auditorReviews
    .filter(review => review.auditor_challenges && review.auditor_challenges.length > 0)
    .map(review =>
      `Section: ${review.section_id}
Challenges:
${review.auditor_challenges!.map((ch: AuditorChallenge) =>
        `  ${ch.id} (${ch.type}/${ch.severity}): ${ch.question}
   Evidence: ${ch.evidence}
   Requested Action: ${ch.requestedAction}`
      ).join('\n\n')}`
    )
    .join('\n\n---\n\n');

  const userMessage = `The auditor has raised challenges to your draft sections. Below is a summary of each challenge. Respond to each one specifically.

${challengeSummary}

For each challenge, provide:
1. Your response (accept, clarify, or escalate)
2. Resolution type ("accepted" if you agree and fix it, "clarified" if you explain your position, "escalated" if you and auditor fundamentally disagree)
3. If escalated, state your position clearly (the CEO will see both positions)

Return a JSON array with one response object per section. Each response includes:
- section_id
- analyst_response: Your detailed response to all challenges in this section
- resolution_type: "accepted" | "clarified" | "escalated"
- analyst_position: (if escalated) Your stated position for CEO review

Be specific. Reference challenge IDs and provide evidence or clarification.`;

  const factBundleJson = JSON.stringify(state.factBundle, null, 2);

  try {
    const response = await withTimeout(
      client.messages.create({
        model: env.LLM_MODEL,
        max_tokens: 3000,
        temperature: env.LLM_TEMPERATURE,
        system: ANALYST_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `${userMessage}\n\nFactBundle for reference:\n${factBundleJson}`,
          },
        ],
      }),
      120000, // 2 minutes
    );

    // Extract JSON from response
    if (!response.content || response.content.length === 0) {
      throw new Error("Empty response from Analyst");
    }

    const firstContent = response.content[0] || null;
    if (!firstContent || firstContent.type !== "text") {
      throw new Error("Expected text response from Analyst");
    }

    // Type guard: assert content is TextBlock
    const textContent = firstContent as { type: "text"; text: string };

    // Parse JSON from response (may be wrapped in markdown code block)
    let jsonStr = textContent.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1];
    }

    const responsesResponse: { responses: AnalystSectionResponse[] } = JSON.parse(jsonStr);

    // Validate structure
    if (!responsesResponse.responses || !Array.isArray(responsesResponse.responses)) {
      throw new Error("Invalid analyst response format: expected { responses: AnalystSectionResponse[] }");
    }

    if (responsesResponse.responses.length !== 5) {
      throw new Error(
        `Expected 5 section responses from analyst, got ${responsesResponse.responses.length}`
      );
    }

    // Validate each response
    for (const resp of responsesResponse.responses) {
      if (!resp.section_id || !resp.analyst_response || !resp.resolution_type) {
        throw new Error(
          `Response for section ${resp.section_id || '(unknown)'} missing required field: section_id, analyst_response, or resolution_type`
        );
      }
    }

    return {
      analystResponses: responsesResponse.responses,
      iterationCount: state.iterationCount + 1,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("timeout")) {
      return {
        error: "Analyst response node timeout (2 minutes exceeded)",
        timeout: true,
      };
    }
    throw new Error(`Analyst response node failed: ${message}`);
  }
}
