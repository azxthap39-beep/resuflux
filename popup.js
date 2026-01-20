
// --- STATE MANAGEMENT ---
const state = {
    currentJD: '',
    resumes: [
        { id: null, name: null, text: null, scoreData: null }, // Resume A
        { id: null, name: null, text: null, scoreData: null }  // Resume B
    ]
};

const ELEMENTS = {
    fileInputA: document.getElementById('fileInputA'),
    fileInputB: document.getElementById('fileInputB'),
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
        if (ELEMENTS.fileInputA) ELEMENTS.fileInputA.addEventListener('change', (e) => handleFileSelect(e, 0));
        if (ELEMENTS.fileInputB) ELEMENTS.fileInputB.addEventListener('change', (e) => handleFileSelect(e, 1));
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
    const resumeA = state.resumes[0];
    const resumeB = state.resumes[1];

    // Update Drop Labels
    const labelA = document.getElementById('fileALabel');
    const labelB = document.getElementById('fileBLabel');
    if (labelA) labelA.textContent = resumeA.name ? (resumeA.name.substring(0, 15) + "...") : "Upload PDF";
    if (labelB) labelB.textContent = resumeB.name ? (resumeB.name.substring(0, 15) + "...") : "Optional";

    // Style Active Drop Zones
    const zoneA = document.getElementById('dropZoneA');
    const zoneB = document.getElementById('dropZoneB');
    if (zoneA) zoneA.className = resumeA.name ? 'file-drop-zone active' : 'file-drop-zone';
    if (zoneB) zoneB.className = resumeB.name ? 'file-drop-zone active' : 'file-drop-zone';

    // Check if we have anything to score
    if (!resumeA.scoreData && !resumeB.scoreData) {
        document.getElementById('scoreSection').classList.add('hidden');
        document.getElementById('suggestionsSection').classList.add('hidden');
        return;
    }

    const container = document.getElementById('scoreSection');
    container.classList.remove('hidden');
    container.innerHTML = ''; // Clear

    // Filter valid resumes
    const validResumes = [resumeA, resumeB].filter(r => r.scoreData);

    if (validResumes.length > 1) {
        // COMPARISON GRID
        const grid = document.createElement('div');
        grid.className = 'grid-2';

        validResumes.forEach(r => {
            const card = createScoreCard(r);
            grid.appendChild(card);
        });
        container.appendChild(grid);
    } else {
        // SINGLE VIEW
        const card = createScoreCard(validResumes[0]);
        container.appendChild(card);
    }

    // Suggestions (Dynamic for all resumes)
    const suggestionList = document.getElementById('suggestionList');
    suggestionList.innerHTML = '';

    let hasSuggestions = false;
    validResumes.forEach(r => {
        if (r.scoreData && r.scoreData.suggestions && r.scoreData.suggestions.length > 0) {
            hasSuggestions = true;
            if (validResumes.length > 1) {
                const header = document.createElement('li');
                header.style = "font-weight:700; font-size:10px; margin-top:12px; margin-bottom:4px; color:var(--muted-foreground); text-transform:uppercase; letter-spacing:0.05em; list-style:none;";
                header.textContent = r.name;
                suggestionList.appendChild(header);
            }
            r.scoreData.suggestions.forEach(s => {
                const li = document.createElement('li');
                li.style = "margin:6px 0; font-size:12px; line-height:1.5; color:var(--foreground); padding-left:14px; position:relative;";
                li.innerHTML = `<span style="position:absolute; left:0; color:var(--muted-foreground);">&bull;</span>${s}`;
                suggestionList.appendChild(li);
            });
        }
    });

    if (hasSuggestions) {
        document.getElementById('suggestionsSection').classList.remove('hidden');
    } else {
        document.getElementById('suggestionsSection').classList.add('hidden');
    }
}

function createScoreCard(resume) {
    const data = resume.scoreData;
    const score = data.total;

    // Color Logic
    let color = '#71717a'; // Muted
    if (score >= 70) color = '#22c55e'; // Green
    else if (score >= 40) color = '#eab308'; // Yellow
    else if (score > 0) color = '#ef4444'; // Red

    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
        <div class="card-content" style="text-align:center; padding: 20px 16px;">
            <div style="font-weight:600; font-size:12px; margin-bottom:16px; color:var(--muted-foreground); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${resume.name}
            </div>

            <div class="gauge-circle" style="background: conic-gradient(${color} ${score}%, var(--secondary) ${score}%);">
                <div class="gauge-center" style="color:${color}">${score}</div>
            </div>
            
            <div style="font-weight:600; font-size:14px; margin-bottom:2px;">Match Score</div>
            <div class="text-sm text-muted-foreground">${data.keywordData.matches.length} keywords found</div>

            <div style="margin-top:16px; text-align:left; border-top:1px solid var(--border); padding-top:12px;">
                <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted-foreground); margin-bottom:8px;">
                    Missing Keywords
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${data.keywordData.missing.length > 0
            ? data.keywordData.missing.slice(0, 8).map(k =>
                `<span class="badge" style="color:var(--destructive); border-color: rgba(239, 68, 68, 0.1); background: rgba(239, 68, 68, 0.05);">${k}</span>`
            ).join('')
            : '<span class="text-sm text-muted-foreground">Perfect match!</span>'}
                </div>
            </div>
        </div>
    `;
    return div;
}

// --- ACTIONS ---

async function handleFileSelect(e, index) {
    const file = e.target.files[0];
    if (!file) return;

    state.resumes[index] = { id: null, name: file.name, text: null, scoreData: null };

    try {
        updateSyncStatus("Parsing...");
        let text = '';
        if (file.name.endsWith('.pdf')) text = await parsePdf(file);
        else if (file.name.endsWith('.docx')) text = await parseDocx(file);
        else text = await file.text(); // txt

        if (!text || text.length < 50) throw new Error("Empty or unreadable file.");

        state.resumes[index].text = text;
        console.log(`📄 Parsed resume "${file.name}": ${text.length} characters`);

        // Supabase Save
        console.log('🔍 Checking SupabaseService:', window.SupabaseService ? '✅ Available' : '❌ Not found');

        if (window.SupabaseService) {
            console.log(`📤 Calling upsertResume for "${file.name}"...`);
            updateSyncStatus("Uploading to Supabase...");

            const rid = await window.SupabaseService.upsertResume(file.name, text);

            if (rid) {
                state.resumes[index].id = rid;
                console.log(`✅ Resume uploaded successfully! ID: ${rid}`);
                updateSyncStatus(`Synced! ID: ${rid}`);
            } else {
                console.warn('⚠️ Upload returned null - check Supabase logs above');
                updateSyncStatus("Upload failed - check console");
            }
        } else {
            console.warn('⚠️ Supabase not available - skipping upload');
            updateSyncStatus("Supabase disabled");
        }

        recalculateAll();

        // Clear status after 3 seconds
        setTimeout(() => updateSyncStatus(""), 3000);

    } catch (err) {
        console.error('❌ File processing error:', err);
        state.resumes[index].error = err.message;
        renderView();
    }
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
    const session = {
        id: Date.now(),
        date: new Date().toLocaleDateString(),
        jdSummary: state.metadata ? state.metadata.company : "Unknown Job",
        resumes: state.resumes.map(r => ({ name: r.name, score: r.scoreData?.total }))
    };
    if (!session.resumes.some(r => r.name)) return;

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
