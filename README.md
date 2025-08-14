# CaneMap - Smart Sugarcane Field Management System

CaneMap is a comprehensive digital platform designed for managing sugarcane fields, tracking farming activities, and facilitating communication between farmers, landowners, and SRA (Sugar Regulatory Administration) officers.

## 🌾 Features

### Core Functionality
- **Interactive Field Mapping**: Visual representation of sugarcane fields using Leaflet.js and OpenStreetMap
- **Field Registration**: Complete field registration with document upload and SRA review process
- **Task Logging**: Daily activity tracking with photo documentation
- **Report Submission**: Cost and production report generation for SRA compliance
- **Role-Based Access**: Different dashboards for farmers, field owners, and SRA officers

### User Roles & Permissions

#### 👨‍🌾 Farmers (All Users)
- Register and manage sugarcane fields
- Join existing fields as workers
- Log daily activities with photos
- Submit cost and production reports
- View field maps and progress

#### 🏡 Field Owners
- Approve worker join requests
- View task logs and field activities
- Manage field information
- Submit reports for their fields

#### 👨‍💼 SRA Officers
- Review field registrations and documents
- Mark submissions as reviewed
- View and review cost/production reports
- Read-only access to all field data

## 🔥 Firebase Reports System (New)

The reports system has been modernized with Firebase integration, providing a fully client-side solution for cost and production reporting.

### Key Features
- **Firebase Authentication**: Secure user management with automatic session handling
- **Real-time Data**: Instant updates using Firestore listeners
- **Cloud Storage**: Secure file uploads to Firebase Storage
- **Access Control**: Field-level permissions based on ownership or approved worker status
- **Modern UI**: Enhanced user experience with real-time validation and feedback

### Reports Types

#### Cost of Production Reports
- Field selection with access control
- Cost breakdown (fertilizer, labor, equipment, other)
- Automatic total calculation
- Optional document uploads (PDF, images)
- Real-time form validation

#### Production Reports
- Harvest area and yield tracking
- Date and variety selection
- Optional harvest proof photos
- Automatic field access validation
- Instant submission feedback

### Technical Implementation
- **Frontend**: `public/views/reports.html` - Modern, responsive interface
- **Backend**: `public/backend/reports.js` - Firebase operations and business logic
- **Architecture**: ES6 modules with async/await patterns
- **Security**: Firebase Security Rules for data protection
- **Performance**: Optimized queries and real-time updates

### Migration Benefits
- **Scalability**: Cloud-based infrastructure
- **Reliability**: Firebase's global infrastructure
- **Maintenance**: Reduced server management overhead
- **Security**: Built-in authentication and authorization
- **Performance**: Fast, responsive user experience

## 🔗 Firebase Join Field System (New)

The Join Field functionality has been converted to Firebase, allowing users to request access to sugarcane fields they don't own.

### Key Features
- **Field Discovery**: Browse available fields with interactive map
- **Join Requests**: Submit requests to work on fields
- **Real-time Updates**: Instant status updates using Firestore
- **Access Control**: Field-level permissions and request management
- **Interactive Maps**: Leaflet.js integration for field visualization

### System Components
- **Frontend**: `public/join-field.html` - User interface for field joining
- **Backend**: `public/backend/join-field.js` - Firebase operations and business logic
- **Configuration**: `public/backend/firebase-config.js` - Firebase setup and initialization

### Firestore Collections Used

#### Fields Collection
```javascript
{
  field_name: "string",
  barangay: "string", 
  municipality: "string",
  area_size: "number",
  owner_uid: "string", // Firebase Auth UID of field owner
  crop_variety: "string", // optional
  status: "active" | "sra_reviewed" | "inactive",
  latitude: "number", // optional
  longitude: "number", // optional
  created_at: "timestamp"
}
```

#### Field Workers Collection
```javascript
{
  field_id: "string", // Reference to fields collection
  user_uid: "string", // Firebase Auth UID
  status: "pending" | "approved" | "rejected",
  requested_at: "timestamp"
}
```

### Features

#### Available Fields
- Displays all fields with status 'active' or 'sra_reviewed'
- Excludes fields owned by the current user
- Shows field details: name, location, area, owner, crop variety
- Allows users to submit join requests

#### Join Requests
- Prevents duplicate requests for the same field
- Shows pending, approved, and rejected requests
- Displays request date and status
- Links to task logging for approved requests

#### Interactive Map
- Uses Leaflet.js for map display
- Shows field locations with markers
- Popup information with join request button
- Centered on Philippines coordinates

### Security Rules
The system implements proper Firestore security rules:
- Users can read all fields
- Field owners can modify their fields
- Users can manage their own join requests
- Field owners can approve/reject requests for their fields

