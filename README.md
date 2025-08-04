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

## 🚀 Installation

### Prerequisites
- PHP 7.4 or higher
- MySQL 5.7 or higher
- Apache/Nginx web server
- Composer (optional, for dependency management)

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

## 🗺️ Interactive Maps

The system uses **Leaflet.js** with **OpenStreetMap** for:
- Field location visualization
- Interactive field markers
- Popup information windows
- Location selection for field registration

## 📊 Database Schema

### Core Tables
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

### Backend
- **PHP**: Server-side scripting
- **MySQL**: Database management
- **PDO**: Database abstraction layer
- **Session Management**: User authentication

### Libraries
- **Chart.js**: Data visualization (ready for future use)
- **Date-fns**: Date manipulation utilities

## 📱 Mobile Responsiveness

The system is fully responsive and optimized for:
- **Desktop**: Full-featured interface
- **Tablet**: Touch-friendly controls
- **Mobile**: Simplified navigation and forms

## 🔒 Security Features

- **Password Hashing**: Secure password storage
- **SQL Injection Prevention**: Prepared statements
- **File Upload Security**: Type and size validation
- **Session Management**: Secure user sessions
- **Access Control**: Role-based permissions

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

---

**CaneMap** - Digitizing sugarcane farming for a sustainable future 🌾 