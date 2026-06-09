// Document Index Storage
let documentIndex = [];
let invertedIndex = {};
let isDiscreetMode = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadStoredData();
    setupEventListeners();
});

// Load previously indexed data
async function loadStoredData() {
    try {
        const result = await chrome.storage.local.get(['docIndex', 'invertedIndex', 'metadata', 'isDiscreetMode']);
        if (result.docIndex) {
            documentIndex = result.docIndex;
            invertedIndex = result.invertedIndex || {};
            updateUIForLoadedDoc(result.metadata);
        }
        if (result.isDiscreetMode !== undefined) {
            isDiscreetMode = result.isDiscreetMode;
            const toggleBtn = document.getElementById('discreetToggle');
            if (toggleBtn) {
                if (isDiscreetMode) toggleBtn.classList.add('active');
                else toggleBtn.classList.remove('active');
            }
        }
    } catch (error) {
        console.error('Error loading stored data:', error);
    }
}

// Event Listeners - UPGRADED FOR ADVANCED SHORTCUTS & POPUP FIXES
function setupEventListeners() {
    const fileInput = document.getElementById('docxFile');

    if (fileInput) {
        // Windows/Chrome-এ ছোট পপআপে ফাইল আপলোড দিলে এক্সটেনশন বন্ধ হওয়া আটকানোর জন্য
        fileInput.addEventListener('click', (e) => {
            if (window.innerWidth < 500) {
                e.preventDefault();
                chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') }, () => {
                    window.close();
                });
            }
        });
        fileInput.addEventListener('change', handleFileUpload);
    }

    // Search inputs
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 200)); // রিঅ্যাকশন টাইম আরও ফাস্ট করা হয়েছে (200ms)
    }

    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }

    const discreetToggle = document.getElementById('discreetToggle');
    if (discreetToggle) {
        discreetToggle.addEventListener('click', toggleDiscreetMode);
    }

    // POWERFUL SHORTCUTS: Ctrl + S দিয়ে সার্চ বক্সে ফোকাস এবং Ctrl + Shift + S দিয়ে ফ্লোটিং প্যানেল
    document.addEventListener('keydown', (e) => {
        // Ctrl + S চাপলে ব্রাউজারের Save উইন্ডো ব্লক করে সার্চ ইনপুটে ফোকাস করবে
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            const sInput = document.getElementById('searchInput');
            if (sInput) {
                sInput.focus();
                sInput.select(); // আগের টেক্সট থাকলে সিলেক্ট হয়ে যাবে যাতে সরাসরি নতুন কিছু টাইপ করা যায়
            }
        }
        // Floating search panel toggle
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            toggleFloatingSearch();
        }
    });
}

// Handle DOCX Upload
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    e.target.value = ''; // একই ফাইল বারবার আপলোডের সুবিধার্থে রিসেট
    showLoading(true);

    try {
        const arrayBuffer = await file.arrayBuffer();
        const questions = await parseDocx(arrayBuffer);

        if (!questions || questions.length === 0) {
            throw new Error('ফাইলের ভেতর কোনো লেখা পাওয়া যায়নি!');
        }

        await buildIndex(questions);

        const metadata = {
            filename: file.name,
            uploadedAt: new Date().toISOString(),
            questionCount: questions.length
        };

        await chrome.storage.local.set({
            docIndex: documentIndex,
            invertedIndex: invertedIndex,
            metadata: metadata
        });

        updateUIForLoadedDoc(metadata);
        showNotification(`✓ Indexed ${questions.length} blocks successfully!`);

    } catch (error) {
        console.error('Parse error:', error);
        alert('❌ Error: ' + error.message);
        showNotification('✗ Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// THE INDESTRUCTIBLE PARSER
async function parseDocx(arrayBuffer) {
    let zip;
    try {
        zip = await JSZip.loadAsync(arrayBuffer);
    } catch (e) {
        throw new Error("এটি আসল DOCX ফাইল নয় বা করাপ্টেড। দয়া করে MS Word দিয়ে Save As > DOCX করুন।");
    }

    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error("ফাইলের ভেতর document.xml পাওয়া যায়নি। এটি সঠিক Word ফাইল নয়।");

    const xmlContent = await docFile.async('text');

    let pureText = xmlContent
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<w:tab\/>/gi, ' ')
    .replace(/<[^>]+>/g, '');

    pureText = pureText.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    let lines = pureText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length === 0) throw new Error("ফাইলের ভেতর পড়ার মতো কোনো টেক্সট নেই!");

    let questions = [];
    let currentBlock = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (/^[Oo0]$/.test(line)) continue; // আবর্জনা বুলেট বাদ দেওয়া

        currentBlock.push(line);

        if (line.toLowerCase().startsWith('answer') || currentBlock.length >= 6) {
            questions.push({
                question: currentBlock[0] || 'Text Block',
                options: currentBlock.slice(1, -1),
                           answer: currentBlock.join(' | '),
                           fullText: currentBlock.join('\n')
            });
            currentBlock = [];
        }
    }

    if (currentBlock.length > 0) {
        questions.push({
            question: currentBlock[0],
            options: currentBlock.slice(1),
                       answer: currentBlock.join(' | '),
                       fullText: currentBlock.join('\n')
        });
    }

    return questions;
}

