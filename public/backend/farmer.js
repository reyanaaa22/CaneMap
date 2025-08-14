// Farmer Dashboard functionality
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    getDocs, 
    addDoc, 
    doc, 
    getDoc,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

class FarmerDashboard {
    constructor() {
        this.currentUser = null;
        this.userData = null;
        this.joinedFields = [];
        this.pendingRequests = [];
        this.recentTasks = [];
        
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
        if (!this.userData || this.userData.role !== 'farmer') {
            alert('Access denied. This page is for farmers only.');
            window.location.href = 'farmers_login.html';
            return;
        }

        // Load dashboard data
        await this.loadDashboardData();
    }

    updateUserName() {
        const userNameElement = document.getElementById('userName');
        const farmerNameInput = document.getElementById('farmerNameInput');
        
        if (this.userData && this.userData.full_name) {
            userNameElement.textContent = `Welcome, ${this.userData.full_name}`;
            farmerNameInput.value = this.userData.full_name;
        }
    }

    async loadDashboardData() {
        try {
            await Promise.all([
                this.loadJoinedFields(),
                this.loadPendingRequests(),
                this.loadRecentTasks()
            ]);
            
            this.updateDashboardStats();
            this.renderDashboard();
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showMessage('Error loading dashboard data. Please refresh the page.', 'error');
        }
    }

    async loadJoinedFields() {
        const fieldWorkersRef = collection(db, 'field_workers');
        const fieldsQuery = query(
            fieldWorkersRef,
            where('user_uid', '==', this.currentUser.uid),
            where('status', '==', 'approved')
        );
        
        const snapshot = await getDocs(fieldsQuery);
        this.joinedFields = [];
        
        for (const doc of snapshot.docs) {
            const workerData = doc.data();
            const fieldDoc = await getDoc(doc(db, 'fields', workerData.field_id));
            
            if (fieldDoc.exists()) {
                const fieldData = fieldDoc.data();
                const landownerDoc = await getDoc(doc(db, 'users', fieldData.landowner_id));
                const landownerData = landownerDoc.exists() ? landownerDoc.data() : {};
                
                this.joinedFields.push({
                    id: fieldDoc.id,
                    ...fieldData,
                    landowner_name: landownerData.full_name || 'Unknown Owner',
                    join_status: workerData.status
                });
            }
        }
    }

    async loadPendingRequests() {
        const fieldWorkersRef = collection(db, 'field_workers');
        const requestsQuery = query(
            fieldWorkersRef,
            where('user_uid', '==', this.currentUser.uid),
            where('status', '==', 'pending')
        );
        
        const snapshot = await getDocs(requestsQuery);
        this.pendingRequests = [];
        
        for (const doc of snapshot.docs) {
            const requestData = doc.data();
            const fieldDoc = await getDoc(doc(db, 'fields', requestData.field_id));
            
            if (fieldDoc.exists()) {
                const fieldData = fieldDoc.data();
                this.pendingRequests.push({
                    id: doc.id,
                    field_name: fieldData.field_name,
                    joined_at: requestData.requested_at
                });
            }
        }
    }

    async loadRecentTasks() {
        // For now, we'll use sample data. In a real app, you'd query task_logs collection
        this.recentTasks = [
            {
                id: 1,
                type: 'Fertilization',
                field_name: 'Sample Field 1',
                status: 'pending',
                due_date: new Date(),
                overdue: false
            },
            {
                id: 2,
                type: 'Weeding',
                field_name: 'Sample Field 2',
                status: 'completed',
                completed_date: new Date(Date.now() - 24 * 60 * 60 * 1000)
            },
            {
                id: 3,
                type: 'Irrigation Check',
                field_name: 'Sample Field 1',
                status: 'overdue',
                due_date: new Date(Date.now() - 24 * 60 * 60 * 1000),
                overdue: true
            }
        ];
    }

    updateDashboardStats() {
        // Update joined fields count
        document.getElementById('joinedFieldsCount').textContent = this.joinedFields.length;
        
        // Update pending requests count
        document.getElementById('pendingRequestsCount').textContent = this.pendingRequests.length;
        
        // Update tasks completed count
        const completedTasks = this.recentTasks.filter(task => task.status === 'completed').length;
        document.getElementById('tasksCompletedCount').textContent = completedTasks;
        
        // Update pending tasks count
        const pendingTasks = this.recentTasks.filter(task => task.status === 'pending' || task.status === 'overdue').length;
        document.getElementById('pendingTasksCount').textContent = pendingTasks;
    }

