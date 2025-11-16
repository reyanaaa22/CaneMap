# CaneMap - Sugarcane Operations Management System

## Requirements Document

**Location**: Ormoc City, Philippines  
**Tech Stack**: Firebase Firestore, Vanilla JavaScript, HTML/CSS  
**Repository Root**: C:\Projects\CaneMap

---

## 📁 Critical File Paths

```
frontend/System_Admin/login.html           # PIN: 123456
frontend/Common/farmers_login.html         # All non-admin login
frontend/Handler/sections/fields.html      # Handler field management
frontend/Handler/sections/rent-driver.html # Driver rental interface
```

---

## 👥 User Roles & Authentication Flow

### Role Hierarchy

- **Farmer** (default) → Upgrades to Handler after field registration + SRA approval
- **Handler** → Manages fields, assigns tasks, rents drivers
- **Driver** → Completes transport tasks, can apply for badge
- **SRA** → Approves fields, reviews reports, manages handlers
- **System Admin** → Creates SRA accounts, monitors failed logins

### Authentication

- **Admin**: PIN-based (123456), no Firebase Auth, session flag only
- **All Others**: Firebase Auth via `farmers_login.html`, email/password
- **Post-Login Routing**: Query `users.role` → redirect to role-specific dashboard
- **Role Storage**: `users` collection, `role` field

---

## 🗄️ Firestore Schema

### Collections

#### `users`

```javascript
{
  userId: string,
  email: string,
  role: 'farmer'|'handler'|'driver'|'sra',
  name: string,
  status: 'active'|'pending'|'suspended',
  driverBadge: boolean,
  failedLoginAttempts: number,
  driverAvailableForRent: boolean,
  rentalRate: number,
  driverBadgeApplication: {
    licenseNumber: string,
    vehicleDetails: string,
    status: 'pending'|'approved'|'rejected'
  }
}
```

#### `fields`

```javascript
{
  fieldId: string,
  handlerId: string,
  fieldName: string,
  area: number, // hectares
  variety: 'PSR 07-195'|'PSR 03-171'|'Phil 93-1601'|...,
  coordinates: array, // polygon points
  status: 'pending'|'approved'|'rejected',
  plantingDate: timestamp,
  basalFertilizationDate: timestamp,
  mainFertilizationDate: timestamp,
  currentGrowthStage: string,
  expectedHarvestDate: timestamp,
  delayDays: number
}
```

#### `tasks`

```javascript
{
  taskId: string,
  fieldId: string,
  handlerId: string,
  assignedTo: array<userId>,
  taskType: string,
  deadline: timestamp,
  status: 'pending'|'done',
  createdAt: timestamp,
  details: object,
  notes: string,
  photoURL: string
}
```

#### `failed_logins`

```javascript
{
  attemptId: string,
  email: string,
  timestamp: timestamp,
  ipAddress: string
}
```

#### `notifications`

```javascript
{
  notificationId: string,
  userId: string,
  message: string,
  type: 'task_assigned'|'rental_approved'|'report_requested'|...,
  read: boolean,
  createdAt: timestamp,
  relatedEntityId: string
}
```

#### `reports`

```javascript
{
  reportId: string,
  handlerId: string,
  sraId: string,
  reportType: string,
  data: object,
  status: 'pending_review'|'approved'|'rejected',
  submittedDate: timestamp
}
```

#### `driver_rentals`

```javascript
{
  rentalId: string,
  driverId: string,
  handlerId: string,
  status: 'pending'|'approved'|'rejected',
  requestDate: timestamp
}
```

---

## 🎯 Requirements

### REQ-1: Failed Login Tracking System

**Problem**: Need to track authentication failures for security monitoring

**Implementation**:

1. On `farmers_login.html` authentication failure:
   - If user exists: increment `users.failedLoginAttempts`
   - If user doesn't exist: create `failed_logins` document with email, timestamp
2. System Admin Dashboard:
   - Query total from both sources
   - Display single metric card
   - Optional: Table showing last 10 attempts (timestamp, email, count)

**Code Location**: `frontend/Common/farmers_login.html`, `frontend/System_Admin/dashboard.html`

---

### REQ-2: Field Registration UX Enhancement

**Problem**: Success message after field registration is blurry, no loading feedback

**Solution**:

1. Replace alert with crisp modal/toast notification
2. Add loading spinner on submit button
3. Disable submit while Firestore write pending
4. Show success only after Firestore confirms write
5. Include message: "Wait for SRA approval notification"

**Code Location**: Handler field registration form

**CSS Requirements**:

