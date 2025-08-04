<?php
session_start();
require_once '../config/database.php';

$page_title = "Sign up";
$error_message = '';
$success_message = '';

if ($_POST) {
    $full_name = trim($_POST['full_name']);
    $email = trim($_POST['email']);
    $password = $_POST['password'];
    $confirm_password = $_POST['confirm_password'];
    $contact_number = trim($_POST['contact_number'] ?? '');
    $city_municipality = trim($_POST['city_municipality'] ?? '');
    
    // Validation
    if (empty($full_name) || empty($email) || empty($password) || empty($confirm_password)) {
        $error_message = "Please fill in all required fields.";
    } elseif ($password !== $confirm_password) {
        $error_message = "Passwords do not match.";
    } elseif (strlen($password) < 6) {
        $error_message = "Password must be at least 6 characters long.";
    } else {
        $database = new Database();
        $db = $database->getConnection();
        
        // Check if email already exists
        $check_query = "SELECT id FROM users WHERE email = :email";
        $check_stmt = $db->prepare($check_query);
        $check_stmt->bindParam(':email', $email);
        $check_stmt->execute();
        
        if ($check_stmt->rowCount() > 0) {
            $error_message = "Email address already exists.";
        } else {
            // Hash password
            $hashed_password = password_hash($password, PASSWORD_DEFAULT);
            $verification_token = bin2hex(random_bytes(32));
            
            // Insert user with default role as farmer
            $query = "INSERT INTO users (full_name, email, password, contact_number, city_municipality, status, verification_token) 
                     VALUES (:full_name, :email, :password, :contact_number, :city_municipality, 'pending', :verification_token)";
            
            $stmt = $db->prepare($query);
            $stmt->bindParam(':full_name', $full_name);
            $stmt->bindParam(':email', $email);
            $stmt->bindParam(':password', $hashed_password);
            $stmt->bindParam(':contact_number', $contact_number);
            $stmt->bindParam(':city_municipality', $city_municipality);
            $stmt->bindParam(':verification_token', $verification_token);
            
            if ($stmt->execute()) {
                $success_message = "Registration successful! Please check your email for verification or click the verification link below.";
                // Create verification link
                $verification_link = "http://" . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']) . "/verify.php?token=" . $verification_token;
            } else {
                $error_message = "Registration failed. Please try again.";
            }
        }
    }
}

include '../includes/header.php';
?>

<div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div class="w-full max-w-lg bg-white rounded-lg shadow-lg p-8">
        <div class="text-center mb-6">
            <h1 class="text-3xl font-bold text-gray-800 mb-2">Sign up</h1>
            <p class="text-gray-600 text-sm">Join CaneMap and start managing your sugarcane fields digitally</p>
        </div>

        <?php if ($error_message): ?>
            <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                <?php echo $error_message; ?>
            </div>
        <?php endif; ?>

        <?php if ($success_message): ?>
            <div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">
                <?php echo $success_message; ?>
                <?php if (isset($verification_link)): ?>
                    <div class="mt-3">
                        <p class="text-sm font-medium mb-2">Verification Link:</p>
                        <a href="<?php echo $verification_link; ?>" 
                           class="inline-block bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 transition-colors">
                            Verify Email Address
                        </a>
                    </div>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <form method="POST" class="space-y-4">
            <!-- Two-column layout for input fields -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Left Column -->
                <div class="space-y-3">
                    <div>
                        <label for="full_name" class="block text-sm font-medium text-gray-700 mb-1">Full Name:</label>
                        <input type="text" id="full_name" name="full_name" required
                               class="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                               placeholder="Enter your full name">
                    </div>

                    <div>
                        <label for="contact_number" class="block text-sm font-medium text-gray-700 mb-1">Contact Number:</label>
                        <input type="tel" id="contact_number" name="contact_number"
                               class="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                               placeholder="Enter your contact number">
                    </div>

                    <div>
                        <label for="password" class="block text-sm font-medium text-gray-700 mb-1">Password:</label>
                        <input type="password" id="password" name="password" required
                               class="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                               placeholder="Enter your password">
                        <p class="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                    </div>
                </div>

                <!-- Right Column -->
                <div class="space-y-3">
                    <div>
                        <label for="email" class="block text-sm font-medium text-gray-700 mb-1">Email Address:</label>
                        <input type="email" id="email" name="email" required
                               class="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                               placeholder="Enter your email address">
                    </div>

                    <div>
                        <label for="city_municipality" class="block text-sm font-medium text-gray-700 mb-1">City/Municipality:</label>
                        <input type="text" id="city_municipality" name="city_municipality"
                               class="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                               placeholder="Enter your city/municipality">
                    </div>

                    <div>
                        <label for="confirm_password" class="block text-sm font-medium text-gray-700 mb-1">Confirm Password:</label>
                        <input type="password" id="confirm_password" name="confirm_password" required
                               class="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                               placeholder="Confirm your password">
                    </div>
                </div>
            </div>

            <!-- Information Box -->
            <div class="bg-gray-700 text-white rounded-lg p-4 mt-4">
                <h3 class="text-base font-semibold mb-2">What happens next?</h3>
                <ul class="space-y-1 text-xs">
                    <li class="flex items-start">
                        <span class="mr-2">•</span>
                        <span>A verification email will be sent to your email address</span>
                    </li>
                    <li class="flex items-start">
                        <span class="mr-2">•</span>
                        <span>Click the verification link to activate your account</span>
                    </li>
                    <li class="flex items-start">
                        <span class="mr-2">•</span>
                        <span>Once verified, you'll be redirected to the Lobby Dashboard</span>
                    </li>
                    <li class="flex items-start">
                        <span class="mr-2">•</span>
                        <span>From there, you can join existing fields or explore the map</span>
                    </li>
                </ul>
            </div>

            <!-- Terms and Privacy Checkbox -->
            <div class="flex items-center mt-4">
                <input type="checkbox" id="terms" name="terms" required
                       class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
                <label for="terms" class="ml-2 text-sm text-gray-700">
                    I agree to the 
                    <a href="#" class="text-blue-600 underline">Terms of Service</a> 
                    and 
                    <a href="#" class="text-blue-600 underline">Privacy Policy</a>
                </label>
            </div>

            <!-- Sign Up Button -->
            <div class="text-center mt-6">
                <button type="submit"
                        class="w-full bg-gray-700 hover:bg-gray-800 text-white py-2 px-4 rounded-md font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-sm">
                    Sign Up
                </button>
            </div>
        </form>

        <div class="mt-4 text-center">
            <p class="text-gray-600 text-xs">Already have an account? 
                <a href="login.php" class="text-blue-600 font-semibold hover:underline">Sign in</a>
            </p>
        </div>
    </div>
</div>

<script>
// Password confirmation validation
document.getElementById('confirm_password').addEventListener('input', function() {
    const password = document.getElementById('password').value;
    const confirmPassword = this.value;
    
    if (password !== confirmPassword) {
        this.setCustomValidity('Passwords do not match');
    } else {
        this.setCustomValidity('');
    }
});

// Password strength validation
document.getElementById('password').addEventListener('input', function() {
    const password = this.value;
    
    if (password.length > 0 && password.length < 6) {
        this.setCustomValidity('Password must be at least 6 characters long');
    } else {
        this.setCustomValidity('');
    }
});
</script>

<?php include '../includes/footer.php'; ?>