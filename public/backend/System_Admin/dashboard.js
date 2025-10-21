// System Admin Dashboard Management
// Handles user management, activity logging, and system administration

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
    getDoc,
    deleteDoc,
    onSnapshot,
    setDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// Global variables
let currentUser = null;
let users = [];
let activityLogs = [];
let currentPage = 1;
let itemsPerPage = 10;
let filteredUsers = [];

// Initialize dashboard
async function initializeDashboard() {
    try {
        console.log('🔄 Initializing dashboard...');
        // DIAGNOSTIC: Log auth state and attempt to fetch user doc for debugging permission errors
        try {
            console.log('Auth object (auth.currentUser):', auth && auth.currentUser);
            if (auth && auth.currentUser && auth.currentUser.uid) {
                try {
                    const userDocRef = doc(db, 'users', auth.currentUser.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    if (userDocSnap.exists()) {
                        console.log('Firestore user doc for current user:', userDocSnap.data());
                    } else {
                        console.warn('No users/{uid} document found for current auth user.');
                    }
                } catch (err) {
                    console.error('Error reading users/{uid} doc during init:', err);
                    if (err && err.code === 'permission-denied') {
                        showAlert('Permission denied when reading user data. Check Firestore rules and ensure you are signed in with a system_admin account.', 'error');
                    }
                }
            } else {
                console.warn('No authenticated Firebase user found at initialization (auth.currentUser is null).');
            }
        } catch (e) {
            console.warn('Auth diagnostics failed:', e);
        }
        
        // Check if user is logged in
        const adminUser = sessionStorage.getItem('admin_user');
        if (!adminUser) {
            console.log('⚠️ No admin user found, using default values');
            // Set default admin name
            const adminNameEl = document.getElementById('adminName');
            const dropdownAdminNameEl = document.getElementById('dropdownAdminName');
            const sidebarAdminNameEl = document.getElementById('sidebarAdminName');
            
            if (adminNameEl) adminNameEl.textContent = 'System Admin';
            if (dropdownAdminNameEl) dropdownAdminNameEl.textContent = 'System Admin';
            if (sidebarAdminNameEl) sidebarAdminNameEl.textContent = 'System Admin';
        } else {
            currentUser = JSON.parse(adminUser);
            
            // Update admin name in header and sidebar
            const adminNameEl = document.getElementById('adminName');
            const dropdownAdminNameEl = document.getElementById('dropdownAdminName');
            const sidebarAdminNameEl = document.getElementById('sidebarAdminName');
            
            if (adminNameEl) adminNameEl.textContent = currentUser.name;
            if (dropdownAdminNameEl) dropdownAdminNameEl.textContent = currentUser.name;
            if (sidebarAdminNameEl) sidebarAdminNameEl.textContent = currentUser.name;
        }
        
        // Load dashboard data
        await loadDashboardStats();
        await loadUsers();
        await loadActivityLogs();
        
        // Set up real-time listeners
        setupRealtimeListeners();
        
        // Set up event listeners
        setupEventListeners();
        
        console.log('✅ Dashboard initialized successfully');
        
    } catch (error) {
        console.error('❌ Error initializing dashboard:', error);
        // Don't show alert on initialization error, just log it
        console.log('⚠️ Dashboard initialization failed, but continuing...');
    }
}

// Load dashboard statistics
async function loadDashboardStats() {
    try {
        console.log('🔄 Loading dashboard stats...');
        
        // Get total users
        let totalUsers = 0;
        try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            totalUsers = usersSnapshot.size;
            console.log(`📊 Total users: ${totalUsers}`);
        } catch (error) {
            console.log('⚠️ Could not load users collection:', error.message);
        }
        
        // Get active users (logged in within last 30 days)
        let activeUsers = 0;
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const activeUsersQuery = query(
                collection(db, 'users'),
                where('lastLogin', '>=', thirtyDaysAgo)
            );
            const activeUsersSnapshot = await getDocs(activeUsersQuery);
            activeUsers = activeUsersSnapshot.size;
            console.log(`📊 Active users: ${activeUsers}`);
        } catch (error) {
            console.log('⚠️ Could not load active users:', error.message);
        }
        
        // Get failed logins today
        let failedLogins = 0;
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const failedLoginsQuery = query(
                collection(db, 'admin_security_logs'),
                where('eventType', '==', 'failed_login'),
                where('timestamp', '>=', today)
            );
            const failedLoginsSnapshot = await getDocs(failedLoginsQuery);
            failedLogins = failedLoginsSnapshot.size;
            console.log(`📊 Failed logins: ${failedLogins}`);
        } catch (error) {
            console.log('⚠️ Could not load failed logins:', error.message);
        }
        
        // Get driver badges
        let driverBadges = 0;
        try {
            const driverBadgesQuery = query(
                collection(db, 'Drivers_Badge'),
                where('status', '==', 'approved')
            );
            const driverBadgesSnapshot = await getDocs(driverBadgesQuery);
            driverBadges = driverBadgesSnapshot.size;
            console.log(`📊 Driver badges: ${driverBadges}`);
        } catch (error) {
            console.log('⚠️ Could not load driver badges:', error.message);
        }
        
        // Update UI
        const totalUsersEl = document.getElementById('totalUsers');
        const activeUsersEl = document.getElementById('activeUsers');
        const failedLoginsEl = document.getElementById('failedLogins');
        const driverBadgesEl = document.getElementById('driverBadges');
        
        if (totalUsersEl) totalUsersEl.textContent = totalUsers;
        if (activeUsersEl) activeUsersEl.textContent = activeUsers;
        if (failedLoginsEl) failedLoginsEl.textContent = failedLogins;
        if (driverBadgesEl) driverBadgesEl.textContent = driverBadges;
        
        console.log('✅ Dashboard stats loaded successfully');
        
        // Load analytics charts
        await loadAnalyticsCharts();
        
    } catch (error) {
        console.error('❌ Error loading dashboard stats:', error);
        // Set default values if loading fails
        const totalUsersEl = document.getElementById('totalUsers');
        const activeUsersEl = document.getElementById('activeUsers');
        const failedLoginsEl = document.getElementById('failedLogins');
        const driverBadgesEl = document.getElementById('driverBadges');
        
        if (totalUsersEl) totalUsersEl.textContent = '0';
        if (activeUsersEl) activeUsersEl.textContent = '0';
        if (failedLoginsEl) failedLoginsEl.textContent = '0';
        if (driverBadgesEl) driverBadgesEl.textContent = '0';
    }
}

