// Configuration
const ENABLE_SUPABASE = true;
const SUPABASE_URL = 'https://gwkxyrdwmayguccwpzcv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3a3h5cmR3bWF5Z3VjY3dwemN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1Mzg0MjUsImV4cCI6MjA4NDExNDQyNX0.gDjacQPJxTeDU18F2exTWDayqr93yH6DIEijEiyNPi0';

let supabase = null;

// Initialize Supabase with proper configuration
function initSupabase() {
    try {
        if (!window.supabase || !window.supabase.createClient) {
            console.error('❌ Supabase library not loaded');
            return;
        }

        // Create client with explicit auth configuration
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });

        console.log('✅ Supabase initialized with config');

    } catch (e) {
        console.error('❌ Init error:', e);
    }
}

// Initialize
setTimeout(initSupabase, 300);

async function upsertResume(fileName, textContent) {
    console.log('📤 upsertResume called:', fileName);

    if (!supabase) {
        console.error('❌ Supabase client is null');
        return null;
    }

    try {
        console.log('Calling supabase.from(resumes).insert()...');

        // Use insert without .single() first to see full response
        const response = await supabase
            .from('resumes')
            .insert({ name: fileName, text: textContent })
            .select();

        if (response.error) {
            console.error("❌ Supabase Insert Error:", response.error);
            return null;
        }

        if (!response.data || response.data.length === 0) {
            console.error('❌ No data returned on insert');
            return null;
        }

        const id = response.data[0].id;
        console.log("✅ Resume saved with ID:", id);
        return id;

    } catch (e) {
        console.error('❌ Exception:', e);
        alert(`Exception: ${e.message}`);
        return null;
    }
}

async function upsertComparison(resumeId, jobDescription, atsScore, breakdown, missingKeywords) {
    console.log('📊 upsertComparison called:', { resumeId, atsScore });

    if (!supabase || !resumeId) {
        console.warn('⚠️ Supabase or resumeId missing in upsertComparison');
        return;
    }

    try {
        const msgBuffer = new TextEncoder().encode(jobDescription);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const jdHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const payload = {
            resume_id: resumeId,
            jd_hash: jdHash,
            ats_score: atsScore,
            data: { breakdown, missingKeywords },
            updated_at: new Date().toISOString()
        };

        console.log('📤 Upserting comparison:', payload);

        const { data, error } = await supabase
            .from('comparisons')
            .upsert(payload, { onConflict: 'resume_id, jd_hash' })
            .select();

        if (error) {
            console.error('❌ Comparison Save Error:', error);
        } else {
            console.log('✅ Comparison saved successfully');
        }
    } catch (e) {
        console.error('❌ Comparison exception:', e);
    }
}

window.SupabaseService = { upsertResume, upsertComparison };
