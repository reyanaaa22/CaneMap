<?php
session_start();
require_once '../config/database.php';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    header('Location: ../auth/login.php');
    exit();
}

$page_title = "Lobby Dashboard";

// Get user information
$database = new Database();
$db = $database->getConnection();

$user_id = $_SESSION['user_id'];
$user_query = "SELECT * FROM users WHERE id = :user_id";
$user_stmt = $db->prepare($user_query);
$user_stmt->bindParam(':user_id', $user_id);
$user_stmt->execute();
$user = $user_stmt->fetch(PDO::FETCH_ASSOC);

// Get user's fields (as owner)
$owned_fields_query = "SELECT * FROM fields WHERE registered_by = :user_id ORDER BY created_at DESC";
$owned_fields_stmt = $db->prepare($owned_fields_query);
$owned_fields_stmt->bindParam(':user_id', $user_id);
$owned_fields_stmt->execute();
$owned_fields = $owned_fields_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get fields where user is a worker
$worker_fields_query = "SELECT f.*, fw.status as worker_status 
                       FROM fields f 
                       JOIN field_workers fw ON f.id = fw.field_id 
                       WHERE fw.user_id = :user_id 
                       ORDER BY fw.requested_at DESC";
$worker_fields_stmt = $db->prepare($worker_fields_query);
$worker_fields_stmt->bindParam(':user_id', $user_id);
$worker_fields_stmt->execute();
$worker_fields = $worker_fields_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get all active fields for map display
$active_fields_query = "SELECT f.*, u.full_name as owner_name 
          FROM fields f 
                       JOIN users u ON f.registered_by = u.id 
                       WHERE f.status = 'active' OR f.status = 'sra_reviewed'
          ORDER BY f.created_at DESC";
$active_fields_stmt = $db->prepare($active_fields_query);
$active_fields_stmt->execute();
$active_fields = $active_fields_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get notifications
$notifications_query = "SELECT * FROM notifications 
                       WHERE user_id = :user_id 
                       ORDER BY created_at DESC 
                       LIMIT 10";
$notifications_stmt = $db->prepare($notifications_query);
$notifications_stmt->bindParam(':user_id', $user_id);
$notifications_stmt->execute();
$notifications = $notifications_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get unread notification count
$unread_query = "SELECT COUNT(*) as count FROM notifications 
                 WHERE user_id = :user_id AND is_read = 0";
$unread_stmt = $db->prepare($unread_query);
$unread_stmt->bindParam(':user_id', $user_id);
$unread_stmt->execute();
$unread_count = $unread_stmt->fetch(PDO::FETCH_ASSOC)['count'];

include '../includes/header.php';
?>

