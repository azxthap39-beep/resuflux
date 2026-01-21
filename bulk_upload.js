const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

// --- CONFIGURATION ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gwkxyrdwmayguccwpzcv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3a3h5cmR3bWF5Z3VjY3dwemN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1Mzg0MjUsImV4cCI6MjA4NDExNDQyNX0.gDjacQPJxTeDU18F2exTWDayqr93yH6DIEijEiyNPi0';

// 2. Set this to the folder containing your resumes
const RESUME_FOLDER = './resumes';

// --- SCRIPT ---

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        return data.text;
    } else if (ext === '.docx') {
        // Assume text
        return fs.readFileSync(filePath, 'utf-8');
    } else {
        // Assume text
        return fs.readFileSync(filePath, 'utf-8');
    }
}

async function bulkUpload() {
    console.log('🚀 Starting Bulk Resume Upload...');

    if (!fs.existsSync(RESUME_FOLDER)) {
        console.error(`❌ Folder not found: ${RESUME_FOLDER}`);
        return;
    }

    const files = fs.readdirSync(RESUME_FOLDER);
    console.log(`📂 Found ${files.length} files in ${RESUME_FOLDER}`);

    for (const file of files) {
        if (file.startsWith('.')) continue; // skip hidden

        const filePath = path.join(RESUME_FOLDER, file);
        const fileName = path.basename(file);

        console.log(`\nProcessing: ${fileName}...`);

        try {
            // Read Content
            const content = await extractText(filePath);

            if (!content || content.length < 10) {
                console.warn('⚠️  Skipping empty/short file.');
                continue;
            }

            // Upsert to Supabase
            // NOTE: Removed 'keywords' to match schema
            const { data, error } = await supabase
                .from('resumes')
                .insert({
                    name: fileName,
                    text: content,
                    created_at: new Date().toISOString()
                })
                .select();

            if (error) {
                // If error is about ambiguous column or text/extracted_text, we might need to adjust
                // But usually passing extra props is ignored unless strict.
                // Let's retry with just one if it fails.
                console.error(`❌ Upload Failed for ${fileName}:`, error.message);
            } else {
                console.log(`✅ Success! ID: ${data[0].id}`);
            }

        } catch (err) {
            console.error(`❌ Error for ${fileName}:`, err.message);
        }
    }
    console.log('\n✨ Bulk Upload Complete!');
}

bulkUpload();
