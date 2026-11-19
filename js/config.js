// config.js -- Utility functions and session configuration loader

// Utility: Debounce
export function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// HTML Sanitization -- escape user-controlled strings before inserting into innerHTML
export function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Input sanitization -- strip control chars and limit length for text stored in state
export function sanitizeInput(str, maxLength = 2000) {
    if (typeof str !== 'string') return '';
    // Strip null bytes and non-printable control chars (keep newlines/tabs)
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').substring(0, maxLength);
}

// Parse a YYYY-MM-DD string as a local calendar date. new Date('YYYY-MM-DD')
// is UTC midnight and renders as the previous day in US time zones.
export function parseLocalDate(dateStr) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    return new Date(y, m - 1, d);
}

// Application configuration -- populated by loadConfig()
export let APP_CONFIG = null;

// Static bill types (not session-specific)
const billTypes = {
    'all': { name: 'All Bills', description: 'Showing all Washington State legislative bills' },
    'SB': { name: 'Senate Bills', description: 'Bills introduced in the Washington State Senate' },
    'HB': { name: 'House Bills', description: 'Bills introduced in the Washington State House of Representatives' },
    'SJR': { name: 'Senate Joint Resolutions', description: 'Joint resolutions from the Washington State Senate' },
    'HJR': { name: 'House Joint Resolutions', description: 'Joint resolutions from the Washington State House' },
    'SJM': { name: 'Senate Joint Memorials', description: 'Joint memorials from the Washington State Senate' },
    'HJM': { name: 'House Joint Memorials', description: 'Joint memorials from the Washington State House' },
    'SCR': { name: 'Senate Concurrent Resolutions', description: 'Concurrent resolutions from the Washington State Senate' },
    'HCR': { name: 'House Concurrent Resolutions', description: 'Concurrent resolutions from the Washington State House' }
};

// Load session configuration from data/session.json
export async function loadConfig() {
    const response = await fetch('data/session.json');
    if (!response.ok) {
        throw new Error('Failed to load session configuration');
    }
    const session = await response.json();

    // Update bill type descriptions with session year
    const typesWithYear = { ...billTypes };
    typesWithYear['all'].description = `Showing all Washington State legislative bills for the ${session.year} session`;

    APP_CONFIG = {
        siteName: session.siteTitle || 'WA Bill Tracker',
        siteUrl: 'https://wa-bill-tracker.org',
        year: session.year,
        biennium: session.biennium,
        sessionType: session.sessionType,
        cookieDuration: 90,
        autoSaveInterval: 30000,
        dataRefreshInterval: 3600000,
        githubDataUrl: 'data/bills.json',
        sessionStart: new Date(session.sessionStart),
        sessionEnd: new Date(session.sessionEnd),
        cutoffDates: (session.cutoffDates || []).map(c => ({
            date: c.date,
            label: c.label,
            failsBefore: c.failsBefore
        })),
        // Single off-switch for the development banner (ADO #3117): set
        // "developmentBanner" to false in data/session.json at cutover.
        developmentBanner: session.developmentBanner === true,
        prefilingOpens: session.prefilingOpens || null,
        priorSession: session.priorSession || {},
        billTypes: typesWithYear
    };

    return APP_CONFIG;
}
