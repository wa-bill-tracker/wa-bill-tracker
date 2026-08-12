// data.js -- Bill loading, filtering, and cutoff date logic

import { APP_CONFIG, escapeHTML } from './config.js';
import { APP_STATE, StorageManager } from './state.js';

// Load Bills Data
export async function loadBillData(showToast) {
    try {
        // Cache-bust to avoid stale CDN/browser cache responses
        const cacheBuster = `?_=${Date.now()}`;
        const response = await fetch(APP_CONFIG.githubDataUrl + cacheBuster);

        if (response.ok) {
            const data = await response.json();
            const bills = data.bills || [];

            // Validate fetched data before using it
            if (bills.length === 0) {
                throw new Error('Fetched data contains no bills');
            }

            APP_STATE.bills = bills.map(bill => ({
                ...bill,
                committee: bill.committee ||
                    (bill.hearings && bill.hearings.length > 0
                        ? bill.hearings[bill.hearings.length - 1].committee
                        : ''),
                _searchText: [bill.number, bill.title, bill.description, bill.sponsor].join(' ').toLowerCase()
            }));
            APP_STATE.lastSync = data.lastSync || new Date().toISOString();

            // Cache validated data in localStorage
            localStorage.setItem('billsData', JSON.stringify(data));
            localStorage.setItem('lastDataFetch', new Date().toISOString());

            showToast(`Loaded ${APP_STATE.bills.length} bills`);
        } else {
            throw new Error('Failed to fetch from GitHub');
        }
    } catch (error) {
        console.error('Error loading from GitHub:', error);

        // Fall back to cached data
        const cachedData = localStorage.getItem('billsData');
        if (cachedData) {
            const data = JSON.parse(cachedData);
            const cachedBills = data.bills || [];

            if (cachedBills.length > 0) {
                APP_STATE.bills = cachedBills.map(bill => ({
                    ...bill,
                    committee: bill.committee ||
                        (bill.hearings && bill.hearings.length > 0
                            ? bill.hearings[bill.hearings.length - 1].committee
                            : ''),
                    _searchText: [bill.number, bill.title, bill.description, bill.sponsor].join(' ').toLowerCase()
                }));
                APP_STATE.lastSync = data.lastSync || null;
                showToast('Using cached data');
            } else {
                // Cached data is corrupted/empty -- clear it and retry
                localStorage.removeItem('billsData');
                localStorage.removeItem('lastDataFetch');
                APP_STATE.bills = [];
                showToast('No bill data available -- please refresh');
            }
        } else {
            // No data available
            APP_STATE.bills = [];
            showToast('No bill data available');
        }
    }
}

// Dynamically generate committee filter tags from loaded bill data
export function populateCommitteeFilters() {
    const container = document.getElementById('committeeFilters');
    if (!container) return;

    const committees = new Set();
    APP_STATE.bills.forEach(bill => {
        if (bill.committee) committees.add(bill.committee);
    });

    if (committees.size === 0) {
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">No committee data available</span>';
        return;
    }

    const sorted = [...committees].sort();
    const house = sorted.filter(c => c.startsWith('House'));
    const senate = sorted.filter(c => c.startsWith('Senate'));

    let html = '';

    if (house.length > 0) {
        html += '<span class="filter-group-label">House</span>';
        house.forEach(c => {
            const value = c.toLowerCase();
            const label = c.replace('House ', '');
            html += '<span class="filter-tag" data-filter="committee" data-value="' + value + '">' + label + '</span>';
        });
    }
    if (senate.length > 0) {
        html += '<span class="filter-group-label">Senate</span>';
        senate.forEach(c => {
            const value = c.toLowerCase();
            const label = c.replace('Senate ', '');
            html += '<span class="filter-tag" data-filter="committee" data-value="' + value + '">' + label + '</span>';
        });
    }

    container.innerHTML = html;

    // Attach click listeners to the dynamically generated filter tags
    container.querySelectorAll('.filter-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            const filterType = tag.dataset.filter;
            const value = tag.dataset.value;

            if (tag.classList.contains('active')) {
                tag.classList.remove('active');
                APP_STATE.filters[filterType] = APP_STATE.filters[filterType].filter(v => v !== value);
            } else {
                tag.classList.add('active');
                if (!Array.isArray(APP_STATE.filters[filterType])) {
                    APP_STATE.filters[filterType] = [];
                }
                APP_STATE.filters[filterType].push(value);
            }

            APP_STATE.pagination.page = 1;
            APP_STATE._dirty = true;
            // updateUI will be called by the caller after populateCommitteeFilters
            // Trigger a custom event so app.js can call updateUI
            document.dispatchEvent(new CustomEvent('filters-changed'));
            StorageManager.save();
            APP_STATE._dirty = false;
        });
    });

    // Restore active state from saved filters
    if (APP_STATE.filters.committee && APP_STATE.filters.committee.length > 0) {
        container.querySelectorAll('.filter-tag').forEach(tag => {
            if (APP_STATE.filters.committee.includes(tag.dataset.value)) {
                tag.classList.add('active');
            }
        });
    }
}

