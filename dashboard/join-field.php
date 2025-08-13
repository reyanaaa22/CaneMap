<?php
session_start();
require_once '../config/database.php';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    header('Location: ../auth/login.php');
    exit();
}

$page_title = "Join Field";
$error_message = '';
$success_message = '';

// Handle join request
if ($_POST && isset($_POST['field_id'])) {
    $field_id = intval($_POST['field_id']);
    $user_id = $_SESSION['user_id'];
    
    $database = new Database();
    $db = $database->getConnection();
    
    // Check if already requested
    $check_query = "SELECT id FROM field_workers WHERE field_id = :field_id AND user_id = :user_id";
    $check_stmt = $db->prepare($check_query);
    $check_stmt->bindParam(':field_id', $field_id);
    $check_stmt->bindParam(':user_id', $user_id);
    $check_stmt->execute();
    
    if ($check_stmt->rowCount() > 0) {
        $error_message = "You have already requested to join this field.";
    } else {
        // Insert join request
        $insert_query = "INSERT INTO field_workers (field_id, user_id, status) VALUES (:field_id, :user_id, 'pending')";
        $insert_stmt = $db->prepare($insert_query);
        $insert_stmt->bindParam(':field_id', $field_id);
        $insert_stmt->bindParam(':user_id', $user_id);
        
        if ($insert_stmt->execute()) {
            $success_message = "Join request submitted successfully! The field owner will be notified.";
        } else {
            $error_message = "Error submitting request. Please try again.";
        }
    }
}

// Get available fields
$database = new Database();
$db = $database->getConnection();

$user_id = $_SESSION['user_id'];

// Get fields that are active and not owned by current user
$fields_query = "SELECT f.*, u.full_name as owner_name 
                 FROM fields f 
                 JOIN users u ON f.registered_by = u.id 
                 WHERE f.status = 'active' OR f.status = 'sra_reviewed'
                 AND f.registered_by != :user_id
                 ORDER BY f.created_at DESC";
$fields_stmt = $db->prepare($fields_query);
$fields_stmt->bindParam(':user_id', $user_id);
$fields_stmt->execute();
$available_fields = $fields_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get user's pending requests
$pending_query = "SELECT f.*, fw.status as request_status, fw.requested_at
                  FROM fields f 
                  JOIN field_workers fw ON f.id = fw.field_id 
                  WHERE fw.user_id = :user_id 
                  ORDER BY fw.requested_at DESC";
$pending_stmt = $db->prepare($pending_query);
$pending_stmt->bindParam(':user_id', $user_id);
$pending_stmt->execute();
$pending_requests = $pending_stmt->fetchAll(PDO::FETCH_ASSOC);

include '../includes/header.php';
?>

