<?php
session_start();
require_once '../config/database.php';

// Check if user is logged in and is SRA officer
if (!isset($_SESSION['user_id'])) {
    header('Location: ../auth/login.php');
    exit();
}

$page_title = "SRA Dashboard";

$database = new Database();
$db = $database->getConnection();
$user_id = $_SESSION['user_id'];

// Check if user is SRA officer
$sra_check_query = "SELECT * FROM sra_officers WHERE user_id = :user_id AND is_active = 1";
$sra_check_stmt = $db->prepare($sra_check_query);
$sra_check_stmt->bindParam(':user_id', $user_id);
$sra_check_stmt->execute();
$sra_officer = $sra_check_stmt->fetch(PDO::FETCH_ASSOC);

if (!$sra_officer) {
    header('Location: lobby.php');
    exit();
}

// Handle mark as reviewed
if ($_POST && isset($_POST['action'])) {
    $field_id = intval($_POST['field_id']);
    
    if ($_POST['action'] === 'mark_field_reviewed') {
        $update_query = "UPDATE fields SET status = 'sra_reviewed', sra_reviewed_at = NOW(), sra_reviewed_by = :user_id WHERE id = :field_id";
        $update_stmt = $db->prepare($update_query);
        $update_stmt->bindParam(':user_id', $user_id);
        $update_stmt->bindParam(':field_id', $field_id);
        
        if ($update_stmt->execute()) {
            $success_message = "Field marked as reviewed successfully.";
        }
    } elseif ($_POST['action'] === 'mark_cost_report_reviewed') {
        $report_id = intval($_POST['report_id']);
        $update_query = "UPDATE cost_reports SET status = 'sra_reviewed', sra_reviewed_at = NOW(), sra_reviewed_by = :user_id WHERE id = :report_id";
        $update_stmt = $db->prepare($update_query);
        $update_stmt->bindParam(':user_id', $user_id);
        $update_stmt->bindParam(':report_id', $report_id);
        
        if ($update_stmt->execute()) {
            $success_message = "Cost report marked as reviewed successfully.";
        }
    } elseif ($_POST['action'] === 'mark_production_report_reviewed') {
        $report_id = intval($_POST['report_id']);
        $update_query = "UPDATE production_reports SET status = 'sra_reviewed', sra_reviewed_at = NOW(), sra_reviewed_by = :user_id WHERE id = :report_id";
        $update_stmt = $db->prepare($update_query);
        $update_stmt->bindParam(':user_id', $user_id);
        $update_stmt->bindParam(':report_id', $report_id);
        
        if ($update_stmt->execute()) {
            $success_message = "Production report marked as reviewed successfully.";
        }
    }
}

// Get pending field submissions
$pending_fields_query = "SELECT f.*, u.full_name as owner_name, u.email as owner_email
                        FROM fields f 
                        JOIN users u ON f.registered_by = u.id 
                        WHERE f.status = 'submitted'
                        ORDER BY f.created_at DESC";
$pending_fields_stmt = $db->prepare($pending_fields_query);
$pending_fields_stmt->execute();
$pending_fields = $pending_fields_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get pending cost reports
$pending_cost_reports_query = "SELECT cr.*, f.field_name, f.barangay, f.municipality, u.full_name as farmer_name
                              FROM cost_reports cr
                              JOIN fields f ON cr.field_id = f.id
                              JOIN users u ON cr.user_id = u.id
                              WHERE cr.status = 'submitted'
                              ORDER BY cr.submitted_at DESC";
$pending_cost_reports_stmt = $db->prepare($pending_cost_reports_query);
$pending_cost_reports_stmt->execute();
$pending_cost_reports = $pending_cost_reports_stmt->fetchAll(PDO::FETCH_ASSOC);

// Get pending production reports
$pending_production_reports_query = "SELECT pr.*, f.field_name, f.barangay, f.municipality, u.full_name as farmer_name
                                    FROM production_reports pr
                                    JOIN fields f ON pr.field_id = f.id
                                    JOIN users u ON pr.user_id = u.id
                                    WHERE pr.status = 'submitted'
                                    ORDER BY pr.submitted_at DESC";
