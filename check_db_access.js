const { createClient } = require('@supabase/supabase-js');

// Config
const SUPABASE_URL = 'https://gwkxyrdwmayguccwpzcv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3a3h5cmR3bWF5Z3VjY3dwemN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1Mzg0MjUsImV4cCI6MjA4NDExNDQyNX0.gDjacQPJxTeDU18F2exTWDayqr93yH6DIEijEiyNPi0';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    console.log("Checking DB Connection...");

    // 1. Get a resume ID
    const { data: list, error: listError } = await supabase.from('resumes').select('id, name').limit(1);

    if (listError) {
        console.error("❌ List Error:", listError.message);
        return;
    }

    if (list.length === 0) {
        console.log("⚠️ No resumes to test detail fetch.");
        return;
    }

    const testId = list[0].id;
    console.log(`Found resume: ${list[0].name} (${testId})`);

    // 2. Try fetching text AND keywords (Exact Match of supabase.js with limit(1))
    console.log(`Querying: .select('text, keywords').eq('id', '${testId}').limit(1)`);

    const { data: detail, error: detailError } = await supabase
        .from('resumes')
        .select('text, keywords')
        .eq('id', testId)
        .limit(1);

    if (detailError) {
        console.error("❌ Detail Fetch Error:", detailError.message);
        console.error("Details:", detailError);
    } else {
        if (detail && detail.length > 0) {
            const row = detail[0];
            console.log(`✅ Success! Fetched text (${row.text ? row.text.length : 0} chars).`);
            console.log(`✅ Fetched keywords:`, row.keywords);
        } else {
            console.log("⚠️ Success, but returned empty list (limit 1).");
        }
    }
}

check();
