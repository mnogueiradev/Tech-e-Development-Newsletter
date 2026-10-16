const ORGANIZATION_PATTERNS = [
    {
        key: 'openai',
        patterns: [/\bopenai\b/i, /\bchatgpt\b/i, /\bgpt(?:[-\s][\w.]+)?\b/i]
    },
    { key: 'anthropic', patterns: [/\banthropic\b/i, /\bclaude\b/i] },
    { key: 'google', patterns: [/\bgoogle\b/i, /\balphabet\b/i, /\bgemini\b/i, /\bdeepmind\b/i] },
    { key: 'microsoft', patterns: [/\bmicrosoft\b/i, /\bcopilot\b/i] },
    { key: 'apple', patterns: [/\bapple\b/i, /\biphone\b/i, /\bipad\b/i, /\bmacbook\b/i] },
    { key: 'meta', patterns: [/\bmeta\b/i, /\bfacebook\b/i, /\binstagram\b/i, /\bwhatsapp\b/i, /\bllama\b/i] },
    { key: 'amazon', patterns: [/\bamazon\b/i, /\baws\b/i, /\bamazon web services\b/i] },
    { key: 'nvidia', patterns: [/\bnvidia\b/i] },
    { key: 'intel', patterns: [/\bintel\b/i] },
    { key: 'amd', patterns: [/\bamd\b/i] },
    { key: 'samsung', patterns: [/\bsamsung\b/i] },
    { key: 'github', patterns: [/\bgithub\b/i] },
    { key: 'deepseek', patterns: [/\bdeepseek\b/i] },
    { key: 'mistral', patterns: [/\bmistral\b/i] },
    { key: 'perplexity', patterns: [/\bperplexity\b/i] },
    { key: 'huggingface', patterns: [/\bhugging\s*face\b/i] },
    { key: 'oracle', patterns: [/\boracle\b/i] },
    { key: 'salesforce', patterns: [/\bsalesforce\b/i] },
    { key: 'adobe', patterns: [/\badobe\b/i] },
    { key: 'qualcomm', patterns: [/\bqualcomm\b/i] },
    { key: 'tsmc', patterns: [/\btsmc\b/i] },
    { key: 'cloudflare', patterns: [/\bcloudflare\b/i] },
    { key: 'databricks', patterns: [/\bdatabricks\b/i] },
    { key: 'bytedance', patterns: [/\bbytedance\b/i, /\btiktok\b/i] },
    { key: 'tesla', patterns: [/\btesla\b/i] }
];

function getPrimaryOrganization(news = {}) {
    const title = String(news.title || '');
    let earliestMatch = null;

    for (const organization of ORGANIZATION_PATTERNS) {
        for (const pattern of organization.patterns) {
            const match = pattern.exec(title);
            if (match && (!earliestMatch || match.index < earliestMatch.index)) {
                earliestMatch = { key: organization.key, index: match.index };
            }
        }
    }

    return earliestMatch ? earliestMatch.key : null;
}

module.exports = { getPrimaryOrganization };