// Load users from Firebase
async function loadUsers() {
    try {
        console.log('🔄 Loading users...');
        
        const usersQuery = query(
            collection(db, 'users'),
            orderBy('createdAt', 'desc')
        );
        
        const querySnapshot = await getDocs(usersQuery);
        users = [];
        
        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            users.push({
                id: doc.id,
                ...userData,
                createdAt: userData.createdAt?.toDate() || new Date(),
                lastLogin: userData.lastLogin?.toDate() || null
            });
        });
        
        filteredUsers = [...users];
        console.log(`📊 Loaded ${users.length} users`);
        
        // Only render table if the users table exists
        const usersTableBody = document.getElementById('usersTableBody');
        if (usersTableBody) {
            renderUsersTable();
        }
        
    } catch (error) {
        console.error('❌ Error loading users:', error);
        // Don't show alert if we're not on the users page
        const usersTableBody = document.getElementById('usersTableBody');
        if (usersTableBody) {
            showAlert('Failed to load users', 'error');
        }
    }
}

// Render users table
function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageUsers = filteredUsers.slice(startIndex, endIndex);
    
    tbody.innerHTML = '';
    
    if (pageUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-users text-4xl mb-4"></i>
                    <p>No users found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    pageUsers.forEach(user => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        
        const statusClass = getStatusClass(user.status);
        const roleClass = getRoleClass(user.role);
        const badgeClass = getBadgeClass(user.driverBadge);
        
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="w-10 h-10 bg-gradient-to-br from-[var(--cane-400)] to-[var(--cane-500)] rounded-full flex items-center justify-center">
                        <i class="fas fa-user text-white text-sm"></i>
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">${user.name || 'N/A'}</div>
                        <div class="text-sm text-gray-500">${user.email || 'N/A'}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${roleClass}">
                    ${user.role || 'N/A'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">
                    ${user.status || 'inactive'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${user.lastLogin ? formatDate(user.lastLogin) : 'Never'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div class="flex items-center space-x-2">
                    <button onclick="editUser('${user.id}')" class="text-[var(--cane-600)] hover:text-[var(--cane-700)]">
                        <i class="fas fa-edit"></i>
                    </button>
                        <button onclick="confirmDeleteUser('${user.id}', this)" class="text-red-600 hover:text-red-700">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    updatePagination();
}

// Custom confirmation modal for deleting a user (matches driver badge style)
async function confirmDeleteUser(userId, el) {
    const existing = document.getElementById('confirmDeleteUserModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'confirmDeleteUserModal';
    overlay.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm z-50';

    overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-[90%] max-w-lg p-6 text-gray-800 animate-fadeIn">
            <h2 class="text-xl font-bold mb-2 text-gray-900">Delete User</h2>
            <p class="text-sm text-gray-600 mb-4">You are about to permanently delete this user. This action cannot be undone.</p>
            <div class="flex items-start gap-2 mb-4">
                <input type="checkbox" id="userConfirmCheck" class="mt-1 accent-[var(--cane-600)]" />
                <label for="userConfirmCheck" class="text-gray-600 text-sm leading-snug">I understand this action is permanent and I want to proceed.</label>
            </div>
            <div class="flex justify-end gap-3">
                <button id="userCancelBtn" class="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300">Cancel</button>
                <button id="userConfirmBtn" class="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">Delete Permanently</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('userCancelBtn').addEventListener('click', () => overlay.remove());

    document.getElementById('userConfirmBtn').addEventListener('click', async () => {
        const checked = document.getElementById('userConfirmCheck').checked;
        if (!checked) {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: 'Confirmation required', message: 'Please confirm the checkbox to proceed.', type: 'warning' });
            } else {
                alert('Please confirm the checkbox to proceed.');
            }
            return;
        }

        overlay.remove();

        // show processing popup
        if (typeof window.showPopup === 'function') {
            window.showPopup({ title: 'Processing Deletion...', message: 'Deleting user. Please wait...', type: 'info' });
        }

        try {
            await deleteDoc(doc(db, 'users', userId));

            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: 'User Deleted', message: 'User deleted successfully.', type: 'success' });
            }

            // remove row from DOM if provided
            try {
                if (el && el.closest) {
                    const tr = el.closest('tr');
                    if (tr && tr.parentElement) tr.parentElement.removeChild(tr);
                }
            } catch (_) {}

        } catch (err) {
            console.error('Error deleting user:', err);
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: 'Deletion Failed', message: 'Failed to delete user. Please try again later.', type: 'error' });
            } else {
                showAlert('Failed to delete user', 'error');
            }
        }
    });
}

// Expose confirmDeleteUser globally
window.confirmDeleteUser = confirmDeleteUser;

// Load activity logs
async function loadActivityLogs() {
    try {
        console.log('🔄 Loading activity logs...');
        
        const activityQuery = query(
            collection(db, 'admin_security_logs'),
            orderBy('timestamp', 'desc'),
            limit(20)
        );
        
        const querySnapshot = await getDocs(activityQuery);
        activityLogs = [];
        
        querySnapshot.forEach((doc) => {
            const logData = doc.data();
            activityLogs.push({
                id: doc.id,
                ...logData,
                timestamp: logData.timestamp?.toDate() || new Date()
            });
        });
        
        console.log(`📊 Loaded ${activityLogs.length} activity logs`);
        
        // Only render if the activity log container exists
        const activityLogContainer = document.getElementById('activityLog');
        if (activityLogContainer) {
            renderActivityLogs();
        }
        
    } catch (error) {
        console.error('❌ Error loading activity logs:', error);
        // Don't show error if we're not on the activity log page
    }
}

