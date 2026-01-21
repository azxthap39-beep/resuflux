
const EmailTemplateManager = (function () {

    const DEFAULT_TEMPLATE = {
        subject: "Application for [Role] - [Candidate Name]",
        body: `Dear Hiring Manager,

I am writing to express my strong interest in the [Role] position at [Company].

With my background in [My Top Skill], I am confident that I can contribute effectively to your team. Please find my resume attached.

Best regards,
[Candidate Name]`
    };

    async function loadTemplate() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['emailTemplate'], (result) => {
                if (result.emailTemplate) {
                    resolve(result.emailTemplate);
                } else {
                    resolve(DEFAULT_TEMPLATE);
                }
            });
        });
    }

    async function saveTemplate(subject, body) {
        return new Promise((resolve) => {
            chrome.storage.local.set({
                emailTemplate: { subject, body }
            }, resolve);
        });
    }

    function renderTemplate(template, data) {
        let subject = template.subject;
        let body = template.body;

        // Replacements
        const map = {
            '[Role]': data.role || "this position",
            '[Company]': data.company || "your company",
            '[Candidate Name]': data.candidateName || "Candidate",
            '[My Top Skill]': data.topSkill || "relevant skills"
        };

        for (const [key, value] of Object.entries(map)) {
            const regex = new RegExp(key.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1"), 'g');
            subject = subject.replace(regex, value);
            body = body.replace(regex, value);
        }

        return { subject, body };
    }

    return {
        loadTemplate,
        saveTemplate,
        renderTemplate
    };

})();

if (typeof window !== 'undefined') {
    window.EmailTemplateManager = EmailTemplateManager;
}
