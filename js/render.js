// render.js -- UI rendering, stats, bill cards, and progress tracking

import { APP_CONFIG, escapeHTML } from './config.js';
import { APP_STATE, CookieManager } from './state.js';
import { filterBills, getBillCutoffStatus, getNextCutoff } from './data.js';

// Human-readable status labels
export const STATUS_LABELS = {
    'prefiled': 'Pre-filed',
    'introduced': 'Introduced',
    'committee': 'In Committee',
    'floor': 'Floor Vote',
    'passed_origin': 'Passed Chamber',
    'passed': 'Passed Chamber',
    'opposite_committee': 'Opposite Committee',
    'opposite_floor': 'Opposite Floor',
    'passed_legislature': 'Passed Legislature',
    'governor': 'Governor',
    'enacted': 'Enacted',
    'vetoed': 'Vetoed',
    'failed': 'Failed'
};

// Infinite scroll state
let scrollObserver = null;
let currentFilteredBills = [];

// --- Main UI update ---
export function updateUI() {
    if (APP_STATE.currentView === 'main') {
        const filtered = filterBills();
        renderBills(filtered);
        updateStats(filtered);
        updateCutoffBanner();
        renderCutoffFailedBills();
    }
    // updateUserPanel is called from notes.js via app.js wiring
    // Dispatch event so app.js can call updateUserPanel
    document.dispatchEvent(new CustomEvent('ui-updated'));
}