// Render activity logs
function renderActivityLogs() {
    const container = document.getElementById('activityLog');
    container.innerHTML = '';
    
    if (activityLogs.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-history text-2xl mb-2"></i>
                <p>No activity logs</p>
            </div>
        `;
        return;
    }
    
    activityLogs.forEach(log => {
        const logItem = document.createElement('div');
        logItem.className = 'flex items-start space-x-3 p-3 bg-gray-50 rounded-lg';
        
        const iconClass = getActivityIcon(log.eventType);
        const colorClass = getActivityColor(log.eventType);
        
        logItem.innerHTML = `
            <div class="w-8 h-8 ${colorClass} rounded-full flex items-center justify-center flex-shrink-0">
                <i class="fas ${iconClass} text-white text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900">${getActivityMessage(log)}</p>
                <p class="text-xs text-gray-500">${formatDate(log.timestamp)}</p>
            </div>
        `;
        
        container.appendChild(logItem);
    });
}

// Set up real-time listeners
function setupRealtimeListeners() {
    // Listen for new users
    const usersListener = onSnapshot(collection(db, 'users'), (snapshot) => {
        loadUsers();
        loadDashboardStats();
    });
    
    // Listen for new activity logs
    const activityListener = onSnapshot(
        query(collection(db, 'security_logs'), orderBy('timestamp', 'desc'), limit(20)),
        (snapshot) => {
            loadActivityLogs();
            loadDashboardStats();
        }
    );
}

// Set up event listeners
function setupEventListeners() {
    // Profile dropdown
    const profileBtn = document.getElementById('adminProfileBtn');
    const profileDropdown = document.getElementById('adminProfileDropdown');
    
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('opacity-0');
        profileDropdown.classList.toggle('invisible');
        profileDropdown.classList.toggle('scale-95');
        profileDropdown.classList.toggle('scale-100');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        profileDropdown.classList.add('opacity-0', 'invisible', 'scale-95');
        profileDropdown.classList.remove('scale-100');
    });
    
    // User filters
    document.getElementById('roleFilter').addEventListener('change', filterUsers);
    document.getElementById('statusFilter').addEventListener('change', filterUsers);
    document.getElementById('userSearch').addEventListener('input', filterUsers);
    
    // Pagination
    document.getElementById('prevPage').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderUsersTable();
        }
    });
    
    document.getElementById('nextPage').addEventListener('click', () => {
        const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderUsersTable();
        }
    });
    
    
    // Edit user form
    document.getElementById('editUserForm').addEventListener('submit', handleEditUser);
    
    // Delegate Change PIN form submission (content injected in HTML)
    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form && form.id === 'changePinForm') {
            e.preventDefault();
            handleChangePin(form);
        }
    });
}

// Filter users
function filterUsers() {
    const roleFilter = document.getElementById('roleFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    
    filteredUsers = users.filter(user => {
        const matchesRole = !roleFilter || user.role === roleFilter;
        const matchesStatus = !statusFilter || user.status === statusFilter;
        const matchesSearch = !searchTerm || 
            (user.name && user.name.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm));
        
        return matchesRole && matchesStatus && matchesSearch;
    });
    
    currentPage = 1;
    renderUsersTable();
}

// Update pagination
function updatePagination() {
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, filteredUsers.length);
    
    document.getElementById('showingStart').textContent = startIndex;
    document.getElementById('showingEnd').textContent = endIndex;
    document.getElementById('totalRecords').textContent = filteredUsers.length;
    document.getElementById('currentPage').textContent = currentPage;
    
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
}

// Modal functions

function openEditUserModal(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.name || '';
    document.getElementById('editUserEmail').value = user.email || '';
    document.getElementById('editUserRole').value = user.role || '';
    document.getElementById('editUserPhone').value = user.phone || '';
    document.getElementById('editUserStatus').value = user.status || 'inactive';
    document.getElementById('editUserBadge').value = user.driverBadge || 'none';
    
    document.getElementById('editUserModal').classList.remove('hidden');
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.add('hidden');
}


// Handle edit user
async function handleEditUser(e) {
    e.preventDefault();
    
    try {
        const userId = document.getElementById('editUserId').value;
        const userData = {
            name: document.getElementById('editUserName').value,
            email: document.getElementById('editUserEmail').value,
            role: document.getElementById('editUserRole').value,
            phone: document.getElementById('editUserPhone').value,
            status: document.getElementById('editUserStatus').value,
            driverBadge: document.getElementById('editUserBadge').value,
            updatedAt: serverTimestamp()
        };
        
        await updateDoc(doc(db, 'users', userId), userData);
        
        showAlert('User updated successfully', 'success');
        closeEditUserModal();
        loadUsers();
        
    } catch (error) {
        console.error('❌ Error updating user:', error);
        showAlert('Failed to update user', 'error');
    }
}

// Edit user function
function editUser(userId) {
    openEditUserModal(userId);
}

// Delete user function
async function deleteUser(userId, el) {
    openConfirmDialog({
        title: 'Delete User',
        message: 'Are you sure you want to delete this user? This action cannot be undone.',
        confirmText: 'Delete',
        confirmType: 'danger',
        onConfirm: async () => {
            try {
                await deleteDoc(doc(db, 'users', userId));
                showAlert('User deleted successfully', 'success');
                // Remove the row from the table immediately without full reload
                try {
                    if (el && el.closest) {
                        const tr = el.closest('tr');
                        if (tr && tr.parentElement) tr.parentElement.removeChild(tr);
                    }
                } catch (_) {}
                // Let realtime listeners update other parts if present
            } catch (error) {
                console.error('❌ Error deleting user:', error);
                showAlert('Failed to delete user', 'error');
            }
        }
    });
}

// Utility functions
function getStatusClass(status) {
    switch (status) {
        case 'active': return 'status-active';
        case 'inactive': return 'status-inactive';
        case 'pending': return 'status-pending';
        default: return 'status-inactive';
    }
}

function getRoleClass(role) {
    switch (role) {
        case 'farmer': return 'role-farmer';
        case 'worker': return 'role-worker';
        case 'sra': return 'role-sra';
        case 'admin': return 'role-admin';
        default: return 'role-worker';
    }
}

function getBadgeClass(badge) {
    switch (badge) {
        case 'approved': return 'status-badge';
        case 'pending': return 'status-pending';
        default: return 'status-no-badge';
    }
}

function getActivityIcon(eventType) {
    switch (eventType) {
        case 'successful_login': return 'fa-sign-in-alt';
        case 'failed_login': return 'fa-exclamation-triangle';
        case 'logout': return 'fa-sign-out-alt';
        case 'user_created': return 'fa-user-plus';
        case 'user_updated': return 'fa-user-edit';
        case 'user_deleted': return 'fa-user-times';
        default: return 'fa-info-circle';
    }
}

function getActivityColor(eventType) {
    switch (eventType) {
        case 'successful_login': return 'bg-green-500';
        case 'failed_login': return 'bg-red-500';
        case 'logout': return 'bg-blue-500';
        case 'user_created': return 'bg-green-500';
        case 'user_updated': return 'bg-yellow-500';
        case 'user_deleted': return 'bg-red-500';
        default: return 'bg-gray-500';
    }
}

function getActivityMessage(log) {
    switch (log.eventType) {
        case 'successful_login':
            return `${log.details?.email || 'User'} logged in successfully`;
        case 'failed_login':
            return `Failed login attempt for ${log.details?.email || 'unknown user'}`;
        case 'logout':
            return `${log.details?.email || 'User'} logged out`;
        case 'user_created':
            return `New user created: ${log.details?.name || 'Unknown'}`;
        case 'user_updated':
            return `User updated: ${log.details?.name || 'Unknown'}`;
        case 'user_deleted':
            return `User deleted: ${log.details?.name || 'Unknown'}`;
        default:
            return log.details?.message || 'Unknown activity';
    }
}

function formatDate(date) {
    if (!date) return 'Never';
    
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
}

// Load analytics charts
async function loadAnalyticsCharts() {
    try {
        // Get all users for analytics
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const allUsers = [];
        
        usersSnapshot.forEach((doc) => {
            const userData = doc.data();
            allUsers.push({
                id: doc.id,
                ...userData,
                createdAt: userData.createdAt?.toDate() || new Date(),
                lastLogin: userData.lastLogin?.toDate() || null
            });
        });
        
        // Create user growth chart
        createUserGrowthChart(allUsers);
        
        // Create user role distribution chart
        createUserRoleChart(allUsers);
        
    } catch (error) {
        console.error('❌ Error loading analytics charts:', error);
    }
}

// Create user growth chart
function createUserGrowthChart(users) {
    const ctx = document.getElementById('userGrowthChart');
    if (!ctx) return;
    
    // Generate last 12 months data
    const months = [];
    const userCounts = [];
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        months.push(monthName);
        
        // Count users created in this month
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        const usersInMonth = users.filter(user => {
            const userDate = user.createdAt;
            return userDate >= monthStart && userDate <= monthEnd;
        }).length;
        
        userCounts.push(usersInMonth);
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'New Users',
                data: userCounts,
                borderColor: '#7ccf00',
                backgroundColor: 'rgba(124, 207, 0, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#7ccf00',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            elements: {
                point: {
                    hoverBackgroundColor: '#7ccf00'
                }
            }
        }
    });
}

// Create user role distribution chart
function createUserRoleChart(users) {
    const ctx = document.getElementById('userRoleChart');
    if (!ctx) return;
    
    // Count users by role
    const roleCounts = {
        farmer: 0,
        worker: 0,
        sra: 0,
        admin: 0
    };
    
    users.forEach(user => {
        const role = user.role || 'worker';
        if (roleCounts.hasOwnProperty(role)) {
            roleCounts[role]++;
        }
    });
    
    const labels = Object.keys(roleCounts).map(role => 
        role.charAt(0).toUpperCase() + role.slice(1) + 's'
    );
    const data = Object.values(roleCounts);
    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#ef4444'];
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#ffffff',
                borderWidth: 3,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            },
            cutout: '60%'
        }
    });
}

// Fetch and render SRA officers directly from Firestore
async function fetchAndRenderSRA() {
  const tableBody = document.getElementById("sraTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = `
    <tr>
      <td colspan="4" class="px-6 py-10">
        <div class="flex flex-col items-center justify-center text-center text-gray-500">
          <i class="fas fa-spinner fa-spin text-2xl mb-2 text-gray-400"></i>
          <p>Loading SRA officers...</p>
        </div>
      </td>
    </tr>
  `;

  try {
    // Query only users with role = 'sra'
    const q = query(collection(db, "users"), where("role", "==", "sra"));
    const snap = await getDocs(q);

    if (snap.empty) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="px-6 py-10 text-center text-gray-400">
            <i class="fas fa-user-tie text-3xl mb-2"></i>
            <p>No SRA officers found.</p>
          </td>
        </tr>
      `;
      return;
    }

    let html = "";
    snap.forEach((doc) => {
      const data = doc.data();
      const statusColor =
        data.status === "active"
          ? "bg-green-100 text-green-700"
          : data.status === "pending"
          ? "bg-yellow-100 text-yellow-700"
          : "bg-gray-100 text-gray-700";

      const verifiedText = data.emailVerified ? "Verified" : "Pending";
      const verifiedColor = data.emailVerified
        ? "text-green-600"
        : "text-yellow-600";

      html += `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-[var(--cane-500)] text-white rounded-full flex items-center justify-center font-semibold uppercase">
                ${data.name ? data.name[0] : "?"}
              </div>
              <div>
                <p class="font-medium text-gray-900">${data.name || "N/A"}</p>
                <p class="text-gray-500 text-sm">${data.email || ""}</p>
              </div>
            </div>
          </td>
          <td class="px-6 py-4 text-sm">
            <span class="${verifiedColor}">${verifiedText}</span>
          </td>
          <td class="px-6 py-4 text-sm">
            <span class="px-2 py-1 rounded-full text-xs font-medium ${statusColor}">
              ${data.status || "inactive"}
            </span>
          </td>
          <td class="px-6 py-4 text-sm text-gray-600">
            <button class="text-[var(--cane-600)] hover:text-[var(--cane-700)] mx-2">
              <i class="fas fa-edit"></i>
            </button>
            <button class="text-red-500 hover:text-red-700 mx-2" onclick="confirmDeleteSRA('${doc.id}', '${data.name}', '${data.email}')">
            <i class="fas fa-trash-alt"></i>
            </button>
          </td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;
  } catch (err) {
    console.error("Error fetching SRA officers:", err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="px-6 py-10 text-center text-red-600">
          Failed to load data. Please check your Firebase rules or network.
        </td>
      </tr>
    `;
  }
}


// ================================
// 🧾 Delete Confirmation + Firestore Delete
// ================================
async function confirmDeleteSRA(id, name, email) {
  // Remove existing modal if open
  const existing = document.getElementById("confirmDeleteModal");
  if (existing) existing.remove();

  // Create overlay modal
  const overlay = document.createElement("div");
  overlay.id = "confirmDeleteModal";
  overlay.className =
    "fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm z-50";

  overlay.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-[90%] max-w-lg p-8 text-gray-800 animate-fadeIn relative">
      <h2 class="text-2xl font-bold mb-3 text-center text-gray-900">Confirm Deletion</h2>
      <p class="text-gray-600 text-sm mb-6 text-justify leading-relaxed">
        You are about to <b>permanently remove</b> the SRA Officer <b>${name}</b> 
        (<i>${email}</i>) from the CaneMap system. This action cannot be undone.
        <br><br>
        <b>Legal Notice:</b> Deleting a registered officer’s data constitutes 
        an irreversible administrative action under CaneMap’s Data Protection 
        and Retention Policy. All associated records (including system access 
        credentials, pending verifications, and activity logs) will be 
        permanently removed. Please ensure that you have obtained any required 
        authorization before confirming this deletion.
        <br><br>
        By proceeding, you acknowledge that this action is intentional, compliant 
        with internal data governance procedures, and will remove the officer 
        from all CaneMap administrative systems.
      </p>
      <div class="flex items-start gap-2 mb-6">
        <input type="checkbox" id="confirmPolicyCheck" class="mt-1 accent-[var(--cane-600)]" />
        <label for="confirmPolicyCheck" class="text-gray-600 text-sm leading-snug">
          I understand and agree to the terms above, and confirm that the deletion 
          of this account complies with CaneMap’s official administrative protocols.
        </label>
      </div>
      <div class="flex justify-center gap-4">
        <button id="cancelDeleteBtn" class="px-5 py-2 rounded-lg bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium shadow-sm transition">Cancel</button>
        <button id="confirmDeleteBtn" class="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium shadow-md transition">Delete Permanently</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("cancelDeleteBtn").addEventListener("click", () => overlay.remove());

  document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
        const checked = document.getElementById("confirmPolicyCheck").checked;
        if (!checked) {
            // Use global custom popup if available
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: 'Confirmation required', message: 'Please confirm that you agree to the data policy before proceeding.', type: 'warning' });
            } else {
                alert('Please confirm that you agree to the data policy before proceeding.');
            }
            return;
        }

    overlay.remove();

    // 🔄 Show loading popup
    showPopup({
      title: "Processing Deletion...",
      message: "Please wait while we remove this officer from the system.",
      type: "info"
    });

    try {
      await deleteDoc(doc(db, "users", id));

      showPopup({
        title: "Officer Deleted Successfully",
        message: `The officer <b>${name}</b> has been permanently removed from the CaneMap system.`,
        type: "success"
      });

      // Refresh table
      await fetchAndRenderSRA();
    } catch (err) {
      console.error("Error deleting officer:", err);
                if (typeof window.showPopup === 'function') {
                    window.showPopup({ title: 'Deletion Failed', message: 'An unexpected error occurred while deleting this record. Please try again later or contact system support.', type: 'error' });
                } else {
                    showPopup({
                        title: "Deletion Failed",
                        message:
                            "An unexpected error occurred while deleting this record. Please try again later or contact system support.",
                        type: "error"
                    });
                }
    }
  });
}

