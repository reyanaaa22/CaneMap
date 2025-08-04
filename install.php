<?php
/**
 * CaneMap Installation Script
 * This script helps set up the CaneMap system
 */

// Check if already installed
if (file_exists('config/installed.txt')) {
    die('CaneMap is already installed. Remove config/installed.txt to reinstall.');
}

$step = isset($_GET['step']) ? intval($_GET['step']) : 1;
$error = '';
$success = '';

// Step 1: System Requirements Check
if ($step == 1) {
    $requirements = [
        'PHP Version (>= 7.4)' => version_compare(PHP_VERSION, '7.4.0', '>='),
        'PDO Extension' => extension_loaded('pdo'),
        'PDO MySQL Extension' => extension_loaded('pdo_mysql'),
        'GD Extension' => extension_loaded('gd'),
        'File Uploads' => ini_get('file_uploads'),
        'Upload Directory Writable' => is_writable('.') || is_writable('uploads'),
    ];
    
    $all_passed = true;
    foreach ($requirements as $requirement => $passed) {
        if (!$passed) $all_passed = false;
    }
    
    if ($all_passed) {
        $success = 'All system requirements are met!';
    } else {
        $error = 'Some system requirements are not met. Please fix them before continuing.';
    }
}

// Step 2: Database Configuration
if ($step == 2 && $_POST) {
    $host = $_POST['host'];
    $dbname = $_POST['dbname'];
    $username = $_POST['username'];
    $password = $_POST['password'];
    
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$dbname", $username, $password);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Test connection
        $pdo->query('SELECT 1');
        
        // Update database config
        $config_content = "<?php
class Database {
    private \$host = '$host';
    private \$db_name = '$dbname';
    private \$username = '$username';
    private \$password = '$password';
    public \$conn;

    public function getConnection() {
        \$this->conn = null;
        try {
            \$this->conn = new PDO(\"mysql:host=\" . \$this->host . \";dbname=\" . \$this->db_name, \$this->username, \$this->password);
            \$this->conn->exec(\"set names utf8\");
        } catch(PDOException \$exception) {
            echo \"Connection error: \" . \$exception->getMessage();
        }
        return \$this->conn;
    }
}
?>";
        
        file_put_contents('config/database.php', $config_content);
        
        // Import database schema
        $schema = file_get_contents('config/database_schema.sql');
        $pdo->exec($schema);
        
        $success = 'Database configured successfully!';
    } catch (Exception $e) {
        $error = 'Database connection failed: ' . $e->getMessage();
    }
}

// Step 3: Create Upload Directories
if ($step == 3) {
    $directories = [
        'uploads',
        'uploads/field_documents',
        'uploads/task_photos',
        'uploads/cost_reports',
        'uploads/production_reports'
    ];
    
    $all_created = true;
    foreach ($directories as $dir) {
        if (!is_dir($dir)) {
            if (!mkdir($dir, 0755, true)) {
                $all_created = false;
            }
        }
    }
    
    if ($all_created) {
        $success = 'Upload directories created successfully!';
    } else {
        $error = 'Failed to create some upload directories. Please check permissions.';
    }
}

// Step 4: Create Admin Account
if ($step == 4 && $_POST) {
    $admin_name = $_POST['admin_name'];
    $admin_email = $_POST['admin_email'];
    $admin_password = $_POST['admin_password'];
    
    if (empty($admin_name) || empty($admin_email) || empty($admin_password)) {
        $error = 'Please fill in all fields.';
    } else {
        try {
            require_once 'config/database.php';
            $database = new Database();
            $db = $database->getConnection();
            
            // Create admin user
            $hashed_password = password_hash($admin_password, PASSWORD_DEFAULT);
            $query = "INSERT INTO users (full_name, email, password, status, email_verified) 
                     VALUES (:name, :email, :password, 'verified', 1)";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':name', $admin_name);
            $stmt->bindParam(':email', $admin_email);
            $stmt->bindParam(':password', $hashed_password);
            
            if ($stmt->execute()) {
                $user_id = $db->lastInsertId();
                
                // Create SRA officer account
                $sra_query = "INSERT INTO sra_officers (user_id, officer_name, designation) 
                             VALUES (:user_id, :name, 'System Administrator')";
                $sra_stmt = $db->prepare($sra_query);
                $sra_stmt->bindParam(':user_id', $user_id);
                $sra_stmt->bindParam(':name', $admin_name);
                $sra_stmt->execute();
                
                $success = 'Admin account created successfully!';
            } else {
                $error = 'Failed to create admin account.';
            }
        } catch (Exception $e) {
            $error = 'Error creating admin account: ' . $e->getMessage();
        }
    }
}

// Step 5: Installation Complete
if ($step == 5) {
    file_put_contents('config/installed.txt', date('Y-m-d H:i:s'));
    $success = 'CaneMap has been installed successfully!';
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CaneMap Installation</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .bg-primary { background-color: #00412E; }
        .text-primary { color: #00412E; }
        .border-primary { border-color: #00412E; }
    </style>
</head>
<body class="bg-gray-50">
    <div class="min-h-screen flex items-center justify-center p-4">
        <div class="w-full max-w-2xl bg-white rounded-lg shadow-lg">
            <div class="p-8">
                <div class="text-center mb-8">
                    <div class="text-4xl mb-4">🌾</div>
                    <h1 class="text-3xl font-bold text-gray-900 mb-2">CaneMap Installation</h1>
                    <p class="text-gray-600">Step <?php echo $step; ?> of 5</p>
                </div>

                <?php if ($error): ?>
                    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                        <?php echo $error; ?>
                    </div>
                <?php endif; ?>

                <?php if ($success): ?>
                    <div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
                        <?php echo $success; ?>
                    </div>
                <?php endif; ?>

                <?php if ($step == 1): ?>
                    <!-- System Requirements -->
                    <div class="space-y-4">
                        <h2 class="text-xl font-semibold text-gray-900 mb-4">System Requirements Check</h2>
                        
                        <?php foreach ($requirements as $requirement => $passed): ?>
                            <div class="flex items-center justify-between p-3 border rounded-lg">
                                <span class="text-gray-700"><?php echo $requirement; ?></span>
                                <span class="<?php echo $passed ? 'text-green-600' : 'text-red-600'; ?>">
                                    <?php echo $passed ? '✓ Passed' : '✗ Failed'; ?>
                                </span>
                            </div>
                        <?php endforeach; ?>
                        
                        <?php if ($all_passed): ?>
                            <div class="mt-6">
                                <a href="?step=2" class="w-full bg-primary text-white py-3 px-6 rounded-lg font-semibold text-center block">
                                    Continue to Database Setup
                                </a>
                            </div>
                        <?php endif; ?>
                    </div>

                <?php elseif ($step == 2): ?>
                    <!-- Database Configuration -->
                    <form method="POST" class="space-y-4">
                        <h2 class="text-xl font-semibold text-gray-900 mb-4">Database Configuration</h2>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Database Host</label>
                            <input type="text" name="host" value="localhost" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Database Name</label>
                            <input type="text" name="dbname" value="canemap_db" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Database Username</label>
                            <input type="text" name="username" value="root" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Database Password</label>
                            <input type="password" name="password" value=""
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary">
                        </div>
                        
                        <button type="submit" class="w-full bg-primary text-white py-3 px-6 rounded-lg font-semibold">
                            Test Connection & Continue
                        </button>
                    </form>

                <?php elseif ($step == 3): ?>
                    <!-- Upload Directories -->
                    <div class="space-y-4">
                        <h2 class="text-xl font-semibold text-gray-900 mb-4">Create Upload Directories</h2>
                        
                        <p class="text-gray-600 mb-4">The installer will create the necessary upload directories for documents and photos.</p>
                        
                        <?php if ($all_created): ?>
                            <div class="mt-6">
                                <a href="?step=4" class="w-full bg-primary text-white py-3 px-6 rounded-lg font-semibold text-center block">
                                    Continue to Admin Setup
                                </a>
                            </div>
                        <?php else: ?>
                            <div class="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg">
                                Please create the upload directories manually and refresh this page.
                            </div>
                        <?php endif; ?>
                    </div>

                <?php elseif ($step == 4): ?>
                    <!-- Admin Account -->
                    <form method="POST" class="space-y-4">
                        <h2 class="text-xl font-semibold text-gray-900 mb-4">Create Admin Account</h2>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                            <input type="text" name="admin_name" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                            <input type="email" name="admin_email" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                            <input type="password" name="admin_password" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary">
                        </div>
                        
                        <button type="submit" class="w-full bg-primary text-white py-3 px-6 rounded-lg font-semibold">
                            Create Admin Account
                        </button>
                    </form>

                <?php elseif ($step == 5): ?>
                    <!-- Installation Complete -->
                    <div class="text-center space-y-6">
                        <div class="text-6xl">🎉</div>
                        <h2 class="text-2xl font-bold text-gray-900">Installation Complete!</h2>
                        <p class="text-gray-600">CaneMap has been successfully installed on your system.</p>
                        
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 class="font-semibold text-blue-900 mb-2">Next Steps:</h3>
                            <ul class="text-sm text-blue-700 space-y-1 text-left">
                                <li>• Access your CaneMap installation</li>
                                <li>• Log in with your admin credentials</li>
                                <li>• Start registering fields and users</li>
                                <li>• Configure SRA officer accounts</li>
                            </ul>
                        </div>
                        
                        <div class="space-y-3">
                            <a href="index.html" class="w-full bg-primary text-white py-3 px-6 rounded-lg font-semibold text-center block">
                                Go to CaneMap
                            </a>
                            <a href="auth/login.php" class="w-full bg-gray-100 text-gray-700 py-3 px-6 rounded-lg font-semibold text-center block">
                                Admin Login
                            </a>
                        </div>
                        
                        <div class="text-xs text-gray-500">
                            <p>For security, please delete this install.php file after installation.</p>
                        </div>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</body>
</html> 