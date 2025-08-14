<?php
session_start();
require_once '../config/database.php';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    header('Location: ../auth/login.php');
    exit();
}

$page_title = "Submit Reports";
$error_message = '';
$success_message = '';

$database = new Database();
$db = $database->getConnection();
$user_id = $_SESSION['user_id'];

// Handle cost report submission
if ($_POST && isset($_POST['report_type']) && $_POST['report_type'] === 'cost') {
    $field_id = intval($_POST['field_id']);
    $report_period = trim($_POST['report_period']);
    $fertilizer_cost = floatval($_POST['fertilizer_cost']);
    $labor_cost = floatval($_POST['labor_cost']);
    $equipment_cost = floatval($_POST['equipment_cost']);
    $other_costs = floatval($_POST['other_costs']);
    $total_cost = $fertilizer_cost + $labor_cost + $equipment_cost + $other_costs;
    
    if (empty($field_id) || empty($report_period)) {
        $error_message = "Please fill in all required fields.";
    } else {
        // Check if field belongs to user or user is approved worker
        $field_check_query = "SELECT f.* FROM fields f 
                             WHERE f.id = :field_id 
                             AND (f.registered_by = :user_id OR 
                                  EXISTS (SELECT 1 FROM field_workers fw WHERE fw.field_id = f.id AND fw.user_id = :user_id AND fw.status = 'approved'))";
        $field_check_stmt = $db->prepare($field_check_query);
        $field_check_stmt->bindParam(':field_id', $field_id);
        $field_check_stmt->bindParam(':user_id', $user_id);
        $field_check_stmt->execute();
        
        if ($field_check_stmt->rowCount() > 0) {
            // Handle file upload
            $summary_file_path = '';
            if (isset($_FILES['summary_file']) && $_FILES['summary_file']['error'] === UPLOAD_ERR_OK) {
                $upload_dir = '../uploads/cost_reports/';
                if (!is_dir($upload_dir)) {
                    mkdir($upload_dir, 0755, true);
                }
                
                $file = $_FILES['summary_file'];
                $file_extension = pathinfo($file['name'], PATHINFO_EXTENSION);
                $file_name = 'cost_report_' . time() . '_' . $user_id . '.' . $file_extension;
                $file_path = $upload_dir . $file_name;
                
                if (move_uploaded_file($file['tmp_name'], $file_path)) {
                    $summary_file_path = $file_path;
                }
            }
            
            // Insert cost report
            $insert_query = "INSERT INTO cost_reports (field_id, user_id, report_period, fertilizer_cost, labor_cost, equipment_cost, other_costs, total_cost, summary_file_path) 
                            VALUES (:field_id, :user_id, :report_period, :fertilizer_cost, :labor_cost, :equipment_cost, :other_costs, :total_cost, :summary_file_path)";
            $insert_stmt = $db->prepare($insert_query);
            $insert_stmt->bindParam(':field_id', $field_id);
            $insert_stmt->bindParam(':user_id', $user_id);
            $insert_stmt->bindParam(':report_period', $report_period);
            $insert_stmt->bindParam(':fertilizer_cost', $fertilizer_cost);
            $insert_stmt->bindParam(':labor_cost', $labor_cost);
            $insert_stmt->bindParam(':equipment_cost', $equipment_cost);
            $insert_stmt->bindParam(':other_costs', $other_costs);
            $insert_stmt->bindParam(':total_cost', $total_cost);
            $insert_stmt->bindParam(':summary_file_path', $summary_file_path);
            
            if ($insert_stmt->execute()) {
                $success_message = "Cost report submitted successfully! It will be reviewed by SRA officers.";
            } else {
                $error_message = "Error submitting report. Please try again.";
            }
        } else {
            $error_message = "You don't have access to this field.";
        }
    }
}