$pending_production_reports_stmt = $db->prepare($pending_production_reports_query);
$pending_production_reports_stmt->execute();
$pending_production_reports = $pending_production_reports_stmt->fetchAll(PDO::FETCH_ASSOC);

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
                    <h1 class="text-xl font-semibold text-gray-900">SRA Dashboard</h1>
                </div>
                <div class="text-sm text-gray-600">
                    Welcome, <?php echo htmlspecialchars($sra_officer['officer_name']); ?>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <?php if (isset($success_message)): ?>
            <div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
                <?php echo $success_message; ?>
            </div>
        <?php endif; ?>

        <!-- Statistics -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white rounded-lg shadow-sm border p-6">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center mr-4">
                        <i data-lucide="file-text" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Pending Field Submissions</p>
                        <p class="text-2xl font-bold text-gray-900"><?php echo count($pending_fields); ?></p>
                    </div>
                </div>
            </div>
            
            <div class="bg-white rounded-lg shadow-sm border p-6">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center mr-4">
                        <i data-lucide="dollar-sign" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Pending Cost Reports</p>
                        <p class="text-2xl font-bold text-gray-900"><?php echo count($pending_cost_reports); ?></p>
                    </div>
                </div>
            </div>
            
            <div class="bg-white rounded-lg shadow-sm border p-6">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center mr-4">
                        <i data-lucide="bar-chart" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Pending Production Reports</p>
                        <p class="text-2xl font-bold text-gray-900"><?php echo count($pending_production_reports); ?></p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Field Submissions -->
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Field Submissions</h2>
            
            <?php if (empty($pending_fields)): ?>
                <div class="bg-white rounded-lg shadow-sm border p-8 text-center">
                    <div class="text-gray-400 mb-4">
                        <i data-lucide="check-circle" class="w-12 h-12 mx-auto"></i>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">All Caught Up!</h3>
                    <p class="text-gray-600">No pending field submissions to review.</p>
                </div>
            <?php else: ?>
                <div class="bg-white rounded-lg shadow-sm border">
                    <div class="p-6 border-b">
                        <h3 class="text-lg font-semibold text-gray-900">Pending Field Reviews</h3>
                        <p class="text-sm text-gray-600">Review field registrations and mark as reviewed</p>
                    </div>
                    
                    <div class="p-6">
                        <div class="space-y-4">
                            <?php foreach ($pending_fields as $field): ?>
                                <div class="border border-gray-200 rounded-lg p-4">
                                    <div class="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($field['field_name']); ?></h4>
                                            <p class="text-sm text-gray-600"><?php echo htmlspecialchars($field['barangay']); ?>, <?php echo htmlspecialchars($field['municipality']); ?></p>
                                            <p class="text-sm text-gray-600">Owner: <?php echo htmlspecialchars($field['owner_name']); ?> (<?php echo htmlspecialchars($field['owner_email']); ?>)</p>
                                            <p class="text-sm text-gray-600">Area: <?php echo $field['area_size']; ?> hectares</p>
                                            <p class="text-sm text-gray-600">Submitted: <?php echo date('M j, Y g:i A', strtotime($field['created_at'])); ?></p>
                                        </div>
                                        <div class="text-right">
                                            <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full status-submitted">
                                                Pending Review
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <!-- Document Links -->
                                    <div class="mb-4">
                                        <h5 class="text-sm font-medium text-gray-700 mb-2">Submitted Documents:</h5>
                                        <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
                                            <?php
                                            $documents_query = "SELECT * FROM field_documents WHERE field_id = :field_id";
                                            $documents_stmt = $db->prepare($documents_query);
                                            $documents_stmt->bindParam(':field_id', $field['id']);
                                            $documents_stmt->execute();
                                            $documents = $documents_stmt->fetchAll(PDO::FETCH_ASSOC);
                                            
                                            foreach ($documents as $doc):
                                                $doc_type_display = str_replace('_', ' ', ucfirst($doc['document_type']));
                                            ?>
                                                <a href="<?php echo $doc['file_path']; ?>" target="_blank" 
                                                   class="block p-2 bg-gray-50 rounded text-xs text-center hover:bg-gray-100">
                                                    <?php echo $doc_type_display; ?>
                                                </a>
                                            <?php endforeach; ?>
                                        </div>
                                    </div>
                                    
                                    <form method="POST" class="flex justify-end">
                                        <input type="hidden" name="action" value="mark_field_reviewed">
                                        <input type="hidden" name="field_id" value="<?php echo $field['id']; ?>">
                                        <button type="submit" class="btn-primary px-4 py-2 rounded-md text-sm">
                                            Mark as Reviewed
                                        </button>
                                    </form>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
        </div>

        <!-- Cost Reports -->
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Cost Reports</h2>
            
            <?php if (empty($pending_cost_reports)): ?>
                <div class="bg-white rounded-lg shadow-sm border p-8 text-center">
                    <div class="text-gray-400 mb-4">
                        <i data-lucide="check-circle" class="w-12 h-12 mx-auto"></i>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">All Caught Up!</h3>
                    <p class="text-gray-600">No pending cost reports to review.</p>
                </div>
            <?php else: ?>
                <div class="bg-white rounded-lg shadow-sm border">
                    <div class="p-6 border-b">
                        <h3 class="text-lg font-semibold text-gray-900">Pending Cost Reports</h3>
                        <p class="text-sm text-gray-600">Review cost of production reports</p>
                    </div>
                    
                    <div class="p-6">
                        <div class="space-y-4">
                            <?php foreach ($pending_cost_reports as $report): ?>
                                <div class="border border-gray-200 rounded-lg p-4">
                                    <div class="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($report['field_name']); ?></h4>
                                            <p class="text-sm text-gray-600">Farmer: <?php echo htmlspecialchars($report['farmer_name']); ?></p>
                                            <p class="text-sm text-gray-600">Period: <?php echo htmlspecialchars($report['report_period']); ?></p>
                                            <p class="text-sm text-gray-600">Total Cost: ₱<?php echo number_format($report['total_cost'], 2); ?></p>
                                            <p class="text-sm text-gray-600">Submitted: <?php echo date('M j, Y g:i A', strtotime($report['submitted_at'])); ?></p>
                                        </div>
                                        <div class="text-right">
                                            <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full status-submitted">
                                                Pending Review
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                                        <div>
                                            <p class="text-gray-600">Fertilizer</p>
                                            <p class="font-semibold">₱<?php echo number_format($report['fertilizer_cost'], 2); ?></p>
                                        </div>
                                        <div>
                                            <p class="text-gray-600">Labor</p>
                                            <p class="font-semibold">₱<?php echo number_format($report['labor_cost'], 2); ?></p>
                                        </div>
                                        <div>
                                            <p class="text-gray-600">Equipment</p>
                                            <p class="font-semibold">₱<?php echo number_format($report['equipment_cost'], 2); ?></p>
                                        </div>
                                        <div>
                                            <p class="text-gray-600">Other</p>
                                            <p class="font-semibold">₱<?php echo number_format($report['other_costs'], 2); ?></p>
                                        </div>
                                    </div>
                                    
                                    <?php if ($report['summary_file_path']): ?>
                                        <div class="mb-4">
                                            <a href="<?php echo $report['summary_file_path']; ?>" target="_blank" 
                                               class="text-blue-600 hover:text-blue-800 text-sm">
                                                View Summary Document →
                                            </a>
                                        </div>
                                    <?php endif; ?>
                                    
                                    <form method="POST" class="flex justify-end">
                                        <input type="hidden" name="action" value="mark_cost_report_reviewed">
                                        <input type="hidden" name="report_id" value="<?php echo $report['id']; ?>">
                                        <button type="submit" class="btn-primary px-4 py-2 rounded-md text-sm">
                                            Mark as Reviewed
                                        </button>
                                    </form>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
        </div>

        <!-- Production Reports -->
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Production Reports</h2>
            
            <?php if (empty($pending_production_reports)): ?>
                <div class="bg-white rounded-lg shadow-sm border p-8 text-center">
                    <div class="text-gray-400 mb-4">
                        <i data-lucide="check-circle" class="w-12 h-12 mx-auto"></i>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">All Caught Up!</h3>
                    <p class="text-gray-600">No pending production reports to review.</p>
                </div>
            <?php else: ?>
                <div class="bg-white rounded-lg shadow-sm border">
                    <div class="p-6 border-b">
                        <h3 class="text-lg font-semibold text-gray-900">Pending Production Reports</h3>
                        <p class="text-sm text-gray-600">Review harvest production reports</p>
                    </div>
                    
                    <div class="p-6">
                        <div class="space-y-4">
                            <?php foreach ($pending_production_reports as $report): ?>
                                <div class="border border-gray-200 rounded-lg p-4">
                                    <div class="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 class="font-semibold text-gray-900"><?php echo htmlspecialchars($report['field_name']); ?></h4>
                                            <p class="text-sm text-gray-600">Farmer: <?php echo htmlspecialchars($report['farmer_name']); ?></p>
                                            <p class="text-sm text-gray-600">Harvest Date: <?php echo date('M j, Y', strtotime($report['harvest_date'])); ?></p>
                                            <p class="text-sm text-gray-600">Area Harvested: <?php echo $report['area_harvested']; ?> hectares</p>
                                            <p class="text-sm text-gray-600">Total Yield: <?php echo number_format($report['total_yield'], 2); ?> kg</p>
                                            <p class="text-sm text-gray-600">Variety: <?php echo htmlspecialchars($report['sugarcane_variety']); ?></p>
                                            <p class="text-sm text-gray-600">Submitted: <?php echo date('M j, Y g:i A', strtotime($report['submitted_at'])); ?></p>
                                        </div>
                                        <div class="text-right">
                                            <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full status-submitted">
                                                Pending Review
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <?php if ($report['harvest_proof_path']): ?>
                                        <div class="mb-4">
                                            <a href="<?php echo $report['harvest_proof_path']; ?>" target="_blank" 
                                               class="text-blue-600 hover:text-blue-800 text-sm">
                                                View Harvest Proof →
                                            </a>
                                        </div>
                                    <?php endif; ?>
                                    
                                    <form method="POST" class="flex justify-end">
                                        <input type="hidden" name="action" value="mark_production_report_reviewed">
                                        <input type="hidden" name="report_id" value="<?php echo $report['id']; ?>">
                                        <button type="submit" class="btn-primary px-4 py-2 rounded-md text-sm">
                                            Mark as Reviewed
                                        </button>
                                    </form>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
        </div>
    </main>
</div>

<script>
// Initialize Lucide icons
lucide.createIcons();
</script>

<?php include '../includes/footer.php'; ?> 