// Build Inverted Index
async function buildIndex(questions) {
    documentIndex = [];
    invertedIndex = {};

    questions.forEach((q, idx) => {
        const doc = {
            id: idx,
            question: q.question,
            options: q.options,
            answer: q.answer,
            fullText: q.fullText,
            tokens: tokenize(q.fullText)
        };

        documentIndex.push(doc);

        doc.tokens.forEach(token => {
            if (!invertedIndex[token]) invertedIndex[token] = new Set();
            invertedIndex[token].add(idx);
        });
    });

    Object.keys(invertedIndex).forEach(key => {
        invertedIndex[key] = Array.from(invertedIndex[key]);
    });
}

// Tokenize text - UPGRADED TO KEEP TECH TERMS (IP, OS, AD, VM)
function tokenize(text) {
    if (!text) return [];
    // স্পেশাল ক্যারেক্টার ক্লিন করা কিন্তু টেকনিক্যাল ড্যাশ বা আন্ডারস্কোর আংশিক বজায় রাখা
    return text.toLowerCase()
    .replace(/[^\w\s\-_]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !isStopWord(t)); // লেন্থ ২ করা হয়েছে যাতে ছোট আইটি টার্ম ডিলিট না হয়
}

// Stop words filter
function isStopWord(word) {
    const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'was', 'one', 'our', 'out', 'has', 'how', 'its', 'may', 'new', 'now', 'see', 'two', 'who', 'use', 'way', 'any', 'say', 'try', 'ask', 'why', 'let', 'put', 'when', 'much', 'would', 'there', 'their', 'what', 'said', 'each', 'which', 'will', 'about', 'could', 'other', 'after', 'first', 'never', 'these', 'think', 'where', 'being', 'every', 'great', 'might', 'shall', 'those', 'while', 'this', 'that', 'with', 'have', 'from', 'they', 'been', 'were', 'than', 'them', 'into', 'just', 'like', 'over', 'also', 'only', 'know', 'take', 'some', 'come', 'make', 'well', 'even', 'more', 'want', 'here', 'look', 'down', 'most', 'long', 'last', 'find', 'give', 'does', 'made', 'part', 'such', 'keep', 'call', 'need', 'feel', 'seem', 'turn', 'high', 'sure', 'upon', 'head', 'help', 'side', 'move', 'both', 'five', 'once', 'same', 'must', 'name', 'left', 'done', 'open', 'case', 'show', 'live', 'play', 'went', 'told', 'seen', 'heard', 'talk', 'soon', 'read', 'stop', 'face', 'fact', 'land', 'line', 'kind', 'next', 'word']);
    return stopWords.has(word);
}

