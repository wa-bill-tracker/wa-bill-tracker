// app.js -- Entry point: initialization, event listeners, navigation, and UI controls

import { loadConfig, debounce, escapeHTML, sanitizeInput, APP_CONFIG } from './config.js';
import { APP_STATE, CookieManager, StorageManager, DomainMigration, setStoragePrefix, getStorageKey, syncFilterTagUI } from './state.js';
import { loadBillData, populateCommitteeFilters, filterBills, getBillCutoffStatus, getNextCutoff } from './data.js';
import { updateUI, renderBills, setupInfiniteScroll, updateStats, renderSessionStats, showStatsDetail, createBillCard, STATUS_LABELS, getBillStageIndex, goToPage } from './render.js';
import { hasArchive, archiveHash, archiveLabel, renderArchive } from './archive.js';
import { toggleTrack, openNoteModal, closeNoteModal, saveNote, shareBill, shareNote, checkForSharedBill, highlightBill, updateUserPanel, updateUserNotesList, exportNotesCSV, importNotesCSV, emailAllNotes, updateSyncStatus, deleteOneNote, deleteAllNotes, copyAllNotes, setShowToast } from './notes.js';

// --- Initialize Application ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('App initializing...');

    // Load session configuration first
    let config;
    try {
        config = await loadConfig();
    } catch (e) {
        console.error('Failed to load session config:', e);
        showToast('Failed to load session configuration');
        return;
    }

    // Set storage prefix based on session year
    setStoragePrefix(config.year);

    // Wire showToast into notes module
    setShowToast(showToast);

    // Run domain migration checks
    DomainMigration.exportAndRedirect();
    DomainMigration.importFromHash();

    // Load saved state and initialize user
    StorageManager.load();
    initializeUser();

    // Update dynamic page text with session year
    document.title = config.siteName;
    const siteTitle = document.getElementById('siteTitle');
    if (siteTitle) {
        siteTitle.textContent = config.siteName;
    }
    const footerYear = document.getElementById('footerYear');
    if (footerYear) {
        footerYear.textContent = config.siteName;
    }

    setupDevBanner();
    setupArchiveNav();

    // Load bill data
    await loadBillsData();

    // Set up UI
    setupEventListeners();
    syncFilterTagUI();
    setupAutoSave();
    setupNavigationListeners();

    // Ensure we have a valid bill type set
    if (!APP_STATE.currentBillType) {
        APP_STATE.currentBillType = 'all';
    }

    // Force initial render
    const initialType = APP_STATE.currentBillType;
    APP_STATE.currentBillType = null;
    handleHashChange();
    if (!APP_STATE.currentBillType) {
        APP_STATE.currentBillType = initialType;
        updateUI();
    }

    // Listen for ui-updated events from render.js to update user panel
    document.addEventListener('ui-updated', () => {
        updateUserPanel(formatDate);
    });

    // Listen for filter-changed events from data.js committee filters
    document.addEventListener('filters-changed', () => {
        updateUI();
    });

    _checkForSharedBill();
});

// --- Development banner (ADO #3117) ---
// Shown only while APP_CONFIG.developmentBanner (session.json) is true and the
// visitor has not dismissed it. Dismissal is stored per session year.
//
// Dismissal is kept in both a cookie and localStorage under the same key.
// WebKit rejects Secure cookies on http://localhost, so the cookie alone would
// not persist there; either copy counts as dismissed.
function isBannerDismissed(key) {
    if (String(CookieManager.get(key)) === '1') return true;
    try {
        return localStorage.getItem(key) === '1';
    } catch (e) {
        return false;
    }
}

function rememberBannerDismissed(key) {
    CookieManager.set(key, '1', 365);
    try {
        localStorage.setItem(key, '1');
    } catch (e) {
        console.warn('Could not store banner dismissal in localStorage:', e);
    }
}