// --- Bill list rendering ---
export function renderBills(filteredBills) {
    const grid = document.getElementById('billsGrid');
    if (!filteredBills) filteredBills = filterBills();

    // Store for infinite scroll appending
    currentFilteredBills = filteredBills;
    APP_STATE.pagination.page = 1;

    if (filteredBills.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
                <h3 style="font-size: 1.5rem; margin-bottom: 1rem;">No bills found</h3>
                <p>Try adjusting your filters or search terms</p>
            </div>
        `;
        updatePageInfo(0, 0);
        return;
    }

    const { pageSize } = APP_STATE.pagination;
    const paginated = filteredBills.slice(0, pageSize);

    grid.innerHTML = paginated.map(bill => createBillCard(bill)).join('');
    updatePageInfo(paginated.length, filteredBills.length);
    setupInfiniteScroll();
}

export function loadNextPage() {
    const { page, pageSize } = APP_STATE.pagination;
    const totalItems = currentFilteredBills.length;
    const totalPages = Math.ceil(totalItems / pageSize);

    if (page >= totalPages) return;

    APP_STATE.pagination.page++;
    const start = (APP_STATE.pagination.page - 1) * pageSize;
    const nextBills = currentFilteredBills.slice(start, start + pageSize);

    const grid = document.getElementById('billsGrid');
    grid.insertAdjacentHTML('beforeend', nextBills.map(createBillCard).join(''));

    const displayed = Math.min(APP_STATE.pagination.page * pageSize, totalItems);
    updatePageInfo(displayed, totalItems);
}

export function setupInfiniteScroll() {
    const sentinel = document.getElementById('scrollSentinel');
    if (!sentinel) return;

    if (scrollObserver) scrollObserver.disconnect();

    // Hide old pagination buttons when IntersectionObserver is available
    const paginationControls = document.getElementById('paginationControls');
    if (paginationControls) paginationControls.innerHTML = '';

    scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            loadNextPage();
        }
    }, { rootMargin: '300px' });

    scrollObserver.observe(sentinel);
}

export function updatePageInfo(displayed, total) {
    const container = document.getElementById('paginationControls');
    if (!container) return;

    if (total === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '<span class="page-info">Showing ' + displayed + ' of ' + total + ' bills</span>';
}

// --- Cutoff-failed bills ---
export function renderCutoffFailedBills() {
    const section = document.getElementById('cutoffFailedSection');
    const countEl = document.getElementById('cutoffFailedCount');
    const container = document.getElementById('cutoffFailedBills');

    if (!section || !container) return;

    // Get all current session bills that missed a cutoff
    const cutoffFailedBills = APP_STATE.bills.filter(bill => {
        if (bill.session === String(APP_CONFIG.priorSession?.year)) return false;
        return getBillCutoffStatus(bill) !== null;
    });

    // Update count display
    countEl.textContent = `(${cutoffFailedBills.length})`;

    // Hide section if no cutoff-failed bills
    if (cutoffFailedBills.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    // Group bills by which cutoff they missed
    const groupedBills = {};
    cutoffFailedBills.forEach(bill => {
        const cutoffLabel = getBillCutoffStatus(bill);
        if (!groupedBills[cutoffLabel]) {
            groupedBills[cutoffLabel] = [];
        }
        groupedBills[cutoffLabel].push(bill);
    });

    // Build grouped HTML
    let html = '';

    // Sort groups by cutoff date order (use config order)
    const cutoffOrder = APP_CONFIG.cutoffDates.map(c => c.label);
    const sortedGroups = Object.keys(groupedBills).sort((a, b) => {
        return cutoffOrder.indexOf(a) - cutoffOrder.indexOf(b);
    });

    sortedGroups.forEach(cutoffLabel => {
        const bills = groupedBills[cutoffLabel];
        const cutoffInfo = APP_CONFIG.cutoffDates.find(c => c.label === cutoffLabel);
        const dateStr = cutoffInfo ? new Date(cutoffInfo.date + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }) : '';

        html += `
            <div class="cutoff-group">
                <div class="cutoff-group-header">
                    <span class="cutoff-group-label">${escapeHTML(cutoffLabel)}</span>
                    <span class="cutoff-group-date">${dateStr}</span>
                    <span class="cutoff-group-count">${bills.length} bill${bills.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="cutoff-failed-bills-grid">
                    ${bills.map(bill => createBillCard(bill)).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

export function updateCutoffBanner() {
    const banner = document.getElementById('cutoffBanner');
    if (!banner) return;

    const now = new Date();
    const sessionEnded = now > APP_CONFIG.sessionEnd;

    if (sessionEnded) {
        // Post-session: show session-ended banner instead of cutoff info
        banner.style.display = 'flex';
        banner.innerHTML =
            '<span>session</span>' +
            '<span class="cutoff-label">The ' + APP_CONFIG.year + ' Session Has Ended -- Showing Bills Awaiting Governor Action</span>' +
            '<span class="cutoff-days">Ended ' + APP_CONFIG.sessionEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</span>';
        updateCutoffExplainerVisibility();
        return;
    }

    const next = getNextCutoff();
    if (!next) {
        banner.style.display = 'none';
        return;
    }

    const dateStr = next.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const daysText = next.daysUntil === 0 ? 'Today' : next.daysUntil + ' day' + (next.daysUntil !== 1 ? 's' : '') + ' away';
    banner.style.display = 'flex';
    banner.innerHTML =
        '<span>cutoff</span>' +
        '<span class="cutoff-label">Next cutoff: ' + next.label + ' -- ' + dateStr + '</span>' +
        '<span class="cutoff-days">' + daysText + '</span>';

    updateCutoffExplainerVisibility();
}

// Show cutoff explainer banner on cutoff day or after
export function updateCutoffExplainerVisibility() {
    const explainerBanner = document.getElementById('cutoffExplainerBanner');
    if (!explainerBanner) return;

    const now = new Date();
    const sessionEnded = now > APP_CONFIG.sessionEnd;

    if (sessionEnded) {
        // Post-session: replace explainer content entirely
        const headline = explainerBanner.querySelector('.cutoff-explainer-headline');
        const flyout = document.getElementById('cutoffExplainerFlyout');

        if (headline) {
            headline.textContent = APP_CONFIG.year + ' Session Has Ended -- Bills Below Have Passed the Legislature';
        }

        if (flyout) {
            const priorYear = String(APP_CONFIG.priorSession?.year);
            const currentSessionBills = APP_STATE.bills.filter(b => b.session !== priorYear);
            const governorCount = currentSessionBills.filter(b => b.status === 'governor').length;
            const passedLegCount = currentSessionBills.filter(b => b.status === 'passed_legislature').length;
            const enactedCount = currentSessionBills.filter(b => b.status === 'enacted').length;

            flyout.innerHTML =
                '<h4>Session Status</h4>' +
                '<p>The ' + APP_CONFIG.year + ' regular session ended on ' +
                APP_CONFIG.sessionEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
                '. The bills shown below successfully passed both chambers of the Washington State Legislature.</p>' +

                '<h4>Governor Action</h4>' +
                '<p>These bills are now with the governor, who has <strong>20 days</strong> after delivery to take action:</p>' +
                '<ul>' +
                '<li><strong>Sign</strong> -- the bill becomes law</li>' +
                '<li><strong>Veto</strong> -- the bill is rejected (legislature can override with 2/3 vote)</li>' +
                '<li><strong>No action</strong> -- the bill becomes law without signature after 20 days</li>' +
                '</ul>' +

                '<h4>Current Counts</h4>' +
                '<ul>' +
                (governorCount > 0 ? '<li><strong>' + governorCount + '</strong> bills at the governor\'s desk awaiting signature</li>' : '') +
                (passedLegCount > 0 ? '<li><strong>' + passedLegCount + '</strong> bills passed legislature, awaiting delivery to governor</li>' : '') +
                (enactedCount > 0 ? '<li><strong>' + enactedCount + '</strong> bills signed into law</li>' : '') +
                '</ul>' +

                '<h4>Inactive Bills</h4>' +
                '<p>Bills that did not pass both chambers before the session ended are no longer active. ' +
                'Toggle "Show inactive bills" above to see which bills missed their cutoff deadlines.</p>';
        }

        if (!explainerBanner.classList.contains('dismissed')) {
            explainerBanner.style.display = 'block';
        }
        return;
    }

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const isCutoffDayOrAfter = APP_CONFIG.cutoffDates.some(cutoff => {
        const cutoffDate = new Date(cutoff.date + 'T00:00:00');
        const cutoffDay = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), cutoffDate.getDate());
        return today >= cutoffDay;
    });

    const hasBillsAtRisk = APP_STATE.bills.some(bill => {
        if (bill.session === String(APP_CONFIG.priorSession?.year)) return false;
        const status = bill.status;
        return APP_CONFIG.cutoffDates.some(cutoff => {
            const cutoffDate = new Date(cutoff.date + 'T00:00:00');
            const cutoffDay = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), cutoffDate.getDate());
            return today >= cutoffDay && cutoff.failsBefore.includes(status);
        });
    });

    if (isCutoffDayOrAfter && hasBillsAtRisk) {
        if (!explainerBanner.classList.contains('dismissed')) {
            explainerBanner.style.display = 'block';
        }
    } else {
        explainerBanner.style.display = 'none';
    }
}

