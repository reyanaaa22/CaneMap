<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo isset($page_title) ? $page_title . ' - CaneMap' : 'CaneMap - Smart Sugarcane Field Management'; ?></title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
    
    <!-- Leaflet.js for Interactive Maps -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    
    <!-- Additional Libraries -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/date-fns@2.30.0/index.min.js"></script>
    
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .bg-primary { background-color: #00412E; }
        .bg-secondary { background-color: #96BF8A; }
        .text-primary { color: #00412E; }
        .text-secondary { color: #96BF8A; }
        .border-primary { border-color: #00412E; }
        .border-secondary { border-color: #96BF8A; }
        .hover\:bg-primary:hover { background-color: #00412E; }
        .hover\:bg-secondary:hover { background-color: #96BF8A; }
        .focus\:border-primary:focus { border-color: #00412E; }
        .focus\:ring-primary:focus { --tw-ring-color: #00412E; }
        
        .slide-in {
            animation: slideIn 0.6s ease-out forwards;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .fade-in {
            animation: fadeIn 0.8s ease-out forwards;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        .card-hover {
            transition: all 0.3s ease;
        }
        
        .card-hover:hover {
            transform: translateY(-4px);
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        
        .btn-primary {
            background-color: #00412E;
            color: white;
            transition: all 0.3s ease;
        }
        
        .btn-primary:hover {
            background-color: #002d20;
            transform: translateY(-1px);
        }
        
        .btn-secondary {
            background-color: #96BF8A;
            color: #00412E;
            transition: all 0.3s ease;
        }
        
        .btn-secondary:hover {
            background-color: #7da876;
            transform: translateY(-1px);
        }
        
        /* Map Styles */
        .map-container {
            height: 400px;
            width: 100%;
            border-radius: 8px;
            overflow: hidden;
        }
        
        .leaflet-popup-content {
            margin: 8px 12px;
            font-family: 'Inter', sans-serif;
        }
        
        .field-marker {
            background: #00412E;
            border: 2px solid #fff;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            font-weight: bold;
        }
        
        /* Status Colors */
        .status-pending { color: #f59e0b; }
        .status-approved { color: #10b981; }
        .status-rejected { color: #ef4444; }
        .status-submitted { color: #3b82f6; }
        .status-sra-reviewed { color: #8b5cf6; }
        .status-active { color: #10b981; }
        .status-harvested { color: #f59e0b; }
        
        /* Task Status Colors */
        .task-done { background-color: #dcfce7; color: #166534; }
        .task-in-progress { background-color: #fef3c7; color: #92400e; }
        .task-not-yet-done { background-color: #f3f4f6; color: #374151; }
        .task-delayed { background-color: #fee2e2; color: #991b1b; }
        
        /* Loading Spinner */
        .loading-spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #00412E;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Notification Badge */
        .notification-badge {
            position: absolute;
            top: -5px;
            right: -5px;
            background-color: #ef4444;
            color: white;
            border-radius: 50%;
            width: 18px;
            height: 18px;
            font-size: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        /* Custom Scrollbar */
        .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 3px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #a8a8a8;
        }
    </style>
</head>
<body class="bg-gray-50">