// Expose SRA delete helper globally so inline onclick handlers in HTML can call it
window.confirmDeleteSRA = confirmDeleteSRA;

// Confirm and delete a Driver Badge document
async function confirmDeleteBadge(id, name) {
    const existing = document.getElementById('confirmDeleteBadgeModal_global');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'confirmDeleteBadgeModal_global';
    overlay.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm z-50';

    overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-[90%] max-w-lg p-6 text-gray-800 animate-fadeIn">
            <h2 class="text-xl font-bold mb-2 text-gray-900">Delete Driver Badge</h2>
            <p class="text-sm text-gray-600 mb-4">You are about to permanently delete the driver badge ${name ? '<b>' + name + '</b>' : ''}. This action cannot be undone.</p>
            <div class="flex items-start gap-2 mb-4">
                <input type="checkbox" id="badgeConfirmCheckGlobal" class="mt-1 accent-[var(--cane-600)]" />
                <label for="badgeConfirmCheckGlobal" class="text-gray-600 text-sm leading-snug">I understand this action is permanent and I want to proceed.</label>
            </div>
            <div class="flex justify-end gap-3">
                <button id="badgeCancelBtnGlobal" class="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300">Cancel</button>
                <button id="badgeConfirmBtnGlobal" class="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">Delete Permanently</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('badgeCancelBtnGlobal').addEventListener('click', () => overlay.remove());

    document.getElementById('badgeConfirmBtnGlobal').addEventListener('click', async () => {
        const checked = document.getElementById('badgeConfirmCheckGlobal').checked;
        if (!checked) {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: 'Confirmation required', message: 'Please confirm the checkbox to proceed.', type: 'warning' });
            } else {
                alert('Please confirm the checkbox to proceed.');
            }
            return;
        }
        overlay.remove();
        // show popup
        try {
            await deleteDoc(doc(db, 'Drivers_Badge', id));
            showPopup({ title: 'Driver Badge Deleted', message: `${name || 'Badge'} deleted successfully`, type: 'success' });
            // If there's a badge list UI, try to refresh
            if (typeof window.fetchBadgeRequests === 'function') {
                try { window.fetchBadgeRequests(); } catch(_){}
            }
        } catch (err) {
            console.error('Error deleting driver badge:', err);
            showPopup({ title: 'Deletion Failed', message: 'Failed to delete driver badge.', type: 'error' });
        }
    });
}