// Handle production report submission
if ($_POST && isset($_POST['report_type']) && $_POST['report_type'] === 'production') {
    $field_id = intval($_POST['field_id']);
    $area_harvested = floatval($_POST['area_harvested']);
    $total_yield = floatval($_POST['total_yield']);
    $harvest_date = $_POST['harvest_date'];
    $sugarcane_variety = trim($_POST['sugarcane_variety']);
    
    if (empty($field_id) || empty($area_harvested) || empty($total_yield) || empty($harvest_date)) {
        $error_message = "Please fill in all required fields.";
    } else {
        // Check if field belongs to user or user is approved worker
        $field_check_query = "SELECT f.* FROM fields f 
                             WHERE f.id = :field_id 
                             AND (f.registered_by = :user_id OR 
                                  EXISTS (SELECT 1 FROM field_workers fw WHERE fw.field_id = f.id AND fw.user_id = :user_id AND fw.status = 'approved'))";
        $field_check_stmt = $db->prepare($field_check_query);
        $field_check_stmt->bindParam(':field_id', $field_id);
        $field_check_stmt->bindParam(':user_id', $user_id);
        $field_check_stmt->execute();
        
        if ($field_check_stmt->rowCount() > 0) {
            // Handle file upload
            $harvest_proof_path = '';
            if (isset($_FILES['harvest_proof']) && $_FILES['harvest_proof']['error'] === UPLOAD_ERR_OK) {
                $upload_dir = '../uploads/production_reports/';
                if (!is_dir($upload_dir)) {
                    mkdir($upload_dir, 0755, true);
                }
                
                $file = $_FILES['harvest_proof'];
                $file_extension = pathinfo($file['name'], PATHINFO_EXTENSION);
                $file_name = 'harvest_proof_' . time() . '_' . $user_id . '.' . $file_extension;
                $file_path = $upload_dir . $file_name;
                
                if (move_uploaded_file($file['tmp_name'], $file_path)) {
                    $harvest_proof_path = $file_path;
                }
            }
            
            // Insert production report
            $insert_query = "INSERT INTO production_reports (field_id, user_id, area_harvested, total_yield, harvest_date, sugarcane_variety, harvest_proof_path) 
                            VALUES (:field_id, :user_id, :area_harvested, :total_yield, :harvest_date, :sugarcane_variety, :harvest_proof_path)";
            $insert_stmt = $db->prepare($insert_query);
            $insert_stmt->bindParam(':field_id', $field_id);
            $insert_stmt->bindParam(':user_id', $user_id);
            $insert_stmt->bindParam(':area_harvested', $area_harvested);
            $insert_stmt->bindParam(':total_yield', $total_yield);
            $insert_stmt->bindParam(':harvest_date', $harvest_date);
            $insert_stmt->bindParam(':sugarcane_variety', $sugarcane_variety);
            $insert_stmt->bindParam(':harvest_proof_path', $harvest_proof_path);
            
            if ($insert_stmt->execute()) {
                $success_message = "Production report submitted successfully! It will be reviewed by SRA officers.";
            } else {
                $error_message = "Error submitting report. Please try again.";
            }
        } else {
            $error_message = "You don't have access to this field.";
        }
    }
}

// Get user's accessible fields
$fields_query = "SELECT f.* FROM fields f 
                 WHERE (f.registered_by = :user_id OR 
                        EXISTS (SELECT 1 FROM field_workers fw WHERE fw.field_id = f.id AND fw.user_id = :user_id AND fw.status = 'approved'))
                 AND (f.status = 'active' OR f.status = 'sra_reviewed')
                 ORDER BY f.field_name";
$fields_stmt = $db->prepare($fields_query);
$fields_stmt->bindParam(':user_id', $user_id);
$fields_stmt->execute();
$accessible_fields = $fields_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get user's submitted reports
$cost_reports_query = "SELECT cr.*, f.field_name 
                       FROM cost_reports cr 
                       JOIN fields f ON cr.field_id = f.id 
                       WHERE cr.user_id = :user_id 
                       ORDER BY cr.submitted_at DESC";
$cost_reports_stmt = $db->prepare($cost_reports_query);
$cost_reports_stmt->bindParam(':user_id', $user_id);
$cost_reports_stmt->execute();
$cost_reports = $cost_reports_stmt->fetchAll(PDO::FETCH_ASSOC);

$production_reports_query = "SELECT pr.*, f.field_name 
                            FROM production_reports pr 
                            JOIN fields f ON pr.field_id = f.id 
                            WHERE pr.user_id = :user_id 
                            ORDER BY pr.submitted_at DESC";
