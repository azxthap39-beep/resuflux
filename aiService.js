/**
 * ResuFlux AI Intelligence Service (v1.0 - Heuristic Engine)
 * 
 * This service simulates a high-level LLM by analyzing ATS patterns
 * and providing natural language career advice.
 * 
 * GOAL: Zero cost, zero latency, future-proofed for real LLM integration.
 */

const aiService = (function () {

    const USE_REAL_AI = false; // Toggle for future upgrade path

    /**
     * Generates human-like strategic suggestions based on ATS results.
     */
    function getAISuggestions(atsResult) {
        if (USE_REAL_AI) return fetchRealAISuggestions(atsResult);

        const { total, keywordData, field } = atsResult;
        const suggestions = [];

        // 1. High Score (>80) - Focus on Polish
        if (total >= 80) {
            suggestions.push({
                tip: "Optimize for the Interviewer, not just the Bot.",
                reason: "Your score is high enough to pass most filters. Now focus on making your achievements 'pop' for human eyes.",
                location: "Summary / Experience"
            });
            suggestions.push({
                tip: "Quantify your impact using 'X by Y through Z' formula.",
                reason: "Technical match is solid. Adding metrics (%, $) will make this resume undeniable.",
                location: "Experience"
            });
        }
        // 2. Mid Score (50-79) - Focus on Formatting/Keywords
        else if (total >= 50) {
            const topMissing = keywordData.missing[0] || "core competencies";
            suggestions.push({
                tip: `Explicitly frame your work around "${topMissing}".`,
                reason: `The JD mentions ${topMissing} frequently. Your experience likely covers this, but the wording needs to match exactly.`,
                location: "Skills / Bullet Points"
            });
            suggestions.push({
                tip: "Consider a 'Core Competencies' section.",
                reason: "A dedicated skill cloud helps the ATS group your expertise faster.",
                location: "Top of Resume"
            });
        }
        // 3. Low Score (<50) - Focus on Structural Alignment
        else {
            suggestions.push({
                tip: "Pivot your resume summary to match this industry.",
                reason: `The ATS detects a significant gap for this ${field} role. A tailored summary can bridge the relevance gap.`,
                location: "Summary"
            });
            suggestions.push({
                tip: "Reorder your experience to lead with relevant projects.",
                reason: "The current structure masks your most relevant work. Bring the JD-aligned items to the top.",
                location: "Experience"
            });
        }

        return suggestions.slice(0, 3);
    }

    /**
     * Explains the score in natural language.
     */
    function explainScore(atsResult) {
        const { total, field, keywordData } = atsResult;

        if (total >= 85) return `Outstanding match. ResuFlux detects that you have over ${keywordData.matches.length} key attributes required for this ${field} role. You are in the top tier of candidates.`;
        if (total >= 70) return `Strong alignment. You are a highly qualified candidate for this ${field} position. A few targeted tweaks to your skills section could push this to 90+.`;
        if (total >= 40) return `Fair relevance. You have the foundational skills, but your resume uses different terminology than the job description. Semantic alignment is missing.`;

        return `Weak match. ResuFlux identifies a major mismatch between your current resume and the requirements for this ${field} role. A significant rewrite may be needed to pass automated filters.`;
    }

    /**
     * Interprets why certain skills are missing.
     */
    function explainSkillGaps(atsResult) {
        const missing = atsResult.keywordData.missing;
        if (missing.length === 0) return "No critical skill gaps identified. Your resume is perfectly aligned with the JD keywords.";

        const cluster = missing.slice(0, 3).join(", ");
        return `ResuFlux's intelligence engine flagged a gap in your "${atsResult.field}" portfolio. Specifically, the absence of keywords like **${cluster}** suggests you might be focusing too much on execution and not enough on the strategic requirements of this role.`;
    }

    // --- FUTURE UPGRADE PATH ---
    async function fetchRealAISuggestions(atsResult) {
        console.log("AI Service: Ready for OpenAI/Anthropic integration.");
        return [{ tip: "AI Upgrade pending...", reason: "Manual toggle required.", location: "Config" }];
    }

    return {
        getAISuggestions,
        explainScore,
        explainSkillGaps
    };

})();

// Export for extension use
if (typeof window !== 'undefined') {
    window.ResuFluxAI = aiService;
}