<div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center py-4">
                <div class="flex items-center">
                    <a href="lobby.php" class="text-gray-400 hover:text-gray-600 mr-4">
                        <i data-lucide="arrow-left" class="w-5 h-5"></i>
                    </a>
                    <h1 class="text-xl font-semibold text-gray-900">Join a Field</h1>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <?php if ($error_message): ?>
            <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                <?php echo $error_message; ?>
            </div>
        <?php endif; ?>

        <?php if ($success_message): ?>
            <div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
                <?php echo $success_message; ?>
            </div>
        <?php endif; ?>

        <!-- Available Fields -->
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Available Fields</h2>
            
            <?php if (empty($available_fields)): ?>
                <div class="bg-white rounded-lg shadow-sm border p-8 text-center">
                    <div class="text-gray-400 mb-4">
                        <i data-lucide="map-pin" class="w-12 h-12 mx-auto"></i>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">No Fields Available</h3>
                    <p class="text-gray-600 mb-4">There are currently no active fields available to join.</p>
                    <a href="register-field.php" class="btn-primary px-4 py-2 rounded-md text-sm">Register Your Own Field</a>
                </div>
            <?php else: ?>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <?php foreach ($available_fields as $field): ?>
                        <div class="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow">
                            <div class="p-6">
                                <div class="flex justify-between items-start mb-4">
                                    <h3 class="font-semibold text-gray-900"><?php echo htmlspecialchars($field['field_name']); ?></h3>
                                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full status-<?php echo $field['status']; ?>">
                                        <?php echo ucfirst(str_replace('_', ' ', $field['status'])); ?>
                                    </span>
                                </div>
                                
                                <div class="space-y-2 text-sm text-gray-600 mb-4">
                                    <p><i data-lucide="map-pin" class="w-4 h-4 inline mr-2"></i><?php echo htmlspecialchars($field['barangay']); ?>, <?php echo htmlspecialchars($field['municipality']); ?></p>
                                    <p><i data-lucide="maximize" class="w-4 h-4 inline mr-2"></i><?php echo $field['area_size']; ?> hectares</p>
                                    <p><i data-lucide="user" class="w-4 h-4 inline mr-2"></i>Owner: <?php echo htmlspecialchars($field['owner_name']); ?></p>
                                    <?php if ($field['crop_variety']): ?>
                                        <p><i data-lucide="leaf" class="w-4 h-4 inline mr-2"></i><?php echo htmlspecialchars($field['crop_variety']); ?></p>
                                    <?php endif; ?>
                                </div>
                                
                                <form method="POST" class="mt-4">
                                    <input type="hidden" name="field_id" value="<?php echo $field['id']; ?>">
                                    <button type="submit" class="w-full btn-primary py-2 px-4 rounded-md text-sm">
                                        Request to Join
                                    </button>
                                </form>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>

        <!-- Pending Requests -->
        <?php if (!empty($pending_requests)): ?>
            <div class="mt-8">
                <h2 class="text-2xl font-bold text-gray-900 mb-6">My Join Requests</h2>
                <div class="bg-white rounded-lg shadow-sm border">
                    <div class="p-6">
                        <div class="space-y-4">
                            <?php foreach ($pending_requests as $request): ?>
                                <div class="border border-gray-200 rounded-lg p-4">
                                    <div class="flex justify-between items-start">
                                        <div>
                                            <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($request['field_name']); ?></h4>
                                            <p class="text-sm text-gray-600"><?php echo htmlspecialchars($request['barangay']); ?>, <?php echo htmlspecialchars($request['municipality']); ?></p>
                                            <p class="text-sm text-gray-600">Requested: <?php echo date('M j, Y g:i A', strtotime($request['requested_at'])); ?></p>
                                        </div>
                                        <div class="text-right">
                                            <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full status-<?php echo $request['request_status']; ?>">
                                                <?php echo ucfirst(str_replace('_', ' ', $request['request_status'])); ?>
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <?php if ($request['request_status'] === 'approved'): ?>
                                        <div class="mt-3">
                                            <a href="task-logging.php?field_id=<?php echo $request['id']; ?>" class="text-sm text-green-600 hover:text-green-800">
                                                Start Logging Tasks →
                                            </a>
                                        </div>
                                    <?php elseif ($request['request_status'] === 'rejected'): ?>
                                        <div class="mt-3">
                                            <p class="text-sm text-red-600">Your request was not approved</p>
                                        </div>
                                    <?php else: ?>
                                        <div class="mt-3">
                                            <p class="text-sm text-gray-600">Waiting for field owner approval</p>
                                        </div>
                                    <?php endif; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
            </div>
        <?php endif; ?>

        <!-- Map View -->
        <div class="mt-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Field Locations</h2>
            <div class="bg-white rounded-lg shadow-sm border">
                <div class="p-6">
                    <div id="fieldsMap" class="map-container"></div>
                </div>
            </div>
        </div>
    </main>
</div>

<script>
// Initialize Lucide icons
lucide.createIcons();

// Initialize map
const fieldsMap = L.map('fieldsMap').setView([14.5995, 120.9842], 10);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(fieldsMap);

// Add field markers
<?php foreach ($available_fields as $field): ?>
    <?php if ($field['latitude'] && $field['longitude']): ?>
        const marker<?php echo $field['id']; ?> = L.marker([<?php echo $field['latitude']; ?>, <?php echo $field['longitude']; ?>])
            .addTo(fieldsMap)
            .bindPopup(`
                <div class="field-popup">
                    <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($field['field_name']); ?></h4>
                    <p class="text-sm text-gray-600"><?php echo htmlspecialchars($field['barangay']); ?>, <?php echo htmlspecialchars($field['municipality']); ?></p>
                    <p class="text-sm text-gray-600">Area: <?php echo $field['area_size']; ?> hectares</p>
                    <p class="text-sm text-gray-600">Owner: <?php echo htmlspecialchars($field['owner_name']); ?></p>
                    <p class="text-sm text-gray-600">Status: <?php echo ucfirst(str_replace('_', ' ', $field['status'])); ?></p>
                    <form method="POST" class="mt-2">
                        <input type="hidden" name="field_id" value="<?php echo $field['id']; ?>">
                        <button type="submit" class="text-blue-600 hover:text-blue-800 text-sm">Request to Join</button>
                    </form>
                </div>
            `);
    <?php endif; ?>
<?php endforeach; ?>
</script>

<?php include '../includes/footer.php'; ?> 