// NEXT-LEVEL HYBRID SEARCH ALGORITHM (TF-IDF + Exact + Proximity + Substring Fuzzy)
function handleSearch(e) {
    const query = e && e.target ? e.target.value : document.getElementById('searchInput').value;
    if (!query || !query.trim()) {
        clearResults();
        return;
    }

    const rawQuery = query.toLowerCase().trim();
    const queryTokens = tokenize(query);

    // যদি টেক্সট টোকেনাইজড নাও হয় (খুব ছোট বা অদ্ভুত ক্যারেক্টার), র-কোয়েরি পুশ করবে ব্যাকআপ হিসেবে
    if (queryTokens.length === 0 && rawQuery.length > 0) {
        queryTokens.push(rawQuery);
    }

    const scores = new Map();
    const uniqueQueryTokens = [...new Set(queryTokens)];

    // ১. সম্পূর্ণ ডেটাসেটের ওপর মাল্টি-লেয়ারড স্কোারিং রান করা হচ্ছে
    documentIndex.forEach((doc, docId) => {
        let score = 0;
        const docText = doc.fullText.toLowerCase();
        const docQuestion = doc.question.toLowerCase();

        // LAYER A: EXACT PHRASE MATCHING (সবচেয়ে শক্তিশালী লজিক)
        if (docText.includes(rawQuery)) {
            score += 2000; // হুবহু পুরো বাক্য বা অংশ মিললে বিশাল বুস্ট
            if (docQuestion.includes(rawQuery)) score += 1000; // প্রশ্নটির মূল বডিতে থাকলে আরও বোনাস
        }

        // LAYER B: SUB-STRING & FUZZY WORD MATCHING
        let matchedTokensCount = 0;

        uniqueQueryTokens.forEach((token, qIdx) => {
            let tokenFound = false;

            // যদি শব্দটা হুবহু ইনভার্টেড ইনডেক্স টোকেনের সাথে মেলে
            if (doc.tokens.includes(token)) {
                score += 100;
                tokenFound = true;
                const tf = doc.tokens.filter(t => t === token).length;
                score += (tf * 15); // Term Frequency বোনাস
            }
            // FUZZY BACKUP: যদি ইউজার পুরো শব্দ না লিখে আংশিক লেখে (যেমন 'meterpret' লিখলে 'meterpreter' ম্যাচ করবে)
            else if (docText.includes(token)) {
                score += 50; // আংশিক শব্দের জন্য স্কোর
                tokenFound = true;
            }

            if (tokenFound) {
                matchedTokensCount++;

                // LAYER C: WORD PROXIMITY (শব্দ জোড়া পাশাপাশি আছে কি না)
                if (qIdx < uniqueQueryTokens.length - 1) {
                    const nextToken = uniqueQueryTokens[qIdx + 1];
                    // দুটি শব্দ পাশাপাশি থাকলে (যেমন: "remote session")
                    if (docText.includes(token + " " + nextToken) || docText.includes(token + "  " + nextToken)) {
                        score += 300;
                    }
                }
            }
        });

        // LAYER D: QUERY COVERAGE RATIO (ইউজারের দেওয়া কত শতাংশ শব্দ ম্যাচ করেছে)
        const coverageRatio = uniqueQueryTokens.length > 0 ? (matchedTokensCount / uniqueQueryTokens.length) : 0;

        if (uniqueQueryTokens.length >= 3) {
            if (coverageRatio === 1) {
                score += 500; // সব শব্দই ফাইলে উপস্থিত থাকলে এক্সট্রা রিওয়ার্ড
            } else if (coverageRatio < 0.35) {
                score = score * 0.02; // যদি অল্প কিছু কমন শব্দ ছাড়া বাকি মূল প্রশ্ন না মেলে, তবে স্কোর বাতিল সমতুল্য করা হবে
            } else {
                score = score * (1 + coverageRatio);
            }
        }

        if (score > 0) {
            scores.set(docId, score);
        }
    });

    // ২. সর্টিং এবং টপ রেজাল্ট ফিল্টারিং
    const results = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12) // সেরা ১২টি রেজাল্ট ইউজারকে দেখানো হবে
    .map(([id, score]) => {
        // রিয়েলিস্টিক পার্সেন্টেজ ক্যালকুলেশন
        let normalizedScore = 0;
        if (score >= 2000) {
            normalizedScore = 100; // হুবহু বা পারফেক্ট ম্যাচ
        } else {
            normalizedScore = Math.min((score / 800) * 100, 99.8);
        }
        return { ...documentIndex[id], score: normalizedScore };
    });

    displayResults(results, query);
}