function setupDevBanner() {
    const banner = document.getElementById('devBanner');
    const dismissBtn = document.getElementById('devBannerDismiss');
    if (!banner || !dismissBtn) return;

    const key = getStorageKey('dev_banner_dismissed');
    if (!APP_CONFIG.developmentBanner || isBannerDismissed(key)) {
        banner.hidden = true;
        return;
    }

    banner.hidden = false;
    dismissBtn.addEventListener('click', () => {
        banner.hidden = true;
        rememberBannerDismissed(key);
        // The banner (and the button that had focus) is gone; move focus to
        // the page title so keyboard and screen reader users keep their place.
        const title = document.getElementById('siteTitle');
        if (title) {
            title.setAttribute('tabindex', '-1');
            title.focus();
        }
    });
}

// --- Wrapper for loadBillData that passes showToast and calls post-load hooks ---
async function loadBillsData() {
    await loadBillData(showToast);
    updateSyncStatus();
    populateCommitteeFilters();
}

// --- Wrapper for shared bill check ---
function _checkForSharedBill() {
    checkForSharedBill((billId) => {
        _highlightBill(billId);
    });
}

// --- Wrapper for highlightBill that injects dependencies ---
function _highlightBill(billId) {
    highlightBill(billId, navigateToBillType, showMainView);
}

// --- User Initialization ---
function initializeUser() {
    let userId = CookieManager.get(getStorageKey('user_id'));

    if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        CookieManager.set(getStorageKey('user_id'), userId, 365);
    }

    APP_STATE.userData.id = userId;

    if (!APP_STATE.userData.name || APP_STATE.userData.name === 'Guest User') {
        const savedName = CookieManager.get(getStorageKey('user_name'));
        if (savedName) {
            setUserName(savedName);
        } else {
            promptUserName();
        }
    }
}

function setUserName(name) {
    const clean = sanitizeInput(name, 50);
    APP_STATE.userData.name = clean || 'Guest User';
    APP_STATE.userData.avatar = APP_STATE.userData.name.charAt(0).toUpperCase();
    CookieManager.set(getStorageKey('user_name'), APP_STATE.userData.name, 365);
}

function promptUserName() {
    const name = prompt('Welcome to WA Bill Tracker! What name would you like to use?', '');
    if (name && name.trim()) {
        setUserName(name.trim());
    } else {
        setUserName('Guest User');
    }
}

function changeUserName() {
    const current = APP_STATE.userData.name === 'Guest User' ? '' : APP_STATE.userData.name;
    const name = prompt('Enter your name:', current);
    if (name !== null) {
        setUserName(name.trim() || 'Guest User');
        updateUserPanel(formatDate);
    }
}

// --- Navigation ---
function setupNavigationListeners() {
    window.addEventListener('hashchange', handleHashChange);

    document.querySelectorAll('.nav-tab[data-type]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const type = tab.dataset.type;
            navigateToBillType(type);
        });
    });

    const archiveLink = document.getElementById('archiveNavLink');
    if (archiveLink) {
        archiveLink.addEventListener('click', (e) => {
            e.preventDefault();
            showArchive();
        });
    }
}

// --- Prior-session archive nav (ADO #3118) ---
// Label, href and visibility come from session.json priorSession.
function setupArchiveNav() {
    const link = document.getElementById('archiveNavLink');
    if (!link) return;
    if (!hasArchive()) {
        link.hidden = true;
        return;
    }
    link.textContent = archiveLabel();
    link.setAttribute('href', '#' + archiveHash());
    link.hidden = false;
}

// The nav scrolls sideways; keep the active tab on screen (ADO #3118). Moves
// the nav's own scrollLeft only when the tab is clipped. element.scrollIntoView
// is avoided on purpose: Chromium treats it as the new starting point for Tab,
// which broke "first Tab reaches the banner dismiss button".
function scrollNavTabIntoView(tab) {
    const nav = tab && tab.parentElement;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const pad = 16;
    const navBox = nav.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    if (tabBox.right > navBox.right - pad) {
        nav.scrollLeft += tabBox.right - navBox.right + pad;
    } else if (tabBox.left < navBox.left + pad) {
        nav.scrollLeft -= navBox.left - tabBox.left + pad;
    }
}