// Render SRA officers table
function renderSRATable(sraOfficers) {
    const tbody = document.getElementById('sraTableBody');
    if (!tbody) return;
    
    if (sraOfficers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-10">
                    <div class="flex flex-col items-center justify-center text-center text-gray-500">
                        <i class="fas fa-user-tie text-2xl mb-2 text-gray-400"></i>
                        <p>No SRA officers found</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = '';
    
    sraOfficers.forEach(officer => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        
        const statusClass = getStatusClass(officer.status);
        const emailVerified = officer.emailVerified ? 'Verified' : 'Pending';
        const emailVerifiedClass = officer.emailVerified ? 'text-green-600' : 'text-yellow-600';
        
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="w-10 h-10 bg-gradient-to-br from-[var(--cane-400)] to-[var(--cane-500)] rounded-full flex items-center justify-center">
                        <i class="fas fa-user-tie text-white text-sm"></i>
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">${officer.name || 'N/A'}</div>
                        <div class="text-sm text-gray-500">${officer.email || 'N/A'}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${officer.email || 'N/A'}</div>
                <div class="text-xs ${emailVerifiedClass}">${emailVerified}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">
                    ${officer.status || 'inactive'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div class="flex items-center space-x-2">
                    <button onclick="editUser('${officer.id}')" class="text-[var(--cane-600)] hover:text-[var(--cane-700)]">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteUser('${officer.id}', this)" class="text-red-600 hover:text-red-700">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// Refresh SRA Officers function
function refreshSRAOfficers() {
    // Refresh from server/localStorage
    fetchAndRenderSRA();
    // Also attempt to load any predefined existing data (previously 'Load Existing Data' button)
    try {
        addExistingSRAOfficer();
    } catch (e) {
        console.warn('Could not run addExistingSRAOfficer during refresh:', e);
    }
}

// Debug function to clear SRA Officers data (for testing)
function clearSRAOfficersData() {
    localStorage.removeItem('sraOfficers');
    fetchAndRenderSRA();
    console.log('SRA Officers data cleared');
}

// Function to manually add existing SRA Officer data
function addExistingSRAOfficer() {
    // Check if data already exists
    const existingData = JSON.parse(localStorage.getItem('sraOfficers') || '[]');
    const existingEmail = 'almackieandrew.bangalao@evsu.edu.ph';
    
    if (existingData.some(officer => officer.email === existingEmail)) {
        if (typeof showAlert === 'function') showAlert('SRA Officer data already exists in localStorage!', 'info');
        else alert('SRA Officer data already exists in localStorage!');
        return;
    }
    
    const officerData = {
        id: 'existing-sra-001', // You can use the actual UID from Firestore
        name: 'Almackie Bangalao',
        email: 'almackieandrew.bangalao@evsu.edu.ph',
        role: 'sra',
        status: 'active',
        emailVerified: false,
        createdAt: new Date('2025-09-27T05:52:58.000Z').toISOString(), // Convert Firestore timestamp
        lastLogin: null
    };
    
    existingData.push(officerData);
    localStorage.setItem('sraOfficers', JSON.stringify(existingData));
    
    fetchAndRenderSRA();
    if (typeof showAlert === 'function') showAlert('Existing SRA Officer data loaded successfully!', 'success');
    else alert('Existing SRA Officer data loaded successfully!');
    console.log('Existing SRA Officer added to localStorage');
}

// Function to import all existing SRA Officers from a predefined list
function importAllExistingSRAOfficers() {
    const existingOfficers = [
        {
            id: 'existing-sra-001',
            name: 'Almackie Bangalao',
            email: 'almackieandrew.bangalao@evsu.edu.ph',
            role: 'sra',
            status: 'active',
            emailVerified: false,
            createdAt: new Date('2025-09-27T05:52:58.000Z').toISOString(),
            lastLogin: null
        }
        // Add more existing SRA Officers here if needed
    ];
    
    const existingData = JSON.parse(localStorage.getItem('sraOfficers') || '[]');
    let addedCount = 0;
    
    existingOfficers.forEach(officer => {
        if (!existingData.some(existing => existing.email === officer.email)) {
            existingData.push(officer);
            addedCount++;
        }
    });
    
    if (addedCount > 0) {
        localStorage.setItem('sraOfficers', JSON.stringify(existingData));
        fetchAndRenderSRA();
        if (typeof showAlert === 'function') showAlert(`Imported ${addedCount} existing SRA Officer(s) successfully!`, 'success');
        else alert(`Imported ${addedCount} existing SRA Officer(s) successfully!`);
    } else {
        if (typeof showAlert === 'function') showAlert('All existing SRA Officers are already imported!', 'info');
        else alert('All existing SRA Officers are already imported!');
    }
}

// Export functions for global access
window.editUser = editUser;
window.deleteUser = deleteUser;
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.fetchAndRenderSRA = fetchAndRenderSRA;
window.refreshSRAOfficers = refreshSRAOfficers;
window.addExistingSRAOfficer = addExistingSRAOfficer;
window.importAllExistingSRAOfficers = importAllExistingSRAOfficers;
window.clearSRAOfficersData = clearSRAOfficersData;

// Attach SRA modal close/cancel event listeners after partial is loaded
document.addEventListener('click', function() {
    setTimeout(() => {
        var closeBtn = document.getElementById('sraModalCloseBtn');
        var cancelBtn = document.getElementById('sraModalCancelBtn');
        function closeAddSRA() {
            var m = document.getElementById('addSraModal');
            if (m) {
                m.classList.add('hidden');
                m.classList.remove('flex');
            }
        }
        if (closeBtn) closeBtn.addEventListener('click', closeAddSRA);
        if (cancelBtn) cancelBtn.addEventListener('click', closeAddSRA);
    }, 200);
});
// Attach SRA modal close/cancel event listeners after modal HTML is loaded
function attachSraModalListeners() {
    var closeBtn = document.getElementById('sraModalCloseBtn');
    var cancelBtn = document.getElementById('sraModalCancelBtn');
    function closeAddSRA() {
        var m = document.getElementById('addSraModal');
        if (m) {
            m.classList.add('hidden');
            m.classList.remove('flex');
        }
    }
    if (closeBtn) closeBtn.addEventListener('click', closeAddSRA);
    if (cancelBtn) cancelBtn.addEventListener('click', closeAddSRA);
}

// Example usage: After inserting modal HTML, call attachSraModalListeners()

// Add sample data for demonstration
async function addSampleData() {
    try {
        console.log('🔄 Adding sample data...');
        
        // Check if we already have data
        const usersSnapshot = await getDocs(collection(db, 'users'));
        if (usersSnapshot.size > 0) {
            console.log('📊 Sample data already exists, skipping...');
            return;
        }
        
        // Add sample users
        const sampleUsers = [
            {
                name: 'John Doe',
                email: 'john.doe@example.com',
                role: 'farmer',
                status: 'active',
                createdAt: serverTimestamp(),
                lastLogin: new Date(),
                driverBadge: 'none'
            },
            {
                name: 'Jane Smith',
                email: 'jane.smith@example.com',
                role: 'sra',
                status: 'active',
                createdAt: serverTimestamp(),
                lastLogin: new Date(),
                driverBadge: 'approved'
            },
            {
                name: 'Mike Johnson',
                email: 'mike.johnson@example.com',
                role: 'worker',
                status: 'active',
                createdAt: serverTimestamp(),
                lastLogin: new Date(),
                driverBadge: 'pending'
            }
        ];
        
        for (const user of sampleUsers) {
            await addDoc(collection(db, 'users'), user);
        }
        
        console.log('✅ Sample data added successfully');
        
        // Reload dashboard stats
        await loadDashboardStats();
        
    } catch (error) {
        console.error('❌ Error adding sample data:', error);
    }
}

// Export functions for global access

window.initializeDashboard = initializeDashboard;
window.addSampleData = addSampleData;

// expose badge delete helper globally
window.confirmDeleteBadge = confirmDeleteBadge;

// Custom confirmation dialog
function openConfirmDialog({ title, message, confirmText, cancelText, onConfirm, onCancel, confirmType }) {
    const root = document.createElement('div');
    root.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/50';
    root.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 class="text-lg font-bold text-gray-900">${title || 'Confirm'}</h3>
                <button class="text-gray-400 hover:text-gray-600" data-close>
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="px-6 py-5 text-gray-700">${message || ''}</div>
            <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                <button class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100" data-cancel>${cancelText || 'Cancel'}</button>
                <button class="px-4 py-2 rounded-lg text-white ${confirmType==='danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--cane-600)] hover:bg-[var(--cane-700)]'}" data-confirm>${confirmText || 'Confirm'}</button>
            </div>
        </div>
    `;
    function cleanup(){ try { document.body.removeChild(root); } catch(_){} }
    root.addEventListener('click', (e) => { if (e.target === root) cleanup(); });
    root.querySelector('[data-close]')?.addEventListener('click', cleanup);
    root.querySelector('[data-cancel]')?.addEventListener('click', () => { cleanup(); try{ onCancel && onCancel(); }catch(_){} });
    root.querySelector('[data-confirm]')?.addEventListener('click', async () => {
        try { await (onConfirm && onConfirm()); } finally { cleanup(); }
    });
    document.body.appendChild(root);
}

// Fetch feedback and render table for admin
window.showFeedbackReports = async function() {
    const mainContent = document.querySelector('main');
    mainContent.style.height = '100vh';
    mainContent.style.overflow = 'auto';
    mainContent.innerHTML = `<div class="bg-white rounded-xl shadow-lg p-6">
        <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-bold text-gray-900">User Feedback Reports</h2>
            <div class="flex items-center gap-3">
                <label class="text-sm text-gray-600">Sort by:</label>
                <select id="feedbackSort" class="px-3 py-1 border rounded-md text-sm">
                    <option value="date_desc">Date (newest)</option>
                    <option value="date_asc">Date (oldest)</option>
                    <option value="email_asc">Email (A → Z)</option>
                    <option value="email_desc">Email (Z → A)</option>
                    <option value="type_asc">Category (A → Z)</option>
                    <option value="type_desc">Category (Z → A)</option>
                </select>
            </div>
        </div>
        <div class="flex items-center justify-between mb-4">
            <div class="text-sm text-gray-600">Only users with role <strong>system_admin</strong> can view feedback here.</div>
            <div class="flex items-center gap-3">
                <button id="feedbackRefresh" class="px-3 py-1 text-sm bg-[var(--cane-100)] border rounded-md">Refresh</button>
                <div id="feedbackStatus" class="text-xs text-gray-500">&nbsp;</div>
            </div>
        </div>
        <div id="feedbackTableContainer">
            <div class="text-gray-600 mb-4">Loading feedback...</div>
        </div>
    </div>`;
    try {
        const { db } = await import('../Common/firebase-config.js');
        const { collection, query, orderBy, onSnapshot } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

        // Clean up previous listener if any
        if (window.__feedbackListener && typeof window.__feedbackListener === 'function') {
            try { window.__feedbackListener(); } catch(_) {}
            window.__feedbackListener = null;
        }

        // Base query: listen for feedbacks ordered by createdAt desc
        const baseQ = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'));

        // render skeleton table
        const skeleton = `<table class="min-w-full border rounded-lg overflow-hidden">
            <thead class="bg-gray-100">
                <tr>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-700">Email</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-700">Category</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-700">Message</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-700">Date</th>
                </tr>
            </thead>
            <tbody id="feedbackTableBody">
                <tr><td colspan="4" class="px-4 py-3 text-center text-gray-500">Loading...</td></tr>
            </tbody>
        </table>`;
        document.getElementById('feedbackTableContainer').innerHTML = skeleton;

        // Append modal container (hidden) used to show full feedback details
        if (!document.getElementById('feedbackDetailModal')) {
            const modalWrap = document.createElement('div');
            modalWrap.id = 'feedbackDetailModal';
            modalWrap.className = 'hidden';
            document.body.appendChild(modalWrap);
        }

        // Helper to format date
        function formatDateField(ts) {
            if (!ts) return '';
            try {
                if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
                if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
                return new Date(ts).toLocaleString();
            } catch(_) { return '' }
        }

        // Map a type to a friendly label
        function typeLabel(t) {
            if (!t) return '';
            if (t === 'like') return 'I like something';
            if (t === 'dislike') return "I don't like something";
            if (t === 'idea') return 'I have an idea';
            return t;
        }

        // Client-side sorting function
        function sortRows(rows, mode) {
            const copy = [...rows];
            switch(mode) {
                case 'date_asc':
                    return copy.sort((a,b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));
                case 'date_desc':
                    return copy.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
                case 'email_asc':
                    return copy.sort((a,b) => String(a.email||'').localeCompare(String(b.email||'')));
                case 'email_desc':
                    return copy.sort((a,b) => String(b.email||'').localeCompare(String(a.email||'')));
                case 'type_asc':
                    return copy.sort((a,b) => String(a.type||'').localeCompare(String(b.type||'')));
                case 'type_desc':
                    return copy.sort((a,b) => String(b.type||'').localeCompare(String(a.type||'')));
                default:
                    return copy;
            }
        }

        // Render rows into table body
        function renderTable(rows, sortMode) {
            const tbody = document.getElementById('feedbackTableBody');
            if (!tbody) return;
            const sorted = sortRows(rows, sortMode || (document.getElementById('feedbackSort')?.value || 'date_desc'));
            if (!sorted.length) {
                tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-3 text-center text-gray-500">No feedback found.</td></tr>`;
                return;
            }
            tbody.innerHTML = sorted.map(f => {
                return `<tr data-id="${escapeHtml(f.id)}" class="cursor-pointer hover:bg-gray-50">
                    <td class="border-t px-4 py-2 text-sm">${escapeHtml(f.email) || '-'}</td>
                    <td class="border-t px-4 py-2 text-sm">${escapeHtml(typeLabel(f.type))}</td>
                    <td class="border-t px-4 py-2 text-sm truncate max-w-[36ch]">${escapeHtml(f.message || '-')}</td>
                    <td class="border-t px-4 py-2 text-xs text-gray-500">${escapeHtml(formatDateField(f.createdAt))}</td>
                </tr>`;
            }).join('');

            // Attach click handler to table body to open modal with details
            tbody.addEventListener('click', function onRowClick(e){
                const tr = e.target.closest('tr[data-id]');
                if (!tr) return;
                const id = tr.getAttribute('data-id');
                const item = (window.__cachedFeedbackRows || []).find(r => r.id === id);
                if (item) openFeedbackModal(item);
            });
        }

        // Basic HTML escape utility
        function escapeHtml(str) {
            if (typeof str !== 'string') return str;
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }

                // Modal rendering for full feedback details
                function openFeedbackModal(item) {
                        try {
                                // Remove existing modal markup if present
                                const existing = document.getElementById('feedbackDetailModal');
                                let modalRoot = existing;
                                if (!modalRoot) {
                                        modalRoot = document.createElement('div');
                                        modalRoot.id = 'feedbackDetailModal';
                                        document.body.appendChild(modalRoot);
                                }
                                // Build modal content
                                const html = `
                                <div class="fixed inset-0 bg-black/40 z-90 flex items-center justify-center p-4">
                                    <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 relative">
                                        <button id="feedbackDetailClose" class="absolute top-3 right-3 w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center"><i class="fas fa-times text-gray-700"></i></button>
                                        <h3 class="text-xl font-bold text-gray-900 mb-2">Feedback Details</h3>
                                        <div class="mt-4 grid grid-cols-1 gap-3">
                                            <div class="text-sm text-gray-700"><strong>Email:</strong> ${escapeHtml(item.email || '-')}</div>
                                            <div class="text-sm text-gray-700"><strong>Category:</strong> ${escapeHtml(typeLabel(item.type))}</div>
                                            <div class="text-sm text-gray-700"><strong>Date:</strong> ${escapeHtml(formatDateField(item.createdAt))}</div>
                                            <div class="pt-4">
                                                <label class="block text-xs text-gray-500 mb-1">Full message</label>
                                                <div class="p-4 bg-gray-50 border border-gray-100 rounded-md text-sm text-gray-800 whitespace-pre-wrap">${escapeHtml(item.message || '-')}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>`;
                                modalRoot.innerHTML = html;
                                modalRoot.classList.remove('hidden');
                                // Close handlers
                                const closeBtn = document.getElementById('feedbackDetailClose');
                                function closeModal(){ try{ modalRoot.innerHTML = ''; modalRoot.classList.add('hidden'); } catch(_){} }
                                closeBtn && closeBtn.addEventListener('click', closeModal);
                                modalRoot.addEventListener('click', function(e){ if (e.target === modalRoot) closeModal(); });
                        } catch (err) { console.error('Failed to open feedback modal', err); }
                }

        // Listen for sort changes
        const sortEl = document.getElementById('feedbackSort');
        if (sortEl) {
            sortEl.addEventListener('change', function(){
                // if we have cachedRows, re-render
                if (window.__cachedFeedbackRows) renderTable(window.__cachedFeedbackRows, sortEl.value);
            });
        }

        // Attach real-time listener
        const feedbackStatusEl = document.getElementById('feedbackStatus');
        const unsubscribe = onSnapshot(baseQ, snap => {
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // cache for client-side sorting rerenders
            window.__cachedFeedbackRows = rows;
            renderTable(rows);
            if (feedbackStatusEl) feedbackStatusEl.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
        }, err => {
            console.error('Feedback snapshot error', err);
            // Show a helpful diagnostic UI so admins know why reads are blocked
            const container = document.getElementById('feedbackTableContainer');
            let infoHtml = `<div class="text-red-600">Failed to load feedback: ${escapeHtml(err.message || String(err))}</div>`;
            infoHtml += `<div class="mt-3 text-sm text-gray-700">Possible causes: insufficient Firestore rules or your user is not a <strong>system_admin</strong>.</div>`;
            container.innerHTML = infoHtml;
            if (feedbackStatusEl) feedbackStatusEl.textContent = 'Failed to update';

            // Try to detect current user role and show it
            (async function showRoleHint(){
                try {
                    // attempt to get current auth user
                    const { auth, db } = await import('../Common/firebase-config.js');
                    if (auth && typeof auth.currentUser !== 'undefined') {
                        const user = auth.currentUser;
                        if (user && user.uid) {
                            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                            const userDoc = await getDoc(doc(db, 'users', user.uid));
                            const role = userDoc.exists() ? (userDoc.data().role || 'unknown') : 'not found';
                            const el = document.createElement('div');
                            el.className = 'mt-2 text-sm text-gray-700';
                            el.innerHTML = `<strong>Current signed-in user:</strong> ${escapeHtml(user.email || user.uid)}<br/><strong>Detected role:</strong> ${escapeHtml(role)}<br/>If the role is not <code>system_admin</code>, update the user's document in Firestore or use an account with the correct role.`;
                            container.appendChild(el);
                        }
                    }
                } catch (e2) {
                    console.warn('Could not fetch user role for diagnostics', e2);
                }
            })();
        });

        // store unsubscribe so subsequent calls can clean up
        window.__feedbackListener = unsubscribe;

        // Refresh button wiring
        const refreshBtn = document.getElementById('feedbackRefresh');
        if (refreshBtn) {
            refreshBtn.onclick = function(){
                // Re-run the reports loader which will cleanup previous listener
                try { window.showFeedbackReports(); } catch(_) {}
            };
        }

    } catch (e) {
        console.error('Error in showFeedbackReports', e);
        document.getElementById('feedbackTableContainer').innerHTML = `<div class="text-red-600">Failed to load feedback.</div>`;
    }
};

// Handle Change PIN
async function handleChangePin(form){
    try{
        const currentPin = (new FormData(form).get('currentPin')||'').trim();
        const newPin = (new FormData(form).get('newPin')||'').trim();
        const confirmPin = (new FormData(form).get('confirmPin')||'').trim();
        if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)){
            showAlert('PIN must be 6 digits','error');
            return;
        }
        if (newPin !== confirmPin){
            showAlert('New PIN and confirmation do not match','error');
            return;
        }
        // Verify current pin
        const qOld = query(collection(db,'admin_pins'), where('pin','==', currentPin), limit(1));
        const snapOld = await getDocs(qOld);
        if (snapOld.empty){
            showAlert('Current PIN is incorrect','error');
            return;
        }
        const docRef = snapOld.docs[0].ref;
        await updateDoc(docRef, { pin: newPin, updatedAt: serverTimestamp() });
        showAlert('PIN updated successfully','success');
        form.reset();
    }catch(e){
        console.error('Change PIN failed', e);
        showAlert('Failed to update PIN','error');
    }
}

document.addEventListener("DOMContentLoaded", fetchAndRenderSRA);
