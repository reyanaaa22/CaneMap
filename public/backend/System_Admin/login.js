

// Import Firebase configuration and auth/db instances
import { auth, db } from '../Common/firebase-config.js';
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    getDocs, 
    orderBy, 
    limit,
    serverTimestamp,
    doc,
    updateDoc,
    getDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// Security Configuration
const SECURITY_CONFIG = {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes in milliseconds
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes in milliseconds
    ADMIN_ROLES: ['super_admin', 'system_admin', 'security_admin'],
    REQUIRED_PERMISSIONS: ['admin_access', 'system_management', 'user_management']
};

// Global Variables
let loginAttempts = 0;
let isLockedOut = false;
let lockoutEndTime = null;
let currentSession = null;
let sessionTimeout = null;

// Utility Functions
class SecurityLogger {
    static async logEvent(eventType, details) {
        try {
            const logEntry = {
                timestamp: serverTimestamp(),
                eventType: eventType,
                details: details,
                userAgent: navigator.userAgent,
                ipAddress: await this.getClientIP(),
                sessionId: currentSession?.id || 'anonymous'
            };
            
            await addDoc(collection(db, 'admin_security_logs'), logEntry);
            console.log(`Security Event Logged: ${eventType}`, details);
        } catch (error) {
            console.error('Failed to log security event:', error);
            // Fallback: log to console if Firebase fails
            console.log('Security Event (Fallback):', eventType, details);
        }
    }
    
    static async getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'unknown';
        }
    }
    
    static async checkFailedAttempts(pinCode) {
        try {
            const q = query(
                collection(db, 'admin_security_logs'),
                where('details.pinCode', '==', pinCode),
                where('eventType', '==', 'failed_login'),
                orderBy('timestamp', 'desc'),
                limit(SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS)
            );
            
            const querySnapshot = await getDocs(q);
            return querySnapshot.size;
        } catch (error) {
            console.error('Error checking failed attempts:', error);
            return 0;
        }
    }
    
    static async isAccountLocked(pinCode) {
        try {
            const q = query(
                collection(db, 'admin_security_logs'),
                where('details.pinCode', '==', pinCode),
                where('eventType', '==', 'account_locked'),
                orderBy('timestamp', 'desc'),
                limit(1)
            );
            
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) return false;
            
            const lockEntry = querySnapshot.docs[0].data();
            const lockTime = lockEntry.timestamp.toDate();
            const now = new Date();
            
            return (now - lockTime) < SECURITY_CONFIG.LOCKOUT_DURATION;
        } catch (error) {
            console.error('Error checking account lock:', error);
            return false;
        }
    }
}

class SessionManager {
    static createSession(user) {
        const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        currentSession = {
            id: sessionId,
            userId: user.uid,
            email: user.email,
            startTime: new Date(),
            lastActivity: new Date(),
            isActive: true
        };
        
        // Store session in localStorage
        localStorage.setItem('admin_session', JSON.stringify(currentSession));
        
        // Set session timeout
        this.resetSessionTimeout();
        
        return currentSession;
    }
    
    static resetSessionTimeout() {
        if (sessionTimeout) {
            clearTimeout(sessionTimeout);
        }
        
        sessionTimeout = setTimeout(() => {
            this.endSession('timeout');
        }, SECURITY_CONFIG.SESSION_TIMEOUT);
    }
    
    static updateActivity() {
        if (currentSession) {
            currentSession.lastActivity = new Date();
            localStorage.setItem('admin_session', JSON.stringify(currentSession));
            this.resetSessionTimeout();
        }
    }
    
    static async endSession(reason = 'logout') {
        if (currentSession) {
            await SecurityLogger.logEvent('session_ended', {
                sessionId: currentSession.id,
                reason: reason,
                duration: new Date() - currentSession.startTime
            });
            
            currentSession = null;
            localStorage.removeItem('admin_session');
        }
        
        if (sessionTimeout) {
            clearTimeout(sessionTimeout);
            sessionTimeout = null;
        }
    }
    
    static loadSession() {
        try {
            const sessionData = localStorage.getItem('admin_session');
            if (sessionData) {
                const session = JSON.parse(sessionData);
                const now = new Date();
                const sessionAge = now - new Date(session.startTime);
                
                if (sessionAge < SECURITY_CONFIG.SESSION_TIMEOUT) {
                    currentSession = session;
                    this.resetSessionTimeout();
                    return true;
                } else {
                    localStorage.removeItem('admin_session');
                }
            }
        } catch (error) {
            console.error('Error loading session:', error);
            localStorage.removeItem('admin_session');
        }
        return false;
    }
}

