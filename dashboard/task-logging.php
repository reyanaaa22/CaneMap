<?php
session_start();
require_once '../config/database.php';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    header('Location: ../auth/login.php');
    exit();
}

$page_title = "Task Logging";
$error_message = '';
$success_message = '';

// Get field ID from URL
$field_id = isset($_GET['field_id']) ? intval($_GET['field_id']) : 0;

if (!$field_id) {
    header('Location: lobby.php');
    exit();
}

// Check if user has access to this field
$database = new Database();
$db = $database->getConnection();
$user_id = $_SESSION['user_id'];

$access_query = "SELECT f.*, u.full_name as owner_name 
                 FROM fields f 
                 JOIN users u ON f.registered_by = u.id 
                 WHERE f.id = :field_id 
                 AND (f.registered_by = :user_id OR 
                      EXISTS (SELECT 1 FROM field_workers fw WHERE fw.field_id = f.id AND fw.user_id = :user_id AND fw.status = 'approved'))";
$access_stmt = $db->prepare($access_query);
$access_stmt->bindParam(':field_id', $field_id);
$access_stmt->bindParam(':user_id', $user_id);
$access_stmt->execute();
$field = $access_stmt->fetch(PDO::FETCH_ASSOC);

if (!$field) {
    header('Location: lobby.php');
    exit();
}

// Handle task submission
if ($_POST) {
    $task_name = trim($_POST['task_name']);
    $description = trim($_POST['description']);
    $task_status = $_POST['task_status'];
    
    if (empty($task_name)) {
        $error_message = "Please enter a task name.";
    } else {
        // Handle file uploads
        $upload_dir = '../uploads/task_photos/';
        if (!is_dir($upload_dir)) {
            mkdir($upload_dir, 0755, true);
        }
        
        $selfie_path = '';
        $field_photo_path = '';
        
        // Upload selfie
        if (isset($_FILES['selfie']) && $_FILES['selfie']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['selfie'];
            $file_extension = pathinfo($file['name'], PATHINFO_EXTENSION);
            $file_name = 'selfie_' . time() . '_' . $user_id . '.' . $file_extension;
            $file_path = $upload_dir . $file_name;
            
            if (move_uploaded_file($file['tmp_name'], $file_path)) {
                $selfie_path = $file_path;
            }
        }
        
        // Upload field photo
        if (isset($_FILES['field_photo']) && $_FILES['field_photo']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['field_photo'];
            $file_extension = pathinfo($file['name'], PATHINFO_EXTENSION);
            $file_name = 'field_' . time() . '_' . $user_id . '.' . $file_extension;
            $file_path = $upload_dir . $file_name;
            
            if (move_uploaded_file($file['tmp_name'], $file_path)) {
                $field_photo_path = $file_path;
            }
        }
        
        // Insert task log
        $insert_query = "INSERT INTO task_logs (field_id, user_id, task_name, description, task_status, selfie_path, field_photo_path) 
                        VALUES (:field_id, :user_id, :task_name, :description, :task_status, :selfie_path, :field_photo_path)";
        $insert_stmt = $db->prepare($insert_query);
        $insert_stmt->bindParam(':field_id', $field_id);
        $insert_stmt->bindParam(':user_id', $user_id);
        $insert_stmt->bindParam(':task_name', $task_name);
        $insert_stmt->bindParam(':description', $description);
        $insert_stmt->bindParam(':task_status', $task_status);
        $insert_stmt->bindParam(':selfie_path', $selfie_path);
        $insert_stmt->bindParam(':field_photo_path', $field_photo_path);
        
        if ($insert_stmt->execute()) {
            $success_message = "Task logged successfully!";
        } else {
            $error_message = "Error logging task. Please try again.";
        }
    }
}

// Get task logs for this field
$logs_query = "SELECT tl.*, u.full_name as worker_name 
               FROM task_logs tl 
               JOIN users u ON tl.user_id = u.id 
               WHERE tl.field_id = :field_id 
               ORDER BY tl.logged_at DESC";
