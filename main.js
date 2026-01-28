import { API_KEY } from './config.js';
import { checkAuth, login, loginAsGuest, logout } from './auth.js';

// Configuration
let GEMINI_API_KEY = API_KEY || localStorage.getItem('talkzen_api_key');
let currentModel = localStorage.getItem('talkzen_model') || 'gemini-2.5-flash-latest';
const getApiUrl = () => `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${GEMINI_API_KEY}`;

// System Prompt
const SYSTEM_PROMPT = "You are TalkZen-AI, a serene, professional, and highly capable AI Assistant. You are currently assisting your 'Admin' (the user). You can perform multiple tasks including coding, writing, reasoning, and multi-language translation. Your tone is helpful and efficient.";

// State Management
let chats = JSON.parse(localStorage.getItem('talkzen_chats')) || [];
let currentChatId = null;
let isGenerating = false;
let abortController = null;
let currentUser = null;
let attachments = []; // For file uploads
let isRecording = false; // For voice input
let recognition = null; // Speech recognition instance

// Guest Limits
const GUEST_MSG_LIMIT = 5;
let guestMsgCount = parseInt(localStorage.getItem('talkzen_guest_count') || '0');

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
const toastContainer = document.getElementById('toast-container');
const splashScreen = document.getElementById('splash-screen');
const appContainer = document.getElementById('app-container');
const loginModal = document.getElementById('login-modal');
const modelSelector = document.getElementById('model-selector');
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const voiceBtn = document.getElementById('voice-btn');
const attachmentPreview = document.getElementById('attachment-preview');
const dragOverlay = document.getElementById('drag-overlay');
const themeToggle = document.getElementById('theme-toggle');

// Initialization
lucide.createIcons();

// --- Auth Functions ---
function showLoginModal() {
    loginModal.classList.add('active');
}

function hideLoginModal() {
    loginModal.classList.remove('active');
}

function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const result = login(email, password);
    if (result.success) {
        currentUser = result.user;
        showToast(`Welcome back, ${currentUser.name}`, 'success');
        hideLoginModal();
        showApp();
    } else {
        showToast(result.message, 'error');
    }
}

function handleGuestAccess() {
    currentUser = loginAsGuest();
    showToast('Entered as Guest', 'info');
    showApp();
}

function handleLogout() {
    logout();
}

// --- App Functions ---
function showApp() {
    splashScreen.style.display = 'none';
    appContainer.style.display = 'flex';
    updateProfileUI();
    renderHistory();

    // Initialize new features
    modelSelector.value = currentModel;
    initTheme();
    initVoiceRecognition();
    initDragAndDrop();

    if (chats.length > 0) {
        loadChat(chats[0].id);
    } else {
        createNewChat();
    }
}

function updateProfileUI() {
    const avatar = document.getElementById('user-avatar');
    const name = document.getElementById('user-name');
    const status = document.getElementById('user-status');

    // Ensure logout button area is clickable and visible for everyone
    const profileDiv = document.querySelector('.admin-profile');
    if (profileDiv) {
        profileDiv.style.cursor = 'pointer';
        profileDiv.title = "Click to Log Out / Go Back";
    }

    if (currentUser) {
        name.innerText = currentUser.name;
        if (currentUser.type === 'admin') {
            avatar.innerText = 'A';
            status.innerText = 'Pro Account';
            status.style.color = '#4cd964';
        } else {
            avatar.innerText = 'G';
            status.innerText = 'Guest Mode (Click to Exit)';
            status.style.color = '#a0a0a0';
        }
    }
}