function setCurrentNav(activeEl) {
    document.querySelectorAll('.bill-type-nav .nav-tab').forEach(tab => {
        const isActive = tab === activeEl;
        tab.classList.toggle('active', isActive);
        if (isActive) {
            tab.setAttribute('aria-current', 'page');
        } else {
            tab.removeAttribute('aria-current');
        }
    });
    scrollNavTabIntoView(activeEl);
}

async function showArchive() {
    if (!hasArchive()) return;
    APP_STATE.currentView = 'archive';
    APP_STATE.currentBillType = null;
    document.getElementById('mainView').classList.remove('active');
    document.getElementById('statsView').classList.remove('active');
    document.getElementById('archiveView').classList.add('active');
    setCurrentNav(document.getElementById('archiveNavLink'));
    document.getElementById('pageTitle').textContent = archiveLabel();
    document.getElementById('pageDescription').textContent = '';

    const newHash = archiveHash();
    if (window.location.hash.slice(1) !== newHash) {
        window.location.hash = newHash;
    }
    await renderArchive();
}

function handleHashChange() {
    const hash = window.location.hash.slice(1);

    if (hash.startsWith('bill-')) {
        const billId = hash.replace('bill-', '');
        setTimeout(() => {
            _highlightBill(billId);
        }, 1000);
        return;
    }

    if (hasArchive() && hash === archiveHash()) {
        showArchive();
        return;
    }

    const billType = hash ? (hash.toLowerCase() === 'all' ? 'all' : hash.toUpperCase()) : 'all';

    if (APP_CONFIG.billTypes[billType]) {
        navigateToBillType(billType);
    } else {
        navigateToBillType('all');
    }
}

function navigateToBillType(type) {
    const normalizedType = type.toLowerCase() === 'all' ? 'all' : type.toUpperCase();

    if (!APP_CONFIG.billTypes[normalizedType]) {
        console.warn(`Invalid bill type: ${type}, defaulting to 'all'`);
        type = 'all';
    } else {
        type = normalizedType;
    }

    if (APP_STATE.currentBillType === type && APP_STATE.currentView === 'main') {
        return;
    }

    APP_STATE.currentBillType = type;

    APP_STATE.currentView = 'main';
    document.getElementById('statsView').classList.remove('active');
    document.getElementById('archiveView').classList.remove('active');
    document.getElementById('mainView').classList.add('active');

    setCurrentNav(Array.from(document.querySelectorAll('.nav-tab[data-type]')).find(tab => {
        const tabType = tab.dataset.type.toLowerCase() === 'all' ? 'all' : tab.dataset.type.toUpperCase();
        return tabType === type;
    }));

    const typeInfo = APP_CONFIG.billTypes[type];
    document.getElementById('pageTitle').textContent = typeInfo.name;
    document.getElementById('pageDescription').textContent = typeInfo.description;

    const newHash = type.toLowerCase();
    if (window.location.hash.slice(1) !== newHash) {
        window.location.hash = newHash;
    }

    if (type !== 'all') {
        APP_STATE.filters.type = '';
        document.querySelectorAll('.filter-tag[data-filter="type"]').forEach(tag => {
            tag.classList.remove('active');
        });
    }

    APP_STATE.pagination.page = 1;
    StorageManager.save();
    updateUI();
}