<div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center py-4">
                <div class="flex items-center">
                    <div class="text-2xl mr-3">🌾</div>
                    <h1 class="text-xl font-semibold text-gray-900">CaneMap</h1>
                </div>
                
                <div class="flex items-center space-x-4">
                    <!-- Notifications -->
                    <div class="relative">
                        <button id="notificationBtn" class="p-2 text-gray-400 hover:text-gray-600 relative">
                            <i data-lucide="bell" class="w-5 h-5"></i>
                            <?php if ($unread_count > 0): ?>
                                <span class="notification-badge"><?php echo $unread_count; ?></span>
                            <?php endif; ?>
                            </button>
                        
                        <!-- Notification Dropdown -->
                        <div id="notificationDropdown" class="hidden absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
                            <div class="p-4">
                                <h3 class="text-lg font-semibold mb-3">Notifications</h3>
                                <div class="max-h-64 overflow-y-auto custom-scrollbar">
                                    <?php if (empty($notifications)): ?>
                                        <p class="text-gray-500 text-sm">No notifications</p>
                    <?php else: ?>
                                        <?php foreach ($notifications as $notification): ?>
                                            <div class="border-b border-gray-100 py-2 last:border-b-0">
                                                <div class="flex items-start">
                                                    <div class="flex-shrink-0">
                                                        <div class="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        </div>
                                                    <div class="ml-3 flex-1">
                                                        <p class="text-sm font-medium text-gray-900"><?php echo htmlspecialchars($notification['title']); ?></p>
                                                        <p class="text-sm text-gray-500"><?php echo htmlspecialchars($notification['message']); ?></p>
                                                        <p class="text-xs text-gray-400 mt-1"><?php echo date('M j, Y g:i A', strtotime($notification['created_at'])); ?></p>
                </div>
            </div>
        </div>
                                        <?php endforeach; ?>
                                    <?php endif; ?>
                </div>
            </div>
        </div>
                    </div>
                    
                    <!-- User Menu -->
                    <div class="relative">
                        <button id="userMenuBtn" class="flex items-center space-x-2 text-gray-700 hover:text-gray-900">
                            <div class="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm font-semibold">
                                <?php echo strtoupper(substr($user['full_name'], 0, 1)); ?>
                        </div>
                            <span class="hidden md:block"><?php echo htmlspecialchars($user['full_name']); ?></span>
                            <i data-lucide="chevron-down" class="w-4 h-4"></i>
                        </button>
                        
                        <!-- User Dropdown -->
                        <div id="userDropdown" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-50">
                            <div class="py-1">
                                <a href="profile.php" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Profile</a>
                                <a href="../auth/logout.php" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Sign Out</a>
                        </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Welcome Section -->
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-2">Welcome back, <?php echo htmlspecialchars($user['full_name']); ?>!</h2>
            <p class="text-gray-600">Manage your sugarcane fields and track your farming activities.</p>
                                    </div>
                                    
        <!-- Quick Actions -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <a href="register-field.php" class="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mr-4">
                        <i data-lucide="plus" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <h3 class="font-semibold text-gray-900">Register a Field</h3>
                        <p class="text-sm text-gray-600">Add your sugarcane field to the system</p>
                                </div>
                            </div>
            </a>
            
            <a href="join-field.php" class="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center mr-4">
                        <i data-lucide="users" class="w-6 h-6 text-primary"></i>
                    </div>
                    <div>
                        <h3 class="font-semibold text-gray-900">Join a Field</h3>
                        <p class="text-sm text-gray-600">Work on existing sugarcane fields</p>
                    </div>
                </div>
            </a>
            
            <a href="reports.php" class="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center mr-4">
                        <i data-lucide="file-text" class="w-6 h-6 text-white"></i>
                                </div>
                    <div>
                        <h3 class="font-semibold text-gray-900">Submit Reports</h3>
                        <p class="text-sm text-gray-600">Cost and production reports</p>
                    </div>
            </div>
            </a>
</div>

        <!-- Map View -->
        <div class="bg-white rounded-lg shadow-sm border mb-8">
            <div class="p-6 border-b">
                <h3 class="text-lg font-semibold text-gray-900">Field Map</h3>
                <p class="text-sm text-gray-600">View all active sugarcane fields in your area</p>
            </div>
            <div class="p-6">
                <div id="fieldMap" class="map-container"></div>
    </div>