```css
.modal {
  /* crisp, clear styling */
}
.loading-spinner {
  /* button overlay */
}
.btn-disabled {
  pointer-events: none;
  opacity: 0.6;
}
```

---

### REQ-3: Handler Dashboard Statistics

**Metrics to Display**:

**Active Workers Count**:

```javascript
// Count distinct userIds from tasks where:
// - handlerId matches current user
// - assignedTo contains worker role users
// - status is 'pending'
```

**Pending Tasks Count**:

```javascript
// Count documents in tasks where:
// - handlerId matches current user
// - status equals 'pending'
```

**Unread Notifications**:

```javascript
// Count notifications where:
// - userId matches current user
// - read is false
```

**Update Method**: Firestore realtime listeners (`onSnapshot`)

**Code Location**: `frontend/Handler/dashboard.html`

---

### REQ-4: Fields Page Task Management

**Current**: Shows tasks for single selected field  
**New**: Show all tasks across all fields for current handler

**Features**:

1. Query all tasks where `handlerId` equals current user
2. Join `fields` data to display `fieldName` alongside each task
3. Add filter dropdown: All | Pending | Done
4. **Delete Button**:
   - Firestore delete from `tasks` collection
   - Remove from DOM
5. **View Button**:
   - Option A: Navigate to detail page with `?taskId=xyz`
   - Option B: Open modal with full task data

**Code Location**: `frontend/Handler/sections/fields.html`

---

### REQ-5: Growth Tracking System

**Calculation Logic**:

**Days After Planting (DAP)**:

```javascript
const DAP = Math.floor((currentDate - plantingDate) / (1000 * 60 * 60 * 24));
```

**Growth Stage Determination**:

```javascript
function getGrowthStage(DAP) {
  if (DAP >= 0 && DAP < 45) return "Germination";
  if (DAP >= 45 && DAP < 100) return "Tillering";
  if (DAP >= 100 && DAP < 240) return "Grand Growth";
  if (DAP >= 240 && DAP < 300) return "Maturation";
  if (DAP >= 300 && DAP < 330) return "Ripening";
  if (DAP >= 330) return "Harvest-ready";
}
```

**Variety Harvest Days**:

```javascript
const VARIETY_HARVEST_DAYS = {
  "PSR 07-195": 345,
  "PSR 03-171": 345,
  "Phil 93-1601": 365,
  "Phil 94-0913": 365,
  "Phil 92-0577": 355,
  "Phil 92-0051": 355,
  "Phil 99-1793": 375,
  "VMC 84-524": 375,
  "LCP 85-384": 365,
  "BZ 148": 365,
};
```

**Expected Harvest Date**:

```javascript
const expectedHarvestDate = new Date(
  plantingDate.getTime() + VARIETY_HARVEST_DAYS[variety] * 24 * 60 * 60 * 1000
);
```

**Update Triggers**:

- Planting task completion
- Basal fertilization task completion
- Main fertilization task completion

**Storage**: Update `fields.currentGrowthStage` and `fields.expectedHarvestDate`

**UI Components**:

- Progress bar with stage markers
- Days remaining to next stage
- **Rent a Driver Link**: Below "Select Driver" dropdown in create-task.js
  - `window.location.href = 'rent-driver.html'`

**Edge Cases**: See REQ-5-EDGE section below

---

### REQ-6: Task Notifications & Driver Assignment

**On Task Creation**:

```javascript
for (const userId of assignedTo) {
  await createNotification({
    userId: userId,
    type: "task_assigned",
    message: `New task: ${taskType} at ${fieldName}`,
    relatedEntityId: taskId,
  });
}
```

**Driver Rental Flow**:

1. Handler approves rental request
2. Update `driver_rentals.status` to 'approved'
3. Create notification for driver (type: 'rental_approved')
4. Add driver to handler's available drivers list

**Driver Dropdown Population**:

```javascript
// Include both:
// 1. Permanent field drivers
// 2. Rented drivers (show with "(Rented)" suffix)
```

---

### REQ-7: Reports & SRA Integration

**Handler Report Creation**:

**Report Types**:

- Crop Planting Records
- Growth Updates
- Harvest Schedules
- Fertilizer Usage
- Land Titles
- Barangay Certifications
- Production Costs

**Dynamic Form Fields**:

```javascript
// Crop Planting Records
{ plantingDates: array, variety: string, areaPlanted: number }

// Growth Updates
{ currentStage: string, fieldProgress: number } // percentage

// Harvest Schedules
{ expectedDate: date, actualDate: date }

// Fertilizer Usage
{ chemicalType: string, applicationDate: date, quantity: number, unit: string }
```