export function goToPage(page) {
    // Legacy -- kept for compatibility. Infinite scroll handles navigation now.
    updateUI();
}

// --- Bill stage / progress tracker ---

// Map bill status to a numeric stage index across the full legislative lifecycle.
export function getBillStageIndex(bill) {
    const status = (bill.status || '').toLowerCase();
    const history = (bill.historyLine || '').toLowerCase();

    if (status === 'enacted')               return 8;
    if (status === 'governor')              return 7;
    if (status === 'passed_legislature')    return 7;
    if (status === 'opposite_floor')        return 6;
    if (status === 'opposite_committee')    return 5;
    if (status === 'passed_origin')         return 4;
    if (status === 'floor')                 return 3;
    if (status === 'vetoed')                return -2;
    if (status === 'failed')                return -1;

    // Legacy statuses
    if (status === 'passed')                return 4;
    if (status === 'committee')             return 2;
    if (status === 'introduced')            return 1;

    // Fallback: infer from historyLine
    if (history.includes('effective date') || history.includes('governor signed'))   return 8;
    if (history.includes('delivered to governor'))                                    return 7;
    if (history.includes('third reading') && history.includes('passed'))             return 4;
    if (history.includes('second reading') || history.includes('third reading'))     return 3;
    if (history.includes('rules committee') || history.includes('placed on'))        return 3;
    if (history.includes('referred to'))                                             return 2;
    if (history.includes('first reading'))                                           return 1;

    return 0; // prefiled
}

