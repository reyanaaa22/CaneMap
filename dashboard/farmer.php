<?php
session_start();
require_once '../config/database.php';

// Check if user is logged in and is a farmer
if (!isset($_SESSION['user_id']) || $_SESSION['user_role'] !== 'farmer') {
    header("Location: ../auth/login.php");
    exit();
}

$page_title = "Farmer Dashboard";
$database = new Database();
$db = $database->getConnection();

// Get farmer's joined fields
$fields_query = "SELECT f.*, fm.status as join_status, u.full_name as landowner_name 
                FROM field_members fm 
                JOIN fields f ON fm.field_id = f.id 
                LEFT JOIN users u ON f.landowner_id = u.id 
                WHERE fm.farmer_id = :farmer_id AND fm.status = 'confirmed'";
$fields_stmt = $db->prepare($fields_query);
$fields_stmt->bindParam(':farmer_id', $_SESSION['user_id']);
$fields_stmt->execute();
$joined_fields = $fields_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get pending join requests
$pending_query = "SELECT f.field_name, fm.joined_at 
                 FROM field_members fm 
                 JOIN fields f ON fm.field_id = f.id 
                 WHERE fm.farmer_id = :farmer_id AND fm.status = 'pending'";
$pending_stmt = $db->prepare($pending_query);
$pending_stmt->bindParam(':farmer_id', $_SESSION['user_id']);
$pending_stmt->execute();
$pending_requests = $pending_stmt->fetchAll(PDO::FETCH_ASSOC);

include '../includes/header.php';
?>

