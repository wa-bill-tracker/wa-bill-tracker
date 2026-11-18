// archive.js -- "Passed in <prior year>" section (ADO #3118)
//
// Read-only list of bills enacted in the prior biennium, built from
// data/archive/<priorSession.year>-bills.json. It is deliberately separate
// from APP_STATE.bills so archive bills never reach the current-session
// filters, counts, cutoff logic, or tracked/notes storage. The label, hash
// and file path all derive from session.json (APP_CONFIG.priorSession).

import { APP_CONFIG, escapeHTML } from './config.js';
import { STATUS_LABELS } from './render.js';

const PASSED_STATUSES = ['enacted', 'partial_veto'];
const LEG_HOST = 'https://app.leg.wa.gov/';

let archiveBills = null;   // cached after first successful load

export function hasArchive() {
    return Boolean(APP_CONFIG && APP_CONFIG.priorSession && APP_CONFIG.priorSession.year);
}

export function archiveHash() {
    return `passed-${APP_CONFIG.priorSession.year}`;
}

export function archiveLabel() {
    return `Passed in ${APP_CONFIG.priorSession.year}`;
}

export function archivePath() {
    return `data/archive/${APP_CONFIG.priorSession.year}-bills.json`;
}

// Bills that became law, including partial vetoes.
export function selectPassedBills(bills) {
    return bills.filter(bill => PASSED_STATUSES.includes(bill.status));
}

// Only link to the official site; fall back to a constructed URL otherwise.
function legislatureUrl(bill) {
    if (typeof bill.legUrl === 'string' && bill.legUrl.startsWith(LEG_HOST)) {
        return bill.legUrl;
    }
    const num = String(bill.number || '').split(' ').pop();
    return `${LEG_HOST}billsummary?BillNumber=${encodeURIComponent(num)}&Year=${encodeURIComponent(APP_CONFIG.priorSession.year)}`;
}

export function createArchiveCard(bill) {
    const label = STATUS_LABELS[bill.status] || bill.status;
    return `
        <li class="archive-item">
            <article class="archive-card" aria-labelledby="archive-${escapeHTML(bill.id)}">
                <h3 class="archive-card-title" id="archive-${escapeHTML(bill.id)}">
                    <a href="${escapeHTML(legislatureUrl(bill))}" target="_blank" rel="noopener noreferrer">${escapeHTML(bill.number)}<span class="visually-hidden"> (opens in a new tab)</span></a>
                    <span class="archive-card-name">${escapeHTML(bill.title)}</span>
                </h3>
                <p class="archive-card-desc">${escapeHTML(bill.description)}</p>
                <p class="archive-card-meta">
                    <span class="tag archive-status status-${escapeHTML(bill.status)}">${escapeHTML(label)}</span>
                    <span class="archive-card-sponsor">Sponsor: ${escapeHTML(bill.sponsor)}</span>
                    ${bill.topic ? `<span class="tag">${escapeHTML(bill.topic)}</span>` : ''}
                </p>
                ${bill.historyLine ? `<p class="archive-card-history">${escapeHTML(bill.historyLine)}</p>` : ''}
            </article>
        </li>`;
}

async function loadArchive() {
    if (archiveBills) return archiveBills;
    const response = await fetch(archivePath());
    if (!response.ok) throw new Error(`Archive request failed (${response.status})`);
    const data = await response.json();
    archiveBills = selectPassedBills(data.bills || []);
    return archiveBills;
}

// Fill #archiveStatus and #archiveCards. Returns the number of bills shown, or
// -1 when the archive could not be loaded.
export async function renderArchive() {
    const status = document.getElementById('archiveStatus');
    const list = document.getElementById('archiveCards');
    const description = document.getElementById('pageDescription');
    status.textContent = 'Loading...';
    list.innerHTML = '';

    try {
        const bills = await loadArchive();
        const prior = APP_CONFIG.priorSession;
        const summary = `${bills.length} bill${bills.length === 1 ? '' : 's'} became law in the ${prior.biennium} biennium.`;
        status.textContent = summary;
        description.textContent = `${summary} These are archived and are not part of ${APP_CONFIG.year} counts, filters, or cutoffs.`;
        list.innerHTML = bills.map(createArchiveCard).join('');
        return bills.length;
    } catch (error) {
        console.warn('Could not load archive:', error);
        status.textContent = `Could not load ${archiveLabel()}. Please try again later.`;
        description.textContent = '';
        return -1;
    }
}