// Build a leg.wa.gov-style two-section status progress tracker
export function buildProgressTracker(bill) {
    const agency = (bill.originalAgency || '').toLowerCase();
    const originLabel  = agency === 'senate' ? 'Senate' : 'House';
    const oppositeLabel = agency === 'senate' ? 'House' : 'Senate';

    const stageIndex = getBillStageIndex(bill);
    const isFailed = stageIndex === -1;
    const isVetoed = stageIndex === -2;
    let failedAt = 0;
    if (isFailed || isVetoed) {
        const history = (bill.historyLine || '').toLowerCase();
        if (isVetoed)                                                    failedAt = 7;
        else if (history.includes('third reading') || history.includes('floor')) failedAt = 3;
        else if (history.includes('committee') || history.includes('referred'))  failedAt = 2;
        else if (history.includes('first reading'))                              failedAt = 1;
        else                                                                     failedAt = 1;
    }
    const effectiveIndex = (isFailed || isVetoed) ? failedAt : stageIndex;

    const originStages = [
        { idx: 0, label: 'Prefiled' },
        { idx: 1, label: 'Introduced' },
        { idx: 2, label: 'Committee' },
        { idx: 3, label: 'Floor' },
        { idx: 4, label: 'Passed' }
    ];

    const finalStages = [
        { idx: 5, label: 'Committee' },
        { idx: 6, label: 'Floor' },
        { idx: 7, label: 'Governor' },
        { idx: 8, label: 'Enacted' }
    ];

    function renderSection(stages, sectionLabel) {
        let html = `<div class="bill-progress-section">`;
        html += `<span class="bill-progress-section-label">${sectionLabel}</span>`;
        html += `<div class="bill-progress-row">`;

        stages.forEach((stage, i) => {
            if (i > 0) {
                const lineOn = effectiveIndex >= stage.idx && !(isFailed || isVetoed);
                html += `<div class="bill-progress-line${lineOn ? ' completed' : ''}"></div>`;
            }

            let cls = '';
            if ((isFailed || isVetoed) && stage.idx === failedAt) {
                cls = isFailed ? 'failed' : 'vetoed';
            } else if (effectiveIndex > stage.idx) {
                cls = 'completed';
            } else if (effectiveIndex === stage.idx && !(isFailed || isVetoed)) {
                cls = stage.idx === 8 ? 'enacted' : 'active';
            }

            html += `<div class="bill-progress-step ${cls}" title="${stage.label}">`;
            html += `<div class="bill-progress-dot"></div>`;
            html += `<span class="bill-progress-label">${stage.label}</span>`;
            html += `</div>`;
        });

        html += `</div></div>`;
        return html;
    }

    let html = '<div class="bill-progress-tracker">';
    html += renderSection(originStages, originLabel);
    html += renderSection(finalStages, oppositeLabel);
    html += '</div>';
    return html;
}

// --- Vote Results Tracker -- replaces progress tracker for passed bills ---
function buildVoteTracker(bill) {
    // Only show vote tracker for bills that have vote data
    if (!bill.votes || bill.votes.length === 0) {
        return buildProgressTracker(bill);  // fallback to old tracker
    }

    // Find the final passage votes for each chamber
    // Filter to "Final Passage" motions (the definitive votes)
    const houseVotes = bill.votes.filter(v => v.chamber === 'House');
    const senateVotes = bill.votes.filter(v => v.chamber === 'Senate');

    // Take the last (most recent) vote for each chamber
    const houseVote = houseVotes.length > 0 ? houseVotes[houseVotes.length - 1] : null;
    const senateVote = senateVotes.length > 0 ? senateVotes[senateVotes.length - 1] : null;

    // Build governor status
    let governorHtml = '';
    if (bill.governorAction) {
        const ga = bill.governorAction;
        let statusClass = 'governor-status-awaiting';
        let statusText = 'Awaiting Signature';
        if (ga.status === 'signed') {
            statusClass = 'governor-status-signed';
            statusText = 'Signed Into Law' + (ga.signedDate ? ' (' + ga.signedDate + ')' : '');
        } else if (ga.status === 'vetoed') {
            statusClass = 'governor-status-vetoed';
            statusText = 'Vetoed' + (ga.vetoDate ? ' (' + ga.vetoDate + ')' : '');
        } else if (ga.status === 'partial_veto') {
            statusClass = 'governor-status-vetoed';
            statusText = 'Partial Veto';
        }
        governorHtml = `
            <div class="governor-status">
                <span class="governor-status-label">Governor:</span>
                <span class="governor-status-value ${statusClass}">${statusText}</span>
            </div>`;
    } else if (['governor', 'passed_legislature'].includes(bill.status)) {
        governorHtml = `
            <div class="governor-status">
                <span class="governor-status-label">Governor:</span>
                <span class="governor-status-value governor-status-awaiting">Awaiting Signature</span>
            </div>`;
    }

    return `
        <div class="vote-tracker">
            <div class="vote-results">
                ${houseVote ? buildVoteChamber('House', houseVote) : '<div class="vote-chamber"><div class="vote-chamber-label">House</div><div class="vote-counts">--</div></div>'}
                ${senateVote ? buildVoteChamber('Senate', senateVote) : '<div class="vote-chamber"><div class="vote-chamber-label">Senate</div><div class="vote-counts">--</div></div>'}
            </div>
            ${governorHtml}
        </div>`;
}

function buildVoteChamber(label, vote) {
    const passedClass = vote.passed ? 'vote-passed' : 'vote-failed';
    const motionShort = vote.motion ? vote.motion.replace('3rd Reading & ', '') : '';
    return `
        <div class="vote-chamber ${passedClass}">
            <div class="vote-chamber-label">${escapeHTML(label)}</div>
            <div class="vote-counts">
                <span class="vote-yeas">${vote.yeas}</span>
                <span class="vote-separator">-</span>
                <span class="vote-nays">${vote.nays}</span>
            </div>
            <div class="vote-motion">${escapeHTML(motionShort)}</div>
        </div>`;
}

