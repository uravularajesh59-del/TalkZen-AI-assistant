// API Configuration
// You can hardcode your key here to bypass the login screen
const DEFAULT_API_KEY = '';
let GEMINI_API_KEY = DEFAULT_API_KEY || localStorage.getItem('talkzen_api_key');
const getApiUrl = () => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// System Prompt
const SYSTEM_PROMPT = "You are TalkZen-AI, a serene, professional, and highly capable AI Assistant. You are currently assisting your 'Admin' (the user). You can perform multiple tasks including coding, writing, reasoning, and multi-language translation. Your tone is helpful and efficient.";

// State Management
let chats = JSON.parse(localStorage.getItem('talkzen_chats')) || [];
let currentChatId = null;
let isGenerating = false;
let abortController = null;

// Configure Marked
marked.setOptions({
    highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true
});

// DOM Elements
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const sidebar = document.querySelector('.sidebar');
const historyList = document.getElementById('history-list');
const settingsModal = document.getElementById('settings-modal');
const apiKeyInput = document.getElementById('api-key-input');
const toastContainer = document.getElementById('toast-container'); // New

// Initialization
lucide.createIcons();
renderHistory();
if (chats.length > 0) {
    loadChat(chats[0].id);
} else {
    createNewChat();
}

// Check for API Key on load
if (!GEMINI_API_KEY) {
    // Show Login Modal
    toggleSettingsModal(true);
} else {
    // If key exists, ensure modal is hidden
    toggleSettingsModal(false);
}

// Event Listeners
userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    sendBtn.disabled = this.value.trim() === '' || isGenerating;
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isGenerating) sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);
stopBtn.addEventListener('click', stopGenerating);
toggleSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

// Auth Modal Functions
function toggleSettingsModal(show) {
    settingsModal.classList.toggle('active', show);
    if (show) {
        apiKeyInput.focus();
    }
}

function saveSettings() {
    const newKey = apiKeyInput.value.trim();
    if (newKey) {
        GEMINI_API_KEY = newKey;
        localStorage.setItem('talkzen_api_key', newKey);
        toggleSettingsModal(false);
        showToast('Welcome to TalkZen-AI', 'success');
    } else {
        showToast('Please enter a valid Access Key.', 'error');
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info'}"></i>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function createNewChat() {
    currentChatId = Date.now().toString();
    chatContainer.innerHTML = `
        <div class="welcome-screen">
            <div class="welcome-icon"><i data-lucide="bot" size="48"></i></div>
            <h2>How can I help you today, Admin?</h2>
            <div class="suggestion-grid">
                <button class="suggestion-card" onclick="setInputValue('Write a JavaScript function to sort an array')"><span>Code a JS function</span></button>
                <button class="suggestion-card" onclick="setInputValue('Translate this to Telugu: How are you today?')"><span>Telugu Translation</span></button>
                <button class="suggestion-card" onclick="setInputValue('Draft a business proposal for a new AI startup')"><span>Draft a Proposal</span></button>
                <button class="suggestion-card" onclick="setInputValue('Explain how deep learning works in simple terms')"><span>Deep Learning Basics</span></button>
            </div>
        </div>
    `;
    chatContainer.classList.remove('has-messages');
    lucide.createIcons();
    sidebar.classList.remove('open');
}

function setInputValue(text) {
    userInput.value = text;
    userInput.dispatchEvent(new Event('input'));
    userInput.focus();
}

function stopGenerating() {
    if (abortController) {
        abortController.abort();
        isGenerating = false;
        sendBtn.disabled = userInput.value.trim() === '';
        stopBtn.style.display = 'none';
    }
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isGenerating) return;

    if (!GEMINI_API_KEY) {
        toggleSettingsModal(true);
        showToast('Please configure your API Key first.', 'error');
        return;
    }

    if (!getActiveChat() || currentChatId === null) {
        currentChatId = Date.now().toString();
        chats.unshift({ id: currentChatId, title: text.substring(0, 30), messages: [] });
    } else if (getActiveChat().messages.length === 0) {
        getActiveChat().title = text.substring(0, 30);
    }

    isGenerating = true;
    sendBtn.disabled = true;
    stopBtn.style.display = 'flex';
    abortController = new AbortController();

    // UI Updates
    const welcomeScreen = document.querySelector('.welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.remove();
        chatContainer.classList.add('has-messages');
    }

    addMessageToUI(text, true);
    userInput.value = '';
    userInput.style.height = 'auto';
    scrollToBottom();

    const loadingMsg = addMessageToUI('', false, true);
    scrollToBottom();

    try {
        const responseText = await getGeminiResponse(text, getActiveChat().messages);
        loadingMsg.remove();

        const aiMsg = addMessageToUI('', false);
        const textElement = aiMsg.querySelector('.text-content');
        textElement.classList.add('streaming-text');

        // Save to state
        getActiveChat().messages.push({ role: 'user', content: text });
        getActiveChat().messages.push({ role: 'ai', content: responseText });
        updateStorage();

        // Streaming effect
        await streamText(textElement, responseText);
        textElement.classList.remove('streaming-text');

        renderHistory();
    } catch (error) {
        console.error(error);
        if (loadingMsg) loadingMsg.remove();

        let errorMessage = 'Error: ' + error.message;
        if (error.message.includes('quota') || error.message.includes('429')) {
            errorMessage = `
                <div class="error-tip">
                    <strong><i data-lucide="alert-triangle"></i> Quota Exceeded</strong>
                    <p>It looks like you've reached the free tier limits of the Gemini API.</p>
                    <ul>
                        <li>Wait 1-2 minutes and try again.</li>
                        <li>Check your usage at <a href="https://aistudio.google.com/" target="_blank">Google AI Studio</a>.</li>
                        <li>Consider switching to a pay-as-you-go plan if you need more volume.</li>
                    </ul>
                </div>
            `;
        }
        addMessageToUI(errorMessage, false);
    } finally {
        isGenerating = false;
        sendBtn.disabled = userInput.value.trim() === '';
        stopBtn.style.display = 'none';
        scrollToBottom();
    }
}

