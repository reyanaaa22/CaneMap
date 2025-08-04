<?php
session_start();
require_once '../config/database.php';

$page_title = "Email Verification";
$message = '';
$message_type = '';

if (isset($_GET['token'])) {
    $token = $_GET['token'];
    
    $database = new Database();
    $db = $database->getConnection();
    
    // Find user with this verification token
    $query = "SELECT id, full_name, email, email_verified FROM users WHERE verification_token = :token";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':token', $token);
    $stmt->execute();
    
    if ($stmt->rowCount() > 0) {
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($user['email_verified']) {
            $message = "Your email has already been verified. You can now log in to your account.";
            $message_type = 'info';
        } else {
            // Update user to verified
            $update_query = "UPDATE users SET email_verified = 1, status = 'verified', verification_token = NULL WHERE id = :user_id";
            $update_stmt = $db->prepare($update_query);
            $update_stmt->bindParam(':user_id', $user['id']);
            
            if ($update_stmt->execute()) {
                $message = "Email verified successfully! You can now log in to your account.";
                $message_type = 'success';
            } else {
                $message = "Error verifying email. Please try again.";
                $message_type = 'error';
            }
        }
    } else {
        $message = "Invalid verification token. Please check your email for the correct link.";
        $message_type = 'error';
    }
} else {
    $message = "No verification token provided.";
    $message_type = 'error';
}

include '../includes/header.php';
?>

<div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <div class="text-center mb-6">
            <div class="text-4xl mb-4">🌾</div>
            <h1 class="text-2xl font-bold text-gray-800 mb-2">Email Verification</h1>
            <p class="text-gray-600 text-sm">Verifying your email address</p>
        </div>

        <?php if ($message): ?>
            <div class="mb-6 p-4 rounded-lg text-sm <?php 
                echo $message_type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 
                    ($message_type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 
                    'bg-blue-50 border border-blue-200 text-blue-700'); 
            ?>">
                <?php echo $message; ?>
            </div>
        <?php endif; ?>

        <div class="text-center">
            <?php if ($message_type === 'success'): ?>
                <div class="mb-6">
                    <div class="text-green-500 text-6xl mb-4">✓</div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">Verification Complete!</h3>
                    <p class="text-gray-600 text-sm mb-6">Your email has been successfully verified.</p>
                </div>
            <?php elseif ($message_type === 'info'): ?>
                <div class="mb-6">
                    <div class="text-blue-500 text-6xl mb-4">ℹ</div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">Already Verified</h3>
                    <p class="text-gray-600 text-sm mb-6">Your email was already verified.</p>
                </div>
            <?php else: ?>
                <div class="mb-6">
                    <div class="text-red-500 text-6xl mb-4">✗</div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">Verification Failed</h3>
                    <p class="text-gray-600 text-sm mb-6">There was an issue with the verification.</p>
                </div>
            <?php endif; ?>

            <div class="space-y-3">
                <a href="login.php" 
                   class="inline-block w-full bg-primary text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors">
                    Sign In to Your Account
                </a>
                
                <a href="../dashboard/lobby.php" 
                   class="inline-block w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-semibold hover:bg-gray-300 transition-colors">
                    Continue to Dashboard
                </a>
            </div>
        </div>

        <div class="mt-6 text-center">
            <p class="text-gray-500 text-xs">
                Having trouble? <a href="register.php" class="text-blue-600 hover:underline">Register again</a>
            </p>
            <p class="text-gray-500 text-xs mt-1">
                Or <a href="resend-verification.php" class="text-blue-600 hover:underline">resend verification link</a>
            </p>
        </div>
    </div>
</div>

<?php include '../includes/footer.php'; ?> 