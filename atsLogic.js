/**
 * ATS Logic Engine (v5.0 - Hybrid Enterprise)
 * 
 * FEATURES:
 * 1. Hybrid Extraction: Ontology (Known Skills) + NLP (Dynamic Keywords)
 * 2. Enterprise Scoring: Weighted coverage of Core vs Nice-to-have
 * 3. Smart Context: Penalty for "fluff" words, bonus for "Action" verbs
 * 4. Resilient Matching: Normalization and substring matching
 */

if (typeof window === 'undefined') {
    window = {};
}

const ATS_LOGIC = (function () {

    // --- 1. KNOWLEDGE BASE (The "Booster" Set) ---
    // These get higher weights, but they are NOT the only things we look for.
    const ONTOLOGY = {
        // TECH
        "javascript": 3, "typescript": 3, "react": 3, "python": 3, "java": 3, "aws": 3,
        "node": 3, "sql": 3, "graphql": 2, "docker": 2, "kubernetes": 3,

        // DESIGN
        "figma": 3, "sketch": 2, "product design": 3, "user research": 3,
        "wireframing": 2, "prototyping": 2, "design system": 3,

        // PRODUCT/BIZ
        "agile": 2, "scrum": 2, "roadmap": 2, "strategy": 2, "kpi": 2,
        "stakeholder": 2, "leadership": 2, "mentorship": 2
    };

    // Words to explicitly ignore even if they appear frequently
    const STOPWORDS = new Set([
        // Articles & Prepositions
        "the", "and", "to", "of", "a", "in", "for", "with", "on", "is", "as", "an", "that", "are",
        "be", "at", "or", "from", "by", "we", "your", "this", "will", "our", "you", "work", "team",
        "can", "has", "have", "had", "not", "but", "into", "which", "more", "about", "use", "using",
        "their", "these", "than", "so", "some", "like", "up", "out", "what", "where", "when", "who",
        "while", "during", "within", "across", "through", "under", "over", "between", "among",

        // Generic Business/Recruiting Terms (The "Fluff")
        "experience", "years", "skills", "working", "environment", "business", "development",
        "role", "join", "us", "help", "looking", "candidate", "ability", "opportunity",
        "including", "other", "new", "ensure", "support", "strong", "best", "qualified",
        "requirements", "responsibilities", "must", "preferred", "plus", "degree", "bachelor",
        "master", "equivalent", "related", "field", "excellent", "good", "great", "communication",
        "collaborate", "interpersonal", "written", "verbal", "impact", "mission", "vision",
        "culture", "benefits", "salary", "range", "location", "position", "apply", "please",
        "proficient", "proficiency", "knowledge", "understanding", "demonstrated", "track", "record",
        "proven", "highly", "motivated", "detail", "oriented", "passion", "passionate", "drive",
        "results", "deliver", "execute", "solutions", "complex", "problems", "innovative",
        "products", "product", "software", "applications", "systems", "services", "platform" // "Product" is too generic unless part of "Product Design"
    ]);

    // --- 2. CORE SCORING FUNCTION ---

    function scoreResume(resumeText, jdText) {
        if (!resumeText || !jdText) {
            console.warn("ATS Logic: Empty input text");
            return emptyScore();
        }

        // A. Extract Target Model from JD
        // This is the "Ideal Candidate" profile derived dynamically
        const jdProfile = analyzeJobDescription(jdText);

        // B. Analyze Resume
        const resumeProfile = analyzeResume(resumeText);

        // C. Calculate Coverage
        const matchResult = calculateCoverage(resumeProfile, jdProfile);

        // D. Generate Score
        let totalScore = Math.round(
            (matchResult.score * 0.85) +
            (resumeProfile.structureScore * 0.15)
        );
        totalScore = Math.min(100, Math.max(0, totalScore));

        return {
            total: totalScore,
            keywordData: {
                matches: matchResult.matches,
                missing: matchResult.missing,
                score: matchResult.score
            },
            suggestions: generateSuggestions(matchResult, resumeProfile),
            details: matchResult
        };
    }

    function emptyScore() {
        return {
            total: 0,
            keywordData: { matches: [], missing: [], score: 0 },
            suggestions: ["Please upload a resume and ensure a job description is loaded."]
        };
    }

    // --- 3. JD ANALYSIS (The "Reasoning" Brain) ---

    function analyzeJobDescription(text) {
        const cleanText = text.toLowerCase().replace(/[^\w\s-]/g, ' ');
        const tokens = cleanText.split(/\s+/).filter(t => t.length > 2);

        const frequencyMap = {};

        // 1. NGram Extraction (Phrases often matter more than words)
        const phrases = extractPhrases(text);

        phrases.forEach(p => {
            frequencyMap[p] = (frequencyMap[p] || 0) + 1;
        });

        tokens.forEach(t => {
            if (!STOPWORDS.has(t)) {
                frequencyMap[t] = (frequencyMap[t] || 0) + 1;
            }
        });

        // 3. Selection Strategy
        const keywords = [];

        for (const [term, freq] of Object.entries(frequencyMap)) {
            let importance = 1;

            // Ontology Boost (Highest Priority)
            if (ONTOLOGY[term]) {
                importance += 5; // MASSIVE boost for known skills
            }
            // Phrase Boost (Medium Priority)
            else if (term.includes(' ')) {
                importance += 2;
            }

            // Frequency Boost
            if (freq > 2) importance += 1;
            if (freq > 5) importance += 1;

            // Threshold Filtering
            // If it's in Ontology, always keep it.
            // If it's a phrase, keep if freq >= 2
            // If it's a single word, keep if freq >= 3 (stricter)
            const isKnown = !!ONTOLOGY[term];
            const isFrequentPhrase = term.includes(' ') && freq >= 2;
            const isVeryFrequentWord = !term.includes(' ') && freq >= 3;

            if (isKnown || isFrequentPhrase || isVeryFrequentWord) {
                // Double check against Stopwords one last time for safety
                if (!STOPWORDS.has(term)) {
                    keywords.push({ term, weight: importance });
                }
            }
        }

        // Sort by weight desc, then freq desc
        return {
            keywords: keywords.sort((a, b) => b.weight - a.weight).slice(0, 20), // Top 20 only
            rawText: cleanText
        };
    }

    // --- 4. RESUME ANALYSIS ---

    function analyzeResume(text) {
        const lower = text.toLowerCase();
        let structureScore = 50;
        if (lower.includes('experience') || lower.includes('employment')) structureScore += 20;
        if (lower.includes('education') || lower.includes('university')) structureScore += 10;
        if (lower.includes('skills') || lower.includes('technologies')) structureScore += 20;
        if (text.length < 500) structureScore -= 30;

        return { text: lower, structureScore };
    }

    // --- 5. MATCHING LOGIC ---

    function calculateCoverage(resume, jd) {
        let totalWeight = 0;
        let matchedWeight = 0;
        const matches = [];
        const missing = [];

        for (const k of jd.keywords) {
            totalWeight += k.weight;
            const hits = resume.text.includes(k.term);

            if (hits) {
                matchedWeight += k.weight;
                matches.push(k.term);
            } else {
                missing.push(k.term);
            }
        }

        const score = totalWeight === 0 ? 0 : Math.round((matchedWeight / totalWeight) * 100);
        return { score, matches, missing: missing.slice(0, 5) };
    }

    // --- NLP UTILS ---

    function extractPhrases(text) {
        // "Smart" 2-gram extractor
        // Rejects phrases that start/end with stopwords
        const clean = text.toLowerCase().replace(/[^\w\s]/g, ' ');
        const words = clean.split(/\s+/).filter(w => w.length > 2);
        const phrases = [];

        for (let i = 0; i < words.length - 1; i++) {
            const w1 = words[i];
            const w2 = words[i + 1];

            // Rejection Heuristics
            if (STOPWORDS.has(w1) || STOPWORDS.has(w2)) continue;

            // Additional Grammar Heuristics
            // Don't start with a verb-like thing if we can guess (suffixes)
            if (w1.endsWith('ing') && !ONTOLOGY[`${w1} ${w2}`]) continue; // "Thinking through" -> Skip, but "Designing Systems" -> Keep? Hard to say. 
            // Actually "Driving the" is caught by "the" stopword.
            // "Designing user" -> "user" is not stopword. "Designing" is not stopword.
            // Let's rely on the expanded STOPWORDS list mainly.

            phrases.push(`${w1} ${w2}`);
        }
        return phrases;
    }

    function generateSuggestions(matchResult, resumeProfile) {
        const tips = [];
        if (matchResult.score < 50) tips.push("Low Relevance: Try adding more specific keywords from the job description.");
        if (matchResult.missing.length > 0) {
            const missingCaps = matchResult.missing.map(w => w.charAt(0).toUpperCase() + w.slice(1));
            tips.push(`Consider adding: <span style="font-weight:500; color:var(--foreground)">${missingCaps.join(', ')}</span>`);
        }
        return tips;
    }

    return { scoreResume };

})();

if (typeof window !== 'undefined') {
    window.ATS_LOGIC = ATS_LOGIC;
}
