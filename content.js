// Content script for discreet mode (Ultimate Stealth)
let floatingPanel = null;
let isVisible = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleFloatingSearch') {
        toggleFloatingPanel();
    }
});

function createFloatingPanel() {
    const panel = document.createElement('div');
    panel.id = 'docusearch-floating';
    panel.innerHTML = `
    <div class="ds-header">
    <input type="text" id="ds-search" placeholder=" " autocomplete="off" spellcheck="false">
    </div>
    <div id="ds-results"></div>
    `;

    // কোনো ইনলাইন স্টাইল নেই, সব styles.css থেকে আসবে
    document.body.appendChild(panel);

    const searchInput = panel.querySelector('#ds-search');
    searchInput.addEventListener('input', debounce(handleFloatingSearch, 200));
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggleFloatingPanel();
    });

        return panel;
}

async function handleFloatingSearch(e) {
    const query = e.target.value;
    if (!query.trim()) {
        document.getElementById('ds-results').innerHTML = '';
        return;
    }

    const result = await chrome.storage.local.get(['docIndex', 'invertedIndex']);
    if (!result.docIndex) return;

    const results = performSearch(query, result.docIndex, result.invertedIndex);
    displayFloatingResults(results);
}

function performSearch(query, docIndex, invertedIndex) {
    const queryTokens = query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
    const scores = new Map();

    queryTokens.forEach(token => {
        const docs = invertedIndex[token] || [];
        docs.forEach(docId => {
            const score = (scores.get(docId) || 0) + 1;
            scores.set(docId, score);
        });
    });

    return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id, score]) => docIndex[id]);
}

function displayFloatingResults(results) {
    const container = document.getElementById('ds-results');
    container.innerHTML = '';

    results.forEach(r => {
        const div = document.createElement('div');
        div.className = 'ds-result';

        div.innerHTML = `
        <div class="ds-q">${r.question}</div>
        <div class="ds-a">${r.answer || ''}</div>
        `;

        // ক্লিক করলে কপি হবে, কিন্তু কোনো হাইলাইট হবে না
        div.addEventListener('click', () => {
            navigator.clipboard.writeText(r.answer || r.question);
        });

        container.appendChild(div);
    });
}

function toggleFloatingPanel() {
    if (!floatingPanel) {
        floatingPanel = createFloatingPanel();
    }
    isVisible = !isVisible;
    floatingPanel.style.display = isVisible ? 'block' : 'none';
    if (isVisible) {
        setTimeout(() => floatingPanel.querySelector('#ds-search').focus(), 50);
    }
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        toggleFloatingPanel();
    }
    if (e.key === 'Escape' && isVisible) {
        toggleFloatingPanel();
    }
});

function debounce(fn, ms) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), ms);
    };
}