### Dependencies
- **Firebase SDK v12.1.0**: Authentication and Firestore
- **Tailwind CSS**: Styling
- **Lucide Icons**: Icon library
- **Leaflet.js**: Interactive maps

## 📝 Firebase Task Logging System (New)

The Task Logging system has been converted to Firebase, enabling users to record and track daily farming activities with photo documentation.

### Key Features
- **Activity Tracking**: Log daily tasks with detailed descriptions
- **Photo Documentation**: Upload selfies and field photos for verification
- **Status Management**: Track task completion status (Done, In Progress, Not Yet Done, Delayed)
- **Real-time Updates**: Instant task log updates using Firestore
- **Field Access Control**: Verify user permissions before allowing task logging
- **Interactive Map**: Display field location with Leaflet.js integration

### System Components
- **Frontend**: `public/views/task-logging.html` - User interface for task logging
- **Backend**: `public/backend/task-logging.js` - Firebase operations and business logic
- **Configuration**: `public/backend/firebase-config.js` - Firebase setup and initialization

### Firestore Collections Used

#### Task Logs Collection
```javascript
{
  id: "auto-generated",
  field_id: "string", // Reference to fields collection
  user_id: "string", // Firebase Auth UID
  task_name: "string", // Name of the task
  description: "string", // Optional task description
  task_status: "done" | "in_progress" | "not_yet_done" | "delayed",
  selfie_path: "string", // Firebase Storage URL for selfie
  field_photo_path: "string", // Firebase Storage URL for field photo
  worker_name: "string", // Name of the worker
  field_name: "string", // Name of the field
  logged_at: "timestamp" // When the task was logged
}
```

### Features

#### Task Submission
- Form validation for required fields
- File upload support for selfies and field photos
- Automatic user identification and field association
- Real-time feedback and error handling

#### Task History
- Chronological display of all tasks for a field
- Status indicators with color coding
- Photo links for uploaded images
- Worker identification and timestamps

#### Field Access Control
- Verifies user is field owner or approved worker
- Automatic redirect for unauthorized access
- Secure field data retrieval

#### Interactive Map
- Displays field location coordinates
- Field information popup with details
- Fallback to default Philippines coordinates if none specified

### Security Features
- **Authentication Required**: Only authenticated users can access
- **Field-level Permissions**: Users can only log tasks for accessible fields
- **File Upload Security**: Images stored securely in Firebase Storage
- **Data Validation**: Client and server-side validation

### Dependencies
- **Firebase SDK v12.1.0**: Authentication, Firestore, and Storage
- **Tailwind CSS**: Responsive styling
- **Lucide Icons**: Modern icon library
- **Leaflet.js**: Interactive mapping

## 🚀 Installation

### Prerequisites

#### Legacy System (PHP/MySQL)
- PHP 7.4 or higher
- MySQL 5.7 or higher
- Apache/Nginx web server
- Composer (optional, for dependency management)

#### New Firebase System
- Modern web browser with ES6 support
- Firebase project setup
- Firebase SDK v12.1.0
- No server-side requirements

### Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/canemap.git
   cd canemap
   ```

2. **Database Setup**
   - Create a MySQL database named `canemap_db`
   - Import the database schema:
   ```bash
   mysql -u root -p canemap_db < config/database_schema.sql
   ```

3. **Configuration**
   - Update database credentials in `config/database.php`
   - Ensure the `uploads/` directory is writable:
   ```bash
   mkdir uploads
   chmod 755 uploads
   mkdir uploads/field_documents uploads/task_photos uploads/cost_reports uploads/production_reports
   chmod 755 uploads/*
   ```

4. **Web Server Configuration**
   - Point your web server to the project root directory
   - Ensure PHP has write permissions for file uploads

### Firebase Setup (New System)

1. **Firebase Project Configuration**
   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Authentication, Firestore, and Storage services
   - Update `public/backend/firebase-config.js` with your project credentials

2. **Firestore Security Rules**
   - Configure Firestore security rules for data protection
   - Set up proper user authentication and field access controls
   - Example rules for Join Field and Task Logging systems:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Users can read their own data
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
       
       // Users can read all fields
       match /fields/{fieldId} {
         allow read: if request.auth != null;
         allow write: if request.auth != null && request.auth.uid == resource.data.owner_uid;
       }
       
       // Users can read/write their own field worker requests
       match /field_workers/{requestId} {
         allow read, write: if request.auth != null && 
           (request.auth.uid == resource.data.user_uid || 
            request.auth.uid == get(/databases/$(database)/documents/fields/$(resource.data.field_id)).data.owner_uid);
       }
       
       // Users can read/write task logs for fields they have access to
       match /task_logs/{logId} {
         allow read, write: if request.auth != null && 
           (request.auth.uid == resource.data.user_id || 
            request.auth.uid == get(/databases/$(database)/documents/fields/$(resource.data.field_id)).data.registered_by ||
            exists(/databases/$(database)/documents/field_workers?field_id=resource.data.field_id&user_id=request.auth.uid&status="approved"));
       }
     }
   }
   ```

3. **Storage Rules**
   - Configure Firebase Storage rules for file uploads
   - Set appropriate file type and size restrictions

4. **Authentication Setup**
   - Enable Email/Password authentication in Firebase Console
   - Configure user roles and permissions

## 📋 System Flow

### 1. User Registration
- All users register as "Farmers"
- Email verification required
- Simple registration process

### 2. Lobby Dashboard
- Universal entry point for all users
- Interactive map showing all active fields
- Quick actions for field registration and joining
- Notifications and user menu

### 3. Field Registration
- Farmers can register their sugarcane fields
- Required documents: Barangay certification, land title, valid ID, selfie
- Map-based location selection
- Status: "Submitted - Awaiting SRA Review"

### 4. SRA Review Process
- SRA officers review submitted field documents
- Mark fields as "Reviewed" (read-only access)
- Fields become visible on map after review

### 5. Field Management
- Field owners can approve worker join requests
- Workers can log daily activities with photos
- Real-time task tracking and status updates

### 6. Report Submission
- Cost of Production Reports
- Production Reports
- Document upload support
- SRA review workflow

#### New Firebase Reports Flow
1. **Authentication**: User logs in via Firebase Authentication
2. **Field Access**: System loads user's accessible fields (owner or approved worker)
3. **Form Submission**: Real-time validation and Firebase Storage uploads
4. **Data Storage**: Reports stored in Firestore with automatic timestamps
5. **Real-time Updates**: Report history updates instantly after submission
6. **File Management**: Secure file storage with download URLs

## 🗺️ Interactive Maps

The system uses **Leaflet.js** with **OpenStreetMap** for:
- Field location visualization
- Interactive field markers
- Popup information windows
- Location selection for field registration

## 📊 Database Schema

### Legacy MySQL Tables
- `users` - User accounts and profiles
- `fields` - Sugarcane field information
- `field_documents` - Uploaded field documents
- `field_workers` - Worker-field relationships
- `task_logs` - Daily activity logs
- `cost_reports` - Cost of production reports
- `production_reports` - Harvest production reports
- `sra_officers` - SRA officer accounts
- `notifications` - System notifications
- `system_settings` - Application configuration

### New Firebase Collections

#### Fields Collection
```javascript
{
  id: "auto-generated",
  field_name: "Field Name",
  barangay: "Barangay Name",
  registered_by: "user_uid",
  status: "active" | "sra_reviewed"
}
```

#### Cost Reports Collection
```javascript
{
  id: "auto-generated",
  field_id: "field_id",
  user_id: "user_uid",
  report_period: "Q1 2024",
  fertilizer_cost: 1000.00,
  labor_cost: 2000.00,
  equipment_cost: 500.00,
  other_costs: 300.00,
  total_cost: 3800.00,
  summary_file_path: "firebase_storage_url",
  field_name: "Field Name",
  barangay: "Barangay Name",
  status: "pending" | "approved" | "rejected" | "under_review",
  submitted_at: "firestore_timestamp"
}
```

#### Production Reports Collection
```javascript
{
  id: "auto-generated",
  field_id: "field_id",
  user_id: "user_uid",
  area_harvested: 5.5,
  total_yield: 25000.00,
  harvest_date: "2024-01-15",
  sugarcane_variety: "Phil 75-514",
  harvest_proof_path: "firebase_storage_url",
  field_name: "Field Name",
  barangay: "Barangay Name",
  status: "pending" | "approved" | "rejected" | "under_review",
  submitted_at: "firestore_timestamp"
}
```

#### Field Workers Collection
```javascript
{
  id: "auto-generated",
  field_id: "field_id",
  user_id: "user_uid",
  status: "pending" | "approved" | "rejected"
}
```

### Firebase Storage Structure
```
/cost_reports/
  - cost_reports_timestamp_userid_filename.ext
  
/production_reports/
  - production_reports_timestamp_userid_filename.ext
```

## 🎨 User Interface

### Design Features
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Modern UI**: Clean, minimalist design with Tailwind CSS
- **Interactive Elements**: Hover effects, transitions, and animations
- **Status Indicators**: Color-coded status badges
- **Photo Integration**: Support for selfies and field photos

### Color Scheme
- Primary: Green (#00412E) - Agriculture theme
- Secondary: Light Green (#96BF8A) - Accent color
- Status Colors: Blue (pending), Green (approved), Red (rejected)

## 🔧 Technical Stack

### Frontend
- **HTML5/CSS3**: Semantic markup and styling
- **Tailwind CSS**: Utility-first CSS framework
- **JavaScript**: Interactive functionality
- **Leaflet.js**: Interactive maps
- **Lucide Icons**: Modern icon library
- **ES6 Modules**: Modern JavaScript with Firebase SDK v12.1.0
- **Async/Await**: Modern asynchronous programming patterns

### Backend
- **PHP**: Server-side scripting (Legacy)
- **Firebase**: Modern cloud backend (New)
  - **Firebase Authentication**: User management
  - **Firestore**: NoSQL database
  - **Firebase Storage**: File management
- **MySQL**: Database management (Legacy)
- **PDO**: Database abstraction layer (Legacy)
- **Session Management**: User authentication (Legacy)

### Libraries
- **Chart.js**: Data visualization (ready for future use)
- **Date-fns**: Date manipulation utilities

## 📱 Mobile Responsiveness

The system is fully responsive and optimized for:
- **Desktop**: Full-featured interface
- **Tablet**: Touch-friendly controls
- **Mobile**: Simplified navigation and forms

## 🔒 Security Features

### Legacy System
- **Password Hashing**: Secure password storage
- **SQL Injection Prevention**: Prepared statements
- **File Upload Security**: Type and size validation
- **Session Management**: Secure user sessions
- **Access Control**: Role-based permissions

### New Firebase System
- **Firebase Authentication**: Industry-standard user management
- **Firestore Security Rules**: Document-level access control
- **Storage Security Rules**: File upload restrictions and validation
- **Real-time Security**: Automatic authentication state management
- **Cloud Security**: Google's enterprise-grade security infrastructure

## 📈 Future Enhancements

### Planned Features
- **Real-time Notifications**: WebSocket integration
- **Advanced Analytics**: Charts and data visualization
- **Mobile App**: Native iOS/Android applications
- **API Integration**: RESTful API for third-party apps
- **Weather Integration**: Real-time weather data
- **Harvest Prediction**: AI-powered yield forecasting

### Technical Improvements
- **Caching**: Redis for performance optimization
- **CDN Integration**: Faster asset delivery
- **Automated Testing**: Unit and integration tests
- **CI/CD Pipeline**: Automated deployment

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Contact the development team
- Check the documentation

## 🏆 Acknowledgments

- **OpenStreetMap**: Free map data
- **Leaflet.js**: Interactive maps
- **Tailwind CSS**: Modern styling framework
- **Lucide**: Beautiful icons
- **SRA**: Regulatory guidance and requirements

## 📁 Project Structure

### Legacy PHP Files
- `public/dashboard/reports.php` - Original PHP reports system
- `config/database.php` - Database connection and configuration

### New Firebase Files
- `public/views/reports.html` - Modern client-side reports interface
- `public/backend/reports.js` - Firebase backend logic for reports
- `public/join-field.html` - Join Field interface for field access requests
- `public/backend/join-field.js` - Firebase backend logic for field joining
- `public/views/task-logging.html` - Task logging interface for daily activities
- `public/backend/task-logging.js` - Firebase backend logic for task logging
- `public/backend/firebase-config.js` - Firebase configuration and initialization

### Key Directories
- `public/views/` - HTML interfaces for the system
- `public/backend/` - JavaScript backend logic and Firebase integration
- `public/auth/` - Authentication pages
- `public/dashboard/` - Legacy dashboard pages
- `public/uploads/` - File storage (legacy system)

## 🔄 Migration Status

The system is currently in a **hybrid state**:
- ✅ **Reports System**: Fully migrated to Firebase (client-side)
- ✅ **Join Field System**: Fully migrated to Firebase (client-side)
- ✅ **Task Logging System**: Fully migrated to Firebase (client-side)
- 🔄 **Other Systems**: Still using legacy PHP/MySQL
- 📋 **Authentication**: Firebase Authentication available
- 🗄️ **Database**: Firestore collections for reports, field management, and task logging, MySQL for other data

### Next Steps for Full Migration
1. Migrate field registration system to Firebase
2. ✅ **Task Logging**: Converted to Firebase (client-side)
3. Update user management to Firebase Auth
4. Migrate remaining dashboard functionality
5. Decommission legacy PHP/MySQL components

---

**CaneMap** - Digitizing sugarcane farming for a sustainable future 🌾 