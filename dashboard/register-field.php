<?php
session_start();
require_once '../config/database.php';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    header('Location: ../auth/login.php');
    exit();
}

$page_title = "Register Field";
$error_message = '';
$success_message = '';

if ($_POST) {
    $field_name = trim($_POST['field_name']);
    $area_size = floatval($_POST['area_size']);
    $barangay = trim($_POST['barangay']);
    $municipality = trim($_POST['municipality']);
    $latitude = floatval($_POST['latitude']);
    $longitude = floatval($_POST['longitude']);
    $crop_variety = trim($_POST['crop_variety']);
    $date_planted = $_POST['date_planted'];
    
    // Validation
    if (empty($field_name) || empty($area_size) || empty($barangay) || empty($municipality)) {
        $error_message = "Please fill in all required fields.";
    } elseif ($area_size < 0.1 || $area_size > 1000) {
        $error_message = "Field size must be between 0.1 and 1000 hectares.";
    } else {
        $database = new Database();
        $db = $database->getConnection();
        
        try {
            $db->beginTransaction();
            
            // Insert field
            $field_query = "INSERT INTO fields (field_name, area_size, barangay, municipality, latitude, longitude, crop_variety, date_planted, registered_by, status) 
                           VALUES (:field_name, :area_size, :barangay, :municipality, :latitude, :longitude, :crop_variety, :date_planted, :registered_by, 'submitted')";
            
            $field_stmt = $db->prepare($field_query);
            $field_stmt->bindParam(':field_name', $field_name);
            $field_stmt->bindParam(':area_size', $area_size);
            $field_stmt->bindParam(':barangay', $barangay);
            $field_stmt->bindParam(':municipality', $municipality);
            $field_stmt->bindParam(':latitude', $latitude);
            $field_stmt->bindParam(':longitude', $longitude);
            $field_stmt->bindParam(':crop_variety', $crop_variety);
            $field_stmt->bindParam(':date_planted', $date_planted);
            $field_stmt->bindParam(':registered_by', $_SESSION['user_id']);
            
            if ($field_stmt->execute()) {
                $field_id = $db->lastInsertId();
                
                // Handle file uploads
                $upload_dir = '../uploads/field_documents/';
                if (!is_dir($upload_dir)) {
                    mkdir($upload_dir, 0755, true);
                }
                
                $document_types = ['barangay_certification', 'land_title', 'valid_id_front', 'valid_id_back', 'selfie_with_id'];
                $upload_success = true;
                
                foreach ($document_types as $doc_type) {
                    if (isset($_FILES[$doc_type]) && $_FILES[$doc_type]['error'] === UPLOAD_ERR_OK) {
                        $file = $_FILES[$doc_type];
                        $file_extension = pathinfo($file['name'], PATHINFO_EXTENSION);
                        $file_name = $field_id . '_' . $doc_type . '.' . $file_extension;
                        $file_path = $upload_dir . $file_name;
                        
                        if (move_uploaded_file($file['tmp_name'], $file_path)) {
                            $doc_query = "INSERT INTO field_documents (field_id, document_type, file_path, file_name) 
                                        VALUES (:field_id, :document_type, :file_path, :file_name)";
                            $doc_stmt = $db->prepare($doc_query);
                            $doc_stmt->bindParam(':field_id', $field_id);
                            $doc_stmt->bindParam(':document_type', $doc_type);
                            $doc_stmt->bindParam(':file_path', $file_path);
                            $doc_stmt->bindParam(':file_name', $file_name);
                            
                            if (!$doc_stmt->execute()) {
                                $upload_success = false;
                                break;
                            }
                        } else {
                            $upload_success = false;
                            break;
                        }
                    }
                }
                
                if ($upload_success) {
                    $db->commit();
                    $success_message = "Field registered successfully! Your submission is now awaiting SRA review (5-10 working days).";
                } else {
                    $db->rollback();
                    $error_message = "Error uploading documents. Please try again.";
                }
            } else {
                $db->rollback();
                $error_message = "Error registering field. Please try again.";
            }
        } catch (Exception $e) {
            $db->rollback();
            $error_message = "An error occurred. Please try again.";
        }
    }
}

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
                    <h1 class="text-xl font-semibold text-gray-900">Register Field</h1>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="bg-white rounded-lg shadow-sm border">
            <div class="p-6 border-b">
                <h2 class="text-lg font-semibold text-gray-900">Field Information</h2>
                <p class="text-sm text-gray-600">Register your sugarcane field with complete details</p>
            </div>

            <?php if ($error_message): ?>
                <div class="m-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    <?php echo $error_message; ?>
                </div>
            <?php endif; ?>

            <?php if ($success_message): ?>
                <div class="m-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                    <?php echo $success_message; ?>
                    <div class="mt-3">
                        <a href="lobby.php" class="text-green-800 underline">Return to Dashboard</a>
                    </div>
                </div>
            <?php endif; ?>

            <form method="POST" enctype="multipart/form-data" class="p-6 space-y-6">
                <!-- Field Details -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label for="field_name" class="block text-sm font-medium text-gray-700 mb-1">Field Name *</label>
                        <input type="text" id="field_name" name="field_name" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                               placeholder="Enter field name">
                    </div>

                    <div>
                        <label for="area_size" class="block text-sm font-medium text-gray-700 mb-1">Area Size (hectares) *</label>
                        <input type="number" id="area_size" name="area_size" step="0.01" min="0.1" max="1000" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                               placeholder="0.00">
                    </div>

                    <div>
                        <label for="barangay" class="block text-sm font-medium text-gray-700 mb-1">Barangay *</label>
                        <input type="text" id="barangay" name="barangay" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                               placeholder="Enter barangay">
                    </div>

                    <div>
                        <label for="municipality" class="block text-sm font-medium text-gray-700 mb-1">Municipality *</label>
                        <input type="text" id="municipality" name="municipality" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                               placeholder="Enter municipality">
                    </div>

                    <div>
                        <label for="crop_variety" class="block text-sm font-medium text-gray-700 mb-1">Sugarcane Variety</label>
                        <select id="crop_variety" name="crop_variety"
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
                        <label for="date_planted" class="block text-sm font-medium text-gray-700 mb-1">Date Planted</label>
                        <input type="date" id="date_planted" name="date_planted"
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                </div>

                <!-- Map Location -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Field Location *</label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label for="latitude" class="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                            <input type="number" id="latitude" name="latitude" step="any" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                   placeholder="14.5995">
                        </div>
                        <div>
                            <label for="longitude" class="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                            <input type="number" id="longitude" name="longitude" step="any" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                   placeholder="120.9842">
                        </div>
                    </div>
                    <div class="mt-4">
                        <div id="locationMap" class="map-container"></div>
                        <p class="text-xs text-gray-500 mt-2">Click on the map to set the field location</p>
                    </div>
                </div>

                <!-- Required Documents -->
                <div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">Required Documents</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label for="barangay_certification" class="block text-sm font-medium text-gray-700 mb-1">Barangay Certification *</label>
                            <input type="file" id="barangay_certification" name="barangay_certification" accept=".pdf,.jpg,.jpeg,.png" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <p class="text-xs text-gray-500 mt-1">PDF or image file</p>
                        </div>

                        <div>
                            <label for="land_title" class="block text-sm font-medium text-gray-700 mb-1">Land Title *</label>
                            <input type="file" id="land_title" name="land_title" accept=".pdf,.jpg,.jpeg,.png" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <p class="text-xs text-gray-500 mt-1">PDF or image file</p>
                        </div>

                        <div>
                            <label for="valid_id_front" class="block text-sm font-medium text-gray-700 mb-1">Valid ID (Front) *</label>
                            <input type="file" id="valid_id_front" name="valid_id_front" accept=".jpg,.jpeg,.png" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <p class="text-xs text-gray-500 mt-1">Image file only</p>
                        </div>

                        <div>
                            <label for="valid_id_back" class="block text-sm font-medium text-gray-700 mb-1">Valid ID (Back) *</label>
                            <input type="file" id="valid_id_back" name="valid_id_back" accept=".jpg,.jpeg,.png" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <p class="text-xs text-gray-500 mt-1">Image file only</p>
                        </div>

                        <div class="md:col-span-2">
                            <label for="selfie_with_id" class="block text-sm font-medium text-gray-700 mb-1">Selfie with Valid ID *</label>
                            <input type="file" id="selfie_with_id" name="selfie_with_id" accept=".jpg,.jpeg,.png" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <p class="text-xs text-gray-500 mt-1">Image file only</p>
                        </div>
                    </div>
                </div>

                <!-- Information Box -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 class="text-sm font-semibold text-blue-800 mb-2">What happens after submission?</h4>
                    <ul class="text-sm text-blue-700 space-y-1">
                        <li>• Your field registration will be reviewed by SRA officers</li>
                        <li>• Review process takes 5-10 working days</li>
                        <li>• Once approved, your field will appear on the map</li>
                        <li>• You can then add workers and submit reports</li>
                    </ul>
                </div>

                <!-- Submit Button -->
                <div class="flex justify-end space-x-4">
                    <a href="lobby.php" class="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                        Cancel
                    </a>
                    <button type="submit" class="px-6 py-2 bg-primary text-white rounded-md hover:bg-green-700">
                        Register Field
                    </button>
                </div>
            </form>
        </div>
    </main>
</div>

<script>
// Initialize Lucide icons
lucide.createIcons();

// Initialize map for location selection
const locationMap = L.map('locationMap').setView([14.5995, 120.9842], 10);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(locationMap);

// Add marker for location selection
let locationMarker = null;

locationMap.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    // Remove existing marker
    if (locationMarker) {
        locationMap.removeLayer(locationMarker);
    }
    
    // Add new marker
    locationMarker = L.marker([lat, lng]).addTo(locationMap);
    
    // Update form fields
    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lng.toFixed(6);
});

// Form validation
document.querySelector('form').addEventListener('submit', function(e) {
    const latitude = document.getElementById('latitude').value;
    const longitude = document.getElementById('longitude').value;
    
    if (!latitude || !longitude) {
        e.preventDefault();
        alert('Please select a location on the map.');
        return false;
    }
});
</script>

<?php include '../includes/footer.php'; ?> 