<?php
session_start();
require_once '../config/database.php';

// Check if user is logged in and is a landowner
if (!isset($_SESSION['user_id']) || $_SESSION['user_role'] !== 'landowner') {
    header("Location: ../auth/login.php");
    exit();
}

$page_title = "Landowner Dashboard";
$database = new Database();
$db = $database->getConnection();

// Get landowner's fields
$fields_query = "SELECT * FROM fields WHERE landowner_id = :landowner_id ORDER BY created_at DESC";
$fields_stmt = $db->prepare($fields_query);
$fields_stmt->bindParam(':landowner_id', $_SESSION['user_id']);
$fields_stmt->execute();
$owned_fields = $fields_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get pending join requests
$join_requests_query = "SELECT fm.*, f.field_name, u.full_name as farmer_name, u.email as farmer_email
                       FROM field_members fm 
                       JOIN fields f ON fm.field_id = f.id 
                       JOIN users u ON fm.farmer_id = u.id 
                       WHERE f.landowner_id = :landowner_id AND fm.status = 'pending'";
$join_requests_stmt = $db->prepare($join_requests_query);
$join_requests_stmt->bindParam(':landowner_id', $_SESSION['user_id']);
$join_requests_stmt->execute();
$join_requests = $join_requests_stmt->fetchAll(PDO::FETCH_ASSOC);

include '../includes/header.php';
?>