// Display results in UI
function displayResults(results, query) {
    const container = document.getElementById('resultsSection');
    if (!container) return;
    container.innerHTML = '';

    if (results.length === 0) {
        container.innerHTML = '<div class="loading">No matches found</div>';
        return;
    }

    results.forEach(result => {
        const div = document.createElement('div');
        div.className = 'result-item';

        const highlightedQ = highlightTerms(result.question, query);
        const highlightedA = highlightTerms(result.answer, query);

        // রেলিভেন্সের ওপর ভিত্তি করে কালার ডায়নামিক করা হয়েছে
        const scoreColor = result.score > 85 ? '#4ade80' : (result.score > 50 ? '#fbbf24' : '#f87171');

        div.innerHTML = `
        <div class="result-question">${highlightedQ}</div>
        <div class="result-answer" style="color: #bbb; line-height: 1.4;">${highlightedA}</div>
        <div class="result-score" style="margin-top: 6px; font-size: 11px; color: ${scoreColor}; font-weight: bold;">
        Relevance: ${result.score.toFixed(1)}%
        </div>
        `;

        // Click to Copy Feature
        div.addEventListener('click', () => {
            copyToClipboard(result.answer || result.question);
            showNotification('✓ Copied to clipboard!');
        });

        container.appendChild(div);
    });
}

// Highlight Search Terms (Safe & Clean regex replacement)
function highlightTerms(text, query) {
    if (!text) return '';
    const terms = tokenize(query);
    if (terms.length === 0) return text;

    // ইউনিক এবং দীর্ঘতম শব্দগুলোকে আগে সর্ট করা হয়েছে যাতে ছোট পার্ট বড় শব্দকে নষ্ট না করে
    const uniqueTerms = [...new Set(terms)].sort((a, b) => b.length - a.length);

    let highlighted = text;
    uniqueTerms.forEach(term => {
        if (term.trim().length < 2) return;
        // HTML ট্যাগ প্রটেক্ট করার জন্য সেফ বাউন্ডারি বা সিম্পল রিপ্লেসমেন্ট
        const regex = new RegExp(`(${term})`, 'gi');
        highlighted = highlighted.replace(regex, '<mark style="background: #667eea; color: white; padding: 1px 3px; border-radius: 3px;">$1</mark>');
    });
    return highlighted;
}

// Discreet/Floating Mode
function toggleDiscreetMode() {
    isDiscreetMode = !isDiscreetMode;
    document.getElementById('discreetToggle').classList.toggle('active');
    chrome.storage.local.set({ isDiscreetMode: isDiscreetMode });

    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
        if (!tabs || !tabs[0] || !tabs[0].id) return;
        if (tabs[0].url && (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('edge://'))) {
            showNotification('ℹ Cannot inject UI into System Pages');
            return;
        }
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleFloatingSearch', enabled: isDiscreetMode }, () => {
            if (chrome.runtime.lastError) console.log("Tab channel not loaded yet.");
        });
    });
}

// UI Fixes after doc loads
function updateUIForLoadedDoc(metadata) {
    if (!metadata) return;
    const uploadSection = document.getElementById('uploadSection');
    const searchSection = document.getElementById('searchSection');

    if (uploadSection) uploadSection.classList.add('hidden');
    if (searchSection) searchSection.classList.remove('hidden');

    const docStatus = document.getElementById('docStatus');
    const qCount = document.getElementById('qCount');

    if (docStatus) docStatus.textContent = `📄 ${metadata.filename}`;
    if (qCount) qCount.textContent = `${metadata.questionCount} blocks found`;
}

// Helpers
function debounce(fn, ms) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), ms);
    };
}

function clearResults() {
    const section = document.getElementById('resultsSection');
    if (section) section.innerHTML = '';
}

function showLoading(show) {
    const results = document.getElementById('resultsSection');
    if (results) results.innerHTML = show ? '<div class="loading">Processing document...</div>' : '';
}

function showNotification(msg) {
    let toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%); background: rgba(102, 126, 234, 0.95); color: white; padding: 8px 16px; border-radius: 20px; font-size: 12px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.3); white-space: nowrap; animation: fadeInOut 2.5s ease-forward;`;
    if (!document.getElementById('toast-style')) {
        let style = document.createElement('style');
        style.id = 'toast-style';
        style.innerHTML = `@keyframes fadeInOut { 0% { opacity: 0; bottom: 50px; } 15% { opacity: 1; bottom: 70px; } 85% { opacity: 1; bottom: 70px; } 100% { opacity: 0; bottom: 50px; } }`;
        document.head.appendChild(style);
    }
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function copyToClipboard(text) {
    if (text) navigator.clipboard.writeText(text);
}

function toggleFloatingSearch() {
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
        if (tabs && tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'toggleFloatingSearch'}, () => {
                if (chrome.runtime.lastError) {}
            });
        }
    });
}