$logs_stmt = $db->prepare($logs_query);
$logs_stmt->bindParam(':field_id', $field_id);
$logs_stmt->execute();
$task_logs = $logs_stmt->fetchAll(PDO::FETCH_ASSOC);

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
                    <h1 class="text-xl font-semibold text-gray-900">Task Logging</h1>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Field Info -->
        <div class="bg-white rounded-lg shadow-sm border mb-8">
            <div class="p-6">
                <h2 class="text-lg font-semibold text-gray-900 mb-2"><?php echo htmlspecialchars($field['field_name']); ?></h2>
                <p class="text-sm text-gray-600"><?php echo htmlspecialchars($field['barangay']); ?>, <?php echo htmlspecialchars($field['municipality']); ?></p>
                <p class="text-sm text-gray-600">Owner: <?php echo htmlspecialchars($field['owner_name']); ?></p>
            </div>
        </div>

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

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Log New Task -->
            <div class="bg-white rounded-lg shadow-sm border">
                <div class="p-6 border-b">
                    <h3 class="text-lg font-semibold text-gray-900">Log New Task</h3>
                    <p class="text-sm text-gray-600">Record your daily activities</p>
                </div>
                
                <form method="POST" enctype="multipart/form-data" class="p-6 space-y-4">
                    <div>
                        <label for="task_name" class="block text-sm font-medium text-gray-700 mb-1">Task Name *</label>
                        <input type="text" id="task_name" name="task_name" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                               placeholder="e.g., Fertilizer application, Irrigation, Harvesting">
                    </div>

                    <div>
                        <label for="description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea id="description" name="description" rows="3"
                                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  placeholder="Describe what you did..."></textarea>
                    </div>

                    <div>
                        <label for="task_status" class="block text-sm font-medium text-gray-700 mb-1">Task Status *</label>
                        <select id="task_status" name="task_status" required
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="done">Done</option>
                            <option value="in_progress">In Progress</option>
                            <option value="not_yet_done">Not Yet Done</option>
                            <option value="delayed">Delayed</option>
                        </select>
                    </div>

                    <div>
                        <label for="selfie" class="block text-sm font-medium text-gray-700 mb-1">Selfie in Field</label>
                        <input type="file" id="selfie" name="selfie" accept=".jpg,.jpeg,.png"
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <p class="text-xs text-gray-500 mt-1">Take a photo of yourself in the field</p>
                    </div>

                    <div>
                        <label for="field_photo" class="block text-sm font-medium text-gray-700 mb-1">Field Photo</label>
                        <input type="file" id="field_photo" name="field_photo" accept=".jpg,.jpeg,.png"
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <p class="text-xs text-gray-500 mt-1">Photo of the field or work area</p>
                    </div>

                    <button type="submit" class="w-full btn-primary py-2 px-4 rounded-md">
                        Log Task
                    </button>
                </form>
            </div>

            <!-- Task History -->
            <div class="bg-white rounded-lg shadow-sm border">
                <div class="p-6 border-b">
                    <h3 class="text-lg font-semibold text-gray-900">Recent Tasks</h3>
                    <p class="text-sm text-gray-600">Latest activities in this field</p>
                </div>
                
                <div class="p-6">
                    <?php if (empty($task_logs)): ?>
                        <div class="text-center py-8">
                            <div class="text-gray-400 mb-4">
                                <i data-lucide="clipboard-list" class="w-12 h-12 mx-auto"></i>
                            </div>
                            <p class="text-gray-500">No tasks logged yet.</p>
                        </div>
                    <?php else: ?>
                        <div class="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                            <?php foreach ($task_logs as $log): ?>
                                <div class="border border-gray-200 rounded-lg p-4">
                                    <div class="flex justify-between items-start mb-2">
                                        <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($log['task_name']); ?></h4>
                                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full task-<?php echo $log['task_status']; ?>">
                                            <?php echo ucfirst(str_replace('_', ' ', $log['task_status'])); ?>
                                        </span>
                                    </div>
                                    
                                    <?php if ($log['description']): ?>
                                        <p class="text-sm text-gray-600 mb-2"><?php echo htmlspecialchars($log['description']); ?></p>
                                    <?php endif; ?>
                                    
                                    <div class="flex items-center justify-between text-xs text-gray-500">
                                        <span>By: <?php echo htmlspecialchars($log['worker_name']); ?></span>
                                        <span><?php echo date('M j, Y g:i A', strtotime($log['logged_at'])); ?></span>
                                    </div>
                                    
                                    <?php if ($log['selfie_path'] || $log['field_photo_path']): ?>
                                        <div class="mt-3 flex space-x-2">
                                            <?php if ($log['selfie_path']): ?>
                                                <a href="<?php echo $log['selfie_path']; ?>" target="_blank" class="text-blue-600 hover:text-blue-800 text-xs">
                                                    View Selfie
                                                </a>
                                            <?php endif; ?>
                                            <?php if ($log['field_photo_path']): ?>
                                                <a href="<?php echo $log['field_photo_path']; ?>" target="_blank" class="text-blue-600 hover:text-blue-800 text-xs">
                                                    View Field Photo
                                                </a>
                                            <?php endif; ?>
                                        </div>
                                    <?php endif; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- Field Map -->
        <div class="mt-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Field Location</h2>
            <div class="bg-white rounded-lg shadow-sm border">
                <div class="p-6">
                    <div id="fieldMap" class="map-container"></div>
                </div>
            </div>
        </div>
    </main>
</div>

<script>
// Initialize Lucide icons
lucide.createIcons();

// Initialize map
const fieldMap = L.map('fieldMap').setView([<?php echo $field['latitude'] ?: '14.5995'; ?>, <?php echo $field['longitude'] ?: '120.9842'; ?>], 15);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(fieldMap);

// Add field marker
<?php if ($field['latitude'] && $field['longitude']): ?>
    const fieldMarker = L.marker([<?php echo $field['latitude']; ?>, <?php echo $field['longitude']; ?>])
        .addTo(fieldMap)
        .bindPopup(`
            <div class="field-popup">
                <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($field['field_name']); ?></h4>
                <p class="text-sm text-gray-600"><?php echo htmlspecialchars($field['barangay']); ?>, <?php echo htmlspecialchars($field['municipality']); ?></p>
                <p class="text-sm text-gray-600">Area: <?php echo $field['area_size']; ?> hectares</p>
                <p class="text-sm text-gray-600">Owner: <?php echo htmlspecialchars($field['owner_name']); ?></p>
            </div>
        `);
<?php endif; ?>
</script>

<?php include '../includes/footer.php'; ?> 