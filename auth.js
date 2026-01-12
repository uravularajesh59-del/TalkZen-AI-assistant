// Authentication Logic

const ADMIN_EMAIL = 'admin@talkzen.com';
const ADMIN_PASSWORD = 'admin';

export function checkAuth() {
    const user = JSON.parse(localStorage.getItem('talkzen_user'));
    return user;
}

export function login(email, password) {
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        const user = {
            type: 'admin',
            name: 'Admin User',
            email: email,
            loginTime: Date.now()
        };
        localStorage.setItem('talkzen_user', JSON.stringify(user));
        return { success: true, user };
    }
    return { success: false, message: 'Invalid credentials' };
}

export function loginAsGuest() {
    const user = {
        type: 'guest',
        name: 'Guest User',
        loginTime: Date.now()
    };
    localStorage.setItem('talkzen_user', JSON.stringify(user));
    return user;
}

export function logout() {
    localStorage.removeItem('talkzen_user');
    window.location.reload();
}
