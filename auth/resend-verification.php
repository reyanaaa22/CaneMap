<?php
session_start();
require_once '../config/database.php';

$page_title = "Resend Verification";
$message = '';
$message_type = '';

if ($_POST && isset($_POST['email'])) {
    $email = trim($_POST['email']);
    
    if (!empty($email)) {
        $database = new Database();
        $db = $database->getConnection();
        
        // Check if user exists and is not verified
        $query = "SELECT id, full_name, email, email_verified FROM users WHERE email = :email";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':email', $email);
        $stmt->execute();
        
        if ($stmt->rowCount() > 0) {
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($user['email_verified']) {
                $message = "This email is already verified. You can log in to your account.";
                $message_type = 'info';
            } else {
                // Generate new verification token
                $new_token = bin2hex(random_bytes(32));
                
                // Update user with new verification token
                $update_query = "UPDATE users SET verification_token = :token WHERE id = :user_id";
                $update_stmt = $db->prepare($update_query);
                $update_stmt->bindParam(':token', $new_token);
                $update_stmt->bindParam(':user_id', $user['id']);
                
                if ($update_stmt->execute()) {
                    // Create new verification link
                    $verification_link = "http://" . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']) . "/verify.php?token=" . $new_token;
                    
                    $message = "New verification link sent! Check your email or use the link below.";
                    $message_type = 'success';
                } else {
                    $message = "Error generating new verification link. Please try again.";
                    $message_type = 'error';
                }
            }
        } else {
            $message = "Email address not found. Please check your email or register a new account.";
            $message_type = 'error';
        }
    } else {
        $message = "Please enter your email address.";
        $message_type = 'error';
    }
}

include '../includes/header.php';
?>

<div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <div class="text-center mb-6">
            <div class="text-4xl mb-4">🌾</div>
            <h1 class="text-2xl font-bold text-gray-800 mb-2">Resend Verification</h1>
            <p class="text-gray-600 text-sm">Get a new verification link for your email</p>
        </div>

        <?php if ($message): ?>
            <div class="mb-6 p-4 rounded-lg text-sm <?php 
                echo $message_type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 
                    ($message_type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 
                    'bg-blue-50 border border-blue-200 text-blue-700'); 
            ?>">
                <?php echo $message; ?>
                <?php if ($message_type === 'success' && isset($verification_link)): ?>
                    <div class="mt-3">
                        <p class="text-sm font-medium mb-2">New Verification Link:</p>
                        <a href="<?php echo $verification_link; ?>" 
                           class="inline-block bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 transition-colors">
                            Verify Email Address
                        </a>
                    </div>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <form method="POST" class="space-y-6">
            <div>
                <label for="email" class="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input type="email" id="email" name="email" required
                       class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                       placeholder="Enter your email address"
                       value="<?php echo isset($_POST['email']) ? htmlspecialchars($_POST['email']) : ''; ?>">
            </div>

            <button type="submit" class="btn-primary w-full py-3 px-6 rounded-lg font-semibold">
                Send New Verification Link
            </button>
        </form>

        <div class="mt-6 text-center space-y-3">
            <div>
                <a href="login.php" class="text-primary font-semibold hover:underline">
                    ← Back to Sign In
                </a>
            </div>
            
            <div>
                <p class="text-gray-500 text-sm">Don't have an account?</p>
                <a href="register.php" class="text-blue-600 font-semibold hover:underline">
                    Sign up here
                </a>
            </div>
        </div>

        <!-- Information Box -->
        <div class="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 class="text-sm font-semibold text-blue-800 mb-2">Why resend verification?</h3>
            <ul class="space-y-1 text-xs text-blue-700">
                <li class="flex items-start">
                    <span class="mr-2">•</span>
                    <span>You didn't receive the original verification email</span>
                </li>
                <li class="flex items-start">
                    <span class="mr-2">•</span>
                    <span>The verification link has expired</span>
                </li>
                <li class="flex items-start">
                    <span class="mr-2">•</span>
                    <span>You accidentally deleted the verification email</span>
                </li>
            </ul>
        </div>
    </div>
</div>

<?php include '../includes/footer.php'; ?> 