// --- Bill card ---
export function createBillCard(bill) {
    const isTracked = APP_STATE.trackedBills.has(bill.id);
    const hasNotes = APP_STATE.userNotes[bill.id] && APP_STATE.userNotes[bill.id].length > 0;
    const hasHearings = bill.hearings && bill.hearings.length > 0;
    const priorSessionYear = APP_CONFIG.priorSession?.year;
    const isFromPriorSession = bill.session === String(priorSessionYear);
    const cutoffStatus = getBillCutoffStatus(bill);
    const isInactive = isFromPriorSession || cutoffStatus;

    let latestNote = '';
    if (hasNotes) {
        const notes = APP_STATE.userNotes[bill.id];
        latestNote = escapeHTML(notes[notes.length - 1].text);
        if (latestNote.length > 100) {
            latestNote = latestNote.substring(0, 100) + '...';
        }
    }

    const stampHtml = bill.status === 'enacted'
        ? '<div class="bill-stamp bill-stamp-signed">Signed</div>'
        : (bill.status === 'passed_legislature' || bill.status === 'governor')
        ? '<div class="bill-stamp">Passed</div>'
        : '';

    return `
        <div class="bill-card ${isTracked ? 'tracked' : ''} ${isInactive ? 'inactive-bill' : ''}" data-bill-id="${escapeHTML(bill.id)}">
            ${stampHtml}
            <div class="bill-header">
                <a href="https://app.leg.wa.gov/billsummary?BillNumber=${encodeURIComponent(bill.number.split(' ').pop())}&Year=${APP_CONFIG.year}"
                   target="_blank" rel="noopener noreferrer" class="bill-number">${escapeHTML(bill.number)}</a>
                <div class="bill-title">${escapeHTML(bill.title)}</div>
            </div>

            ${(bill.status === 'governor' || bill.status === 'passed_legislature' || bill.status === 'enacted')
                ? buildVoteTracker(bill)
                : buildProgressTracker(bill)}

            <div class="bill-body">
                <div class="bill-meta">
                    <span class="meta-item">Sponsor: ${escapeHTML(bill.sponsor)}</span>
                    <span class="meta-item">Committee: ${escapeHTML(bill.committee)}</span>
                    ${hasHearings ? `<span class="meta-item" style="color: var(--warning);">Hearing: ${escapeHTML(bill.hearings[0].date)}</span>` : ''}
                </div>

                <div class="bill-description">${escapeHTML(bill.description)}</div>

                ${hasNotes ? `<div class="bill-notes-preview">Note: "${latestNote}"</div>` : ''}

                <div class="bill-tags">
                    <span class="tag status-${escapeHTML(bill.status)}">${escapeHTML(STATUS_LABELS[bill.status] || bill.status)}</span>
                    <span class="tag priority-${escapeHTML(bill.priority)}">${escapeHTML(bill.priority)} priority</span>
                    <span class="tag">${escapeHTML(bill.topic)}</span>
                    ${isFromPriorSession ? '<span class="tag session-prior">' + escapeHTML(String(priorSessionYear)) + ' Session</span>' : ''}
                    ${cutoffStatus ? '<span class="tag cutoff-failed">Missed: ' + escapeHTML(cutoffStatus) + '</span>' : ''}
                </div>
            </div>

            <div class="bill-actions">
                <button class="action-btn ${isTracked ? 'active' : ''}" data-action="track" data-bill-id="${escapeHTML(bill.id)}">
                    ${isTracked ? 'Tracked' : 'Track'}
                </button>
                <button class="action-btn" data-action="note" data-bill-id="${escapeHTML(bill.id)}">
                    ${hasNotes ? 'Notes (' + APP_STATE.userNotes[bill.id].length + ')' : 'Add Note'}
                </button>
                <button class="action-btn" data-action="share" data-bill-id="${escapeHTML(bill.id)}">
                    Share
                </button>
                <a href="https://app.leg.wa.gov/pbc/bill/${encodeURIComponent(bill.number.split(' ').pop())}"
                   target="_blank" rel="noopener noreferrer" class="action-btn" title="Contact your legislator about this bill">
                    Contact
                </a>
                <a href="https://app.leg.wa.gov/billsummary/Home/GetEmailNotifications?billTitle=${encodeURIComponent(bill.number.replace(' ', ' ') + '-' + bill.biennium)}&billNumber=${encodeURIComponent(bill.number.split(' ').pop())}&year=${encodeURIComponent(bill.biennium.split('-')[0])}&agency=${encodeURIComponent(bill.originalAgency)}&initiative=False"
                   target="_blank" rel="noopener noreferrer" class="action-btn" title="Follow this bill by email on leg.wa.gov">
                    Follow
                </a>
            </div>
        </div>
    `;
}