**Submit Action**:

1. Create `reports` document with `handlerId`, `data`, `status: 'pending_review'`
2. Create notification for all SRA users

**SRA Dashboard**:

- Table columns: submittedDate, handlerName, reportType, status, actions
- **Request Report Button**:
  - Opens handler selection dropdown
  - Creates notification for selected handler (type: 'report_requested')

**Handler Notifications Page**:

- Shows report requests
- Clicking opens report creation form pre-filled with requested type

**Totals Calculation**: Count documents in each status category

---

### REQ-8: Driver Dashboard

**Visible Fields**:

```javascript
// Query fields where:
// - userId in field.members array OR
// - User has assigned tasks in that field
```

**Task Query**:

```javascript
// tasks where:
// - assignedTo contains driver's userId
// - taskType is driver category only
```

**Notifications**:

```javascript
// Query where userId matches and type in:
// ['task_assigned', 'rental_request', 'rental_approved']
```

**Rental Requests Section**:

- Query `driver_rentals` where `driverId` matches
- Each request has Approve/Reject buttons
- Update `status` field
- Create response notification for handler

**Driver Badge Application**:

- Button opens form for:
  - Driver license info
  - Vehicle details
- Stores in `users.driverBadgeApplication` with `status: 'pending'`

**Open for Rental**:

- Sets `users.driverAvailableForRent = true`
- Sets `users.rentalRate`
- Displayed to handlers searching for drivers

---

### REQ-9: Worker Dashboard

**Visible Fields**:

```javascript
// Query fields where:
// - User in field.members OR
// - User has assigned tasks
```

**Task Query**:

```javascript
// tasks where:
// - assignedTo contains worker's userId
// - taskType is worker category
```

**Notifications**:

```javascript
// Query where userId matches and type is 'task_assigned'
```

**Create Task Feature**:

- Workers can log completed work
- Creates task with:
  - `type: 'worker_log'`
  - `status: 'done'`
  - `notes`, `photoUpload` (optional)

**UI Restrictions**: Remove Transport/transportation sections

**Dashboard Cards**:

- Active Fields count
- Assigned Tasks count
- Upcoming Tasks (deadline within 7 days)
- Recent Activity feed (last 5 task updates)

---

### REQ-10: Data Input Implementation

**Worker Task Log Form**:

```javascript
{
  taskType: dropdown,
  completionDate: datepicker,
  notes: textarea,
  workerName: text, // if logging from another device
  photoUpload: file, // accept image types, upload to Firebase Storage
  verification: checkbox
}
```

**Handler Field Registration Form**:

```javascript
{
  fieldName: text,
  area: number, // hectare unit
  variety: dropdown, // all 10 varieties
  map: interactive // Leaflet or Google Maps API
}
```

**Map Component**:

- Allow polygon drawing for field boundaries
- Save `coordinates` array to Firestore
- Show existing fields as markers
- Click popup shows field details

---

## 🔄 Growth Stage Edge Cases (REQ-5-EDGE)

**Delayed Fertilization**:

```javascript
// If basal fertilization not completed by 30 DAP:
field.delayDays += currentDAP - 30;
field.status = "delayed";
// Adjust all subsequent stage predictions

// If main fertilization not done by 60 DAP:
field.delayDays += currentDAP - 60;
```

**Display**: Warning indicator on growth tracker

**Overdue Harvest**:

```javascript
if (currentDAP > VARIETY_HARVEST_DAYS[variety] + 30) {
  field.status = "overdue";
  // Show: "Recommend immediate harvest"
}
```

**Null Planting Date**:

```javascript
if (!field.plantingDate) {
  // Show: "Not planted"
  // Disable growth tracker
}
```

---

## 🔔 Notification System Implementation

**Function Signature**:

```javascript
async function createNotification(userId, message, type, relatedEntityId) {
  await db.collection("notifications").add({
    userId,
    message,
    type,
    relatedEntityId,
    read: false,
    createdAt: new Date(),
  });
}
```

**Client-Side Listener**:

```javascript
// On all dashboards:
const unsubscribe = db
  .collection("notifications")
  .where("userId", "==", currentUserId)
  .where("read", "==", false)
  .onSnapshot((snapshot) => {
    updateBellBadge(snapshot.size);
  });
```

**Click Handler**:

```javascript
async function handleNotificationClick(notification) {
  // Mark as read
  await db
    .collection("notifications")
    .doc(notification.id)
    .update({ read: true });

  // Navigate based on type
  const routes = {
    task_assigned: `/tasks/${notification.relatedEntityId}`,
    report_requested: "/reports/create",
    field_approved: `/fields/${notification.relatedEntityId}`,
  };

  window.location.href = routes[notification.type];
}
```

