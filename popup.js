
// --- STATE MANAGEMENT ---
const state = {
    currentJD: '',
    resumes: [] // Dynamic array for N resumes
};

const ELEMENTS = {
    fileInputA: document.getElementById('fileInputA'),
    jdInput: document.getElementById('jdInput'),
    jdContainer: document.getElementById('jdInputContainer'),
    scrapeBtn: document.getElementById('scrapeBtn'),
    historyList: document.getElementById('historyList'),
    syncStatus: document.getElementById('syncStatus')
};

document.addEventListener('DOMContentLoaded', () => {
    initPopup();
});

async function initPopup() {
    try {
        // 1. Check for Pending Context Menu Data (Initial Load)
        await loadPendingJD();

        // 2. Load History (Disabled)
        // await loadHistory();

        // 3. Attach Listeners
        if (ELEMENTS.fileInputA) ELEMENTS.fileInputA.addEventListener('change', (e) => handleFileSelect(e));
        if (ELEMENTS.jdInput) ELEMENTS.jdInput.addEventListener('input', handleJDChange);

        // Listen for Context Menu updates (Real-time)
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.pendingJD && changes.pendingJD.newValue) {
                console.log("ATS Popup: Storage changed, loading new JD...");
                loadPendingJD();
            }
        });

        const toggleBtn = document.getElementById('toggleJdBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const box = ELEMENTS.jdContainer;
                if (box) {
                    if (box.classList.contains('hidden')) {
                        box.classList.remove('hidden');
                    } else {
                        box.classList.add('hidden');
                    }
                }
            });
        }

        if (ELEMENTS.scrapeBtn) {
            ELEMENTS.scrapeBtn.addEventListener('click', handleGetJD);
        }

        // 4. Reveal UI
        const loader = document.getElementById('loading-screen');
        const app = document.getElementById('app-container');
        if (loader && app) {
            loader.style.display = 'none';
            app.style.display = 'block';
        }

    } catch (err) {
        console.error("ATS Initialization Failed:", err);
        const loader = document.getElementById('loading-screen');
        if (loader) loader.innerHTML = `<span style="color:var(--destructive)">Error: ${err.message}</span>`;
    }
}

async function loadPendingJD() {
    const data = await chrome.storage.local.get(['pendingJD', 'sourceUrl']);
    if (data.pendingJD) {
        console.log("ATS Popup: Loading pending JD");
        state.currentJD = data.pendingJD;
        state.metadata = {
            company: "Manual Selection",
            title: "Imported Selection",
            location: "Unknown",
            url: data.sourceUrl
        };

        // Clear immediately
        chrome.storage.local.remove(['pendingJD', 'sourceUrl']);

        updateJobCard(state.metadata);
        if (ELEMENTS.jdInput) ELEMENTS.jdInput.value = state.currentJD;
        if (ELEMENTS.jdContainer) ELEMENTS.jdContainer.classList.remove('hidden');
        recalculateAll();
    }
}

// --- ROBUST SCRAPING (MV3) ---

async function handleGetJD() {
    console.log("ATS Popup: Starting JD scrape flow...");
    const btn = ELEMENTS.scrapeBtn;
    const originalText = "Scrape Page";

    // UI Feedback
    btn.disabled = true;
    btn.textContent = "...";

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error("No active tab.");

        const url = tab.url || "";
        if (url.startsWith("chrome://") || url.startsWith("file://")) {
            throw new Error("Cannot scrape this page.");
        }

        // Inject
        if (!chrome.scripting) throw new Error("Reload extension.");
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['contentScript.js']
        });

        // Wait & Send
        await new Promise(r => setTimeout(r, 500));
        const response = await sendMessageWithTimeout(tab.id, { type: "SCRAPE_JD" }, 5000);

        if (response && response.success && response.jdText) {
            let text = response.jdText;
            if (text.length > 20000) text = text.substring(0, 20000);

            // Update State
            state.currentJD = text;
            state.metadata = response.metadata || {};

            // Sync UI
            updateJobCard(state.metadata);
            if (ELEMENTS.jdInput) ELEMENTS.jdInput.value = text;

            btn.textContent = "Done";
            btn.style.backgroundColor = "var(--primary)";

            debounce(recalculateAll, 500)();

        } else {
            throw new Error(response.error || "No text.");
        }

    } catch (err) {
        console.error("Scrape Error:", err);
    } finally {
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
        }, 1500);
    }
}