// --- Stats detail views ---
export function showStatsDetail(type) {
    APP_STATE.currentView = 'stats';
    document.getElementById('mainView').classList.remove('active');
    document.getElementById('statsView').classList.add('active');

    const detailContainer = document.getElementById('statsDetail');
    let content = '';

    switch(type) {
        case 'total':
            content = renderTotalBillsStats();
            break;
        case 'tracked':
            content = renderTrackedBillsStats();
            break;
        case 'today':
            content = renderTodayStats();
            break;
        case 'hearings':
            content = renderHearingsStats();
            break;
        case 'remaining':
            content = renderSessionStats();
            break;
    }

    detailContainer.innerHTML = content;
}

export function renderTotalBillsStats() {
    const stats = calculateBillStats();
    return `
        <h2>Total Bills: ${APP_STATE.bills.length}</h2>
        <div class="stats-list">
            ${Object.entries(stats.byType).map(([type, count]) => `
                <div class="stats-item">
                    <span class="stats-item-label">${type} Bills</span>
                    <span class="stats-item-value">${count}</span>
                </div>
            `).join('')}
            ${Object.entries(stats.byStatus).map(([status, count]) => `
                <div class="stats-item">
                    <span class="stats-item-label">${status}</span>
                    <span class="stats-item-value">${count}</span>
                </div>
            `).join('')}
        </div>
    `;
}

export function renderTrackedBillsStats() {
    const trackedBills = APP_STATE.bills.filter(bill =>
        APP_STATE.trackedBills.has(bill.id)
    );

    return `
        <h2>Your Tracked Bills: ${trackedBills.length}</h2>
        <div class="stats-list">
            ${trackedBills.map(bill => {
                const statusLabel = STATUS_LABELS[bill.status] || bill.status;
                const hasHearings = bill.hearings && bill.hearings.length > 0;
                const billNum = bill.number.split(' ').pop();
                return `
                <div class="tracked-bill-card" data-highlight-bill="${bill.id}">
                    <div class="tracked-bill-header">
                        <a href="https://app.leg.wa.gov/billsummary?BillNumber=${billNum}&Year=${APP_CONFIG.year}"
                           target="_blank" rel="noopener noreferrer" class="bill-number"
                           onclick="event.stopPropagation();">${escapeHTML(bill.number)}</a>
                        <span class="tracked-bill-title">${escapeHTML(bill.title)}</span>
                    </div>
                    <div class="tracked-bill-meta">
                        <span class="meta-item">Sponsor: ${escapeHTML(bill.sponsor)}</span>
                        <span class="tag status-${bill.status}">${escapeHTML(statusLabel)}</span>
                        ${hasHearings ? `<span class="meta-item" style="color: var(--warning);">Hearing: ${escapeHTML(bill.hearings[0].date)}${bill.hearings[0].committee ? ' -- ' + escapeHTML(bill.hearings[0].committee) : ''}</span>` : ''}
                    </div>
                </div>`;
            }).join('')}
            ${trackedBills.length === 0 ? '<p style="text-align: center; color: var(--text-muted);">No bills tracked yet</p>' : ''}
        </div>
    `;
}

export function renderTodayStats() {
    const today = new Date().toDateString();
    const todayBills = APP_STATE.bills.filter(bill => {
        const updateDate = new Date(bill.lastUpdated);
        return updateDate.toDateString() === today;
    });

    return `
        <h2>Updated Today: ${todayBills.length}</h2>
        <div class="stats-list">
            ${todayBills.map(bill => `
                <div class="stats-item" data-highlight-bill="${bill.id}" style="cursor: pointer;">
                    <span class="stats-item-label">${bill.number}: ${bill.title}</span>
                    <span class="stats-item-value">${formatTime(bill.lastUpdated)}</span>
                </div>
            `).join('')}
            ${todayBills.length === 0 ? '<p style="text-align: center; color: var(--text-muted);">No updates today</p>' : ''}
        </div>
    `;
}

