# ResuFlux 🌊

**ResuFlux** is a powerful Chrome Extension that helps job seekers instantly compare their resumes against any job description. Using a hybrid ATS scoring algorithm, it provides deep insights into keyword matches, formatting, and content quality.

![ResuFlux Logo](icons/icon128.png)

## ✨ Features

- **Side-by-Side Comparison**: Upload two resumes (e.g., General vs. Targeted) and see which performs better.
- **Hybrid ATS Scoring (V5)**:
  - **Keyword Match (50%)**: Advanced normalization and N-gram detection.
  - **Formatting (20%)**: Detects common ATS pitfalls (headers, sections).
  - **Section Presence (20%)**: Ensures Work History, Skills, and Education are present.
  - **Conciseness (10%)**: Length sanity checks.
- **Smart JD Scraping**: One-click extraction of job titles, companies, and descriptions from LinkedIn, Jobright, and more.
- **Supabase Cloud Sync**: Automatically securely stores your resume history and comparison scores.
- **Premium UI**: Modern Shadcn-inspired design with real-time gauges and detailed breakdowns.

## 🛠️ Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `ats-resume-score` folder.

## 🚀 How to Use

1. **Scrape a Job**: Navigate to a job post on LinkedIn or any job site and click **Scrape Page** in the extension.
2. **Upload Resumes**: Drop your PDF or DOCX files into the Resume A or Resume B slots.
3. **Compare**: Instantly see your scores! Use the **Optimizer** section to identify missing keywords.
4. **Edit Manually**: Need to tweak the JD? Click **Edit** to manually paste or refine the job description.

## 🏗️ Technical Stack

- **Javascript (ES6+)**: Core logic and state management.
- **Supabase**: Backend Database for persistence.
- **pdf.js / mammoth.js**: Local bundling for robust document parsing.
- **Manifest V3**: Compliant with newest Chrome Extension standards.

---
*Created with ❤️ by Atharva Potnis*