function updateJobCard(meta) {
    document.getElementById('displayTitle').textContent = meta.title || "Unknown Role";
    document.getElementById('displayCompany').textContent = meta.company || "Unknown Company";

    const locEl = document.getElementById('displayLocation');
    locEl.textContent = meta.location || "Remote";
}

function sendMessageWithTimeout(tabId, message, timeoutMs) {
    return new Promise((resolve, reject) => {
        let isTimedOut = false;
        const timer = setTimeout(() => {
            isTimedOut = true;
            reject(new Error("Timeout"));
        }, timeoutMs);

        chrome.tabs.sendMessage(tabId, message, (response) => {
            clearTimeout(timer);
            if (isTimedOut) return;
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(response);
        });
    });
}

// --- RENDERING (V5 ShadCN) ---

function renderView() {
    // Update Drop Zone Label
    const labelA = document.getElementById('fileALabel');
    if (labelA) {
        labelA.textContent = state.resumes.length > 0 ? `${state.resumes.length} Resumes Added` : "Upload Resumes";
    }

    const zoneA = document.getElementById('dropZoneA');
    if (zoneA) zoneA.className = state.resumes.length > 0 ? 'file-drop-zone active' : 'file-drop-zone';

    // Results Section
    const container = document.getElementById('scoreSection');
    if (state.resumes.length === 0) {
        container.classList.add('hidden');
        document.getElementById('suggestionsSection').classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = ''; // Clear

    // Update Field Badge
    const fieldEl = document.getElementById('displayField');
    const scoredResumes = state.resumes.filter(r => r.scoreData);
    if (fieldEl && scoredResumes.length > 0) {
        fieldEl.textContent = scoredResumes[0].scoreData.field || "General";
    }

    // Determine Winner
    let winnerId = null;
    let maxScore = -1;
    scoredResumes.forEach((r, idx) => {
        if (r.scoreData.total > maxScore) {
            maxScore = r.scoreData.total;
            winnerId = idx;
        }
    });

    // Create Grid
    const grid = document.createElement('div');
    if (scoredResumes.length === 2) {
        grid.className = 'grid-2';
    } else if (scoredResumes.length > 2) {
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
    }
    grid.style.gap = '12px';

    scoredResumes.forEach((r, idx) => {
        const isWinner = scoredResumes.length > 1 && maxScore > 0 && idx === winnerId;
        const card = createScoreCard(r, isWinner);
        grid.appendChild(card);
    });
    container.appendChild(grid);

    // AI Intelligence Rendering (V1.4)
    const aiSection = document.getElementById('aiIntelligenceSection');
    const aiExplanation = document.getElementById('aiExplanation');
    const aiGaps = document.getElementById('aiGaps');
    const aiSuggestionsList = document.getElementById('aiSuggestionsList');

    if (scoredResumes.length > 0 && window.ResuFluxAI) {
        aiSection.style.display = 'block';
        const bestResume = scoredResumes[winnerId || 0];

        // 1. Explain Score
        aiExplanation.textContent = window.ResuFluxAI.explainScore(bestResume.scoreData);

        // 2. Explain Gaps
        aiGaps.innerHTML = window.ResuFluxAI.explainSkillGaps(bestResume.scoreData);

        // 3. AI Suggestions
        aiSuggestionsList.innerHTML = '';
        const aiTips = window.ResuFluxAI.getAISuggestions(bestResume.scoreData);
        aiTips.forEach(tip => {
            const tipDiv = document.createElement('div');
            tipDiv.style = "padding:12px; border-radius:var(--radius); border:1px solid var(--border); background:var(--card); box-shadow: 0 2px 4px rgba(0,0,0,0.02);";
            tipDiv.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                    <div style="width:2px; height:12px; background:var(--primary); border-radius:2px;"></div>
                    <div style="font-size:12px; font-weight:700; color:var(--foreground);">${tip.tip}</div>
                </div>
                <div style="font-size:11px; color:var(--muted-foreground); line-height:1.4; margin-bottom:8px;">${tip.reason}</div>
                <div style="font-size:9px; font-weight:800; text-transform:uppercase; color:var(--primary); opacity:0.7; letter-spacing:0.05em;">Suggested Fix: ${tip.location}</div>
            `;
            aiSuggestionsList.appendChild(tipDiv);
        });
    }

    // Suggestions (Dynamic for all resumes)
    const suggestionList = document.getElementById('suggestionList');
    suggestionList.innerHTML = '';

    let hasSuggestions = scoredResumes.length > 0;

    // Winner Suggestion
    if (scoredResumes.length > 1 && winnerId !== null) {
        const winner = scoredResumes[winnerId];
        const winnerTip = document.createElement('li');
        winnerTip.style = "margin:0px 0 20px; font-size:13px; line-height:1.5; color:var(--foreground); font-weight:600; padding:16px; background:linear-gradient(135deg, #f5f3ff 0%, #f0f9ff 100%); border-radius:var(--radius); list-style:none; border:1px solid rgba(99,102,241,0.15); box-shadow: var(--shadow-sm);";
        winnerTip.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:20px; filter: drop-shadow(0 0 8px rgba(99,102,241,0.3));">✨</span>
                <div>
                   <div class="outfit" style="color:var(--primary); font-size:11px; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:2px; font-weight:800;">Strategic Recommendation</div>
                   <div style="opacity:0.9;">Deploy <span style="font-weight:700; color:var(--primary);">"${winner.name}"</span> for maximum conversion.</div>
                </div>
            </div>`;
        suggestionList.appendChild(winnerTip);
    }

    if (hasSuggestions) {
        document.getElementById('suggestionsSection').classList.remove('hidden');
    } else {
        document.getElementById('suggestionsSection').classList.add('hidden');
    }
}

function createScoreCard(resume, isWinner = false) {
    const data = resume.scoreData;
    const score = data.total;

    // Enterprise-Grade Colors
    let color = '#94a3b8'; // Slate
    if (score >= 80) color = '#10b981'; // Emerald
    else if (score >= 60) color = '#f59e0b'; // Amber
    else if (score > 0) color = '#ef4444'; // Red

    const div = document.createElement('div');
    div.className = 'card';
    if (isWinner) {
        div.style.border = '2px solid #6366f1';
        div.style.boxShadow = '0 12px 30px -10px rgba(99, 102, 241, 0.25)';
    }

    div.innerHTML = `
        <div class="card-content" style="text-align:center; padding: 24px 16px; position:relative;">
            ${isWinner ? `
                <div class="outfit" style="position:absolute; top:-12px; left:50%; transform:translateX(-50%); background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color:white; font-size:10px; font-weight:700; padding:4px 14px; border-radius:99px; text-transform:uppercase; letter-spacing:0.1em; border: 2px solid white; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">
                    Best Fit Match
                </div>` : ''}
            
            <div class="outfit" style="font-weight:700; font-size:13px; margin-bottom:20px; color:var(--foreground); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:-0.01em;">
                ${resume.name}
            </div>

            <div class="gauge-circle" style="background: conic-gradient(${color} ${score}%, transparent ${score}%); box-shadow: inset 0 0 0 7px var(--secondary);">
                <div class="gauge-center">
                    <span class="outfit" style="color:${color}; font-size:24px; margin-top:2px;">${score}</span>
                    <span style="font-size:9px; color:var(--muted-foreground); margin-top:-4px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; opacity: 0.8;">Score</span>
                </div>
            </div>
            
            <div class="outfit" style="font-weight:700; font-size:15px; margin-bottom:4px; color:var(--foreground); letter-spacing:-0.01em;">Match Ranking</div>
            <div style="font-size:11px; color:var(--muted-foreground); font-weight:600;">${data.keywordData.matches.length} keywords validated</div>

            <div style="margin-top:24px; text-align:left; border-top:1px solid var(--border); padding-top:16px;">
                <div class="outfit" style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted-foreground); margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                    <span style="display:block; width:6px; height:6px; background:var(--destructive); border-radius:50%; animation: pulse 2s infinite;"></span>
                    Technical Skill Gaps
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    ${data.keywordData.missing.length > 0
            ? data.keywordData.missing.slice(0, 8).map(k =>
                `<span class="badge" style="color:var(--destructive); border:none; background: #fff1f2; font-weight:700; font-size:10px; padding:4px 12px;">${k}</span>`
            ).join('')
            : '<span class="text-sm" style="color:var(--primary); font-weight:800; font-family:Outfit;">Maximum Match Performance</span>'}
                </div>
            </div>
        </div>
    `;
    return div;
}

// --- ACTIONS ---

async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const resumeObj = { id: null, name: file.name, text: null, scoreData: null };
        const index = state.resumes.length;
        state.resumes.push(resumeObj);

        try {
            updateSyncStatus(`Processing ${i + 1}/${files.length}: ${file.name}...`);
            let text = '';
            if (file.name.endsWith('.pdf')) text = await parsePdf(file);
            else if (file.name.endsWith('.docx')) text = await parseDocx(file);
            else text = await file.text();

            if (!text || text.length < 50) throw new Error("Empty or unreadable file.");

            state.resumes[index].text = text;

            if (window.SupabaseService) {
                updateSyncStatus(`Syncing ${file.name}...`);
                const rid = await window.SupabaseService.upsertResume(file.name, text);
                if (rid) state.resumes[index].id = rid;
            }

            recalculateAll();

        } catch (err) {
            console.error('❌ File error:', err);
            state.resumes[index].error = err.message;
        }
    }
    updateSyncStatus("Done!");
    setTimeout(() => updateSyncStatus(""), 2000);
}

function handleJDChange(e) {
    state.currentJD = e.target.value;
    debounce(recalculateAll, 1000)();
}

let debounceTimer;
function debounce(func, delay) {
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}

async function recalculateAll() {
    for (let i = 0; i < state.resumes.length; i++) {
        const r = state.resumes[i];
        if (r.text && state.currentJD) {
            // V5 Call
            r.scoreData = window.ATS_LOGIC.scoreResume(r.text, state.currentJD);

            // Supabase Sync (Comparisons)
            if (r.id && window.SupabaseService) {
                console.log(`📊 Saving comparison for "${r.name}" (ID: ${r.id})...`);
                await window.SupabaseService.upsertComparison(
                    r.id,
                    state.currentJD,
                    r.scoreData.total,
                    r.scoreData.keywordData.matches,
                    r.scoreData.keywordData.missing
                );
            }
        }
    }
    saveSessionLocally();
    renderView();
}

// --- PERSISTENCE ---

function saveSessionLocally() {
    if (state.resumes.length === 0) return;

    const session = {
        id: Date.now(),
        date: new Date().toLocaleDateString(),
        jdSummary: state.metadata ? state.metadata.company : (state.currentJD ? "Manual JD" : "Unknown Job"),
        resumes: state.resumes.map(r => ({ name: r.name, score: r.scoreData?.total }))
    };

    chrome.storage.local.get(['history'], (res) => {
        const h = res.history || [];
        h.unshift(session);
        chrome.storage.local.set({ history: h.slice(0, 10) }, loadHistory);
    });
}

function loadHistory() {
    return new Promise(resolve => {
        chrome.storage.local.get(['history'], (res) => {
            const h = res.history || [];
            if (!ELEMENTS.historyList) { resolve(); return; }

            ELEMENTS.historyList.innerHTML = h.map(item => `
                <div class="history-item" style="border-bottom:1px solid var(--border); padding:8px 0;">
                    <div style="font-weight:500; font-size:12px;">${item.jdSummary}</div>
                    <div style="font-size:11px; color:var(--muted-foreground);">
                        ${item.resumes.map(r => r.name ? `${r.name.substring(0, 10)} (${r.score || 0})` : '').join(' | ')}
                    </div>
                </div>
            `).join('');
            resolve();
        });
    });
}

function updateSyncStatus(msg) {
    if (ELEMENTS.syncStatus) ELEMENTS.syncStatus.textContent = msg;
}

// --- PARSERS ---

async function parsePdf(file) {
    const ab = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        const tc = await p.getTextContent();
        fullText += tc.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
}

async function parseDocx(file) {
    const ab = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: ab });
    return res.value;
}