// --- Chat Functions ---
function createNewChat() {
    currentChatId = Date.now().toString();
    chatContainer.innerHTML = `
        <div class="welcome-screen">
            <div class="welcome-icon"><i data-lucide="bot" size="48"></i></div>
            <h2>How can I help you today?</h2>
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

    // UI Updates - Show User Message Immediately
    const welcomeScreen = document.querySelector('.welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.remove();
        chatContainer.classList.add('has-messages');
    }

    addMessageToUI(text, true);
    userInput.value = '';
    userInput.style.height = 'auto';
    scrollToBottom();

    if (!GEMINI_API_KEY) {
        // Auto-detect if user is trying to paste the key
        if (text.trim().startsWith('AIza')) {
            const key = text.trim();
            localStorage.setItem('talkzen_api_key', key);
            GEMINI_API_KEY = key;
            addMessageToUI("🔑 **API Key Detected!**\n\nSaving your key and reloading...", false);
            setTimeout(() => window.location.reload(), 2000);
            return;
        }

        // Show error as a simulated AI message
        setTimeout(() => {
            const errorMsg = "⚠️ **System Error:** API Key is missing.\n\n**To fix this immediately:**\n1. Copy your Google Gemini API Key.\n2. **PASTE IT HERE** in this chat.\n\nI will automatically save it for you.";
            addMessageToUI(errorMsg, false);
            scrollToBottom();
        }, 500);
        return;
    }

    if (currentUser.type === 'guest') {
        if (guestMsgCount >= GUEST_MSG_LIMIT) {
            setTimeout(() => {
                addMessageToUI("🔒 **Guest Limit Reached**\n\nPlease login to continue chatting.", false);
                showLoginModal();
                scrollToBottom();
            }, 500);
            return;
        }
        guestMsgCount++;
        localStorage.setItem('talkzen_guest_count', guestMsgCount);
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
        // DEBUG MODE: Showing raw error
        // if (error.message.includes('quota') || error.message.includes('429')) {
        //     errorMessage = 'System is currently busy. Please try again later.';
        // }
        errorMessage += '\n\n(Debug: ' + new Date().toLocaleTimeString() + ')';
        addMessageToUI(errorMessage, false);
    } finally {
        isGenerating = false;
        sendBtn.disabled = userInput.value.trim() === '';
        stopBtn.style.display = 'none';
        scrollToBottom();
    }
}

function loadChat(id) {
    currentChatId = id;
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    chatContainer.innerHTML = '';
    chatContainer.classList.add('has-messages');
    chat.messages.forEach((m, index) => {
        const row = addMessageToUI(m.content, m.role === 'user');
        // Update rating buttons if message has rating
        if (m.rating) {
            const likeBtn = row.querySelector('[title="Like"]');
            const dislikeBtn = row.querySelector('[title="Dislike"]');
            if (likeBtn) likeBtn.classList.toggle('liked', m.rating === 'like');
            if (dislikeBtn) dislikeBtn.classList.toggle('disliked', m.rating === 'dislike');
        }
    });
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

// --- Helper Functions ---
function getActiveChat() {
    return chats.find(c => c.id === currentChatId);
}

function updateStorage() {
    localStorage.setItem('talkzen_chats', JSON.stringify(chats));
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
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

    // Add message actions if not loading
    if (!isLoading && getActiveChat()) {
        const messageIndex = chatContainer.children.length - 1;
        addMessageActions(row, isUser, messageIndex);
    }

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
    const interval = setInterval(() => {
        if (!isGenerating) {
            clearInterval(interval);
            return;
        }
        if (currentIdx < words.length) {
            element.innerHTML = formatText(words.slice(0, currentIdx + 1).join(' '));
            currentIdx++;
            scrollToBottom();
        } else {
            clearInterval(interval);
        }
    }, 30);
    return new Promise(resolve => {
        const checkInterval = setInterval(() => {
            if (currentIdx >= words.length || !isGenerating) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
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
    // ... same logic ...
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

function checkAuthInit() {
    currentUser = checkAuth();
    if (currentUser) {
        showApp();
    }
}

// ============================================
// NEW CHATGPT-LIKE FEATURES
// ============================================

// Model Selection
function switchModel() {
    currentModel = modelSelector.value;
    localStorage.setItem('talkzen_model', currentModel);
    showToast(`Switched to ${modelSelector.options[modelSelector.selectedIndex].text}`, 'success');
}

// File Upload Handling
function handleFileUpload(files) {
    Array.from(files).forEach(file => {
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            showToast('File too large. Max 10MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const attachment = {
                name: file.name,
                size: formatFileSize(file.size),
                type: file.type,
                data: e.target.result
            };
            attachments.push(attachment);
            renderAttachments();
        };
        reader.readAsDataURL(file);
    });
}

function renderAttachments() {
    if (attachments.length === 0) {
        attachmentPreview.style.display = 'none';
        return;
    }

    attachmentPreview.style.display = 'flex';
    attachmentPreview.innerHTML = attachments.map((att, index) => `
        <div class="attachment-card">
            <div class="attachment-thumbnail">
                ${att.type.startsWith('image/') ? `<img src="${att.data}" alt="${att.name}">` : `<i data-lucide="file-text"></i>`}
            </div>
            <div class="attachment-info">
                <div class="attachment-name">${att.name}</div>
                <div class="attachment-size">${att.size}</div>
            </div>
            <div class="remove-attachment" onclick="removeAttachment(${index})">
                <i data-lucide="x" size="12"></i>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function removeAttachment(index) {
    attachments.splice(index, 1);
    renderAttachments();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Voice Input
function initVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
            userInput.dispatchEvent(new Event('input'));
            stopVoiceRecording();
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            showToast('Voice input failed', 'error');
            stopVoiceRecording();
        };

        recognition.onend = () => {
            stopVoiceRecording();
        };
    }
}

function startVoiceRecording() {
    if (!recognition) {
        showToast('Voice input not supported in this browser', 'error');
        return;
    }

    isRecording = true;
    voiceBtn.classList.add('voice-recording');
    recognition.start();
    showToast('Listening...', 'info');
}