class AdminAuth {
    static async authenticateAdmin(pinCode) {
        try {
            // Check if account is locked
            const isLocked = await SecurityLogger.isAccountLocked(pinCode);
            if (isLocked) {
                await SecurityLogger.logEvent('login_attempt_blocked', {
                    pinCode: pinCode,
                    reason: 'account_locked'
                });
                throw new Error('Account is temporarily locked due to multiple failed attempts. Please try again later.');
            }
            
            // Check failed attempts
            const failedAttempts = await SecurityLogger.checkFailedAttempts(pinCode);
            if (failedAttempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
                await SecurityLogger.logEvent('account_locked', {
                    pinCode: pinCode,
                    failedAttempts: failedAttempts
                });
                throw new Error('Account locked due to too many failed attempts. Please contact system administrator.');
            }
            
            // Validate PIN code
            if (!pinCode || pinCode.length !== 6 || !/^\d{6}$/.test(pinCode)) {
                await SecurityLogger.logEvent('failed_login', {
                    pinCode: pinCode,
                    reason: 'invalid_pin_format'
                });
                throw new Error('Please enter a valid 6-digit PIN code');
            }
            
            // Get admin credentials by PIN
            const adminCredentials = await this.getAdminCredentials(pinCode);
            if (!adminCredentials) {
                await SecurityLogger.logEvent('failed_login', {
                    pinCode: pinCode,
                    reason: 'invalid_pin'
                });
                throw new Error('Invalid PIN code');
            }
            
            // Successful authentication
            await SecurityLogger.logEvent('successful_login', {
                pinCode: pinCode,
                role: adminCredentials.role,
                permissions: adminCredentials.permissions,
                adminName: adminCredentials.name
            });
            
            return {
                success: true,
                user: {
                    uid: adminCredentials.uid,
                    email: adminCredentials.email,
                    name: adminCredentials.name,
                    role: adminCredentials.role,
                    permissions: adminCredentials.permissions
                }
            };
            
        } catch (error) {
            console.error('Authentication error:', error);
            throw error;
        }
    }
    
    static async getAdminCredentials(pinCode) {
        // In production, this would fetch from a secure database
        // For demo purposes, using hardcoded admin PIN codes
        const adminPins = {
            '123456': {
                uid: 'admin_001',
                email: 'admin@canemap.com',
                pin: '123456',
                role: 'super_admin',
                permissions: ['admin_access', 'system_management', 'user_management', 'security_management'],
                name: 'System Administrator'
            },
            '654321': {
                uid: 'admin_002',
                email: 'security@canemap.com',
                pin: '654321',
                role: 'security_admin',
                permissions: ['admin_access', 'security_management'],
                name: 'Security Administrator'
            },
            '789012': {
                uid: 'admin_003',
                email: 'system@canemap.com',
                pin: '789012',
                role: 'system_admin',
                permissions: ['admin_access', 'system_management'],
                name: 'System Manager'
            },
            '000000': {
                uid: 'admin_demo',
                email: 'demo@canemap.com',
                pin: '000000',
                role: 'demo_admin',
                permissions: ['admin_access', 'demo_mode'],
                name: 'Demo Administrator'
            }
        };
        
        return adminPins[pinCode] || null;
    }
    
