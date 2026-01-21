console.log("🚀 Supabase Script Starting...");

// 1. Define Service Interface IMMEDIATELY to prevent downstream errors
// We define empty/null functions initially, they will be overwritten if init succeeds
window.SupabaseService = {
    upsertResume: async () => null,
    upsertComparison: async () => null,
    fetchAllResumes: async () => [],
    fetchResumeDetails: async () => null,
    saveResumeToSupabase: async () => null
};

try {
    // Configuration
    const ENABLE_SUPABASE = true;
    const SUPABASE_URL = 'https://gwkxyrdwmayguccwpzcv.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3a3h5cmR3bWF5Z3VjY3dwemN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1Mzg0MjUsImV4cCI6MjA4NDExNDQyNX0.gDjacQPJxTeDU18F2exTWDayqr93yH6DIEijEiyNPi0';

    let supabase = null;

    // Initialize
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
        console.error('❌ Supabase library (supabase.min.js) not loaded or missing.');
    } else {
        // Clear stale auth
        if (window.localStorage) {
            try {
                window.localStorage.removeItem('sb-gwkxyrdwmayguccwpzcv-auth-token');
            } catch (e) { console.warn("Localstorage cleanup failed", e); }
        }

        // Init Client
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                storageKey: 'supa_clean_session'
            }
        });
        console.log('✅ Supabase Client Initialized');
    }

    // Define Real Functions
    async function upsertResume(fileName, textContent) {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase.from('resumes').insert({ name: fileName, text: textContent }).select();
            if (error) throw error;
            return data && data[0] ? data[0].id : null;
        } catch (e) { console.error('Upsert Error:', e); return null; }
    }

    async function upsertComparison(resumeId, jd, atsScore, breakdown, missingKeywords) {
        if (!supabase || !resumeId) return;
        try {
            // Simplified hashing if crypto fails? No, keep it but try-catch inside
            const msgBuffer = new TextEncoder().encode(jd);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const jdHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

            await supabase.from('comparisons').upsert({
                resume_id: resumeId,
                jd_hash: jdHash,
                ats_score: atsScore,
                data: { breakdown, missingKeywords },
                updated_at: new Date().toISOString()
            }, { onConflict: 'resume_id, jd_hash' });
        } catch (e) { console.error('Comparison Save Error:', e); }
    }

    async function fetchAllResumes() {
        console.log('Fetching resumes...');
        if (!supabase) { console.warn("No Supabase Client"); return []; }
        const { data, error } = await supabase.from('resumes').select('id, name, created_at'); // Remove order to fail safe
        if (error) { console.error("Supabase Fetch Error:", error); return []; }
        return data || [];
    }

    async function fetchResumeDetails(id) {
        if (!supabase) return null;
        console.log(`🔍 Fetching details for ID: "${id}"`);

        // Use limit(1) instead of single() to prevent 406/PGRST116 errors if row missing
        // Removed keywords column since it doesn't exist in DB
        const { data, error } = await supabase
            .from('resumes')
            .select('text')
            .eq('id', id)
            .limit(1);

        if (error) {
            console.error("❌ fetchResumeDetails Error:", error);
            return null;
        }

        // Return first item or null
        const result = data && data.length > 0 ? data[0] : null;
        if (!result) console.warn(`⚠️ No resume found for ID: ${id}`);
        return result;
    }

    async function saveResumeToSupabase(resumeData) {
        if (!supabase) return null;
        const { data } = await supabase.from('resumes').insert({
            name: resumeData.name,
            text: resumeData.text || resumeData.extracted_text
        }).select();
        return data ? data[0] : null;
    }

    // Override Export with Real Functions if successful
    window.SupabaseService = { upsertResume, upsertComparison, fetchAllResumes, fetchResumeDetails, saveResumeToSupabase };
    console.log("✅ SupabaseService Fully Loaded");

} catch (globalErr) {
    console.error("🔥 CRITICAL ERROR in supabase.js:", globalErr);
    // Service remains defined as empty/null functions from top of file
}
