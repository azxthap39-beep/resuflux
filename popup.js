
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
        // 1. Fetch & Render Saved Resumes (Minimal UI)
        await fetchAndRenderResumes();

        // 2. Check for Pending Context Menu Data (Initial Load)
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

async function fetchAndRenderResumes() {
    try {
        const historyListEl = document.getElementById('historyList');
        if (!historyListEl) return;

        // 1. Check Service Availability
        if (!window.SupabaseService) {
            console.error("SupabaseService missing");
            historyListEl.innerHTML = '<div style="color:var(--destructive);">Error: Database Service not initialized.</div>';
            return;
        }

        // 2. Fetch with Timeout (8s)
        const fetchPromise = window.SupabaseService.fetchAllResumes();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Connection Timeout (8s)")), 8000));

        const resumes = await Promise.race([fetchPromise, timeoutPromise]);

        console.log(`DEBUG: Fetched ${resumes.length} via Popup`);

        const container = document.getElementById('historyList');
        const historyWrapper = document.getElementById('savedResumesContainer');

        if (!container || !historyWrapper) {
            console.error("Missing container elements");
            return;
        }

        if (resumes.length === 0) {
            // Show container but with message
            historyWrapper.classList.remove('hidden');
            historyWrapper.style.display = 'block';

            container.innerHTML = `<div style="padding:10px; color:var(--destructive); font-size:11px;">No saved resumes found. (Check RLS or Upload)</div>`;
            return;
        }

        // Expanded "Library" UI
        historyWrapper.classList.remove('hidden');
        // Expanded "Library" UI - Polished
        historyWrapper.style.display = 'block';

        // Create formatted options
        const options = resumes.map(r => {
            const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `<option value="${r.id}">${r.name} (${date})</option>`;
        }).join('');

        // Better styling for the select/button
        container.innerHTML = `
            <div style="margin-bottom:12px; border:1px solid var(--border); border-radius:8px; padding:10px; background:var(--card);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <label style="font-size:12px; font-weight:600; color:var(--foreground);">
                        Saved Library
                    </label>
                    <span style="font-size:10px; color:var(--muted-foreground); background:var(--muted); padding:2px 6px; border-radius:4px;">${resumes.length} Saveds</span>
                </div>
                
                <div style="display:flex; gap:8px;">
                    <div style="position:relative; flex:1;">
                        <select id="resumeLibrarySelect" style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--background); color:var(--foreground); cursor:pointer; appearance:none; -webkit-appearance:none;">
                            <option value="" disabled selected>Select a resume...</option>
                            ${options}
                        </select>
                        <div style="position:absolute; right:10px; top:50%; transform:translateY(-50%); pointer-events:none; color:var(--muted-foreground); font-size:10px;">▼</div>
                    </div>
                    <button id="loadFromLibBtn" class="btn btn-secondary" style="padding:0 16px; font-size:12px;">Load</button>
                </div>
                <div id="libErrorMsg" style="display:none; margin-top:8px; font-size:11px; color:var(--destructive); background:var(--destructive-foreground); padding:6px; border-radius:4px;"></div>
            </div>
        `;

        // Attach Listener
        const select = document.getElementById('resumeLibrarySelect');
        const loadBtn = document.getElementById('loadFromLibBtn');
        const errorBox = document.getElementById('libErrorMsg');

        const loadSelected = async () => {
            const id = select.value;
            if (!id) return;

            errorBox.style.display = 'none';
            errorBox.textContent = '';

            const resume = resumes.find(r => r.id.toString() === id);
            if (resume) {
                // UI Feedback
                const originalBtnText = loadBtn.textContent;
                loadBtn.textContent = "Loading...";
                loadBtn.disabled = true;
                select.disabled = true;

                try {
                    await loadSavedResume(resume);
                } catch (e) {
                    console.error("Load failed", e);
                    errorBox.textContent = "Failed to load resume. See console.";
                    errorBox.style.display = 'block';
                } finally {
                    loadBtn.textContent = originalBtnText;
                    loadBtn.disabled = false;
                    select.disabled = false;
                }
            }
        };

        loadBtn.addEventListener('click', loadSelected);
        select.addEventListener('change', loadSelected);

    } catch (err) {
        console.error("❌ Fetch/Render Error:", err);
        const listContainer = document.getElementById('historyList');
        if (listContainer) {
            listContainer.innerHTML = ''; // Clear loading text

            const errorMsg = document.createElement('div');
            errorMsg.style = "color:var(--destructive); font-size:10px; margin-bottom:4px;";
            errorMsg.textContent = `Error: ${err.message}`;

            const retryBtn = document.createElement('button');
            retryBtn.textContent = "Retry";
            retryBtn.style = "background:var(--secondary); border:1px solid var(--border); border-radius:4px; padding:4px 8px; font-size:10px; cursor:pointer;";
            retryBtn.onclick = () => window.location.reload();

            listContainer.appendChild(errorMsg);
            listContainer.appendChild(retryBtn);
        }
    }
}

