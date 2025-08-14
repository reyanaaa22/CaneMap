<?php
session_start();
require_once '../config/database.php';

// Check if user is logged in and is RSA/MAO
if (!isset($_SESSION['user_id']) || $_SESSION['user_role'] !== 'rsa') {
    header("Location: ../auth/login.php");
    exit();
}

$page_title = "RSA/MAO Dashboard";
$database = new Database();
$db = $database->getConnection();

// Get landowner registry
$registry_query = "SELECT * FROM landowner_registry ORDER BY barangay, full_name";
$registry_stmt = $db->prepare($registry_query);
$registry_stmt->execute();
$landowner_registry = $registry_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get pending landowner verifications
$pending_landowners_query = "SELECT * FROM users WHERE role = 'landowner' AND status = 'pending' ORDER BY created_at DESC";
$pending_stmt = $db->prepare($pending_landowners_query);
$pending_stmt->execute();
$pending_landowners = $pending_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get registered fields for review
$fields_query = "SELECT f.*, u.full_name as landowner_name, u.farm_company_name 
                FROM fields f 
                LEFT JOIN users u ON f.landowner_id = u.id 
                ORDER BY f.created_at DESC";
$fields_stmt = $db->prepare($fields_query);
$fields_stmt->execute();
$registered_fields = $fields_stmt->fetchAll(PDO::FETCH_ASSOC);

include '../includes/header.php';
?>

