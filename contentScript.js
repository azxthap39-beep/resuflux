console.log("ATS Content Script: Loaded");

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SCRAPE_JD") {
        try {
            console.log("ATS Content Script: Scraping started...");
            const result = scrapeJobDescription();
            sendResponse({
                success: true,
                jdText: result.text,
                metadata: result.metadata
            });
        } catch (err) {
            console.error("ATS Content Script Error:", err);
            sendResponse({ success: false, error: err.message });
        }
    }
    return true;
});


function scrapeJobDescription() {
    // 1. Working Copy: Clone body to avoid mutating the live page
    const clone = document.body.cloneNode(true);

    // 2. Pre-Scrub: Remove known noise elements
    removeNoise(clone);

    // 3. Extract Metadata (Title, Company, Location, Salary)
    const metadata = extractMetadata();

    // 4. Strategy A: Container Search
    // Look for explicit job containers (Greenhouse, Lever, LinkedIn, etc.)
    const containerText = tryContainers(clone);
    let jdText = "";

    if (containerText && containerText.length > 200) {
        jdText = cleanOutput(containerText);
    } else {
        // 5. Strategy B: Smart Anchors (Look for "Role", "Requirements", etc.)
        const anchorText = trySmartAnchors(clone);
        if (anchorText && anchorText.length > 200) {
            jdText = cleanOutput(anchorText);

        } else {
            // 6. Strategy C: Heuristic Fallback
            const heuristicText = tryHeuristics(clone);
            jdText = cleanOutput(heuristicText);
        }
    }

    return {
        text: jdText,
        metadata: metadata,
        strategy: containerText ? 'Container Match' : (jdText === cleanOutput(trySmartAnchors(clone)) ? 'Smart Anchor' : 'Heuristic Fallback')
    };
}

// --- HELPERS ---

function trySmartAnchors(root) {
    // Keywords determining the start/end of a JD
    const headers = [
        "about the role", "about the job", "role", "responsibilities", "what you'll do",
        "what you will do", "requirements", "qualifications", "what we look for",
        "who you are", "about you", "job description"
    ];

    // Find all elements containing these headers (H1-H6, Strong, P)
    const candidates = [];
    const elements = root.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, p');

    elements.forEach(el => {
        const text = el.innerText.toLowerCase().trim();
        if (headers.some(h => text.includes(h) && text.length < 100)) {
            candidates.push(el);
        }
    });

    if (candidates.length === 0) return null;

    // Find the Common Ancestor of these headers
    // If we have "About You" and "Requirements", their parent is likely the JD container
    let parent = candidates[0].parentElement;
    while (parent && parent !== root) {
        // Check if this parent contains most of our candidates
        const containsCount = candidates.filter(c => parent.contains(c)).length;
        if (containsCount > 1 || candidates.length === 1) { // If >1 header found, or just 1 distinct header
            // Heuristic: The parent should have significant text length (avoid tiny wrappers)
            if (parent.innerText.length > 500) {
                return parent.innerText;
            }
        }
        parent = parent.parentElement;
    }

    return null;
}

function removeNoise(root) {
    const selectors = [
        'script', 'style', 'noscript', 'iframe', 'svg', 'button', 'input', 'form',
        'nav', 'header', 'footer', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
        '.cookie-banner', '#cookie-banner', '.modal', '.popup', '.sidebar', '.ad', '.ads',
        '.related-jobs', '.suggestions', '.share-buttons', '.social-media'
    ];
    selectors.forEach(sel => {
        const els = root.querySelectorAll(sel);
        els.forEach(el => el.remove());
    });
}

function extractMetadata() {
    const meta = {
        title: "",
        company: "",
        location: "",
        salary: ""
    };

    // 1. Try JSON-LD (Schema.org) - The Best Source
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
        try {
            const data = JSON.parse(script.innerText);
            // Handle both single object and graph arrays
            const graph = data['@graph'] || (Array.isArray(data) ? data : [data]);
            const job = graph.find(item => item['@type'] === 'JobPosting');

            if (job) {
                meta.title = job.title || "";
                meta.company = (job.hiringOrganization ? job.hiringOrganization.name : "") || "";

                if (job.jobLocation) {
                    const loc = job.jobLocation;
                    if (loc.address) {
                        meta.location = [loc.address.addressLocality, loc.address.addressRegion].filter(x => x).join(', ');
                    }
                }

                // Salary is often nested
                if (job.baseSalary) {
                    const val = job.baseSalary.value;
                    if (val) {
                        const min = val.minValue || val.value;
                        const max = val.maxValue;
                        meta.salary = max ? `$${min} - $${max}` : `$${min}`;
                    }
                }

                break; // Found it
            }
        } catch (e) { /* ignore parse errors */ }
    }

    // 2. Fallback: OpenGraph / Meta Tags
    if (!meta.title) meta.title = getMetaContent('og:title') || document.title;
    if (!meta.company) meta.company = getMetaContent('og:site_name');

    // 3. Fallback: Heuristics (H1, etc.)
    if (!meta.title) {
        const h1 = document.querySelector('h1');
        if (h1) meta.title = h1.innerText.trim();
    }

    // Heuristic for Company if still missing - try looking for "at [Company]" in title
    if (!meta.company && meta.title.includes(' at ')) {
        meta.company = meta.title.split(' at ').pop();
    }

    return meta;
}

function getMetaContent(name) {
    const el = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') : null;
}

function tryContainers(root) {
    // Known selectors for popular ATS
    const selectors = [
        '[data-testid="job-details"]', // LinkedIn
        '.job-description',
        '#job-description',
        '[class*="JobDescription"]',
        '[class*="jobDescription"]',
        '.description',
        '#content'
    ];

    for (const sel of selectors) {
        const el = root.querySelector(sel);
        if (el) return el.innerText;
    }
    return null;
}

function tryHeuristics(root) {
    // Get all paragraphs and list items
    const blocks = Array.from(root.querySelectorAll('p, li, div'));

    // Score blocks by density of text
    // Filter out short nav items
    const candidates = blocks.filter(el => {
        const text = el.innerText.trim();
        return text.length > 40 && text.split(' ').length > 8;
    });

    return candidates.map(c => c.innerText).join('\n\n');
}

function cleanOutput(text) {
    if (!text) return "";
    return text
        .replace(/\t/g, ' ')
        .replace(/\n\s*\n/g, '\n\n') // Collapse multiple newlines
        .trim();
}