// --- Event Listeners ---
function setupEventListeners() {
    const debouncedSearch = debounce(() => {
        updateUI();
    }, 250);

    document.getElementById('searchInput').addEventListener('input', (e) => {
        APP_STATE.filters.search = sanitizeInput(e.target.value, 200);
        APP_STATE.pagination.page = 1;
        debouncedSearch();
    });

    document.querySelectorAll('.filter-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            const filter = tag.dataset.filter;
            const value = tag.dataset.value;

            if (tag.classList.contains('active')) {
                tag.classList.remove('active');
                APP_STATE.filters[filter] = APP_STATE.filters[filter].filter(v => v !== value);
            } else {
                tag.classList.add('active');
                if (!Array.isArray(APP_STATE.filters[filter])) {
                    APP_STATE.filters[filter] = [];
                }
                APP_STATE.filters[filter].push(value);
            }

            APP_STATE.pagination.page = 1;
            APP_STATE._dirty = true;
            updateUI();
            StorageManager.save();
            APP_STATE._dirty = false;
        });
    });

    // Inactive bills toggle
    const inactiveToggle = document.getElementById('showInactiveBills');
    if (inactiveToggle) {
        inactiveToggle.addEventListener('change', (e) => {
            APP_STATE.filters.showInactiveBills = e.target.checked;
            APP_STATE.pagination.page = 1;
            updateUI();
        });
    }

    // Bill action button delegation
    document.getElementById('billsGrid').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const billId = btn.dataset.billId;
        switch (btn.dataset.action) {
            case 'track': toggleTrack(billId, showToast); break;
            case 'note': openNoteModal(billId); break;
            case 'share': shareBill(billId); break;
        }
    });

    // User panel toggle
    const panel = document.getElementById('userPanel');
    const avatar = document.getElementById('userAvatar');

    const savedPanelState = CookieManager.get(getStorageKey('panel_collapsed'));
    if (savedPanelState === '1') {
        panel.classList.add('panel-collapsed');
    }

    avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 768) {
            panel.classList.toggle('mobile-expanded');
        } else {
            panel.classList.toggle('panel-collapsed');
            const isCollapsed = panel.classList.contains('panel-collapsed');
            CookieManager.set(getStorageKey('panel_collapsed'), isCollapsed ? '1' : '0', 365);
        }
    });

    document.addEventListener('click', (e) => {
        if (window.innerWidth > 768) return;
        if (!panel.contains(e.target)) {
            panel.classList.remove('mobile-expanded');
        }
    });

    // Stats cards
    document.querySelectorAll('.stat-card[data-stat]').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            showStatsDetail(card.dataset.stat);
        });
    });

    // Filter toggle, tracked toggle, refresh
    document.getElementById('filterToggle').addEventListener('click', toggleFilters);
    document.getElementById('trackedToggle').addEventListener('click', toggleTrackedOnly);
    document.getElementById('refreshBtn').addEventListener('click', refreshData);

    // Back to main view
    document.getElementById('backToMainBtn').addEventListener('click', (e) => {
        e.preventDefault();
        showMainView();
    });

    // User panel expand
    document.getElementById('expandBtn').addEventListener('click', toggleUserPanel);
    document.getElementById('userName').addEventListener('click', changeUserName);

    // Notes export buttons
    const safeBind = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };
    safeBind('copyNotesBtn', 'click', copyAllNotes);
    safeBind('emailNotesBtn', 'click', emailAllNotes);
    safeBind('csvNotesBtn', 'click', exportNotesCSV);
    safeBind('importCsvBtn', 'click', () => {
        document.getElementById('csvFileInput').click();
    });
    safeBind('csvFileInput', 'change', importNotesCSV);

    // Note modal buttons
    document.getElementById('noteModalClose').addEventListener('click', closeNoteModal);
    document.getElementById('noteModalCancel').addEventListener('click', closeNoteModal);
    document.getElementById('noteModalShare').addEventListener('click', shareNote);
    document.getElementById('noteModalSave').addEventListener('click', saveNote);
    document.getElementById('noteModalDeleteAll').addEventListener('click', deleteAllNotes);

    // Delegated handler for highlight-bill links
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-highlight-bill]');
        if (el) {
            e.preventDefault();
            _highlightBill(el.dataset.highlightBill);
        }
    });

    // Cutoff failed section toggle
    const cutoffToggle = document.getElementById('cutoffFailedToggle');
    if (cutoffToggle) {
        cutoffToggle.addEventListener('click', () => {
            const section = document.getElementById('cutoffFailedSection');
            const isExpanded = section.classList.toggle('expanded');
            cutoffToggle.setAttribute('aria-expanded', isExpanded);
        });
    }

    // Cutoff explainer banner toggle and dismiss
    const explainerToggle = document.getElementById('cutoffExplainerToggle');
    const explainerDismiss = document.getElementById('cutoffExplainerDismiss');
    const explainerBanner = document.getElementById('cutoffExplainerBanner');

    if (explainerToggle && explainerBanner) {
        explainerToggle.addEventListener('click', () => {
            const isExpanded = explainerBanner.classList.toggle('expanded');
            explainerToggle.setAttribute('aria-expanded', isExpanded);
        });
    }

    if (explainerDismiss && explainerBanner) {
        explainerDismiss.addEventListener('click', () => {
            explainerBanner.classList.add('dismissed');
            CookieManager.set(getStorageKey('cutoff_banner_dismissed'), '1', 7);
        });

        if (CookieManager.get(getStorageKey('cutoff_banner_dismissed')) === '1') {
            explainerBanner.classList.add('dismissed');
        }
    }

    // Delegated handler for bill actions in cutoff-failed section
    const cutoffContainer = document.getElementById('cutoffFailedBills');
    if (cutoffContainer) {
        cutoffContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const billId = btn.dataset.billId;
            switch (btn.dataset.action) {
                case 'track': toggleTrack(billId, showToast); break;
                case 'note': openNoteModal(billId); break;
                case 'share': shareBill(billId); break;
            }
        });
    }
}