<div class="min-h-screen bg-gray-50">
    <!-- Navigation Header -->
    <nav class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center">
                    <a href="lobby.php" class="text-2xl font-bold text-primary">🌾 CaneMap</a>
                    <div class="ml-4 text-sm text-gray-500">RSA/MAO Dashboard</div>
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
                        <i data-lucide="users" class="w-6 h-6 text-white"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Registered Landowners</p>
                        <p class="text-2xl font-semibold text-gray-900"><?php echo count($landowner_registry); ?></p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-yellow-500 rounded-lg">
                        <i data-lucide="clock" class="w-6 h-6 text-white"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Pending Verifications</p>
                        <p class="text-2xl font-semibold text-gray-900"><?php echo count($pending_landowners); ?></p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-secondary rounded-lg">
                        <i data-lucide="map-pin" class="w-6 h-6 text-primary"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Registered Fields</p>
                        <p class="text-2xl font-semibold text-gray-900"><?php echo count($registered_fields); ?></p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-2 bg-green-500 rounded-lg">
                        <i data-lucide="trending-up" class="w-6 h-6 text-white"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Total Hectares</p>
                        <p class="text-2xl font-semibold text-gray-900">
                            <?php echo array_sum(array_column($registered_fields, 'size_hectares')); ?>
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Tab Navigation -->
        <div class="bg-white rounded-lg shadow-sm mb-8">
            <div class="border-b border-gray-200">
                <nav class="-mb-px flex space-x-8 px-6">
                    <button onclick="showTab('registry')" id="registry-tab" 
                            class="tab-button py-4 px-1 border-b-2 border-primary text-primary font-medium text-sm">
                        Landowner Registry
                    </button>
                    <button onclick="showTab('verification')" id="verification-tab" 
                            class="tab-button py-4 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium text-sm">
                        Identity Verification
                    </button>
                    <button onclick="showTab('fields')" id="fields-tab" 
                            class="tab-button py-4 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium text-sm">
                        Field Management
                    </button>
                    <button onclick="showTab('reports')" id="reports-tab" 
                            class="tab-button py-4 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium text-sm">
                        Reports & Analytics
                    </button>
                </nav>
            </div>

            <!-- Registry Tab -->
            <div id="registry-content" class="tab-content p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-lg font-semibold text-gray-900">RSA/MAO Landowner Registry</h3>
                    <div class="flex space-x-2">
                        <input type="text" id="registrySearch" placeholder="Search registry..." 
                               class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary">
                        <button onclick="exportRegistryCSV()" class="btn-secondary px-4 py-2 rounded-lg text-sm">
                            <i data-lucide="download" class="w-4 h-4 inline mr-2"></i>
                            Export CSV
                        </button>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No.</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Full Name</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Farm/Company</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area Name</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Barangay</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Land Code</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size (Ha)</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coordinates</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            <?php foreach ($landowner_registry as $index => $entry): ?>
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"><?php echo $index + 1; ?></td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        <?php echo htmlspecialchars($entry['full_name']); ?>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <?php echo htmlspecialchars($entry['farm_company_name']); ?>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <?php echo htmlspecialchars($entry['area_name']); ?>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <?php echo htmlspecialchars($entry['barangay']); ?>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                                        <?php echo htmlspecialchars($entry['land_code']); ?>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <?php echo $entry['size_hectares']; ?>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <?php echo $entry['latitude']; ?>, <?php echo $entry['longitude']; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Verification Tab -->
            <div id="verification-content" class="tab-content p-6 hidden">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-lg font-semibold text-gray-900">Landowner Identity Verification</h3>
                    <span class="bg-yellow-100 text-yellow-800 text-sm font-medium px-3 py-1 rounded-full">
                        <?php echo count($pending_landowners); ?> Pending
                    </span>
                </div>

                <?php if (count($pending_landowners) === 0): ?>
                    <div class="text-center py-12">
                        <i data-lucide="check-circle" class="w-12 h-12 text-green-500 mx-auto mb-4"></i>
                        <h3 class="text-lg font-medium text-gray-900 mb-2">All Caught Up!</h3>
                        <p class="text-gray-500">No pending landowner verifications at this time.</p>
                    </div>
                <?php else: ?>
                    <div class="space-y-6">
                        <?php foreach ($pending_landowners as $landowner): ?>
                            <div class="bg-gray-50 rounded-lg p-6">
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div>
                                        <h4 class="text-lg font-semibold text-gray-900 mb-4">
                                            <?php echo htmlspecialchars($landowner['full_name']); ?>
                                        </h4>
                                        <div class="space-y-2 text-sm">
                                            <div><span class="font-medium">Farm/Company:</span> <?php echo htmlspecialchars($landowner['farm_company_name']); ?></div>
                                            <div><span class="font-medium">Email:</span> <?php echo htmlspecialchars($landowner['email']); ?></div>
                                            <div><span class="font-medium">Address:</span> <?php echo htmlspecialchars($landowner['address']); ?></div>
                                            <div><span class="font-medium">ID Type:</span> <?php echo htmlspecialchars($landowner['id_type']); ?></div>
                                            <div><span class="font-medium">Registered:</span> <?php echo date('M d, Y', strtotime($landowner['created_at'])); ?></div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <h5 class="font-medium text-gray-900 mb-3">Verification Documents</h5>
                                        <div class="grid grid-cols-3 gap-2 mb-4">
                                            <button class="bg-white border border-gray-300 rounded-lg p-3 text-center hover:bg-gray-50">
                                                <i data-lucide="image" class="w-6 h-6 mx-auto mb-1 text-gray-400"></i>
                                                <span class="text-xs text-gray-600">ID Front</span>
                                            </button>
                                            <button class="bg-white border border-gray-300 rounded-lg p-3 text-center hover:bg-gray-50">
                                                <i data-lucide="image" class="w-6 h-6 mx-auto mb-1 text-gray-400"></i>
                                                <span class="text-xs text-gray-600">ID Back</span>
                                            </button>
                                            <button class="bg-white border border-gray-300 rounded-lg p-3 text-center hover:bg-gray-50">
                                                <i data-lucide="user" class="w-6 h-6 mx-auto mb-1 text-gray-400"></i>
                                                <span class="text-xs text-gray-600">Selfie</span>
                                            </button>
                                        </div>
                                        
                                        <div class="flex space-x-3">
                                            <button onclick="verifyLandowner(<?php echo $landowner['id']; ?>, 'verified')" 
                                                    class="btn-primary px-4 py-2 rounded-lg text-sm flex-1">
                                                ✅ Approve
                                            </button>
                                            <button onclick="verifyLandowner(<?php echo $landowner['id']; ?>, 'rejected')" 
                                                    class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm flex-1">
                                                ❌ Reject
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>

            <!-- Fields Tab -->
            <div id="fields-content" class="tab-content p-6 hidden">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-lg font-semibold text-gray-900">Registered Fields Overview</h3>
                    <div class="flex space-x-2">
                        <select class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary">
                            <option value="">All Barangays</option>
                            <option value="Naungan">Naungan</option>
                            <option value="Ipil">Ipil</option>
                            <option value="Linao">Linao</option>
                        </select>
                        <button onclick="exportFieldsCSV()" class="btn-secondary px-4 py-2 rounded-lg text-sm">
                            <i data-lucide="download" class="w-4 h-4 inline mr-2"></i>
                            Export CSV
                        </button>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Field Name</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Barangay</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Landowner</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area Size</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variety</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            <?php foreach ($registered_fields as $field): ?>
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        <?php echo htmlspecialchars($field['field_name']); ?>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <?php echo htmlspecialchars($field['barangay']); ?>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <?php echo htmlspecialchars($field['landowner_name']); ?>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <?php echo $field['size_hectares']; ?> Ha
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <?php echo htmlspecialchars($field['sugarcane_variety']); ?>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="bg-<?php echo $field['status'] === 'verified' ? 'green' : ($field['status'] === 'pending' ? 'yellow' : 'red'); ?>-100 
                                                     text-<?php echo $field['status'] === 'verified' ? 'green' : ($field['status'] === 'pending' ? 'yellow' : 'red'); ?>-800 
                                                     text-xs font-medium px-2.5 py-0.5 rounded-full">
                                            <?php echo ucfirst($field['status']); ?>
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <?php if ($field['status'] === 'pending'): ?>
                                            <div class="flex space-x-2">
                                                <button onclick="reviewField(<?php echo $field['id']; ?>)" 
                                                        class="text-primary hover:text-green-700">🔍 Review</button>
                                                <button onclick="approveField(<?php echo $field['id']; ?>)" 
                                                        class="text-green-600 hover:text-green-800">✅ Approve</button>
                                                <button onclick="rejectField(<?php echo $field['id']; ?>)" 
                                                        class="text-red-600 hover:text-red-800">❌ Reject</button>
                                            </div>
                                        <?php else: ?>
                                            <button onclick="viewFieldDetails(<?php echo $field['id']; ?>)" 
                                                    class="text-primary hover:text-green-700">View Details</button>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Reports Tab -->
            <div id="reports-content" class="tab-content p-6 hidden">
                <h3 class="text-lg font-semibold text-gray-900 mb-6">Reports & Export Panel</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div class="bg-gray-50 rounded-lg p-6">
                        <div class="flex items-center mb-4">
                            <i data-lucide="users" class="w-8 h-8 text-primary mr-3"></i>
                            <h4 class="text-lg font-semibold text-gray-900">Verified Landowners</h4>
                        </div>
                        <p class="text-gray-600 mb-4">Export complete list of verified landowners with their details.</p>
                        <button onclick="exportLandownersReport()" class="btn-primary w-full py-2 rounded-lg text-sm">
                            <i data-lucide="download" class="w-4 h-4 inline mr-2"></i>
                            Export Masterlist
                        </button>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-6">
                        <div class="flex items-center mb-4">
                            <i data-lucide="map-pin" class="w-8 h-8 text-secondary mr-3"></i>
                            <h4 class="text-lg font-semibold text-gray-900">Fields Summary</h4>
                        </div>
                        <p class="text-gray-600 mb-4">Comprehensive report of all registered sugarcane fields.</p>
                        <button onclick="exportFieldsSummary()" class="btn-primary w-full py-2 rounded-lg text-sm">
                            <i data-lucide="download" class="w-4 h-4 inline mr-2"></i>
                            Export Summary
                        </button>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-6">
                        <div class="flex items-center mb-4">
                            <i data-lucide="calendar" class="w-8 h-8 text-green-600 mr-3"></i>
                            <h4 class="text-lg font-semibold text-gray-900">Harvest Forecast</h4>
                        </div>
                        <p class="text-gray-600 mb-4">Predicted harvest dates based on planting schedules.</p>
                        <button onclick="exportHarvestForecast()" class="btn-primary w-full py-2 rounded-lg text-sm">
                            <i data-lucide="download" class="w-4 h-4 inline mr-2"></i>
                            Export Calendar
                        </button>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-6">
                        <div class="flex items-center mb-4">
                            <i data-lucide="map" class="w-8 h-8 text-blue-600 mr-3"></i>
                            <h4 class="text-lg font-semibold text-gray-900">Barangay Overview</h4>
                        </div>
                        <p class="text-gray-600 mb-4">Crop distribution and statistics by barangay.</p>
                        <button onclick="exportBarangayOverview()" class="btn-primary w-full py-2 rounded-lg text-sm">
                            <i data-lucide="download" class="w-4 h-4 inline mr-2"></i>
                            Export Overview
                        </button>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-6">
                        <div class="flex items-center mb-4">
                            <i data-lucide="map-pin" class="w-8 h-8 text-purple-600 mr-3"></i>
                            <h4 class="text-lg font-semibold text-gray-900">Interactive Map</h4>
                        </div>
                        <p class="text-gray-600 mb-4">Export map with field pins and coordinates.</p>
                        <button onclick="exportMapData()" class="btn-primary w-full py-2 rounded-lg text-sm">
                            <i data-lucide="download" class="w-4 h-4 inline mr-2"></i>
                            Export Map Data
                        </button>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-6">
                        <div class="flex items-center mb-4">
                            <i data-lucide="trending-up" class="w-8 h-8 text-orange-600 mr-3"></i>
                            <h4 class="text-lg font-semibold text-gray-900">Analytics Report</h4>
                        </div>
                        <p class="text-gray-600 mb-4">Comprehensive analytics and growth statistics.</p>
                        <button onclick="exportAnalyticsReport()" class="btn-primary w-full py-2 rounded-lg text-sm">
                            <i data-lucide="download" class="w-4 h-4 inline mr-2"></i>
                            Export Analytics
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function showTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    // Remove active state from all tabs
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('border-primary', 'text-primary');
        button.classList.add('border-transparent', 'text-gray-500');
    });
    
    // Show selected tab content
    document.getElementById(tabName + '-content').classList.remove('hidden');
    
    // Add active state to selected tab
    const activeTab = document.getElementById(tabName + '-tab');
    activeTab.classList.remove('border-transparent', 'text-gray-500');
    activeTab.classList.add('border-primary', 'text-primary');
}

