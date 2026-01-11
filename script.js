// Initialize Lucide icons
lucide.createIcons();

const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const sidebar = document.querySelector('.sidebar');

// Auto-resize textarea
userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    
    // Enable/disable send button
    sendBtn.disabled = this.value.trim() === '';
});

// Send message on Enter keys (but allow Shift+Enter)
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
});

function setInputValue(text) {
    userInput.value = text;
    userInput.dispatchEvent(new Event('input'));
    userInput.focus();
}

function createMessageElement(text, isUser) {
    const messageRow = document.createElement('div');
    messageRow.className = `message-row ${isUser ? 'user' : 'ai'}`;
    
    const avatarIcon = isUser ? 'user' : 'bot';
    
    messageRow.innerHTML = `
        <div class="message-content">
            <div class="avatar ${isUser ? 'user' : 'ai'}">
                <i data-lucide="${avatarIcon}" size="18"></i>
            </div>
            <div class="text-content">
                ${text}
            </div>
        </div>
    `;
    
    return messageRow;
}

function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // Clear welcome screen on first message
    const welcomeScreen = document.querySelector('.welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.remove();
        chatContainer.classList.add('has-messages');
    }

    // Add user message
    const userMsg = createMessageElement(text, true);
    chatContainer.appendChild(userMsg);
    
    // Clear input
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;
    
    // Scroll to bottom
    scrollToBottom();
    
    // Refresh icons
    lucide.createIcons();

    // Mock AI Response
    setTimeout(() => {
        const aiResponse = getMockResponse(text);
        const aiMsg = createMessageElement(aiResponse, false);
        chatContainer.appendChild(aiMsg);
        scrollToBottom();
        lucide.createIcons();
    }, 1000);
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function getMockResponse(query) {
    const responses = [
        "That's an interesting question! As TalkZen-AI, I'm here to help you explore that further.",
        "I'm processing your request. Here's a brief summary of what I found...",
        "TalkZen-AI is designed to be your serene companion in problem-solving. How else can I assist?",
        "I understand. Let me help you with that right away.",
        "That sounds like a great project! I'd be happy to collaborate with you on it."
    ];
    
    // Simple keyword matching for better mock feel
    if (query.toLowerCase().includes('hello') || query.toLowerCase().includes('hi')) {
        return "Hello! I'm TalkZen-AI Assistant. How can I help you today?";
    }
    
    return responses[Math.floor(Math.random() * responses.length)];
}

function createNewChat() {
    window.location.reload();
}