<div class="min-h-screen bg-gray-50">
    <!-- Navigation Header -->
    <nav class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center">
                    <a href="lobby.php" class="text-2xl font-bold text-primary">🌾 CaneMap</a>
                    <div class="ml-4 text-sm text-gray-500">Farmer Dashboard</div>
                </div>
                
                <div class="flex items-center space-x-4">
                    <div class="flex items-center space-x-3">
                        <span class="text-sm text-gray-700">Welcome, <?php echo htmlspecialchars($_SESSION['user_name']); ?></span>
                        <div class="relative">
                            <button onclick="toggleUserMenu()" class="bg-primary text-white p-2 rounded-full">
                                <i data-lucide="user" class="w-4 h-4"></i>
                            </button>
                            <div id="userMenu" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
                                <a href="../auth/change-password.php" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Change Password</a>
                                <a href="../auth/logout.php" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Logout</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </nav>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Dashboard Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-primary rounded-lg">
                        <i data-lucide="map-pin" class="w-6 h-6 text-white"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Joined Fields</p>
                        <p class="text-2xl font-semibold text-gray-900"><?php echo count($joined_fields); ?></p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-secondary rounded-lg">
                        <i data-lucide="clock" class="w-6 h-6 text-primary"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Pending Requests</p>
                        <p class="text-2xl font-semibold text-gray-900"><?php echo count($pending_requests); ?></p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-green-100 rounded-lg">
                        <i data-lucide="check-circle" class="w-6 h-6 text-green-600"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Tasks Completed</p>
                        <p class="text-2xl font-semibold text-gray-900">12</p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-yellow-100 rounded-lg">
                        <i data-lucide="alert-circle" class="w-6 h-6 text-yellow-600"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Pending Tasks</p>
                        <p class="text-2xl font-semibold text-gray-900">3</p>
                    </div>
                </div>
            </div>
        </div>

        <?php if (count($joined_fields) === 0): ?>
            <!-- No Fields Joined -->
            <div class="bg-white rounded-lg shadow-sm p-8 text-center">
                <div class="text-6xl mb-4">🌾</div>
                <h3 class="text-xl font-semibold text-gray-900 mb-2">No Fields Joined Yet</h3>
                <p class="text-gray-600 mb-6">Start by joining a field to begin tracking your farming activities.</p>
                <a href="lobby.php" class="btn-primary px-6 py-3 rounded-lg">
                    <i data-lucide="search" class="w-4 h-4 inline mr-2"></i>
                    Browse Available Fields
                </a>
            </div>
        <?php else: ?>
            <!-- Fields Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- My Fields -->
                <div class="space-y-6">
                    <h2 class="text-xl font-semibold text-gray-900">My Fields</h2>
                    
                    <?php foreach ($joined_fields as $field): ?>
                        <div class="bg-white rounded-lg shadow-sm p-6 card-hover cursor-pointer" 
                             onclick="viewFieldTasks(<?php echo $field['id']; ?>)">
                            <div class="flex items-start justify-between mb-4">
                                <div>
                                    <h3 class="text-lg font-semibold text-gray-900"><?php echo htmlspecialchars($field['field_name']); ?></h3>
                                    <p class="text-sm text-gray-600"><?php echo htmlspecialchars($field['land_code']); ?></p>
                                    <p class="text-sm text-gray-500">
                                        Owner: <?php echo htmlspecialchars($field['landowner_name']); ?>
                                    </p>
                                </div>
                                <span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                    Active
                                </span>
                            </div>
                            
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span class="text-gray-500">Location:</span>
                                    <p class="font-medium"><?php echo htmlspecialchars($field['barangay']); ?></p>
                                </div>
                                <div>
                                    <span class="text-gray-500">Size:</span>
                                    <p class="font-medium"><?php echo $field['size_hectares']; ?> Ha</p>
                                </div>
                                <div>
                                    <span class="text-gray-500">Variety:</span>
                                    <p class="font-medium"><?php echo htmlspecialchars($field['sugarcane_variety']); ?></p>
                                </div>
                                <div>
                                    <span class="text-gray-500">Planted:</span>
                                    <p class="font-medium"><?php echo date('M d, Y', strtotime($field['planted_date'])); ?></p>
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
                    <?php endforeach; ?>
                </div>

                <!-- Tasks and Activities -->
                <div class="space-y-6">
                    <div class="flex items-center justify-between">
                        <h2 class="text-xl font-semibold text-gray-900">Recent Activities</h2>
                        <button onclick="showAllTasks()" class="text-primary hover:text-green-700 text-sm font-medium">
                            View All Tasks
                        </button>
                    </div>
                    
                    <!-- Task List -->
                    <div class="bg-white rounded-lg shadow-sm">
                        <div class="p-6">
                            <div class="space-y-4">
                                <!-- Sample Task 1 -->
                                <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                                    <div class="flex items-center space-x-3">
                                        <div class="w-3 h-3 bg-yellow-400 rounded-full"></div>
                                        <div>
                                            <p class="font-medium text-gray-900">Fertilization</p>
                                            <p class="text-sm text-gray-500">Field: Sample Field 1</p>
                                            <p class="text-xs text-gray-400">Due: Today</p>
                                        </div>
                                    </div>
                                    <button onclick="logTask(1)" class="btn-primary px-4 py-2 text-sm rounded-lg">
                                        Log Task
                                    </button>
                                </div>

                                <!-- Sample Task 2 -->
                                <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                                    <div class="flex items-center space-x-3">
                                        <div class="w-3 h-3 bg-green-400 rounded-full"></div>
                                        <div>
                                            <p class="font-medium text-gray-900">Weeding</p>
                                            <p class="text-sm text-gray-500">Field: Sample Field 2</p>
                                            <p class="text-xs text-gray-400">Completed yesterday</p>
                                        </div>
                                    </div>
                                    <span class="text-green-600 text-sm font-medium">✓ Done</span>
                                </div>

                                <!-- Sample Task 3 -->
                                <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                                    <div class="flex items-center space-x-3">
                                        <div class="w-3 h-3 bg-red-400 rounded-full"></div>
                                        <div>
                                            <p class="font-medium text-gray-900">Irrigation Check</p>
                                            <p class="text-sm text-gray-500">Field: Sample Field 1</p>
                                            <p class="text-xs text-red-500">Overdue by 1 day</p>
                                        </div>
                                    </div>
                                    <button onclick="logTask(3)" class="btn-primary px-4 py-2 text-sm rounded-lg">
                                        Log Task
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Notifications -->
                    <?php if (count($pending_requests) > 0): ?>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">Notifications</h3>
                            <div class="space-y-3">
                                <?php foreach ($pending_requests as $request): ?>
                                    <div class="flex items-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                        <i data-lucide="clock" class="w-5 h-5 text-yellow-600 mr-3"></i>
                                        <div>
                                            <p class="text-sm font-medium text-yellow-800">
                                                Join request pending for <?php echo htmlspecialchars($request['field_name']); ?>
                                            </p>
                                            <p class="text-xs text-yellow-600">
                                                Submitted <?php echo date('M d, Y', strtotime($request['joined_at'])); ?>
                                            </p>
                                        </div>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        <?php endif; ?>
    </div>