function stopVoiceRecording() {
    if (recognition && isRecording) {
        isRecording = false;
        voiceBtn.classList.remove('voice-recording');
        recognition.stop();
    }
}

function toggleVoiceInput() {
    if (isRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

// Drag and Drop
function initDragAndDrop() {
    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) {
            dragOverlay.classList.add('active');
        }
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            dragOverlay.classList.remove('active');
        }
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dragOverlay.classList.remove('active');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files);
        }
    });
}

// Message Actions
function addMessageActions(messageRow, isUser, messageIndex) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    if (isUser) {
        actions.innerHTML = `
            <button class="action-btn" onclick="copyMessage(${messageIndex})" title="Copy">
                <i data-lucide="copy" size="14"></i>
            </button>
            <button class="action-btn" onclick="editMessage(${messageIndex})" title="Edit">
                <i data-lucide="edit-2" size="14"></i>
            </button>
        `;
    } else {
        actions.innerHTML = `
            <button class="action-btn" onclick="copyMessage(${messageIndex})" title="Copy">
                <i data-lucide="copy" size="14"></i>
            </button>
            <button class="action-btn" onclick="regenerateResponse(${messageIndex})" title="Regenerate">
                <i data-lucide="refresh-cw" size="14"></i>
            </button>
            <button class="action-btn" onclick="rateMessage(${messageIndex}, 'like')" title="Like">
                <i data-lucide="thumbs-up" size="14"></i>
            </button>
            <button class="action-btn" onclick="rateMessage(${messageIndex}, 'dislike')" title="Dislike">
                <i data-lucide="thumbs-down" size="14"></i>
            </button>
        `;
    }

    messageRow.querySelector('.message-content').appendChild(actions);
    lucide.createIcons();
}

function copyMessage(index) {
    const chat = getActiveChat();
    if (!chat || !chat.messages[index]) return;

    const text = chat.messages[index].content;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
    });
}

function editMessage(index) {
    const chat = getActiveChat();
    if (!chat || !chat.messages[index]) return;

    const messageRow = chatContainer.children[index];
    const textContent = messageRow.querySelector('.text-content');
    const originalText = chat.messages[index].content;

    textContent.innerHTML = `
        <textarea class="edit-input">${originalText}</textarea>
        <div class="edit-actions">
            <button class="edit-cancel-btn" onclick="cancelEdit(${index})">Cancel</button>
            <button class="edit-save-btn" onclick="saveEdit(${index})">Save & Regenerate</button>
        </div>
    `;
    messageRow.classList.add('message-editing');
}

function cancelEdit(index) {
    const chat = getActiveChat();
    if (!chat) return;

    const messageRow = chatContainer.children[index];
    const textContent = messageRow.querySelector('.text-content');
    textContent.innerHTML = formatText(chat.messages[index].content);
    messageRow.classList.remove('message-editing');
    attachCodeCopy();
}

function saveEdit(index) {
    const chat = getActiveChat();
    if (!chat) return;

    const messageRow = chatContainer.children[index];
    const newText = messageRow.querySelector('.edit-input').value.trim();

    if (!newText) return;

    // Update message
    chat.messages[index].content = newText;

    // Remove all messages after this one
    chat.messages = chat.messages.slice(0, index + 1);
    updateStorage();

    // Reload chat and regenerate
    loadChat(chat.id);

    // Trigger new response
    setTimeout(() => {
        sendMessage(newText, true);
    }, 100);
}

function regenerateResponse(index) {
    const chat = getActiveChat();
    if (!chat || index < 1) return;

    // Find the user message before this AI response
    const userMessageIndex = index - 1;
    const userMessage = chat.messages[userMessageIndex];

    if (!userMessage || userMessage.role !== 'user') return;

    // Remove this AI response and all after
    chat.messages = chat.messages.slice(0, index);
    updateStorage();

    // Reload and regenerate
    loadChat(chat.id);
    setTimeout(() => {
        sendMessage(userMessage.content, true);
    }, 100);
}

function rateMessage(index, rating) {
    const chat = getActiveChat();
    if (!chat || !chat.messages[index]) return;

    // Store rating
    if (!chat.messages[index].rating) {
        chat.messages[index].rating = rating;
    } else if (chat.messages[index].rating === rating) {
        delete chat.messages[index].rating;
    } else {
        chat.messages[index].rating = rating;
    }

    updateStorage();

    // Update UI
    const messageRow = chatContainer.children[index];
    const likeBtn = messageRow.querySelector('[title="Like"]');
    const dislikeBtn = messageRow.querySelector('[title="Dislike"]');

    if (likeBtn) likeBtn.classList.toggle('liked', chat.messages[index].rating === 'like');
    if (dislikeBtn) dislikeBtn.classList.toggle('disliked', chat.messages[index].rating === 'dislike');

    showToast('Feedback recorded', 'success');
}

