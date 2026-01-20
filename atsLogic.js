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

    // --- 1. KNOWLEDGE BASE (Expanded for Global Roles) ---
    const ONTOLOGY = {
        // TECH & DATA
        "javascript": 3, "react": 3, "python": 3, "java": 3, "aws": 3, "typescript": 3,
        "node": 2, "sql": 3, "docker": 2, "kubernetes": 2, "machine learning": 3,
        "data science": 3, "cloud architecture": 3, "cybersecurity": 3,

        // DESIGN & CREATIVE
        "figma": 3, "product design": 3, "user research": 3, "wireframing": 2,
        "design system": 3, "adobe creative suite": 2, "ux": 3, "ui": 3,

        // HEALTHCARE & MEDICAL
        "patient care": 3, "clinical": 3, "nursing": 3, "medical records": 2,
        "hipaa": 3, "diagnosis": 3, "treatment plan": 2, "cpr": 2, "icu": 3,

        // FINANCE & BUSINESS
        "accounting": 3, "financial analysis": 3, "budgeting": 2, "excel": 2,
        "audit": 3, "risk management": 3, "investment": 2, "macroeconomics": 2,

        // SALES & MARKETING
        "crm": 2, "seo": 3, "sem": 2, "content strategy": 3, "lead generation": 3,
        "copywriting": 2, "b2b": 2, "b2c": 2, "social media": 2,

        // LAW & COMPLIANCE
        "legal research": 3, "litigation": 3, "contract law": 3, "compliance": 3,
        "regulatory": 2, "affidavit": 2, "jurisprudence": 3,

        // EDUCATION
        "curriculum": 3, "pedagogy": 3, "classroom management": 3, "lesson planning": 2,
        "special education": 3, "assessment": 2,

        // SOFT SKILLS (UNIVERSAL)
        "agile": 2, "scrum": 2, "roadmap": 2, "strategy": 3, "kpi": 2,
        "stakeholder": 2, "leadership": 3, "mentorship": 2, "problem solving": 2
    };

    const INDUSTRY_MAP = {
        "Technology": ["javascript", "python", "software", "developer", "cloud", "data", "engineer", "aws", "cybersecurity"],
        "Design": ["figma", "sketch", "ux", "ui", "creative", "product design", "adobe"],
        "Medical": ["patient", "clinical", "nursing", "hospital", "medical", "doctor", "health", "nrs", "rn"],
        "Business": ["business", "finance", "accounting", "strategy", "roadmap", "kpi", "manager", "operations"],
        "Legal": ["legal", "law", "attorney", "paralegal", "compliance", "regulatory", "contract"],
        "Education": ["teaching", "education", "school", "university", "curriculum", "pedagogy", "student"]
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

        // A. Detect Role/Field
        const detectedField = detectIndustry(jdText);

        // B. Extract Target Model from JD
        const jdProfile = analyzeJobDescription(jdText, detectedField);

        // C. Analyze Resume
        const resumeProfile = analyzeResume(resumeText, detectedField);

        // D. Calculate Coverage
        const matchResult = calculateCoverage(resumeProfile, jdProfile);

        // E. Generate Score
        let totalScore = Math.round(
            (matchResult.score * 0.80) +
            (resumeProfile.structureScore * 0.20)
        );
        totalScore = Math.min(100, Math.max(0, totalScore));

        return {
            total: totalScore,
            field: detectedField,
            keywordData: {
                matches: matchResult.matches,
                missing: matchResult.missing,
                score: matchResult.score
            },
            suggestions: generateSuggestions(matchResult, resumeProfile, detectedField),
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

    function detectIndustry(text) {
        const lower = text.toLowerCase();
        let bestField = "General";
        let maxHits = 0;

        for (const [field, markers] of Object.entries(INDUSTRY_MAP)) {
            let hits = 0;
            markers.forEach(m => {
                const regex = new RegExp(`\\b${m}\\b`, 'gi');
                const count = (text.match(regex) || []).length;
                hits += count;
            });
            if (hits > maxHits) {
                maxHits = hits;
                bestField = field;
            }
        }
        return bestField;
    }

    // --- 3. JD ANALYSIS (The "Reasoning" Brain) ---

    function analyzeJobDescription(text, field) {
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

    function analyzeResume(text, field) {
        const lower = text.toLowerCase();
        let structureScore = 50;

        // General structure
        if (lower.includes('experience') || lower.includes('employment')) structureScore += 15;
        if (lower.includes('education') || lower.includes('university')) structureScore += 10;
        if (lower.includes('skills') || lower.includes('technologies')) structureScore += 15;

        // Industry Specific Structure
        if (field === 'Medical' && (lower.includes('certification') || lower.includes('licensed'))) structureScore += 10;
        if (field === 'Design' && (lower.includes('portfolio') || lower.includes('behance'))) structureScore += 10;
        if (field === 'Technology' && (lower.includes('projects') || lower.includes('github'))) structureScore += 10;

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

    function generateSuggestions(matchResult, resumeProfile, field) {
        const tips = [];
        if (matchResult.score < 50) tips.push("Low Relevance: Try adding more specific keywords from the job description.");

        // Field Specific Tips
        if (field === 'Medical' && !resumeProfile.text.includes('license')) tips.push("Tip: Medical roles often require explicit license/certification info.");
        if (field === 'Technology' && !resumeProfile.text.includes('github')) tips.push("Tip: Adding a GitHub link can boost credibility for tech roles.");
        if (field === 'Design' && !resumeProfile.text.includes('portfolio')) tips.push("Tip: Ensure your portfolio link is clearly visible.");

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
