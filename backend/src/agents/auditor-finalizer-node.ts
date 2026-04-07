import { Anthropic } from "@anthropic-ai/sdk";
import type { BriefingState, AuditorChallenge } from "./types.js";
import type { AuditorFinalDecision } from "../services/briefing-blackboard.js";
import { AUDITOR_SYSTEM_PROMPT } from "./prompts.js";
import { withTimeout } from "../lib/timeout.js";

/**
 * Auditor finalizer node: Blackboard pattern - auditor makes final decisions.
 * Generates AuditorFinalDecision[] per section after analyst responses.
 * Timeout: 2 minutes
 * Returns: updated state with auditorFinalDecisions
 */
export async function runAuditorFinalizerNode(
  state: BriefingState,
  env: { ANTHROPIC_API_KEY?: string; LLM_MODEL: string; LLM_TEMPERATURE: number },
): Promise<Partial<BriefingState>> {
  if (!state.auditorReviews || !Array.isArray(state.auditorReviews) || state.auditorReviews.length === 0) {
    throw new Error("No auditor reviews to finalize");
  }

  if (!state.analystResponses || !Array.isArray(state.analystResponses) || state.analystResponses.length === 0) {
    throw new Error("No analyst responses to review");
  }

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required for auditor finalizer node");
  }

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });

  // Build context of challenges and analyst responses for auditor to make final calls
  const analysisContext = state.auditorReviews
    .map((review) => {
      const analystResp = state.analystResponses!.find(r => r.section_id === review.section_id);
      return `SECTION: ${review.section_id}

Auditor's Initial Challenges:
${
  review.auditor_challenges && review.auditor_challenges.length > 0
    ? review.auditor_challenges
        .map((ch: AuditorChallenge) => `- ${ch.id}: ${ch.question}`)
        .join('\n')
    : 'No challenges'
}

Analyst's Response:
${analystResp?.analyst_response || '(no response)'}

Resolution Type: ${analystResp?.resolution_type || 'unknown'}
${analystResp?.analyst_position ? `Analyst's Position (if escalated): ${analystResp.analyst_position}` : ''}
`;
    })
    .join('\n---\n\n');

  const userMessage = `Now make final decisions for each section. Review the analyst's responses to your challenges.

${analysisContext}

For each section, decide:
1. is_approved (true/false): Has the analyst satisfied your concerns or is this section ready for the CEO?
2. escalation_reason (if is_approved=false): State clearly why this section is not approved and what needs to happen next
3. auditor_position (if is_approved=false): State your final position clearly for CEO review

Return a JSON array with one decision object per section:
{
  "section_id": "string",
  "is_approved": boolean,
  "escalation_reason": "string (only if is_approved=false)",
  "auditor_position": "string (only if is_approved=false)"
}

Approve a section if:
- All factual errors are corrected
- Key assumptions are stated explicitly
- Trade-offs are justified
- Policies are followed

Escalate if:
- The analyst refuses to correct a factual error
- Assumptions remain unstated despite request
- Trade-offs lack justification
- Policy violation persists
- Analyst and you fundamentally disagree on approach (both positions go to CEO)`;

  try {
    const response = await withTimeout(
      client.messages.create({
        model: env.LLM_MODEL,
        max_tokens: 2000,
        temperature: 0.1, // Strict mode for final decisions
        system: AUDITOR_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
      120000, // 2 minutes
    );

    // Extract JSON from response
    if (!response.content || response.content.length === 0) {
      throw new Error("Empty response from Auditor");
    }

    const firstContent = response.content[0] || null;
    if (!firstContent || firstContent.type !== "text") {
      throw new Error("Expected text response from Auditor");
    }

    // Type guard: assert content is TextBlock
    const textContent = firstContent as { type: "text"; text: string };

    // Parse JSON from response (may be wrapped in markdown code block)
    let jsonStr = textContent.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1];
    }

    const decisionsResponse: { decisions: AuditorFinalDecision[] } = JSON.parse(jsonStr);

    // Validate structure
    if (!decisionsResponse.decisions || !Array.isArray(decisionsResponse.decisions)) {
      throw new Error("Invalid auditor finalizer response format: expected { decisions: AuditorFinalDecision[] }");
    }

    if (decisionsResponse.decisions.length !== 5) {
      throw new Error(
        `Expected 5 section decisions from auditor, got ${decisionsResponse.decisions.length}`
      );
    }

    // Validate each decision
    for (const decision of decisionsResponse.decisions) {
      if (decision.section_id === undefined || decision.is_approved === undefined) {
        throw new Error(
          `Decision for section ${decision.section_id || '(unknown)'} missing required field: section_id or is_approved`
        );
      }
      // If not approved, must have escalation_reason
      if (!decision.is_approved && !decision.escalation_reason) {
        throw new Error(
          `Section ${decision.section_id} is not approved but has no escalation_reason`
        );
      }
    }

    return {
      auditorFinalDecisions: decisionsResponse.decisions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("timeout")) {
      return {
        error: "Auditor finalizer node timeout (2 minutes exceeded)",
        timeout: true,
      };
    }
    throw new Error(`Auditor finalizer node failed: ${message}`);
  }
}