// Theme Toggle
function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('talkzen_theme', isLight ? 'light' : 'dark');

    const icon = themeToggle.querySelector('i');
    icon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
    lucide.createIcons();
}

function initTheme() {
    const savedTheme = localStorage.getItem('talkzen_theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        const icon = themeToggle.querySelector('i');
        icon.setAttribute('data-lucide', 'moon');
        lucide.createIcons();
    }
}

// Enhanced Send Message with Multimodal Support
async function sendMessageWithAttachments(text, isRegenerate = false) {
    if (!text && attachments.length === 0) return;
    if (isGenerating && !isRegenerate) return;

    // Build message content
    const messageText = text || userInput.value.trim();

    // UI Updates
    if (!isRegenerate) {
        const welcomeScreen = document.querySelector('.welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.remove();
            chatContainer.classList.add('has-messages');
        }

        addMessageToUI(messageText, true);
        userInput.value = '';
        userInput.style.height = 'auto';

        // Clear attachments after sending
        attachments = [];
        renderAttachments();
    }

    scrollToBottom();

    // API Key check
    if (!GEMINI_API_KEY) {
        if (messageText.trim().startsWith('AIza')) {
            const key = messageText.trim();
            localStorage.setItem('talkzen_api_key', key);
            GEMINI_API_KEY = key;
            addMessageToUI("🔑 **API Key Detected!**\n\nSaving your key and reloading...", false);
            setTimeout(() => window.location.reload(), 2000);
            return;
        }

        setTimeout(() => {
            const errorMsg = "⚠️ **System Error:** API Key is missing.\n\n**To fix this immediately:**\n1. Copy your Google Gemini API Key.\n2. **PASTE IT HERE** in this chat.\n\nI will automatically save it for you.";
            addMessageToUI(errorMsg, false);
            scrollToBottom();
        }, 500);
        return;
    }

    // Guest limit check
    if (currentUser.type === 'guest') {
        if (guestMsgCount >= GUEST_MSG_LIMIT) {
            setTimeout(() => {
                addMessageToUI("🔒 **Guest Limit Reached**\n\nPlease login to continue chatting.", false);
                showLoginModal();
                scrollToBottom();
            }, 500);
            return;
        }
        guestMsgCount++;
        localStorage.setItem('talkzen_guest_count', guestMsgCount);
    }

    // Create or update chat
    if (!getActiveChat() || currentChatId === null) {
        currentChatId = Date.now().toString();
        chats.unshift({ id: currentChatId, title: messageText.substring(0, 30), messages: [] });
    } else if (getActiveChat().messages.length === 0) {
        getActiveChat().title = messageText.substring(0, 30);
    }

    isGenerating = true;
    sendBtn.disabled = true;
    stopBtn.style.display = 'flex';
    abortController = new AbortController();

    const loadingMsg = addMessageToUI('', false, true);
    scrollToBottom();

    try {
        const responseText = await getGeminiResponse(messageText, getActiveChat().messages);
        loadingMsg.remove();

        const aiMsg = addMessageToUI('', false);
        const textElement = aiMsg.querySelector('.text-content');
        textElement.classList.add('streaming-text');

        // Save to state
        getActiveChat().messages.push({ role: 'user', content: messageText });
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
        errorMessage += '\n\n(Debug: ' + new Date().toLocaleTimeString() + ')';
        addMessageToUI(errorMessage, false);
    } finally {
        isGenerating = false;
        sendBtn.disabled = userInput.value.trim() === '';
        stopBtn.style.display = 'none';
        scrollToBottom();
    }
}

// --- Attach to Window (Export) ---
window.showLoginModal = showLoginModal;
window.hideLoginModal = hideLoginModal;
window.handleLogin = handleLogin;
window.handleGuestAccess = handleGuestAccess;
window.handleLogout = handleLogout;
window.createNewChat = createNewChat;
window.setInputValue = setInputValue;
window.stopGenerating = stopGenerating;
window.sendMessage = sendMessage;
window.loadChat = loadChat;
window.deleteChat = deleteChat;
window.clearAllChats = clearAllChats;
window.copyCode = copyCode;

// New ChatGPT-like features
window.removeAttachment = removeAttachment;
window.copyMessage = copyMessage;
window.editMessage = editMessage;
window.cancelEdit = cancelEdit;
window.saveEdit = saveEdit;
window.regenerateResponse = regenerateResponse;
window.rateMessage = rateMessage;

// --- Event Listeners with Local References ---
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

// New feature event listeners
modelSelector.addEventListener('change', switchModel);
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileUpload(e.target.files);
    }
});
voiceBtn.addEventListener('click', toggleVoiceInput);
themeToggle.addEventListener('click', toggleTheme);

// Run Init
checkAuthInit();