async function loadSavedResume(resume) {
    if (state.resumes.some(r => r.id === resume.id)) {
        updateSyncStatus(`Already comparing ${resume.name}`);
        return;
    }

    let textFragment = resume.text;

    // Fetch full text if missing (Lazy Load)
    if (!textFragment && window.SupabaseService) {
        updateSyncStatus(`Downloading ${resume.name}...`);
        const details = await window.SupabaseService.fetchResumeDetails(resume.id);
        if (details) {
            textFragment = details.text;
        } else {
            // throw error to be caught by UI
            throw new Error("Could not download text content from DB");
        }
    }

    state.resumes.push({
        id: resume.id,
        name: resume.name,
        text: textFragment,
        scoreData: null
    });

    updateSyncStatus(`Loaded ${resume.name}`);
    recalculateAll();
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
    const historyWrapper = document.getElementById('savedResumesContainer');

    // Always show library if populated (Fixed Visibility - Forced Persistence)
    if (historyWrapper && historyWrapper.children.length > 0) {
        historyWrapper.classList.remove('hidden');
        historyWrapper.style.display = 'block';
    }

    if (state.resumes.length === 0) {
        container.classList.add('hidden');
        document.getElementById('suggestionsSection').classList.add('hidden');
        // Ensure library is visible if empty but data exists
        if (historyWrapper && historyWrapper.children.length > 0) {
            historyWrapper.classList.remove('hidden');
        }
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = ''; // Clear

    // Update Field Badge
    const fieldEl = document.getElementById('displayField');

    // Show ALL resumes, even if no score yet
    const scoredResumes = state.resumes.sort((a, b) => {
        const scoreA = a.scoreData ? a.scoreData.total : -1;
        const scoreB = b.scoreData ? b.scoreData.total : -1;
        return scoreB - scoreA;
    });

    if (fieldEl && scoredResumes.length > 0 && scoredResumes[0].scoreData) {
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

        // Helper for simple formatting
        const parseMarkdown = (text) => {
            if (!text) return "";
            return text
                .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--foreground); font-weight:700;">$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
        };

        // 1. Explain Score
        aiExplanation.textContent = window.ResuFluxAI.explainScore(bestResume.scoreData);

        // 2. Explain Gaps (Enhanced UI)
        aiGaps.innerHTML = parseMarkdown(window.ResuFluxAI.explainSkillGaps(bestResume.scoreData));
        aiGaps.style.cssText = "font-size: 12px; line-height: 1.6; color: var(--foreground); background: #f8fafc; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #e2e8f0; border-left: 3px solid #6366f1;";

        // 3. AI Suggestions
        aiSuggestionsList.innerHTML = '';
        const aiTips = window.ResuFluxAI.getAISuggestions(bestResume.scoreData);
        aiTips.forEach(tip => {
            const tipDiv = document.createElement('div');
            // Premium Card Styling
            tipDiv.style.cssText = "padding:16px; border-radius:8px; border:1px solid #e2e8f0; background:white; margin-bottom:8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: transform 0.2s;";

            tipDiv.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                     <div style="width:4px; height:16px; background:#10b981; border-radius:4px;"></div>
                     <div style="font-size:13px; font-weight:700; color:#1e293b; letter-spacing:-0.01em;">${tip.tip}</div>
                </div>
                <div style="font-size:12px; color:#64748b; line-height:1.6; margin-bottom:12px; padding-left:14px;">
                    ${parseMarkdown(tip.reason)}
                </div>
                <div style="padding-left:14px;">
                    <span style="font-size:10px; font-weight:700; text-transform:uppercase; color:#6366f1; background:#eef2ff; padding:4px 8px; border-radius:4px; letter-spacing:0.04em;">
                       FIX: ${tip.location}
                    </span>
                </div>
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

    // FINAL VISIBILITY CHECK: Ensure Saved Library is ALWAYS visible
    const libContainer = document.getElementById('savedResumesContainer');
    if (libContainer && libContainer.children.length > 0) {
        libContainer.classList.remove('hidden');
        libContainer.style.cssText = "display: block !important; margin-bottom: 16px; border: 1px dashed var(--border); padding: 10px; border-radius: 6px;";
    }
}

function createScoreCard(resume, isWinner = false) {
    const data = resume.scoreData;

    // Handle "Ready to Compare" state (No JD yet)
    if (!data) {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `
            <div class="card-content" style="text-align:center; padding: 24px 16px;">
                <div class="outfit" style="font-weight:700; font-size:13px; margin-bottom:12px; color:var(--foreground); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${resume.name}
                </div>
                <div style="background:var(--secondary); width:50px; height:50px; border-radius:50%; margin:0 auto 12px; display:flex; align-items:center; justify-content:center;">
                    <span style="font-size:20px;">📄</span>
                </div>
                <div style="font-size:11px; color:var(--muted-foreground); font-weight:600;">Ready to Compare</div>
                <div style="font-size:10px; color:var(--muted-foreground); margin-top:4px;">Add a Job Description</div>
            </div>
        `;
        return div;
    }

    const score = data.total;

    // Enterprise-Grade Colors
    let color = '#94a3b8'; // Slate
    if (score >= 80) color = '#10b981'; // Emerald
    else if (score >= 60) color = '#f59e0b'; // Amber
    else if (score > 0) color = '#ef4444'; // Red

    const div = document.createElement('div');
    div.className = 'card';

    // Base Styles (Enterprise Polish)
    div.style.transition = 'all 0.2s ease';
    div.style.position = 'relative';

    if (isWinner) {
        div.style.border = '2px solid #6366f1';
        div.style.boxShadow = '0 12px 30px -10px rgba(99, 102, 241, 0.25)';
        div.style.overflow = 'visible';
        div.style.marginTop = '12px'; // Room for badge
        div.style.transform = 'scale(1.02)'; // Slight pop
    } else {
        // Improved Non-Winner Styling
        div.style.border = '1px solid var(--border)';
        div.style.marginTop = '12px'; // Align with winner
        div.style.background = '#fafafa'; // Subtle contrast
        div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
    }

    div.innerHTML = `
        <div class="card-content" style="text-align:center; padding: 28px 16px 20px; position:relative;">
            ${isWinner ? `
                <div class="outfit" style="position:absolute; top:-14px; left:50%; transform:translateX(-50%); background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color:white; font-size:10px; font-weight:800; padding:5px 16px; border-radius:99px; text-transform:uppercase; letter-spacing:0.12em; border: 2.5px solid white; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); white-space:nowrap; z-index:10;">
                    Best Fit Match
                </div>` : ''}
            
            <!-- Filename: Fixed height, vertically centered, 2-line clamp -->
            <div class="outfit" style="font-weight:700; font-size:13px; height:38px; margin-bottom:20px; color:var(--foreground); line-height:1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">
                ${resume.name}
            </div>

            <div class="gauge-circle" style="background: conic-gradient(${color} ${score}%, transparent ${score}%); box-shadow: inset 0 0 0 7px var(--secondary); margin-bottom: 24px;">
                <div class="gauge-center">
                    <span class="outfit" style="color:${color}; font-size:26px; line-height:1; font-weight:800;">${score}</span>
                    <span style="font-size:9px; color:var(--muted-foreground); margin-top:2px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; opacity: 0.7;">Score</span>
                </div>
            </div>
            
            <div class="outfit" style="font-weight:700; font-size:14px; margin-bottom:6px; color:var(--foreground); letter-spacing:-0.01em;">Match Ranking</div>
            <div style="font-size:12px; color:var(--muted-foreground); font-weight:500; background:var(--secondary); display:inline-block; padding:4px 10px; border-radius:99px;">
                ${data.keywordData.matches.length} keywords validated
            </div>

            <div style="margin-top:24px; text-align:left; border-top:1px solid var(--border); padding-top:16px;">
                <div class="outfit" style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted-foreground); margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                    <span style="display:block; width:6px; height:6px; background:var(--destructive); border-radius:50%;"></span>
                    Technical Skill Gaps
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${data.keywordData.missing.length > 0
            ? data.keywordData.missing.slice(0, 6).map(k =>
                `<span class="badge" style="color:var(--destructive); border:1px solid rgba(239, 68, 68, 0.15); background: #fef2f2; font-weight:600; font-size:10px; padding:4px 8px; border-radius: 4px;">${k}</span>`
            ).join('')
            : '<div class="outfit" style="color:var(--primary); font-size:11px; font-weight:800;">Maximum Match Performance</div>'}
                </div>
            </div>
        </div>
    `;
    return div;
}

// --- ACTIONS ---

async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    alert(`DEBUG: Selected ${files.length} files`);
    if (files.length === 0) return;

    // BATCH MODE (More than 3 files)
    // Prevents memory crash by only saving to database and NOT rendering cards for all of them.
    if (files.length > 3) {
        const confirmBatch = confirm(`Bulk Limit: You are uploading ${files.length} resumes.\n\nTo prevent the extension from crashing, we will save them to your library/history list directly without opening all of them in the comparison view.\n\nClick OK to proceed.`);
        if (!confirmBatch) return;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                updateSyncStatus(`Batch Processing ${i + 1}/${files.length}: ${file.name}...`);

                // 1. Parse
                let text = '';
                const fName = file.name.toLowerCase();
                try {
                    if (fName.endsWith('.pdf')) text = await parsePdf(file);
                    else if (fName.endsWith('.docx')) text = await parseDocx(file);
                    else text = await file.text();
                } catch (parseErr) {
                    console.error(`Skipping ${file.name}:`, parseErr);
                    continue; // Skip bad files
                }

                if (!text || text.length < 50) continue;

                // 2. Save to Supabase
                if (window.SupabaseService) {
                    const keywords = window.ATS_LOGIC ? window.ATS_LOGIC.extractKeywords(text) : [];
                    await window.SupabaseService.saveResumeToSupabase({
                        name: file.name,
                        extracted_text: text,
                        keywords: keywords
                    });
                }

                // 3. FORCE GARBAGE COLLECTION (Logical)
                // We do NOT add to state.resumes here.
                text = null;
            }

            // Done
            updateSyncStatus("Bulk Upload Complete!");
            await fetchAndRenderResumes(); // Refresh the list
            setTimeout(() => updateSyncStatus(""), 3000);

        } catch (err) {
            console.error('❌ Batch Error:', err);
            updateSyncStatus("Batch Error: " + err.message);
        }
        return;
    }

    // INTERACTIVE MODE (1-3 Files)
    // Loads them directly into the comparison view
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const index = state.resumes.length;

        // Placeholder
        state.resumes.push({ id: null, name: file.name, text: null, scoreData: null });

        try {
            updateSyncStatus(`Processing ${i + 1}/${files.length}: ${file.name}...`);
            let text = '';
            const fName = file.name.toLowerCase();
            if (fName.endsWith('.pdf')) text = await parsePdf(file);
            else if (fName.endsWith('.docx')) text = await parseDocx(file);
            else text = await file.text();

            if (!text || text.length < 50) throw new Error("Empty or unreadable file.");

            state.resumes[index].text = text;

            if (window.SupabaseService) {
                // Sync
                const keywords = window.ATS_LOGIC ? window.ATS_LOGIC.extractKeywords(text) : [];
                const saved = await window.SupabaseService.saveResumeToSupabase({
                    name: file.name,
                    extracted_text: text,
                    keywords: keywords
                });

                if (saved) state.resumes[index].id = saved.id;
            }

        } catch (err) {
            console.error('❌ File error:', err);
            state.resumes[index].error = err.message;
            alert(`Error reading file ${file.name}: ${err.message}`);
        }
    }

    // Refresh List & Recalculate
    if (window.SupabaseService) await fetchAndRenderResumes();
    recalculateAll();

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
    let emailFound = null;

    for (let i = 0; i < state.resumes.length; i++) {
        const r = state.resumes[i];
        if (r.text && state.currentJD) {
            // V5 Call
            r.scoreData = window.ATS_LOGIC.scoreResume(r.text, state.currentJD);

            // Check for Email in JD (only need to do once really, but simple here)
            const extracted = window.ATS_LOGIC.extractEmail(state.currentJD);
            if (extracted) emailFound = extracted;

            // Supabase Sync (Comparisons)
            if (r.id && window.SupabaseService) {
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

    // Update Email UI
    const emailDiv = document.getElementById('emailActionContainer');
    const emailBtn = document.getElementById('emailActionBtn');

    // Modal Elements
    const modal = document.getElementById('emailTemplateModal');
    const subjectInput = document.getElementById('emailSubjectInput');
    const bodyInput = document.getElementById('emailBodyInput');
    const sendBtn = document.getElementById('sendEmailBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelEmailBtn');
    const saveTemplateBtn = document.getElementById('saveTemplateBtn'); // NEW

    if (emailDiv && emailBtn && modal) {
        if (emailFound && state.resumes.length > 0) {
            emailDiv.classList.remove('hidden');

            // OPEN MODAL HANDLER
            emailBtn.onclick = async () => {
                // 1. Load Template
                const template = await window.EmailTemplateManager.loadTemplate();

                // 2. Prepare Data for Replacement
                // Sort by best score to get name/skills
                const bestResume = state.resumes.sort((a, b) => (b.scoreData?.total || 0) - (a.scoreData?.total || 0))[0];
                const data = {
                    role: state.metadata?.title || "Product Designer",
                    company: state.metadata?.company || "the company",
                    candidateName: bestResume.name ? bestResume.name.replace(/\.[^/.]+$/, "") : "Candidate",
                    topSkill: bestResume.scoreData?.keywordData?.matches?.[0] || "my relevant experience"
                };

                // 3. Render
                const rendered = window.EmailTemplateManager.renderTemplate(template, data);

                // 4. Populate Inputs
                subjectInput.value = rendered.subject;
                bodyInput.value = rendered.body;

                // 5. Show Modal
                modal.classList.remove('hidden');
            };

            // SEND HANDLER
            sendBtn.onclick = () => {
                const subj = subjectInput.value;
                const body = bodyInput.value;
                window.open(`mailto:${emailFound}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`);
                modal.classList.add('hidden');
            };

            // SAVE TEMPLATE HANDLER
            if (saveTemplateBtn) {
                saveTemplateBtn.onclick = async () => {
                    const subj = subjectInput.value;
                    const body = bodyInput.value;
                    // Revert specific variable placeholders if possible? 
                    // It's hard to reverse-engineer variables. 
                    // For now, we save it AS IS (Custom Message).
                    // User can manually add [Role] if they want.
                    await window.EmailTemplateManager.saveTemplate(subj, body);
                    alert("Template Saved as Default!");
                };
            }

            // CLOSE HANDLERS
            const closeModal = () => modal.classList.add('hidden');
            closeBtn.onclick = closeModal;
            cancelBtn.onclick = closeModal;

            // Update label
            emailBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                Email ${emailFound}
            `;
        } else {
            emailDiv.classList.add('hidden');
        }
    }

    // saveSessionLocally(); // DISABLED to prevent conflict with Supabase Library
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
// Force hide legacy styling just in case
const styleCheck = document.createElement('style');
styleCheck.innerHTML = `
#historyList .history-item { display: none !important; } 
/* Ensuring the dropdown logic controls visibility */
`;
document.head.appendChild(styleCheck);
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