export function renderHearingsStats() {
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const hearingBills = [];
    APP_STATE.bills.forEach(bill => {
        if (bill.hearings) {
            bill.hearings.forEach(hearing => {
                const hearingDate = new Date(hearing.date);
                if (hearingDate >= new Date() && hearingDate <= weekFromNow) {
                    hearingBills.push({
                        bill,
                        hearing,
                        date: hearingDate
                    });
                }
            });
        }
    });

    hearingBills.sort((a, b) => a.date - b.date);

    return `
        <h2>Hearings This Week: ${hearingBills.length}</h2>
        <div class="stats-list">
            ${hearingBills.map(item => `
                <div class="stats-item" data-highlight-bill="${item.bill.id}" style="cursor: pointer;">
                    <span class="stats-item-label">
                        ${item.hearing.date} ${item.hearing.time}<br>
                        ${item.bill.number}: ${item.bill.title}
                    </span>
                    <span class="stats-item-value">${item.hearing.committee}</span>
                </div>
            `).join('')}
            ${hearingBills.length === 0 ? '<p style="text-align: center; color: var(--text-muted);">No hearings scheduled this week</p>' : ''}
        </div>
    `;
}

export function renderSessionStats() {
    const now = new Date();
    const sessionStarted = now >= APP_CONFIG.sessionStart;
    const daysLeft = Math.ceil((APP_CONFIG.sessionEnd - now) / (1000 * 60 * 60 * 24));
    const totalDays = Math.ceil((APP_CONFIG.sessionEnd - APP_CONFIG.sessionStart) / (1000 * 60 * 60 * 24));
    const sessionEnded = daysLeft <= 0;

    const currentSessionBills = APP_STATE.bills.filter(b => b.session !== String(APP_CONFIG.priorSession?.year));
    const enactedCount = currentSessionBills.filter(b => b.status === 'enacted').length;
    const governorCount = currentSessionBills.filter(b => b.status === 'governor').length;
    const passedLegCount = currentSessionBills.filter(b => b.status === 'passed_legislature').length;
    const awaitingGovernor = governorCount + passedLegCount;
    const vetoedCount = currentSessionBills.filter(b => b.status === 'vetoed' || b.status === 'partial_veto').length;

    if (!sessionStarted) {
        // PRE-SESSION: show countdown to session start
        const daysUntil = Math.ceil((APP_CONFIG.sessionStart - now) / (1000 * 60 * 60 * 24));
        const prefiledCount = APP_STATE.bills.filter(b => b.status === 'prefiled').length;
        const startDateStr = APP_CONFIG.sessionStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return `
            <h2>Upcoming: ${APP_CONFIG.year} Session</h2>
            <div class="stats-list">
                <div class="stats-item">
                    <span class="stats-item-label">Session Begins</span>
                    <span class="stats-item-value">${startDateStr}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-item-label">Days Until Session</span>
                    <span class="stats-item-value">${Math.max(0, daysUntil)}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-item-label">Session Type</span>
                    <span class="stats-item-value">${APP_CONFIG.sessionType === 'long' ? 'Long (105 days)' : 'Short (60 days)'}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-item-label">Prefiled Bills</span>
                    <span class="stats-item-value">${prefiledCount}</span>
                </div>
            </div>
        `;
    }

    if (sessionEnded) {
        const endDateStr = APP_CONFIG.sessionEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        return `
            <h2>Post-Session: Governor Action</h2>
            <div class="stats-list">
                <div class="stats-item">
                    <span class="stats-item-label">Session Status</span>
                    <span class="stats-item-value">Ended ${endDateStr}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-item-label">Signed Into Law</span>
                    <span class="stats-item-value">${enactedCount}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-item-label">Awaiting Governor</span>
                    <span class="stats-item-value">${awaitingGovernor}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-item-label">At Governor's Desk</span>
                    <span class="stats-item-value">${governorCount}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-item-label">Passed Legislature</span>
                    <span class="stats-item-value">${passedLegCount}</span>
                </div>
                ${vetoedCount > 0 ? `<div class="stats-item">
                    <span class="stats-item-label">Vetoed</span>
                    <span class="stats-item-value">${vetoedCount}</span>
                </div>` : ''}
            </div>
        `;
    }

    const daysPassed = totalDays - daysLeft;
    const percentComplete = Math.round((daysPassed / totalDays) * 100);
    const activeBills = currentSessionBills.filter(b => !getBillCutoffStatus(b)).length;

    const next = getNextCutoff();
    const nextCutoffHtml = next
        ? `<div class="stats-item">
               <span class="stats-item-label">Next Cutoff: ${next.label}</span>
               <span class="stats-item-value">${next.daysUntil} day${next.daysUntil !== 1 ? 's' : ''}</span>
           </div>`
        : '';

    const endDateStr = APP_CONFIG.sessionEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return `
        <h2>Session Progress</h2>
        <div class="stats-list">
            <div class="stats-item">
                <span class="stats-item-label">Days Remaining</span>
                <span class="stats-item-value">${Math.max(0, daysLeft)}</span>
            </div>
            <div class="stats-item">
                <span class="stats-item-label">Session Progress</span>
                <span class="stats-item-value">${percentComplete}%</span>
            </div>
            ${nextCutoffHtml}
            <div class="stats-item">
                <span class="stats-item-label">Active ${APP_CONFIG.year} Bills</span>
                <span class="stats-item-value">${activeBills}</span>
            </div>
            <div class="stats-item">
                <span class="stats-item-label">Signed Into Law</span>
                <span class="stats-item-value">${enactedCount}</span>
            </div>
            <div class="stats-item">
                <span class="stats-item-label">Awaiting Governor</span>
                <span class="stats-item-value">${awaitingGovernor}</span>
            </div>
            <div class="stats-item">
                <span class="stats-item-label">Session Ends</span>
                <span class="stats-item-value">${endDateStr}</span>
            </div>
        </div>
    `;
}