function addMessageToUI(text, isUser, isLoading = false) {
    const row = document.createElement('div');
    row.className = `message-row ${isUser ? 'user' : 'ai'}`;
    row.innerHTML = `
        <div class="message-content">
            <div class="avatar ${isUser ? 'user' : 'ai'}"><i data-lucide="${isUser ? 'user' : 'bot'}" size="18"></i></div>
            <div class="text-content">${isLoading ? '<div class="typing-indicator"><span></span><span></span><span></span></div>' : (text.startsWith('<div') ? text : formatText(text))}</div>
        </div>
    `;
    chatContainer.appendChild(row);
    lucide.createIcons();
    attachCodeCopy();
    return row;
}

function attachCodeCopy() {
    document.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-header')) return;

        const header = document.createElement('div');
        header.className = 'code-header';
        const lang = pre.querySelector('code').className.replace('language-', '') || 'code';
        header.innerHTML = `
            <span>${lang}</span>
            <button class="copy-code-btn" onclick="copyCode(this)">
                <i data-lucide="copy" size="14"></i>
                <span>Copy</span>
            </button>
        `;
        pre.insertBefore(header, pre.firstChild);
    });
    lucide.createIcons();
}

function copyCode(btn) {
    const code = btn.closest('pre').querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        const span = btn.querySelector('span');
        const icon = btn.querySelector('i');
        span.innerText = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            span.innerText = 'Copy';
            btn.classList.remove('copied');
        }, 2000);
    });
}

async function streamText(element, text) {
    let currentIdx = 0;
    const words = text.split(' ');
    return new Promise(resolve => {
        const interval = setInterval(() => {
            if (!isGenerating) {
                clearInterval(interval);
                resolve();
                return;
            }
            if (currentIdx < words.length) {
                element.innerHTML = formatText(words.slice(0, currentIdx + 1).join(' '));
                currentIdx++;
                scrollToBottom();
            } else {
                clearInterval(interval);
                resolve();
            }
        }, 30);
    });
}

function formatText(text) {
    if (!text) return '';
    try {
        return marked.parse(text);
    } catch (e) {
        console.error('Marked error:', e);
        return text;
    }
}

async function getGeminiResponse(query, history) {
    const contents = [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        { role: 'model', parts: [{ text: "Understood. I am TalkZen-AI, ready to assist." }] },
        ...history,
        { role: 'user', parts: [{ text: query }] }
    ];

    const response = await fetch(getApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
        signal: abortController.signal
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'API Error');
    }
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

function renderHistory() {
    historyList.innerHTML = chats.map(chat => `
        <div class="history-item ${chat.id === currentChatId ? 'active' : ''}" onclick="loadChat('${chat.id}')">
            <i data-lucide="message-square" size="14"></i>
            <span>${chat.title}</span>
            <button class="delete-chat-btn" onclick="deleteChat(event, '${chat.id}')">
                <i data-lucide="x" size="14"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}

function loadChat(id) {
    currentChatId = id;
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    chatContainer.innerHTML = '';
    chatContainer.classList.add('has-messages');
    chat.messages.forEach(m => addMessageToUI(m.content, m.role === 'user'));
    renderHistory();
    scrollToBottom();
    sidebar.classList.remove('open');
}

function deleteChat(e, id) {
    e.stopPropagation();
    if (confirm('Delete this chat?')) {
        chats = chats.filter(c => c.id !== id);
        updateStorage();
        if (currentChatId === id) {
            if (chats.length > 0) loadChat(chats[0].id);
            else createNewChat();
        } else {
            renderHistory();
        }
    }
}

function clearAllChats() {
    if (confirm('Delete all chats?')) {
        chats = [];
        updateStorage();
        createNewChat();
        renderHistory();
    }
}

function getActiveChat() {
    return chats.find(c => c.id === currentChatId);
}

function updateStorage() {
    localStorage.setItem('talkzen_chats', JSON.stringify(chats));
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