    renderDashboard() {
        if (this.joinedFields.length === 0) {
            this.showNoFieldsState();
        } else {
            this.showFieldsGrid();
            this.renderJoinedFields();
            this.renderRecentTasks();
            this.renderNotifications();
        }
    }

    showNoFieldsState() {
        document.getElementById('noFieldsState').style.display = 'block';
        document.getElementById('fieldsGrid').style.display = 'none';
    }

    showFieldsGrid() {
        document.getElementById('noFieldsState').style.display = 'none';
        document.getElementById('fieldsGrid').style.display = 'grid';
    }

    renderJoinedFields() {
        const joinedFieldsList = document.getElementById('joinedFieldsList');
        joinedFieldsList.innerHTML = this.joinedFields.map(field => this.renderFieldCard(field)).join('');
    }

    renderFieldCard(field) {
        const plantedDate = field.planted_date ? this.formatDate(field.planted_date.toDate()) : 'Not set';
        
        return `
            <div class="bg-white rounded-lg shadow-sm p-6 card-hover cursor-pointer" 
                 onclick="farmerDashboard.viewFieldTasks('${field.id}')">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-900">${this.escapeHtml(field.field_name)}</h3>
                        <p class="text-sm text-gray-600">${this.escapeHtml(field.land_code || 'No land code')}</p>
                        <p class="text-sm text-gray-500">
                            Owner: ${this.escapeHtml(field.landowner_name)}
                        </p>
                    </div>
                    <span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                        Active
                    </span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-500">Location:</span>
                        <p class="font-medium">${this.escapeHtml(field.barangay)}</p>
                    </div>
                    <div>
                        <span class="text-gray-500">Size:</span>
                        <p class="font-medium">${field.area_size || 0} Ha</p>
                    </div>
                    <div>
                        <span class="text-gray-500">Variety:</span>
                        <p class="font-medium">${this.escapeHtml(field.sugarcane_variety || 'Not specified')}</p>
                    </div>
                    <div>
                        <span class="text-gray-500">Planted:</span>
                        <p class="font-medium">${plantedDate}</p>
                    </div>
                </div>
                
                <!-- Growth Progress -->
                <div class="mt-4">
                    <div class="flex items-center justify-between text-sm mb-1">
                        <span class="text-gray-500">Growth Progress</span>
                        <span class="font-medium">Tillering Stage</span>
                    </div>
                    <div class="bg-gray-200 rounded-full h-2">
                        <div class="bg-secondary h-2 rounded-full" style="width: 45%"></div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRecentTasks() {
        const recentTasksList = document.getElementById('recentTasksList');
        recentTasksList.innerHTML = this.recentTasks.map(task => this.renderTaskItem(task)).join('');
    }

    renderTaskItem(task) {
        const statusColor = task.status === 'completed' ? 'green' : 
                           task.status === 'overdue' ? 'red' : 'yellow';
        const statusText = task.status === 'completed' ? '✓ Done' : 
                          task.status === 'overdue' ? 'Overdue' : 'Pending';
        const dueText = task.status === 'completed' ? 
                       `Completed ${this.formatDate(task.completed_date)}` :
                       task.overdue ? `Overdue by ${Math.abs(this.getDaysDifference(task.due_date))} day(s)` :
                       `Due: ${this.formatDate(task.due_date)}`;
        
        return `
            <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div class="flex items-center space-x-3">
                    <div class="w-3 h-3 bg-${statusColor}-400 rounded-full"></div>
                    <div>
                        <p class="font-medium text-gray-900">${this.escapeHtml(task.type)}</p>
                        <p class="text-sm text-gray-500">Field: ${this.escapeHtml(task.field_name)}</p>
                        <p class="text-xs ${task.overdue ? 'text-red-500' : 'text-gray-400'}">${dueText}</p>
                    </div>
                </div>
                ${task.status === 'completed' ? 
                    `<span class="text-green-600 text-sm font-medium">${statusText}</span>` :
                    `<button onclick="farmerDashboard.logTask('${task.id}')" class="btn-primary px-4 py-2 text-sm rounded-lg">
                        Log Task
                    </button>`
                }
            </div>
        `;
    }

    renderNotifications() {
        const notificationsSection = document.getElementById('notificationsSection');
        const notificationsList = document.getElementById('notificationsList');
        
        if (this.pendingRequests.length === 0) {
            notificationsSection.style.display = 'none';
        } else {
            notificationsSection.style.display = 'block';
            notificationsList.innerHTML = this.pendingRequests.map(request => this.renderNotification(request)).join('');
        }
    }

    renderNotification(request) {
        const submittedDate = request.joined_at ? this.formatDate(request.joined_at.toDate()) : 'Unknown date';
        
        return `
            <div class="flex items-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <i data-lucide="clock" class="w-5 h-5 text-yellow-600 mr-3"></i>
                <div>
                    <p class="text-sm font-medium text-yellow-800">
                        Join request pending for ${this.escapeHtml(request.field_name)}
                    </p>
                    <p class="text-xs text-yellow-600">
                        Submitted ${submittedDate}
                    </p>
                </div>
            </div>
        `;
    }

    formatDate(date) {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    getDaysDifference(date) {
        const now = new Date();
        const diffTime = now - date;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
    viewFieldTasks(fieldId) {
        window.location.href = `field-tasks.html?field_id=${fieldId}`;
    }

    showAllTasks() {
        window.location.href = 'tasks.html';
    }

    // Task logging functions
    logTask(taskId) {
        // Populate field select with joined fields
        const fieldSelect = document.getElementById('fieldSelect');
        fieldSelect.innerHTML = '<option value="">Select a field</option>';
        
        this.joinedFields.forEach(field => {
            const option = document.createElement('option');
            option.value = field.id;
            option.textContent = field.field_name;
            fieldSelect.appendChild(option);
        });
        
        // Show modal
        document.getElementById('taskModal').classList.remove('hidden');
        document.getElementById('taskModal').classList.add('flex');
    }

    closeTaskModal() {
        document.getElementById('taskModal').classList.add('hidden');
        document.getElementById('taskModal').classList.remove('flex');
        
        // Reset form
        document.getElementById('taskLogForm').reset();
        document.getElementById('fieldPhotoInput').value = '';
        document.getElementById('selfieInput').value = '';
    }

    captureFieldPhoto() {
        // In a real application, this would open camera
        alert('Camera would open to capture field photo');
        // For demo purposes, set a placeholder value
        document.getElementById('fieldPhotoInput').value = 'field_photo_placeholder.jpg';
    }

    captureSelfie() {
        // In a real application, this would open camera for selfie
        alert('Camera would open to capture selfie');
        // For demo purposes, set a placeholder value
        document.getElementById('selfieInput').value = 'selfie_placeholder.jpg';
    }

    async submitTaskLog(formData) {
        try {
            // Add task log to Firestore
            const taskLogData = {
                user_uid: this.currentUser.uid,
                field_id: formData.field_id,
                task_type: formData.task_type,
                description: formData.description,
                status: formData.status,
                field_photo_path: formData.field_photo_path,
                selfie_path: formData.selfie_path,
                logged_at: serverTimestamp()
            };
            
            await addDoc(collection(db, 'task_logs'), taskLogData);
            
            this.showMessage('Task logged successfully!');
            this.closeTaskModal();
            
            // Refresh dashboard data
            await this.loadDashboardData();
        } catch (error) {
            console.error('Error submitting task log:', error);
            this.showMessage('Error submitting task log. Please try again.', 'error');
        }
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
    
    // Initialize farmer dashboard
    window.farmerDashboard = new FarmerDashboard();
});

// Global functions for onclick handlers
window.viewFieldTasks = (fieldId) => window.farmerDashboard?.viewFieldTasks(fieldId);
window.logTask = (taskId) => window.farmerDashboard?.logTask(taskId);
window.closeTaskModal = () => window.farmerDashboard?.closeTaskModal();
window.captureFieldPhoto = () => window.farmerDashboard?.captureFieldPhoto();
window.captureSelfie = () => window.farmerDashboard?.captureSelfie();
window.showAllTasks = () => window.farmerDashboard?.showAllTasks();
window.logout = () => window.farmerDashboard?.logout();

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

// Handle task log form submission
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('taskLogForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = {
            field_id: document.getElementById('fieldSelect').value,
            task_type: document.getElementById('taskTypeSelect').value,
            description: document.getElementById('taskDescription').value,
            status: document.getElementById('taskStatusSelect').value,
            field_photo_path: document.getElementById('fieldPhotoInput').value,
            selfie_path: document.getElementById('selfieInput').value
        };
        
        if (!formData.field_id) {
            alert('Please select a field');
            return;
        }
        
        await window.farmerDashboard?.submitTaskLog(formData);
    });
});