$production_reports_stmt = $db->prepare($production_reports_query);
$production_reports_stmt->bindParam(':user_id', $user_id);
$production_reports_stmt->execute();
$production_reports = $production_reports_stmt->fetchAll(PDO::FETCH_ASSOC);

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
                    <h1 class="text-xl font-semibold text-gray-900">Submit Reports</h1>
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

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Cost Report Form -->
            <div class="bg-white rounded-lg shadow-sm border">
                <div class="p-6 border-b">
                    <h2 class="text-lg font-semibold text-gray-900">Cost of Production Report</h2>
                    <p class="text-sm text-gray-600">Submit your cost of production details</p>
                </div>
                
                <form method="POST" enctype="multipart/form-data" class="p-6 space-y-4">
                    <input type="hidden" name="report_type" value="cost">
                    
                    <div>
                        <label for="cost_field_id" class="block text-sm font-medium text-gray-700 mb-1">Field *</label>
                        <select id="cost_field_id" name="field_id" required
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Select a field</option>
                            <?php foreach ($accessible_fields as $field): ?>
                                <option value="<?php echo $field['id']; ?>">
                                    <?php echo htmlspecialchars($field['field_name']); ?> (<?php echo htmlspecialchars($field['barangay']); ?>)
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div>
                        <label for="report_period" class="block text-sm font-medium text-gray-700 mb-1">Report Period *</label>
                        <input type="text" id="report_period" name="report_period" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                               placeholder="e.g., Q1 2024, January 2024">
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="fertilizer_cost" class="block text-sm font-medium text-gray-700 mb-1">Fertilizer Cost (₱)</label>
                            <input type="number" id="fertilizer_cost" name="fertilizer_cost" step="0.01" min="0" value="0"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label for="labor_cost" class="block text-sm font-medium text-gray-700 mb-1">Labor Cost (₱)</label>
                            <input type="number" id="labor_cost" name="labor_cost" step="0.01" min="0" value="0"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label for="equipment_cost" class="block text-sm font-medium text-gray-700 mb-1">Equipment Cost (₱)</label>
                            <input type="number" id="equipment_cost" name="equipment_cost" step="0.01" min="0" value="0"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label for="other_costs" class="block text-sm font-medium text-gray-700 mb-1">Other Costs (₱)</label>
                            <input type="number" id="other_costs" name="other_costs" step="0.01" min="0" value="0"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                    </div>

                    <div>
                        <label for="cost_summary_file" class="block text-sm font-medium text-gray-700 mb-1">Summary Document (Optional)</label>
                        <input type="file" id="cost_summary_file" name="summary_file" accept=".pdf,.jpg,.jpeg,.png"
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <p class="text-xs text-gray-500 mt-1">Upload a summary document or receipt</p>
                    </div>

                    <button type="submit" class="w-full btn-primary py-2 px-4 rounded-md">
                        Submit Cost Report
                    </button>
                </form>
            </div>

            <!-- Production Report Form -->
            <div class="bg-white rounded-lg shadow-sm border">
                <div class="p-6 border-b">
                    <h2 class="text-lg font-semibold text-gray-900">Production Report</h2>
                    <p class="text-sm text-gray-600">Submit your harvest production details</p>
                </div>
                
                <form method="POST" enctype="multipart/form-data" class="p-6 space-y-4">
                    <input type="hidden" name="report_type" value="production">
                    
                    <div>
                        <label for="production_field_id" class="block text-sm font-medium text-gray-700 mb-1">Field *</label>
                        <select id="production_field_id" name="field_id" required
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Select a field</option>
                            <?php foreach ($accessible_fields as $field): ?>
                                <option value="<?php echo $field['id']; ?>">
                                    <?php echo htmlspecialchars($field['field_name']); ?> (<?php echo htmlspecialchars($field['barangay']); ?>)
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="area_harvested" class="block text-sm font-medium text-gray-700 mb-1">Area Harvested (ha) *</label>
                            <input type="number" id="area_harvested" name="area_harvested" step="0.01" min="0" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label for="total_yield" class="block text-sm font-medium text-gray-700 mb-1">Total Yield (kg) *</label>
                            <input type="number" id="total_yield" name="total_yield" step="0.01" min="0" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                    </div>

                    <div>
                        <label for="harvest_date" class="block text-sm font-medium text-gray-700 mb-1">Harvest Date *</label>
                        <input type="date" id="harvest_date" name="harvest_date" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    </div>

                    <div>
                        <label for="sugarcane_variety" class="block text-sm font-medium text-gray-700 mb-1">Sugarcane Variety</label>
                        <select id="sugarcane_variety" name="sugarcane_variety"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Select variety</option>
                            <option value="Phil 75-514">Phil 75-514</option>
                            <option value="Phil 80-016">Phil 80-016</option>
                            <option value="Phil 89-075">Phil 89-075</option>
                            <option value="Phil 99-179">Phil 99-179</option>
                            <option value="Phil 2000-2057">Phil 2000-2057</option>
                        </select>
                    </div>

                    <div>
                        <label for="harvest_proof" class="block text-sm font-medium text-gray-700 mb-1">Harvest Proof (Optional)</label>
                        <input type="file" id="harvest_proof" name="harvest_proof" accept=".jpg,.jpeg,.png"
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <p class="text-xs text-gray-500 mt-1">Upload a photo of the harvest</p>
                    </div>

                    <button type="submit" class="w-full btn-primary py-2 px-4 rounded-md">
                        Submit Production Report
                    </button>
                </form>
            </div>
        </div>

        <!-- Report History -->
        <div class="mt-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Report History</h2>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Cost Reports -->
                <div class="bg-white rounded-lg shadow-sm border">
                    <div class="p-6 border-b">
                        <h3 class="text-lg font-semibold text-gray-900">Cost Reports</h3>
                        <p class="text-sm text-gray-600">Your submitted cost reports</p>
                    </div>
                    
                    <div class="p-6">
                        <?php if (empty($cost_reports)): ?>
                            <p class="text-gray-500 text-center py-4">No cost reports submitted yet.</p>
                        <?php else: ?>
                            <div class="space-y-4">
                                <?php foreach ($cost_reports as $report): ?>
                                    <div class="border border-gray-200 rounded-lg p-4">
                                        <div class="flex justify-between items-start mb-2">
                                            <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($report['field_name']); ?></h4>
                                            <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full status-<?php echo $report['status']; ?>">
                                                <?php echo ucfirst(str_replace('_', ' ', $report['status'])); ?>
                                            </span>
                                        </div>
                                        <p class="text-sm text-gray-600">Period: <?php echo htmlspecialchars($report['report_period']); ?></p>
                                        <p class="text-sm text-gray-600">Total Cost: ₱<?php echo number_format($report['total_cost'], 2); ?></p>
                                        <p class="text-sm text-gray-600">Submitted: <?php echo date('M j, Y g:i A', strtotime($report['submitted_at'])); ?></p>
                                        
                                        <?php if ($report['summary_file_path']): ?>
                                            <div class="mt-2">
                                                <a href="<?php echo $report['summary_file_path']; ?>" target="_blank" 
                                                   class="text-blue-600 hover:text-blue-800 text-sm">
                                                    View Summary Document →
                                                </a>
                                            </div>
                                        <?php endif; ?>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- Production Reports -->
                <div class="bg-white rounded-lg shadow-sm border">
                    <div class="p-6 border-b">
                        <h3 class="text-lg font-semibold text-gray-900">Production Reports</h3>
                        <p class="text-sm text-gray-600">Your submitted production reports</p>
                    </div>
                    
                    <div class="p-6">
                        <?php if (empty($production_reports)): ?>
                            <p class="text-gray-500 text-center py-4">No production reports submitted yet.</p>
                        <?php else: ?>
                            <div class="space-y-4">
                                <?php foreach ($production_reports as $report): ?>
                                    <div class="border border-gray-200 rounded-lg p-4">
                                        <div class="flex justify-between items-start mb-2">
                                            <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($report['field_name']); ?></h4>
                                            <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full status-<?php echo $report['status']; ?>">
                                                <?php echo ucfirst(str_replace('_', ' ', $report['status'])); ?>
                                            </span>
                                        </div>
                                        <p class="text-sm text-gray-600">Harvest Date: <?php echo date('M j, Y', strtotime($report['harvest_date'])); ?></p>
                                        <p class="text-sm text-gray-600">Area: <?php echo $report['area_harvested']; ?> hectares</p>
                                        <p class="text-sm text-gray-600">Yield: <?php echo number_format($report['total_yield'], 2); ?> kg</p>
                                        <p class="text-sm text-gray-600">Submitted: <?php echo date('M j, Y g:i A', strtotime($report['submitted_at'])); ?></p>
                                        
                                        <?php if ($report['harvest_proof_path']): ?>
                                            <div class="mt-2">
                                                <a href="<?php echo $report['harvest_proof_path']; ?>" target="_blank" 
                                                   class="text-blue-600 hover:text-blue-800 text-sm">
                                                    View Harvest Proof →
                                                </a>
                                            </div>
                                        <?php endif; ?>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
    </main>
</div>

<script>
// Initialize Lucide icons
lucide.createIcons();

// Auto-calculate total cost
function calculateTotalCost() {
    const fertilizer = parseFloat(document.getElementById('fertilizer_cost').value) || 0;
    const labor = parseFloat(document.getElementById('labor_cost').value) || 0;
    const equipment = parseFloat(document.getElementById('equipment_cost').value) || 0;
    const other = parseFloat(document.getElementById('other_costs').value) || 0;
    
    const total = fertilizer + labor + equipment + other;
    console.log('Total cost: ₱' + total.toFixed(2));
}

// Add event listeners for cost calculation
document.getElementById('fertilizer_cost').addEventListener('input', calculateTotalCost);
document.getElementById('labor_cost').addEventListener('input', calculateTotalCost);
document.getElementById('equipment_cost').addEventListener('input', calculateTotalCost);
document.getElementById('other_costs').addEventListener('input', calculateTotalCost);
</script>

<?php include '../includes/footer.php'; ?> 