</div>

        <!-- My Fields Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Owned Fields -->
            <div class="bg-white rounded-lg shadow-sm border">
                <div class="p-6 border-b">
                    <h3 class="text-lg font-semibold text-gray-900">My Fields</h3>
                    <p class="text-sm text-gray-600">Fields you've registered</p>
                </div>
                <div class="p-6">
                    <?php if (empty($owned_fields)): ?>
                        <div class="text-center py-8">
                            <div class="text-gray-400 mb-4">
                                <i data-lucide="map-pin" class="w-12 h-12 mx-auto"></i>
                            </div>
                            <p class="text-gray-500 mb-4">You haven't registered any fields yet.</p>
                            <a href="register-field.php" class="btn-primary px-4 py-2 rounded-md text-sm">Register Your First Field</a>
                        </div>
                    <?php else: ?>
                        <div class="space-y-4">
                            <?php foreach ($owned_fields as $field): ?>
                                <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                    <div class="flex justify-between items-start">
                <div>
                                            <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($field['field_name']); ?></h4>
                                            <p class="text-sm text-gray-600"><?php echo htmlspecialchars($field['barangay']); ?>, <?php echo htmlspecialchars($field['municipality']); ?></p>
                                            <p class="text-sm text-gray-600"><?php echo $field['area_size']; ?> hectares</p>
                                        </div>
                                        <div class="text-right">
                                            <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full status-<?php echo $field['status']; ?>">
                                                <?php echo ucfirst(str_replace('_', ' ', $field['status'])); ?>
                                            </span>
                                        </div>
                </div>
                                    <div class="mt-3 flex space-x-2">
                                        <a href="field-details.php?id=<?php echo $field['id']; ?>" class="text-sm text-blue-600 hover:text-blue-800">View Details</a>
                                        <a href="field-management.php?id=<?php echo $field['id']; ?>" class="text-sm text-green-600 hover:text-green-800">Manage</a>
                </div>
                </div>
                            <?php endforeach; ?>
                </div>
                    <?php endif; ?>
                </div>
            </div>
            
            <!-- Joined Fields -->
            <div class="bg-white rounded-lg shadow-sm border">
                <div class="p-6 border-b">
                    <h3 class="text-lg font-semibold text-gray-900">Joined Fields</h3>
                    <p class="text-sm text-gray-600">Fields where you work as a laborer</p>
                </div>
                <div class="p-6">
                    <?php if (empty($worker_fields)): ?>
                        <div class="text-center py-8">
                            <div class="text-gray-400 mb-4">
                                <i data-lucide="users" class="w-12 h-12 mx-auto"></i>
                            </div>
                            <p class="text-gray-500 mb-4">You haven't joined any fields yet.</p>
                            <a href="join-field.php" class="btn-primary px-4 py-2 rounded-md text-sm">Join a Field</a>
                        </div>
                    <?php else: ?>
                        <div class="space-y-4">
                            <?php foreach ($worker_fields as $field): ?>
                                <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                    <div class="flex justify-between items-start">
                                        <div>
                                            <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($field['field_name']); ?></h4>
                                            <p class="text-sm text-gray-600"><?php echo htmlspecialchars($field['barangay']); ?>, <?php echo htmlspecialchars($field['municipality']); ?></p>
                                            <p class="text-sm text-gray-600">Owner: <?php echo htmlspecialchars($field['owner_name']); ?></p>
                                        </div>
                                        <div class="text-right">
                                            <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full status-<?php echo $field['worker_status']; ?>">
                                                <?php echo ucfirst(str_replace('_', ' ', $field['worker_status'])); ?>
                                            </span>
                                        </div>
                                    </div>
                                    <div class="mt-3 flex space-x-2">
                                        <a href="field-details.php?id=<?php echo $field['id']; ?>" class="text-sm text-blue-600 hover:text-blue-800">View Details</a>
                                        <a href="task-logging.php?field_id=<?php echo $field['id']; ?>" class="text-sm text-green-600 hover:text-green-800">Log Tasks</a>
                                    </div>
                                </div>
                            <?php endforeach; ?>
            </div>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </main>
</div>

<script>
// Initialize Lucide icons
lucide.createIcons();

// Notification dropdown
const notificationBtn = document.getElementById('notificationBtn');
const notificationDropdown = document.getElementById('notificationDropdown');

notificationBtn.addEventListener('click', () => {
    notificationDropdown.classList.toggle('hidden');
});

// User menu dropdown
const userMenuBtn = document.getElementById('userMenuBtn');
const userDropdown = document.getElementById('userDropdown');

userMenuBtn.addEventListener('click', () => {
    userDropdown.classList.toggle('hidden');
});

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!notificationBtn.contains(e.target)) {
        notificationDropdown.classList.add('hidden');
    }
    if (!userMenuBtn.contains(e.target)) {
        userDropdown.classList.add('hidden');
    }
});

// Initialize map
const fieldMap = L.map('fieldMap').setView([14.5995, 120.9842], 10);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(fieldMap);

// Add field markers
<?php foreach ($active_fields as $field): ?>
    <?php if ($field['latitude'] && $field['longitude']): ?>
        const marker<?php echo $field['id']; ?> = L.marker([<?php echo $field['latitude']; ?>, <?php echo $field['longitude']; ?>])
            .addTo(fieldMap)
            .bindPopup(`
                <div class="field-popup">
                    <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($field['field_name']); ?></h4>
                    <p class="text-sm text-gray-600"><?php echo htmlspecialchars($field['barangay']); ?>, <?php echo htmlspecialchars($field['municipality']); ?></p>
                    <p class="text-sm text-gray-600">Area: <?php echo $field['area_size']; ?> hectares</p>
                    <p class="text-sm text-gray-600">Owner: <?php echo htmlspecialchars($field['owner_name']); ?></p>
                    <p class="text-sm text-gray-600">Status: <?php echo ucfirst(str_replace('_', ' ', $field['status'])); ?></p>
                    <a href="field-details.php?id=<?php echo $field['id']; ?>" class="text-blue-600 hover:text-blue-800 text-sm">View Details</a>
        </div>
            `);
    <?php endif; ?>
<?php endforeach; ?>
</script>

<?php include '../includes/footer.php'; ?>