<div class="min-h-screen bg-gray-50">
    <!-- Navigation Header -->
    <nav class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center">
                    <a href="lobby.php" class="text-2xl font-bold text-primary">🌾 CaneMap</a>
                    <div class="ml-4 text-sm text-gray-500">Landowner Dashboard</div>
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
        <?php if ($_SESSION['user_status'] === 'pending'): ?>
            <!-- Pending Verification Notice -->
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
                <div class="flex items-center">
                    <i data-lucide="clock" class="w-6 h-6 text-yellow-600 mr-3"></i>
                    <div>
                        <h3 class="text-lg font-semibold text-yellow-800">Account Verification Pending</h3>
                        <p class="text-yellow-700">Please wait 5 working days for your account to be verified by our MAO officers.</p>
                    </div>
                </div>
            </div>
        <?php endif; ?>

        <!-- Dashboard Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-primary rounded-lg">
                        <i data-lucide="map-pin" class="w-6 h-6 text-white"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Owned Areas</p>
                        <p class="text-2xl font-semibold text-gray-900"><?php echo count($owned_fields); ?></p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-secondary rounded-lg">
                        <i data-lucide="users" class="w-6 h-6 text-primary"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Join Requests</p>
                        <p class="text-2xl font-semibold text-gray-900"><?php echo count($join_requests); ?></p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-green-100 rounded-lg">
                        <i data-lucide="check-circle" class="w-6 h-6 text-green-600"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Active Tasks</p>
                        <p class="text-2xl font-semibold text-gray-900">8</p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-blue-100 rounded-lg">
                        <i data-lucide="trending-up" class="w-6 h-6 text-blue-600"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Total Hectares</p>
                        <p class="text-2xl font-semibold text-gray-900">
                            <?php echo array_sum(array_column($owned_fields, 'size_hectares')); ?>
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- My Fields -->
            <div class="lg:col-span-2 space-y-6">
                <div class="flex items-center justify-between">
                    <h2 class="text-xl font-semibold text-gray-900">My Fields</h2>
                    <?php if ($_SESSION['user_status'] === 'verified'): ?>
                        <button onclick="registerNewField()" class="btn-primary px-4 py-2 rounded-lg text-sm">
                            <i data-lucide="plus" class="w-4 h-4 inline mr-2"></i>
                            Register New Area
                        </button>
                    <?php endif; ?>
                </div>

                <?php if (count($owned_fields) === 0): ?>
                    <div class="bg-white rounded-lg shadow-sm p-8 text-center">
                        <div class="text-6xl mb-4">🏡</div>
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">No Fields Registered</h3>
                        <p class="text-gray-600 mb-6">Start by registering your first sugarcane field.</p>
                        <?php if ($_SESSION['user_status'] === 'verified'): ?>
                            <button onclick="registerNewField()" class="btn-primary px-6 py-3 rounded-lg">
                                <i data-lucide="plus" class="w-4 h-4 inline mr-2"></i>
                                Register Your First Field
                            </button>
                        <?php else: ?>
                            <p class="text-sm text-gray-500">Account verification required to register fields</p>
                        <?php endif; ?>
                    </div>
                <?php else: ?>
                    <div class="space-y-4">
                        <?php foreach ($owned_fields as $field): ?>
                            <div class="bg-white rounded-lg shadow-sm p-6 card-hover cursor-pointer" 
                                 onclick="viewFieldDetails(<?php echo $field['id']; ?>)">
                                <div class="flex items-start justify-between mb-4">
                                    <div>
                                        <h3 class="text-lg font-semibold text-gray-900"><?php echo htmlspecialchars($field['field_name']); ?></h3>
                                        <p class="text-sm text-gray-600"><?php echo htmlspecialchars($field['land_code']); ?></p>
                                        <p class="text-sm text-gray-500">
                                            <?php echo htmlspecialchars($field['barangay']); ?>, <?php echo htmlspecialchars($field['municipality']); ?>
                                        </p>
                                    </div>
                                    <span class="bg-<?php echo $field['status'] === 'verified' ? 'green' : ($field['status'] === 'pending' ? 'yellow' : 'red'); ?>-100 
                                                 text-<?php echo $field['status'] === 'verified' ? 'green' : ($field['status'] === 'pending' ? 'yellow' : 'red'); ?>-800 
                                                 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                        <?php echo ucfirst($field['status']); ?>
                                    </span>
                                </div>
                                
                                <div class="grid grid-cols-2 gap-4 text-sm mb-4">
                                    <div>
                                        <span class="text-gray-500">Size:</span>
                                        <p class="font-medium"><?php echo $field['size_hectares']; ?> Hectares</p>
                                    </div>
                                    <div>
                                        <span class="text-gray-500">Variety:</span>
                                        <p class="font-medium"><?php echo htmlspecialchars($field['sugarcane_variety']); ?></p>
                                    </div>
                                    <div>
                                        <span class="text-gray-500">Planted:</span>
                                        <p class="font-medium"><?php echo $field['planted_date'] ? date('M d, Y', strtotime($field['planted_date'])) : 'Not set'; ?></p>
                                    </div>
                                    <div>
                                        <span class="text-gray-500">Growth Stage:</span>
                                        <p class="font-medium">Tillering</p>
                                    </div>
                                </div>
                                
                                <!-- Quick Actions -->
                                <div class="flex space-x-2">
                                    <button onclick="event.stopPropagation(); manageFieldTasks(<?php echo $field['id']; ?>)" 
                                            class="btn-secondary px-3 py-1 text-xs rounded">
                                        Manage Tasks
                                    </button>
                                    <button onclick="event.stopPropagation(); viewFieldMembers(<?php echo $field['id']; ?>)" 
                                            class="btn-secondary px-3 py-1 text-xs rounded">
                                        View Members
                                    </button>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>

            <!-- Sidebar -->
            <div class="space-y-6">
                <!-- Join Requests -->
                <?php if (count($join_requests) > 0): ?>
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">Join Requests</h3>
                        <div class="space-y-4">
                            <?php foreach ($join_requests as $request): ?>
                                <div class="border border-gray-200 rounded-lg p-4">
                                    <div class="flex items-start justify-between mb-3">
                                        <div>
                                            <p class="font-medium text-gray-900"><?php echo htmlspecialchars($request['farmer_name']); ?></p>
                                            <p class="text-sm text-gray-600"><?php echo htmlspecialchars($request['farmer_email']); ?></p>
                                            <p class="text-sm text-gray-500">Field: <?php echo htmlspecialchars($request['field_name']); ?></p>
                                        </div>
                                    </div>
                                    <div class="flex space-x-2">
                                        <button onclick="handleJoinRequest(<?php echo $request['id']; ?>, 'confirmed')" 
                                                class="btn-primary px-3 py-1 text-xs rounded">
                                            Confirm
                                        </button>
                                        <button onclick="handleJoinRequest(<?php echo $request['id']; ?>, 'rejected')" 
                                                class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs rounded">
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                <?php endif; ?>

                <!-- Quick Reports -->
                <div class="bg-white rounded-lg shadow-sm p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">Quick Reports</h3>
                    <div class="space-y-3">
                        <button onclick="generateWeeklyReport()" class="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium">Weekly Summary</span>
                                <i data-lucide="download" class="w-4 h-4 text-gray-400"></i>
                            </div>
                        </button>
                        <button onclick="generateMonthlyReport()" class="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium">Monthly Report</span>
                                <i data-lucide="download" class="w-4 h-4 text-gray-400"></i>
                            </div>
                        </button>
                        <button onclick="generateTaskReport()" class="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium">Task Completion</span>
                                <i data-lucide="download" class="w-4 h-4 text-gray-400"></i>
                            </div>
                        </button>
                    </div>
                </div>

                <!-- Growth Tracker -->
                <div class="bg-white rounded-lg shadow-sm p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">Growth Tracker</h3>
                    <div class="space-y-4">
                        <?php foreach (array_slice($owned_fields, 0, 3) as $field): ?>
                            <div class="border-l-4 border-secondary pl-4">
                                <p class="font-medium text-sm"><?php echo htmlspecialchars($field['field_name']); ?></p>
                                <p class="text-xs text-gray-500 mb-2">
                                    <?php 
                                    if ($field['planted_date']) {
                                        $days = (time() - strtotime($field['planted_date'])) / (60 * 60 * 24);
                                        echo floor($days) . ' days since planting';
                                    } else {
                                        echo 'Planting date not set';
                                    }
                                    ?>
                                </p>
                                <div class="bg-gray-200 rounded-full h-2">
                                    <div class="bg-secondary h-2 rounded-full" style="width: 45%"></div>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">Tillering Stage</p>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function registerNewField() {
    window.location.href = 'register-field.php';
}

function viewFieldDetails(fieldId) {
    window.location.href = `field-details.php?id=${fieldId}`;
}

function manageFieldTasks(fieldId) {
    window.location.href = `field-tasks.php?field_id=${fieldId}`;
}

function viewFieldMembers(fieldId) {
    window.location.href = `field-members.php?field_id=${fieldId}`;
}

function handleJoinRequest(requestId, action) {
    // In a real application, this would send an AJAX request
    if (confirm(`Are you sure you want to ${action} this join request?`)) {
        // AJAX call to update request status
        alert(`Join request ${action} successfully!`);
        location.reload();
    }
}

function generateWeeklyReport() {
    // In a real application, this would generate and download a report
    alert('Generating weekly report...');
}

function generateMonthlyReport() {
    alert('Generating monthly report...');
}

function generateTaskReport() {
    alert('Generating task completion report...');
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
</script>

<?php include '../includes/footer.php'; ?>