    static async logout() {
        try {
            await SessionManager.endSession('manual_logout');
            await SecurityLogger.logEvent('logout', {
                sessionId: currentSession?.id
            });
            
            // Clear any cached data
            localStorage.removeItem('admin_session');
            sessionStorage.clear();
            
            // Redirect to login page
            window.location.href = '../System_Admin/login.html';
            
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
}

// UI Management
class LoginUI {
    static showLoading() {
        const loginBtn = document.getElementById('loginBtn');
        const loginBtnText = document.getElementById('loginBtnText');
        const loginSpinner = document.getElementById('loginSpinner');
        const loadingOverlay = document.getElementById('loadingOverlay');
        
        loginBtn.disabled = true;
        loginBtnText.classList.add('hidden');
        loginSpinner.classList.remove('hidden');
        loadingOverlay.classList.remove('hidden');
    }
    
    static hideLoading() {
        const loginBtn = document.getElementById('loginBtn');
        const loginBtnText = document.getElementById('loginBtnText');
        const loginSpinner = document.getElementById('loginSpinner');
        const loadingOverlay = document.getElementById('loadingOverlay');
        
        loginBtn.disabled = false;
        loginBtnText.classList.remove('hidden');
        loginSpinner.classList.add('hidden');
        loadingOverlay.classList.add('hidden');
    }
    
    static showError(message) {
        const form = document.getElementById('adminLoginForm');
        form.classList.add('shake');
        setTimeout(() => form.classList.remove('shake'), 500);
        
        showAlert(message, 'error');
    }
    
    static showSuccess(message) {
        showAlert(message, 'success');
    }
    
    static clearForm() {
        document.getElementById('adminLoginForm').reset();
        document.getElementById('pinCode').focus();
    }
    
    static updateSecurityStatus(status) {
        const statusElement = document.querySelector('.text-green-400');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }
}

// Main Login Handler
async function handleLogin(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const pinCode = formData.get('pinCode').trim();
    
    // Validate input
    if (!pinCode || pinCode.length !== 6) {
        LoginUI.showError('Please enter a valid 6-digit PIN code');
        return;
    }
    
    LoginUI.showLoading();
    LoginUI.updateSecurityStatus('Authenticating...');
    
    try {
        // Authenticate admin
        const authResult = await AdminAuth.authenticateAdmin(pinCode);
        
        if (authResult.success) {
            // Create session
            const session = SessionManager.createSession(authResult.user);
            
            // Log successful login
            await SecurityLogger.logEvent('admin_session_started', {
                pinCode: pinCode,
                role: authResult.user.role,
                sessionId: session.id,
                adminName: authResult.user.name
            });
            
            LoginUI.showSuccess('Authentication successful! Redirecting...');
            LoginUI.updateSecurityStatus('Authenticated');
            
            // Store user data
            sessionStorage.setItem('admin_user', JSON.stringify(authResult.user));
            
            // Redirect to admin dashboard
            setTimeout(() => {
                window.location.href = '../System_Admin/dashboard.html';
            }, 1500);
            
        } else {
            throw new Error('Authentication failed');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        LoginUI.showError(error.message || 'Authentication failed. Please try again.');
        LoginUI.updateSecurityStatus('Authentication Failed');
        
        // Clear form on error
        setTimeout(() => {
            LoginUI.clearForm();
        }, 2000);
        
    } finally {
        LoginUI.hideLoading();
    }
}

// Session Management
function initializeSession() {
    // Load existing session
    if (SessionManager.loadSession()) {
        // Check if user is already logged in
        const adminUser = sessionStorage.getItem('admin_user');
        if (adminUser) {
            // Redirect to dashboard
            window.location.href = '../System_Admin/dashboard.html';
            return;
        }
    }
    
    // Set up activity tracking
    document.addEventListener('click', SessionManager.updateActivity);
    document.addEventListener('keypress', SessionManager.updateActivity);
    document.addEventListener('scroll', SessionManager.updateActivity);
}

// Security Monitoring
function initializeSecurityMonitoring() {
    // Monitor for suspicious activity
    let activityCount = 0;
    const activityThreshold = 100; // Rapid clicks/keystrokes
    
    document.addEventListener('click', () => {
        activityCount++;
        if (activityCount > activityThreshold) {
            SecurityLogger.logEvent('suspicious_activity', {
                type: 'rapid_activity',
                count: activityCount
            });
        }
    });
    
    // Reset activity count every minute
    setInterval(() => {
        activityCount = 0;
    }, 60000);
    
    // Monitor for multiple tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'admin_session' && e.newValue) {
            SecurityLogger.logEvent('multiple_tabs_detected', {
                sessionId: currentSession?.id
            });
        }
    });
}

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    // Initialize session management
    initializeSession();
    
    // Initialize security monitoring
    initializeSecurityMonitoring();
    
    // Set up form submission
    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Set up keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl+Shift+L for logout (if logged in)
        if (e.ctrlKey && e.shiftKey && e.key === 'L') {
            e.preventDefault();
            AdminAuth.logout();
        }
        
        // Escape to clear form
        if (e.key === 'Escape') {
            LoginUI.clearForm();
        }
    });
    
    // Log page access
    SecurityLogger.logEvent('admin_login_page_accessed', {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
    });
    
    console.log('System Admin Login initialized');
});

// Export functions for global access
window.AdminAuth = AdminAuth;
window.SecurityLogger = SecurityLogger;
window.SessionManager = SessionManager;
