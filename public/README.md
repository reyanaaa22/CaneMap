# CaneMap - Join Field (Firebase Version)

This is the Firebase version of the Join Field functionality, converted from the original PHP/MySQL implementation.

## Files Structure

```
public/
├── join-field.html          # Main HTML file
├── js/
│   ├── firebase-config.js   # Firebase configuration and initialization
│   └── join-field.js        # Main functionality and UI logic
└── README.md               # This file
```

## Setup Instructions

### 1. Firebase Configuration

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication (Email/Password or your preferred method)
3. Enable Firestore Database
4. Get your Firebase configuration from Project Settings > General > Your apps

### 2. Update Firebase Config

Edit `js/firebase-config.js` and replace the placeholder configuration with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### 3. Firestore Database Structure

The application expects the following Firestore collections:

#### `fields` Collection
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

#### `users` Collection
```javascript
{
  uid: "string", // Firebase Auth UID
  full_name: "string",
  email: "string",
  // ... other user fields
}
```

#### `field_workers` Collection
```javascript
{
  field_id: "string", // Reference to fields collection
  user_uid: "string", // Firebase Auth UID
  status: "pending" | "approved" | "rejected",
  requested_at: "timestamp"
}
```

### 4. Firestore Security Rules

Set up appropriate security rules in your Firestore console:

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
  }
}
```

### 5. Authentication Setup

The application uses Firebase Authentication. Users need to be authenticated to access the join field functionality. If not authenticated, they will be redirected to `/auth/login.html`.

## Features

### Available Fields
- Displays all fields with status 'active' or 'sra_reviewed'
- Excludes fields owned by the current user
- Shows field details: name, location, area, owner, crop variety
- Allows users to submit join requests

### Join Requests
- Prevents duplicate requests for the same field
- Shows pending, approved, and rejected requests
- Displays request date and status
- Links to task logging for approved requests

### Interactive Map
- Uses Leaflet.js for map display
- Shows field locations with markers
- Popup information with join request button
- Centered on Philippines coordinates

### Real-time Updates
- Uses Firebase's real-time capabilities
- Automatic UI updates when data changes
- Error handling and user feedback

## Usage

1. Deploy the files to your Firebase Hosting or any web server
2. Ensure users are authenticated through Firebase Auth
3. Users can browse available fields and submit join requests
4. Field owners can approve/reject requests (separate interface needed)
5. Approved users can access task logging functionality

## Dependencies

- **Firebase SDK v12.1.0**: Authentication and Firestore
- **Tailwind CSS**: Styling
- **Lucide Icons**: Icon library
- **Leaflet.js**: Interactive maps

## Browser Compatibility

- Modern browsers with ES6+ support
- Requires JavaScript enabled
- Internet connection for Firebase services

## Security Notes

- All data validation should be done server-side
- Implement proper Firebase security rules
- Use Firebase Auth for user management
- Consider implementing rate limiting for join requests