// Parse a YYYY-MM-DD date string as end-of-day in local time (11:59:59 PM).
// Cutoff dates represent the LAST day for action, so the cutoff doesn't pass
// until the day is over.
export function endOfDayLocal(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59);
}

// Determine if a bill has effectively failed based on legislative cutoff dates.
// Returns the cutoff label if the bill missed a deadline, or null if still active.
export function getBillCutoffStatus(bill) {
    // Only applies to current session bills
    if (bill.session === String(APP_CONFIG.priorSession?.year)) return null;
    // Already terminal -- not a cutoff failure
    if (['enacted', 'vetoed', 'failed', 'partial_veto', 'governor', 'passed_legislature'].includes(bill.status)) return null;

    const now = new Date();
    let cutoffLabel = null;

    for (const cutoff of APP_CONFIG.cutoffDates) {
        if (now <= endOfDayLocal(cutoff.date)) break; // cutoff day hasn't ended yet
        if (cutoff.failsBefore.includes(bill.status)) {
            cutoffLabel = cutoff.label;
            // Don't break -- later cutoffs may also apply
        }
    }
    return cutoffLabel;
}

// Get the next upcoming cutoff date
export function getNextCutoff() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const cutoff of APP_CONFIG.cutoffDates) {
        const cutoffEnd = endOfDayLocal(cutoff.date);
        if (cutoffEnd > now) {
            const cutoffDay = new Date(cutoffEnd.getFullYear(), cutoffEnd.getMonth(), cutoffEnd.getDate());
            const daysUntil = Math.round((cutoffDay - today) / (1000 * 60 * 60 * 24));
            return { ...cutoff, daysUntil, dateObj: cutoffEnd };
        }
    }
    return null; // all cutoffs passed
}

// Filter bills based on current APP_STATE filters
export function filterBills() {
    let filtered = [...APP_STATE.bills];

    console.log('filterBills called:', {
        currentBillType: APP_STATE.currentBillType,
        totalBills: APP_STATE.bills.length
    });

    // Filter out inactive bills (prior-session carryovers + cutoff failures) unless toggle is on
    if (!APP_STATE.filters.showInactiveBills) {
        const priorYear = String(APP_CONFIG.priorSession?.year || '');
        filtered = filtered.filter(bill => {
            // Hide prior-session bills (same-biennium carryovers)
            if (priorYear && bill.session === priorYear) return false;
            // Hide bills that missed a cutoff deadline
            if (getBillCutoffStatus(bill)) return false;
            return true;
        });
    }

    // Filter by current bill type page
    if (APP_STATE.currentBillType && APP_STATE.currentBillType.toLowerCase() !== 'all') {
        console.log('Filtering by type:', APP_STATE.currentBillType);
        filtered = filtered.filter(bill => {
            const billType = bill.number.split(' ')[0];
            return billType.toUpperCase() === APP_STATE.currentBillType.toUpperCase();
        });
        console.log('After type filter:', filtered.length);
    } else {
        console.log('Not filtering by type (showing all)');
    }

    if (APP_STATE.filters.search) {
        const search = APP_STATE.filters.search.toLowerCase();
        filtered = filtered.filter(bill => bill._searchText.includes(search));
    }

    if (APP_STATE.filters.status && APP_STATE.filters.status.length > 0) {
        const statusAliases = {
            'prefiled':      ['prefiled'],
            'introduced':    ['introduced'],
            'committee':     ['committee', 'opposite_committee'],
            'floor':         ['floor', 'opposite_floor'],
            'passed_origin': ['passed_origin', 'passed'],
            'passed':        ['passed', 'passed_origin'],
            'passed_legislature': ['passed_legislature'],
            'governor':      ['governor'],
            'enacted':       ['enacted'],
            'vetoed':        ['vetoed'],
            'failed':        ['failed']
        };
        const expandedStatuses = new Set();
        APP_STATE.filters.status.forEach(s => {
            (statusAliases[s] || [s]).forEach(v => expandedStatuses.add(v));
        });
        filtered = filtered.filter(bill => expandedStatuses.has(bill.status));
    }

    if (APP_STATE.filters.priority && APP_STATE.filters.priority.length > 0) {
        filtered = filtered.filter(bill => APP_STATE.filters.priority.includes(bill.priority));
    }

    if (APP_STATE.filters.committee && APP_STATE.filters.committee.length > 0) {
        filtered = filtered.filter(bill =>
            bill.committee && APP_STATE.filters.committee.some(c => bill.committee.toLowerCase() === c)
        );
    }

    if (APP_STATE.filters.type) {
        filtered = filtered.filter(bill => {
            const billType = bill.number.split(' ')[0];
            return billType === APP_STATE.filters.type;
        });
    }

    if (APP_STATE.filters.trackedOnly) {
        filtered = filtered.filter(bill => APP_STATE.trackedBills.has(bill.id));
    }

    return filtered;
}