function verifyLandowner(landownerId, status) {
    if (confirm(`Are you sure you want to ${status} this landowner?`)) {
        // In a real application, this would send an AJAX request
        alert(`Landowner ${status} successfully!`);
        location.reload();
    }
}

function reviewField(fieldId) {
    alert(`Opening field review for field ID: ${fieldId}`);
}

function approveField(fieldId) {
    if (confirm('Are you sure you want to approve this field?')) {
        alert('Field approved successfully!');
        location.reload();
    }
}

function rejectField(fieldId) {
    if (confirm('Are you sure you want to reject this field?')) {
        alert('Field rejected successfully!');
        location.reload();
    }
}

function viewFieldDetails(fieldId) {
    window.location.href = `field-details.php?id=${fieldId}`;
}

// Export functions
function exportRegistryCSV() {
    alert('Exporting landowner registry to CSV...');
}

function exportFieldsCSV() {
    alert('Exporting fields data to CSV...');
}

function exportLandownersReport() {
    alert('Exporting verified landowners masterlist...');
}

function exportFieldsSummary() {
    alert('Exporting fields summary report...');
}

function exportHarvestForecast() {
    alert('Exporting harvest forecast calendar...');
}

function exportBarangayOverview() {
    alert('Exporting barangay overview report...');
}

function exportMapData() {
    alert('Exporting map data with field coordinates...');
}

function exportAnalyticsReport() {
    alert('Exporting comprehensive analytics report...');
}

function toggleUserMenu() {
    const menu = document.getElementById('userMenu');
    menu.classList.toggle('hidden');
}

// Search functionality
document.getElementById('registrySearch').addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase();
    const rows = document.querySelectorAll('#registry-content tbody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
});

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