</div>

<!-- Task Logging Modal -->
<div id="taskModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
    <div class="bg-white rounded-lg max-w-md w-full mx-4">
        <div class="p-6">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-semibold text-gray-900">Log Task</h3>
                <button onclick="closeTaskModal()" class="text-gray-400 hover:text-gray-600">
                    <i data-lucide="x" class="w-6 h-6"></i>
                </button>
            </div>
            
            <form id="taskLogForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Farmer Name</label>
                    <input type="text" value="<?php echo htmlspecialchars($_SESSION['user_name']); ?>" 
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" readonly>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Field Photo</label>
                    <button type="button" onclick="captureFieldPhoto()" 
                            class="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary hover:text-primary transition-colors">
                        <i data-lucide="camera" class="w-5 h-5 inline mr-2"></i>
                        Take Field Photo
                    </button>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Selfie</label>
                    <button type="button" onclick="captureSelfie()" 
                            class="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary hover:text-primary transition-colors">
                        <i data-lucide="user" class="w-5 h-5 inline mr-2"></i>
                        Take Selfie
                    </button>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea rows="3" placeholder="Brief description of work done..."
                              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"></textarea>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary">
                        <option value="done">✓ Done</option>
                        <option value="in_progress">⏳ In Progress</option>
                        <option value="not_done">❌ Not Yet Done</option>
                    </select>
                </div>
                
                <div class="flex space-x-3 pt-4">
                    <button type="submit" class="flex-1 btn-primary py-3 rounded-lg">
                        Submit Log
                    </button>
                    <button type="button" onclick="closeTaskModal()" class="flex-1 btn-secondary py-3 rounded-lg">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
function viewFieldTasks(fieldId) {
    window.location.href = `field-tasks.php?field_id=${fieldId}`;
}

function logTask(taskId) {
    document.getElementById('taskModal').classList.remove('hidden');
    document.getElementById('taskModal').classList.add('flex');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.add('hidden');
    document.getElementById('taskModal').classList.remove('flex');
}

function captureFieldPhoto() {
    // In a real application, this would open camera
    alert('Camera would open to capture field photo');
}

function captureSelfie() {
    // In a real application, this would open camera for selfie
    alert('Camera would open to capture selfie');
}

function showAllTasks() {
    window.location.href = 'tasks.php';
}

function toggleUserMenu() {
    const menu = document.getElementById('userMenu');
    menu.classList.toggle('hidden');
}

// Close user menu when clicking outside
document.addEventListener('click', function(event) {
    const menu = document.getElementById('userMenu');
    const button = event.target.closest('button');
    
    if (!button || !button.onclick || button.onclick.toString().indexOf('toggleUserMenu') === -1) {
        menu.classList.add('hidden');
    }
});

// Handle task log form submission
document.getElementById('taskLogForm').addEventListener('submit', function(e) {
    e.preventDefault();
    // In a real application, submit via AJAX
    alert('Task logged successfully!');
    closeTaskModal();
});
</script>

<?php include '../includes/footer.php'; ?>