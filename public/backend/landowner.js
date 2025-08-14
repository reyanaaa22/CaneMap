// Landowner Dashboard functionality
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    getDocs, 
    updateDoc, 
    doc, 
    getDoc 
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

class LandownerDashboard {
    constructor() {
        this.currentUser = null;
        this.userData = null;
        this.ownedFields = [];
        this.joinRequests = [];
        
        this.init();
    }

    async init() {
        // Check authentication state
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.currentUser = user;
                await this.loadUserData();
                await this.checkUserRole();
            } else {
                // Redirect to login if not authenticated
                window.location.href = 'farmers_login.html';
            }
        });
    }

    async loadUserData() {
        try {
            const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
            if (userDoc.exists()) {
                this.userData = userDoc.data();
                this.updateUserName();
            } else {
                console.error('User document not found');
                window.location.href = 'farmers_login.html';
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            window.location.href = 'farmers_login.html';
        }
    }

    async checkUserRole() {
        if (!this.userData || this.userData.role !== 'landowner') {
            alert('Access denied. This page is for landowners only.');
            window.location.href = 'farmers_login.html';
            return;
        }

        // Show/hide verification notice based on status
        this.showVerificationStatus();
        
        // Load dashboard data
        await this.loadDashboardData();
    }

    showVerificationStatus() {
        const verificationNotice = document.getElementById('verificationNotice');
        const registerNewFieldBtn = document.getElementById('registerNewFieldBtn');
        const registerFirstFieldBtn = document.getElementById('registerFirstFieldBtn');
        const verificationRequired = document.getElementById('verificationRequired');

        if (this.userData.status === 'pending') {
            verificationNotice.style.display = 'block';
            registerNewFieldBtn.style.display = 'none';
            registerFirstFieldBtn.style.display = 'none';
            verificationRequired.style.display = 'block';
        } else if (this.userData.status === 'verified') {
            verificationNotice.style.display = 'none';
            registerNewFieldBtn.style.display = 'inline-flex';
            registerFirstFieldBtn.style.display = 'inline-flex';
            verificationRequired.style.display = 'none';
        }
    }

    updateUserName() {
        const userNameElement = document.getElementById('userName');
        if (this.userData && this.userData.full_name) {
            userNameElement.textContent = `Welcome, ${this.userData.full_name}`;
        }
    }

    async loadDashboardData() {
        try {
            await Promise.all([
                this.loadOwnedFields(),
                this.loadJoinRequests()
            ]);
            
            this.updateDashboardStats();
            this.renderFields();
            this.renderJoinRequests();
            this.renderGrowthTracker();
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showMessage('Error loading dashboard data. Please refresh the page.', 'error');
        }
    }

    async loadOwnedFields() {
        const fieldsRef = collection(db, 'fields');
        const fieldsQuery = query(
            fieldsRef,
            where('landowner_id', '==', this.currentUser.uid),
            orderBy('created_at', 'desc')
        );
        
        const snapshot = await getDocs(fieldsQuery);
        this.ownedFields = [];
        
        snapshot.forEach(doc => {
            this.ownedFields.push({
                id: doc.id,
                ...doc.data()
            });
        });
    }

    async loadJoinRequests() {
        const fieldWorkersRef = collection(db, 'field_workers');
        const requestsQuery = query(
            fieldWorkersRef,
            where('status', '==', 'pending')
        );
        
        const snapshot = await getDocs(requestsQuery);
        this.joinRequests = [];
        
        // Get join requests for fields owned by this landowner
        for (const doc of snapshot.docs) {
            const requestData = doc.data();
            const fieldDoc = await getDoc(doc(db, 'fields', requestData.field_id));
            
            if (fieldDoc.exists()) {
                const fieldData = fieldDoc.data();
                if (fieldData.landowner_id === this.currentUser.uid) {
                    const userDoc = await getDoc(doc(db, 'users', requestData.user_uid));
                    const userData = userDoc.exists() ? userDoc.data() : {};
                    
                    this.joinRequests.push({
                        id: doc.id,
                        ...requestData,
                        field: fieldData,
                        user: userData
                    });
                }
            }
        }
    }

    updateDashboardStats() {
        // Update owned areas count
        document.getElementById('ownedAreasCount').textContent = this.ownedFields.length;
        
        // Update join requests count
        document.getElementById('joinRequestsCount').textContent = this.joinRequests.length;
        
        // Update total hectares
        const totalHectares = this.ownedFields.reduce((sum, field) => {
            return sum + (field.area_size || 0);
        }, 0);
        document.getElementById('totalHectares').textContent = totalHectares.toFixed(1);
        
        // Update active tasks (placeholder for now)
        document.getElementById('activeTasksCount').textContent = '8';
    }

    renderFields() {
        const fieldsList = document.getElementById('fieldsList');
        const noFieldsState = document.getElementById('noFieldsState');
        
        if (this.ownedFields.length === 0) {
            fieldsList.style.display = 'none';
            noFieldsState.style.display = 'block';
        } else {
            fieldsList.style.display = 'block';
            noFieldsState.style.display = 'none';
            
            fieldsList.innerHTML = this.ownedFields.map(field => this.renderFieldCard(field)).join('');
        }
    }

    renderFieldCard(field) {
        const statusClass = this.getStatusClass(field.status);
        const statusText = field.status ? field.status.charAt(0).toUpperCase() + field.status.slice(1) : 'Unknown';
        const plantedDate = field.planted_date ? this.formatDate(field.planted_date.toDate()) : 'Not set';
        
        return `
            <div class="bg-white rounded-lg shadow-sm p-6 card-hover cursor-pointer" 
                 onclick="landownerDashboard.viewFieldDetails('${field.id}')">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-900">${this.escapeHtml(field.field_name)}</h3>
                        <p class="text-sm text-gray-600">${this.escapeHtml(field.land_code || 'No land code')}</p>
                        <p class="text-sm text-gray-500">
                            ${this.escapeHtml(field.barangay)}, ${this.escapeHtml(field.municipality)}
                        </p>
                    </div>
                    <span class="bg-${statusClass} text-${statusClass} text-xs font-medium px-2.5 py-0.5 rounded-full">
                        ${statusText}
                    </span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                        <span class="text-gray-500">Size:</span>
                        <p class="font-medium">${field.area_size || 0} Hectares</p>
                    </div>
                    <div>
                        <span class="text-gray-500">Variety:</span>
                        <p class="font-medium">${this.escapeHtml(field.sugarcane_variety || 'Not specified')}</p>
                    </div>
                    <div>
                        <span class="text-gray-500">Planted:</span>
                        <p class="font-medium">${plantedDate}</p>
                    </div>
                    <div>
                        <span class="text-gray-500">Growth Stage:</span>
                        <p class="font-medium">Tillering</p>
                    </div>
                </div>
                
                <!-- Quick Actions -->
                <div class="flex space-x-2">
                    <button onclick="event.stopPropagation(); landownerDashboard.manageFieldTasks('${field.id}')" 
                            class="btn-secondary px-3 py-1 text-xs rounded">
                        Manage Tasks
                    </button>
                    <button onclick="event.stopPropagation(); landownerDashboard.viewFieldMembers('${field.id}')" 
                            class="btn-secondary px-3 py-1 text-xs rounded">
                        View Members
                    </button>
                </div>
            </div>
        `;
    }

    renderJoinRequests() {
        const joinRequestsSection = document.getElementById('joinRequestsSection');
        const joinRequestsList = document.getElementById('joinRequestsList');
        
        if (this.joinRequests.length === 0) {
            joinRequestsSection.style.display = 'none';
        } else {
            joinRequestsSection.style.display = 'block';
            joinRequestsList.innerHTML = this.joinRequests.map(request => this.renderJoinRequest(request)).join('');
        }
    }

    renderJoinRequest(request) {
        return `
            <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <p class="font-medium text-gray-900">${this.escapeHtml(request.user.full_name || 'Unknown User')}</p>
                        <p class="text-sm text-gray-600">${this.escapeHtml(request.user.email || 'No email')}</p>
                        <p class="text-sm text-gray-500">Field: ${this.escapeHtml(request.field.field_name)}</p>
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button onclick="landownerDashboard.handleJoinRequest('${request.id}', 'approved')" 
                            class="btn-primary px-3 py-1 text-xs rounded">
                        Confirm
                    </button>
                    <button onclick="landownerDashboard.handleJoinRequest('${request.id}', 'rejected')" 
                            class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs rounded">
                        Reject
                    </button>
                </div>
            </div>
        `;
    }

    renderGrowthTracker() {
        const growthTrackerList = document.getElementById('growthTrackerList');
        const recentFields = this.ownedFields.slice(0, 3);
        
        if (recentFields.length === 0) {
            growthTrackerList.innerHTML = '<p class="text-gray-500 text-sm">No fields to track</p>';
        } else {
            growthTrackerList.innerHTML = recentFields.map(field => this.renderGrowthTrackerItem(field)).join('');
        }
    }

    renderGrowthTrackerItem(field) {
        let daysSincePlanting = 'Planting date not set';
        let progressWidth = '0%';
        
        if (field.planted_date) {
            const plantedDate = field.planted_date.toDate();
            const days = Math.floor((Date.now() - plantedDate.getTime()) / (1000 * 60 * 60 * 24));
            daysSincePlanting = `${days} days since planting`;
            progressWidth = Math.min(45, Math.max(0, (days / 365) * 100)) + '%';
        }
        
        return `
            <div class="border-l-4 border-secondary pl-4">
                <p class="font-medium text-sm">${this.escapeHtml(field.field_name)}</p>
                <p class="text-xs text-gray-500 mb-2">${daysSincePlanting}</p>
                <div class="bg-gray-200 rounded-full h-2">
                    <div class="bg-secondary h-2 rounded-full" style="width: ${progressWidth}"></div>
                </div>
                <p class="text-xs text-gray-500 mt-1">Tillering Stage</p>
            </div>
        `;
    }

    getStatusClass(status) {
        const statusClasses = {
            'verified': 'green-100 text-green-800',
            'pending': 'yellow-100 text-yellow-800',
            'rejected': 'red-100 text-red-800'
        };
        return statusClasses[status] || 'gray-100 text-gray-800';
    }

    formatDate(date) {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showMessage(message, type) {
        // Simple alert for now, can be enhanced with a proper notification system
        alert(message);
    }

    // Navigation functions
    registerNewField() {
        window.location.href = 'Register-field.html';
    }

    viewFieldDetails(fieldId) {
        window.location.href = `field-details.html?id=${fieldId}`;
    }

    manageFieldTasks(fieldId) {
        window.location.href = `field-tasks.html?field_id=${fieldId}`;
    }

    viewFieldMembers(fieldId) {
        window.location.href = `field-members.html?field_id=${fieldId}`;
    }

    async handleJoinRequest(requestId, action) {
        if (confirm(`Are you sure you want to ${action} this join request?`)) {
            try {
                const requestRef = doc(db, 'field_workers', requestId);
                await updateDoc(requestRef, {
                    status: action === 'approved' ? 'approved' : 'rejected',
                    updated_at: new Date()
                });
                
                this.showMessage(`Join request ${action} successfully!`);
                await this.loadDashboardData(); // Refresh data
            } catch (error) {
                console.error('Error updating join request:', error);
                this.showMessage('Error updating join request. Please try again.', 'error');
            }
        }
    }

    // Report generation functions (placeholders)
    generateWeeklyReport() {
        alert('Generating weekly report...');
        // TODO: Implement actual report generation
    }

    generateMonthlyReport() {
        alert('Generating monthly report...');
        // TODO: Implement actual report generation
    }

    generateTaskReport() {
        alert('Generating task completion report...');
        // TODO: Implement actual report generation
    }

    async logout() {
        try {
            await signOut(auth);
            window.location.href = 'farmers_login.html';
        } catch (error) {
            console.error('Error signing out:', error);
            alert('Error signing out. Please try again.');
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
    
    // Initialize landowner dashboard
    window.landownerDashboard = new LandownerDashboard();
});

// Global functions for onclick handlers
window.registerNewField = () => window.landownerDashboard?.registerNewField();
window.viewFieldDetails = (fieldId) => window.landownerDashboard?.viewFieldDetails(fieldId);
window.manageFieldTasks = (fieldId) => window.landownerDashboard?.manageFieldTasks(fieldId);
window.viewFieldMembers = (fieldId) => window.landownerDashboard?.viewFieldMembers(fieldId);
window.handleJoinRequest = (requestId, action) => window.landownerDashboard?.handleJoinRequest(requestId, action);
window.generateWeeklyReport = () => window.landownerDashboard?.generateWeeklyReport();
window.generateMonthlyReport = () => window.landownerDashboard?.generateMonthlyReport();
window.generateTaskReport = () => window.landownerDashboard?.generateTaskReport();
window.logout = () => window.landownerDashboard?.logout();

// User menu toggle
window.toggleUserMenu = () => {
    const menu = document.getElementById('userMenu');
    menu.classList.toggle('hidden');
};

// Close user menu when clicking outside
document.addEventListener('click', function(event) {
    const menu = document.getElementById('userMenu');
    const button = event.target.closest('button');
    
    if (!button || !button.onclick || button.onclick.toString().indexOf('toggleUserMenu') === -1) {
        menu.classList.add('hidden');
    }
});