---

## 📅 Implementation Priority (2-Day Timeline)

### Day 1 Morning (4 hours)

- ✅ REQ-1: Failed Login Tracking
- ✅ REQ-2: Field Registration UX
- ✅ REQ-3: Handler Dashboard Statistics

### Day 1 Afternoon (4 hours)

- ✅ REQ-4: Task Management (fields.html)
- ✅ REQ-5: Growth Tracking Core Logic

### Day 1 Evening (2 hours)

- ✅ REQ-6: Notifications Foundation

### Day 2 Morning (4 hours)

- ✅ REQ-7: Reports System

### Day 2 Afternoon (4 hours)

- ✅ REQ-8: Driver Dashboard
- ✅ REQ-9: Worker Dashboard

### Day 2 Evening (2 hours)

- ✅ REQ-10: Data Input Forms
- ✅ Testing & Bug Fixes

---

## 🐛 Common Bugs to Prevent

1. **Async Issues**: Always `await` Firestore queries

   ```javascript
   // BAD
   const data = db.collection("tasks").get();

   // GOOD
   const data = await db.collection("tasks").get();
   ```

2. **Memory Leaks**: Unsubscribe listeners on page unload

   ```javascript
   window.addEventListener("beforeunload", () => {
     if (unsubscribe) unsubscribe();
   });
   ```

3. **Array Queries**: Use `array-contains`, not `==`

   ```javascript
   // BAD
   .where('assignedTo', '==', userId)

   // GOOD
   .where('assignedTo', 'array-contains', userId)
   ```

4. **Date Timezone Issues**: Use UTC

   ```javascript
   const date = new Date();
   const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
   ```

5. **Notification Duplicates**: Debounce submit buttons

   ```javascript
   let isSubmitting = false;
   async function handleSubmit() {
     if (isSubmitting) return;
     isSubmitting = true;
     // ... submit logic
     isSubmitting = false;
   }
   ```

6. **Missing Role Field**: Add default or migration

   ```javascript
   const role = userData.role || "farmer";
   ```

7. **Leap Year Issues**: Use proper date library or careful calculation

8. **Stale Dashboard Data**: Use `onSnapshot`, not `get()`

---

## ✅ Testing Checklist

### User Flows

- [ ] Create farmer account → register field → verify pending status
- [ ] Login as admin → create SRA → verify email sent
- [ ] Login as SRA → approve field → verify handler notification
- [ ] Login as handler → verify dashboard stats match Firestore
- [ ] Create task → assign to worker → verify worker notification
- [ ] Create driver task → verify driver notification
- [ ] Apply for driver badge → verify pending status
- [ ] Rent driver → verify full rental flow
- [ ] Submit report → verify SRA receives
- [ ] Request report as SRA → verify handler notification

### Functionality

- [ ] Delete task → verify removed from Firestore
- [ ] Test growth tracker with each variety → verify harvest date
- [ ] Test failed login counter increments correctly
- [ ] Test all sorting and filtering options
- [ ] Test notification bell updates in real-time
- [ ] Test map polygon drawing and coordinate saving

### Edge Cases

- [ ] Null planting date handling
- [ ] Delayed fertilization warnings
- [ ] Overdue harvest detection
- [ ] Role upgrade: farmer → handler

---

## 💻 Code Standards

**Firestore Initialization**:

```javascript
// Assume db is already initialized
const db = firebase.firestore();
```

**Error Handling**:

```javascript
try {
  await db.collection("tasks").add(taskData);
  showSuccess("Task created successfully");
} catch (error) {
  console.error("Error creating task:", error);
  showError("Failed to create task. Please try again.");
}
```

**Form Validation**:

```javascript
function validateForm(formData) {
  if (!formData.fieldName) {
    showError("Field name is required");
    return false;
  }
  if (formData.area <= 0) {
    showError("Area must be greater than 0");
    return false;
  }
  return true;
}
```

**HTML/CSS**:

- Use semantic HTML
- Consistent class naming (BEM or similar)
- Comment complex logic
- Mobile-responsive (but not priority)

**Focus**: Working functionality over visual polish

---

## 🎯 Success Criteria

- All 10 requirements implemented and functional
- No console errors in production
- Failed logins tracked accurately
- Real-time notifications working
- Growth tracker calculates correctly for all varieties
- All role dashboards show correct data
- Reports flow from handler → SRA working
- Driver rental system functional
- Task management allows create/view/delete
- Field registration has clear UX with loading states
