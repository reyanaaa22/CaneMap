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
    onSnapshot
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
        // Check if user is logged in
        const adminUser = sessionStorage.getItem('admin_user');
        if (!adminUser) {
            // Temporarily disabled redirect to login during development
            // window.location.href = 'login.html';
            return;
        }
        
        currentUser = JSON.parse(adminUser);
        
        // Update admin name in header and sidebar
        document.getElementById('adminName').textContent = currentUser.name;
        document.getElementById('dropdownAdminName').textContent = currentUser.name;
        document.getElementById('sidebarAdminName').textContent = currentUser.name;
        
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
        showAlert('Failed to initialize dashboard', 'error');
    }
}

// Load dashboard statistics
async function loadDashboardStats() {
    try {
        // Get total users
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const totalUsers = usersSnapshot.size;
        
        // Get active users (logged in within last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const activeUsersQuery = query(
            collection(db, 'users'),
            where('lastLogin', '>=', thirtyDaysAgo)
        );
        const activeUsersSnapshot = await getDocs(activeUsersQuery);
        const activeUsers = activeUsersSnapshot.size;
        
        // Get failed logins today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const failedLoginsQuery = query(
            collection(db, 'security_logs'),
            where('eventType', '==', 'failed_login'),
            where('timestamp', '>=', today)
        );
        const failedLoginsSnapshot = await getDocs(failedLoginsQuery);
        const failedLogins = failedLoginsSnapshot.size;
        
        // Get driver badges
        const driverBadgesQuery = query(
            collection(db, 'users'),
            where('driverBadge', '==', 'approved')
        );
        const driverBadgesSnapshot = await getDocs(driverBadgesQuery);
        const driverBadges = driverBadgesSnapshot.size;
        
        // Update UI
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('activeUsers').textContent = activeUsers;
        document.getElementById('failedLogins').textContent = failedLogins;
        document.getElementById('driverBadges').textContent = driverBadges;
        
        // Load analytics charts
        await loadAnalyticsCharts();
        
    } catch (error) {
        console.error('❌ Error loading dashboard stats:', error);
    }
}

// Load users from Firebase
async function loadUsers() {
    try {
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
        renderUsersTable();
        
    } catch (error) {
        console.error('❌ Error loading users:', error);
        showAlert('Failed to load users', 'error');
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
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${badgeClass}">
                    ${user.driverBadge === 'approved' ? 'Badge Holder' : 
                      user.driverBadge === 'pending' ? 'Pending' : 'No Badge'}
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
                    <button onclick="deleteUser('${user.id}')" class="text-red-600 hover:text-red-700">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    updatePagination();
}

// Load activity logs
async function loadActivityLogs() {
    try {
        const activityQuery = query(
            collection(db, 'security_logs'),
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
        
        renderActivityLogs();
        
    } catch (error) {
        console.error('❌ Error loading activity logs:', error);
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
    
    // Add user form
    document.getElementById('addUserForm').addEventListener('submit', handleAddUser);
    
    // Edit user form
    document.getElementById('editUserForm').addEventListener('submit', handleEditUser);
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
function openAddUserModal() {
    document.getElementById('addUserModal').classList.remove('hidden');
    document.getElementById('addUserForm').reset();
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.add('hidden');
}

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

// Handle add user
async function handleAddUser(e) {
    e.preventDefault();
    
    try {
        const userData = {
            name: document.getElementById('userName').value,
            email: document.getElementById('userEmail').value,
            role: document.getElementById('userRole').value,
            phone: document.getElementById('userPhone').value,
            driverBadge: document.getElementById('userBadge').value,
            status: 'active',
            createdAt: serverTimestamp(),
            lastLogin: null,
            loginCount: 0,
            failedAttempts: 0
        };
        
        await addDoc(collection(db, 'users'), userData);
        
        showAlert('User added successfully', 'success');
        closeAddUserModal();
        loadUsers();
        
    } catch (error) {
        console.error('❌ Error adding user:', error);
        showAlert('Failed to add user', 'error');
    }
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
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }
    
    try {
        await deleteDoc(doc(db, 'users', userId));
        showAlert('User deleted successfully', 'success');
        loadUsers();
        
    } catch (error) {
        console.error('❌ Error deleting user:', error);
        showAlert('Failed to delete user', 'error');
    }
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

// Export functions for global access
window.editUser = editUser;
window.deleteUser = deleteUser;
window.openAddUserModal = openAddUserModal;
window.closeAddUserModal = closeAddUserModal;
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;

// Export initializeDashboard to global scope for inline script
window.initializeDashboard = initializeDashboard;