// --- Stats calculation ---
export function calculateBillStats() {
    const stats = {
        byStatus: {},
        byType: {},
        byTopic: {},
        byCommittee: {}
    };

    APP_STATE.bills.forEach(bill => {
        const status = bill.status || 'unknown';
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

        const type = bill.number.split(' ')[0];
        stats.byType[type] = (stats.byType[type] || 0) + 1;

        const topic = bill.topic || 'General';
        stats.byTopic[topic] = (stats.byTopic[topic] || 0) + 1;

        const committee = bill.committee || 'Unknown';
        stats.byCommittee[committee] = (stats.byCommittee[committee] || 0) + 1;
    });

    return stats;
}

// --- Stats bar update ---
export function updateStats(filteredBills) {
    if (!filteredBills) filteredBills = filterBills();

    document.getElementById('totalBills').textContent = filteredBills.length;

    const trackedOnPage = filteredBills.filter(bill =>
        APP_STATE.trackedBills.has(bill.id)
    ).length;
    document.getElementById('trackedBills').textContent = trackedOnPage;

    const today = new Date().toDateString();
    const newToday = filteredBills.filter(bill =>
        new Date(bill.lastUpdated).toDateString() === today
    ).length;
    document.getElementById('newToday').textContent = newToday;

    const now = new Date();
    const sessionStarted = now >= APP_CONFIG.sessionStart;
    const daysLeft = Math.ceil((APP_CONFIG.sessionEnd - now) / (1000 * 60 * 60 * 24));
    const sessionEnded = daysLeft <= 0;

    if (!sessionStarted) {
        // PRE-SESSION: show countdown and prefiled bill count
        const daysUntil = Math.ceil((APP_CONFIG.sessionStart - now) / (1000 * 60 * 60 * 24));
        const prefiledCount = APP_STATE.bills.filter(b => b.status === 'prefiled').length;
        document.getElementById('hearingsWeek').textContent = prefiledCount;
        document.getElementById('hearingsLabel').textContent = 'Prefiled Bills';
        document.getElementById('daysLeft').textContent = Math.max(0, daysUntil);
        document.getElementById('daysLeftLabel').textContent = 'Days Until Session';
    } else if (sessionEnded) {
        const allCurrentSessionBills = APP_STATE.bills.filter(b => b.session !== String(APP_CONFIG.priorSession?.year));
        const atGovernor = allCurrentSessionBills.filter(b => b.status === 'governor' || b.status === 'passed_legislature').length;
        const enacted = allCurrentSessionBills.filter(b => b.status === 'enacted').length;
        document.getElementById('hearingsWeek').textContent = atGovernor;
        document.getElementById('hearingsLabel').textContent = 'Awaiting Governor';
        document.getElementById('daysLeft').textContent = enacted;
        document.getElementById('daysLeftLabel').textContent = 'Signed Into Law';
    } else {
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        const hearingsThisWeek = filteredBills.reduce((count, bill) => {
            if (!bill.hearings) return count;
            return count + bill.hearings.filter(h => {
                const hearingDate = new Date(h.date);
                return hearingDate >= now && hearingDate <= weekFromNow;
            }).length;
        }, 0);
        document.getElementById('hearingsWeek').textContent = hearingsThisWeek;
        document.getElementById('hearingsLabel').textContent = 'Hearings This Week';
        document.getElementById('daysLeft').textContent = Math.max(0, daysLeft);
        document.getElementById('daysLeftLabel').textContent = 'Days Remaining';
    }
}

// --- Utility used by render (also in app.js but needed here for renderTodayStats) ---
function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