// --- Auto-save ---
function setupAutoSave() {
    setInterval(() => {
        if (APP_STATE._dirty) {
            StorageManager.save();
            APP_STATE._dirty = false;
        }
    }, APP_CONFIG.autoSaveInterval);
}

// --- UI Controls ---
function toggleFilters() {
    const panel = document.getElementById('filtersPanel');
    const btn = document.getElementById('filterToggle');
    panel.classList.toggle('active');
    btn.classList.toggle('active');
}

function toggleTrackedOnly() {
    const btn = document.getElementById('trackedToggle');
    APP_STATE.filters.trackedOnly = !APP_STATE.filters.trackedOnly;
    btn.classList.toggle('active');
    APP_STATE.pagination.page = 1;
    updateUI();
    StorageManager.save();
}

function toggleUserPanel() {
    const panel = document.getElementById('userPanel');
    const notesSection = document.getElementById('userNotesSection');
    const expandBtn = document.getElementById('expandBtn');
    panel.classList.toggle('expanded');
    notesSection.classList.toggle('active');
    expandBtn.classList.toggle('expanded');
}

async function refreshData() {
    const syncStatus = document.getElementById('syncStatus');
    syncStatus.classList.add('syncing');

    await loadBillsData();
    updateUI();

    setTimeout(() => {
        syncStatus.classList.remove('syncing');
    }, 1000);
}

function showMainView() {
    APP_STATE.currentView = 'main';
    document.getElementById('statsView').classList.remove('active');
    document.getElementById('mainView').classList.add('active');
    updateUI();
}

// --- Utility Functions ---
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours === 0) {
            return 'Just now';
        }
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return `${days} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// --- Toast Notifications ---
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// --- Add highlight animation CSS ---
const style = document.createElement('style');
style.textContent = `
    @keyframes highlight {
        0% { box-shadow: 0 0 0 0 var(--accent); }
        50% { box-shadow: 0 0 20px 10px var(--accent); }
        100% { box-shadow: 0 0 0 0 var(--accent); }
    }
`;
document.head.appendChild(style);

// --- Expose functions to window for any remaining inline handlers ---
window.showStatsDetail = showStatsDetail;
window.goToPage = goToPage;
