<?php
session_start();
require_once '../config/database.php';

$page_title = "Sign In";
$error_message = '';
$success_message = '';

if ($_POST) {
    $email = trim($_POST['email']);
    $password = $_POST['password'];
    
    if (!empty($email) && !empty($password)) {
        $database = new Database();
        $db = $database->getConnection();
        
        $query = "SELECT id, full_name, email, password, status, email_verified FROM users WHERE email = :email";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':email', $email);
        $stmt->execute();
        
        if ($stmt->rowCount() > 0) {
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (password_verify($password, $user['password'])) {
                if ($user['email_verified']) {
                    $_SESSION['user_id'] = $user['id'];
                    $_SESSION['user_name'] = $user['full_name'];
                    $_SESSION['user_email'] = $user['email'];
                    $_SESSION['user_status'] = $user['status'];
                    
                    // Redirect to lobby dashboard (all users go to same dashboard)
                    header("Location: ../dashboard/lobby.php");
                    exit();
                } else {
                    $error_message = "Please verify your email address before logging in. Check your email for the verification link or register again.";
                }
            } else {
                $error_message = "Invalid email or password.";
            }
        } else {
            $error_message = "Invalid email or password.";
        }
    } else {
        $error_message = "Please fill in all fields.";
    }
}

include '../includes/header.php';
?>

<div class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
    <div class="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div class="text-center mb-8">
            <div class="text-4xl mb-4">🌾</div>
            <h1 class="text-3xl font-bold text-primary mb-2">Welcome Back</h1>
            <p class="text-gray-600">Sign in to your CaneMap account</p>
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

        <form method="POST" class="space-y-6">
            <div>
                <label for="email" class="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input type="email" id="email" name="email" required
                       class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                       placeholder="Enter your email">
            </div>

            <div>
                <label for="password" class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input type="password" id="password" name="password" required
                       class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                       placeholder="Enter your password">
            </div>

            <div class="flex items-center justify-between">
                <label class="flex items-center">
                    <input type="checkbox" class="rounded border-gray-300 text-primary focus:ring-primary">
                    <span class="ml-2 text-sm text-gray-600">Remember me</span>
                </label>
                <a href="forgot-password.php" class="text-sm text-primary hover:underline">Forgot password?</a>
            </div>

            <button type="submit" class="btn-primary w-full py-3 px-6 rounded-lg font-semibold text-lg">
                Sign In
            </button>
        </form>

        <div class="mt-6 text-center space-y-2">
            <p class="text-gray-600">Don't have an account?</p>
            <a href="register.php" class="text-primary font-semibold hover:underline">Sign up here</a>
            
            <div class="mt-4 pt-4 border-t border-gray-200">
                <p class="text-gray-500 text-sm mb-2">Need to verify your email?</p>
                <a href="resend-verification.php" class="text-blue-600 text-sm hover:underline">Resend verification link</a>
            </div>
        </div>

        <div class="mt-6 text-center">
            <a href="../dashboard/lobby.php" class="text-sm text-gray-500 hover:text-gray-700">
                Continue as Guest →
            </a>
        </div>
    </div>
</div>

<?php include '../includes/footer.php'; ?>