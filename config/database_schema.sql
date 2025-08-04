-- CaneMap Database Schema
-- Created for Smart Sugarcane Field Management System

-- Users table (simplified to single role: Farmer)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    contact_number VARCHAR(20),
    city_municipality VARCHAR(255),
    status ENUM('pending', 'verified', 'active', 'suspended') DEFAULT 'pending',
    verification_token VARCHAR(64),
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Fields table (sugarcane fields)
CREATE TABLE fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_name VARCHAR(255) NOT NULL,
    area_size DECIMAL(10,2) NOT NULL, -- in hectares
    barangay VARCHAR(255) NOT NULL,
    municipality VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    crop_variety VARCHAR(255),
    date_planted DATE,
    estimated_harvest_date DATE,
    current_growth_stage ENUM('planting', 'vegetative', 'tillering', 'grand_growth', 'maturity', 'harvest_ready') DEFAULT 'planting',
    status ENUM('submitted', 'sra_reviewed', 'active', 'harvested', 'inactive') DEFAULT 'submitted',
    registered_by INT NOT NULL,
    sra_reviewed_at TIMESTAMP NULL,
    sra_reviewed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (registered_by) REFERENCES users(id),
    FOREIGN KEY (sra_reviewed_by) REFERENCES users(id)
);

-- Field documents (for SRA review)
CREATE TABLE field_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_id INT NOT NULL,
    document_type ENUM('barangay_certification', 'land_title', 'valid_id_front', 'valid_id_back', 'selfie_with_id') NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
);

-- Field workers (farmers who join fields)
CREATE TABLE field_workers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_id INT NOT NULL,
    user_id INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected', 'removed') DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    approved_by INT NULL,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id),
    UNIQUE KEY unique_field_worker (field_id, user_id)
);

-- Task logs (daily activities)
CREATE TABLE task_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_id INT NOT NULL,
    user_id INT NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    description TEXT,
    task_status ENUM('done', 'in_progress', 'not_yet_done', 'delayed') DEFAULT 'not_yet_done',
    selfie_path VARCHAR(500),
    field_photo_path VARCHAR(500),
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Cost of Production Reports
CREATE TABLE cost_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_id INT NOT NULL,
    user_id INT NOT NULL,
    report_period VARCHAR(50) NOT NULL, -- e.g., "Q1 2024", "January 2024"
    fertilizer_cost DECIMAL(12,2) DEFAULT 0,
    labor_cost DECIMAL(12,2) DEFAULT 0,
    equipment_cost DECIMAL(12,2) DEFAULT 0,
    other_costs DECIMAL(12,2) DEFAULT 0,
    total_cost DECIMAL(12,2) NOT NULL,
    summary_file_path VARCHAR(500),
    status ENUM('submitted', 'sra_reviewed') DEFAULT 'submitted',
    sra_reviewed_at TIMESTAMP NULL,
    sra_reviewed_by INT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sra_reviewed_by) REFERENCES users(id)
);

-- Production Reports
CREATE TABLE production_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_id INT NOT NULL,
    user_id INT NOT NULL,
    area_harvested DECIMAL(10,2) NOT NULL, -- in hectares
    total_yield DECIMAL(12,2) NOT NULL, -- in kg/tons
    harvest_date DATE NOT NULL,
    sugarcane_variety VARCHAR(255),
    harvest_proof_path VARCHAR(500),
    status ENUM('submitted', 'sra_reviewed') DEFAULT 'submitted',
    sra_reviewed_at TIMESTAMP NULL,
    sra_reviewed_by INT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sra_reviewed_by) REFERENCES users(id)
);

-- SRA Officers (for document and report review)
CREATE TABLE sra_officers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    officer_name VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- System notifications
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    related_type ENUM('field_request', 'task_log', 'report_submission', 'sra_review') NULL,
    related_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- System settings
CREATE TABLE system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('sra_review_days', '7', 'Expected days for SRA review'),
('max_field_size', '1000', 'Maximum field size in hectares'),
('min_field_size', '0.1', 'Minimum field size in hectares'),
('harvest_prediction_enabled', 'true', 'Enable harvest prediction feature'),
('map_center_lat', '14.5995', 'Default map center latitude'),
('map_center_lng', '120.9842', 'Default map center longitude'),
('map_zoom_level', '10', 'Default map zoom level');

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_fields_status ON fields(status);
CREATE INDEX idx_fields_location ON fields(latitude, longitude);
CREATE INDEX idx_field_workers_status ON field_workers(status);
CREATE INDEX idx_task_logs_field ON task_logs(field_id);
CREATE INDEX idx_task_logs_date ON task_logs(logged_at);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read); 