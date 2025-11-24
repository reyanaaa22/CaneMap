// Driver Dashboard Initialization and Navigation
// Handles SPA navigation, profile dropdown, sidebar, and data loading

import {
  getDriverStatistics,
  getDriverFields,
  getDriverTasks,
  setupDriverFieldsListener,
  setupDriverTasksListener,
} from "./driver-dashboard.js";
import { auth } from "../Common/firebase-config.js";
import {
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  handlePlantingCompletion,
  handleBasalFertilizationCompletion,
  handleMainFertilizationCompletion,
  handleHarvestCompletion,
} from "../Handler/growth-tracker.js";
import {
  getRecommendedTasksForDAP,
} from "../Handler/task-automation.js";

// Helper function to get display-friendly task names
function getTaskDisplayName(taskValue) {
  const taskMap = {
    plowing: "Plowing",
    harrowing: "Harrowing",
    furrowing: "Furrowing",
    planting: "Planting (0 DAP)",
    basal_fertilizer: "Basal Fertilizer (0–30 DAP)",
    main_fertilization: "Main Fertilization (45–60 DAP)",
    spraying: "Spraying",
    harvesting: "Harvesting",
    transport: "Transport",
    equipment_operation: "Equipment Operation",
    material_delivery: "Material Delivery",
    field_support: "Field Support",
    others: "Others",
  };
  return taskMap[taskValue.toLowerCase()] || taskValue;
}

// Track current user ID and listeners
let currentUserId = null;
let unsubscribeListeners = [];

onAuthStateChanged(auth, (user) => {
  currentUserId = user ? user.uid : null;

  // Setup real-time listeners when user is authenticated
  if (user) {
    setupRealtimeListeners();
  } else {
    // Cleanup listeners on logout
    unsubscribeListeners.forEach((unsub) => unsub());
    unsubscribeListeners = [];
  }
});

// ============================================================
// REAL-TIME LISTENERS SETUP
// ============================================================

/**
 * Setup real-time listeners for driver dashboard data
 */
function setupRealtimeListeners() {
  console.log("🔄 Setting up real-time listeners for driver dashboard");

  // Cleanup existing listeners
  unsubscribeListeners.forEach((unsub) => unsub());
  unsubscribeListeners = [];

  // Setup fields listener
  const fieldsUnsub = setupDriverFieldsListener((fields) => {
    console.log(`📊 Fields updated: ${fields.length} fields`);

    // Store fields for later rendering
    currentFields = fields;

    // Update dashboard stats
    const activeFieldsCount = document.getElementById("activeFieldsCount");
    if (activeFieldsCount) {
      activeFieldsCount.textContent = fields.length;
    }

    // Always update fields list if the section is visible
    const currentSection = document.querySelector(
      ".content-section:not(.hidden)"
    );
    if (currentSection && currentSection.id === "my-fields") {
      console.log("Rendering fields because my-fields section is visible");
      renderFieldsList(fields);
    }
  });
  unsubscribeListeners.push(fieldsUnsub);

  // Setup tasks listener
  const tasksUnsub = setupDriverTasksListener((tasks) => {
    console.log(`📊 Tasks updated: ${tasks.length} tasks`);

    // Store tasks for filtering and later rendering
    currentTasks = tasks;

    // Calculate stats
    const pendingTasks = tasks.filter(
      (t) => t.status === "pending" || t.status === "todo"
    );
    const completedTasks = tasks.filter((t) => t.status === "done");

    // Update dashboard stats
    const totalTasksCount = document.getElementById("totalTasksCount");
    const pendingTasksCount = document.getElementById("pendingTasksCount");

    if (totalTasksCount) totalTasksCount.textContent = tasks.length;
    if (pendingTasksCount) pendingTasksCount.textContent = pendingTasks.length;

    // Always update tasks list if the section is visible
    const currentSection = document.querySelector(
      ".content-section:not(.hidden)"
    );
    if (currentSection && currentSection.id === "my-tasks") {
      console.log("Rendering tasks because my-tasks section is visible");
      renderTasksList(tasks);
    }

    // Update recent activity
    loadRecentActivity();
  });
  unsubscribeListeners.push(tasksUnsub);

  console.log("✅ Real-time listeners setup complete");
}

/**
 * Render fields list
 */
function renderFieldsList(fields) {
  const fieldsListEl = document.getElementById("myFieldsList");
  if (!fieldsListEl) return;

  if (fields.length === 0) {
    fieldsListEl.innerHTML = `
      <div class="text-center py-12">
        <i class="fas fa-map text-[var(--cane-400)] text-4xl mb-3"></i>
        <p class="text-[var(--cane-600)] text-lg font-medium">No fields assigned yet</p>
        <p class="text-[var(--cane-500)] text-sm mt-2">You don't have any active field assignments</p>
      </div>
    `;
    return;
  }

  // Render fields
  fieldsListEl.innerHTML = fields
    .map((field) => {
      const fieldName = field.fieldName || field.name || "Unknown Field";
      const area = field.area || field.size || "N/A";
      const variety = field.variety || field.caneVariety || "N/A";
      const location = field.location || field.address || "";

      return `
      <div class="p-4 border border-[var(--cane-200)] rounded-lg flex items-center justify-between hover:bg-[var(--cane-50)] transition-colors">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <i class="fas fa-map-marked-alt text-[var(--cane-500)]"></i>
            <p class="font-semibold text-[var(--cane-900)] text-lg">${escapeHtml(
              fieldName
            )}</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-sm text-[var(--cane-600)]">
            <p><i class="fas fa-ruler-combined text-[var(--cane-400)] mr-2"></i>Area: ${escapeHtml(
              area
            )} hectares</p>
            <p><i class="fas fa-seedling text-[var(--cane-400)] mr-2"></i>Variety: ${escapeHtml(
              variety
            )}</p>
            ${
              location
                ? `<p class="md:col-span-2"><i class="fas fa-location-dot text-[var(--cane-400)] mr-2"></i>${escapeHtml(
                    location
                  )}</p>`
                : ""
            }
          </div>
        </div>
        <button onclick="viewFieldDetails('${
          field.id
        }')" class="ml-4 px-4 py-2 bg-[var(--cane-600)] hover:bg-[var(--cane-700)] text-white rounded-lg transition-colors font-medium">
          <i class="fas fa-eye mr-2"></i>View Details
        </button>
      </div>
    `;
    })
    .join("");
}

/**
 * Render tasks list
 */
function renderTasksList(tasks) {
  const tasksList = document.getElementById("myTasksList");
  if (!tasksList) return;

  // Get current filter
  const activeFilter = document.querySelector(".task-filter-btn.active");
  const filter = activeFilter ? activeFilter.dataset.filter : "all";

  // Filter tasks
  let filteredTasks = tasks;
  if (filter === "pending") {
    filteredTasks = tasks.filter(
      (t) => t.status === "pending" || t.status === "todo"
    );
  } else if (filter === "done") {
    filteredTasks = tasks.filter((t) => t.status === "done");
  }

  if (filteredTasks.length === 0) {
    tasksList.innerHTML = `
      <div class="text-center py-12 text-gray-500">
        <i class="fas fa-inbox text-4xl mb-3"></i>
        <p class="text-lg font-medium">No ${
          filter === "all" ? "" : filter
        } tasks</p>
      </div>
    `;
    return;
  }

  tasksList.innerHTML = filteredTasks
    .map((task) => {
      const statusColor =
        task.status === "done"
          ? "bg-green-100 text-green-800"
          : "bg-yellow-100 text-yellow-800";
      const statusIcon =
        task.status === "done" ? "fa-check-circle" : "fa-clock";

      const timestamp = task.completedAt || task.updatedAt || task.createdAt;
      const timeAgo = timestamp ? formatTimeAgo(timestamp) : "";

      const isPending = task.status !== "done" && task.status !== "completed";

      return `
      <div class="bg-white border border-[var(--cane-200)] rounded-lg p-4 hover:shadow-md transition">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2">
              <h3 class="font-semibold text-[var(--cane-900)]">${
                task.title
              }</h3>
              <span class="px-2 py-1 rounded-full text-xs font-medium ${statusColor}">
                <i class="fas ${statusIcon} mr-1"></i>${task.status}
              </span>
            </div>
            <p class="text-sm text-gray-600 mb-2">
              <i class="fas fa-map-marker-alt text-[var(--cane-500)] mr-1"></i>
              ${task.fieldName || "Unknown Field"}
            </p>
            ${
              task.description
                ? `<p class="text-sm text-gray-500">${task.description}</p>`
                : ""
            }
            <p class="text-xs text-gray-400 mt-2">${timeAgo}</p>
          </div>
          ${
            isPending
              ? `
            <div class="flex-shrink-0">
              <button
                onclick="markDriverTaskAsDone('${task.id}')"
                class="px-4 py-2 bg-[var(--cane-600)] hover:bg-[var(--cane-700)] text-white rounded-lg font-medium transition-colors text-sm whitespace-nowrap">
                <i class="fas fa-check-circle mr-1"></i>Mark as Done
              </button>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
    })
    .join("");
}

// ============================================================
// NAVIGATION SYSTEM
// ============================================================

/**
 * Show a specific content section and hide others
 */
function showSection(sectionId) {
  // Hide all content sections
  document.querySelectorAll(".content-section").forEach((section) => {
    section.classList.add("hidden");
  });

  // Show requested section
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.classList.remove("hidden");
  }

  // Update active nav item - remove active state from all
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("bg-gray-800", "text-white", "font-medium");
    item.classList.add(
      "text-gray-300",
      "hover:bg-gray-700",
      "hover:text-white"
    );
  });

  // Add active state to current section
  const activeNav = document.querySelector(
    `.nav-item[data-section="${sectionId}"]`
  );
  if (activeNav) {
    activeNav.classList.remove(
      "text-gray-300",
      "hover:bg-gray-700",
      "hover:text-white"
    );
    activeNav.classList.add("bg-gray-800", "text-white", "font-medium");
  }
}

/**
 * Setup navigation click handlers
 */
function setupNavigation() {
  // Handle all nav-item clicks
  document.querySelectorAll("[data-section]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const sectionId = link.dataset.section;
      showSection(sectionId);

      // Load section-specific data
      loadSectionData(sectionId);

      // Close mobile sidebar if open
      const sidebar = document.getElementById("sidebar");
      const overlay = document.getElementById("sidebarOverlay");
      if (sidebar && overlay) {
        sidebar.classList.add("-translate-x-full");
        overlay.classList.add("hidden");
      }
    });
  });

  // Setup task filter buttons
  document.querySelectorAll(".task-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Update active button
      document
        .querySelectorAll(".task-filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Re-render tasks with current filter
      renderTasksList(currentTasks);
    });
  });

  // Handle mobile sidebar close
  const closeSidebarBtn = document.getElementById("closeSidebarBtn");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", () => {
      document.getElementById("sidebar").classList.add("-translate-x-full");
      sidebarOverlay.classList.add("hidden");
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => {
      document.getElementById("sidebar").classList.add("-translate-x-full");
      sidebarOverlay.classList.add("hidden");
    });
  }

  // Handle desktop sidebar collapse
  const collapseBtn = document.getElementById("driverCollapseSidebarBtn");
  if (collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      const sidebar = document.getElementById("sidebar");
      const mainContent = document.querySelector("main");

      if (sidebar && mainContent) {
        // Check if sidebar is currently collapsed by checking for w-20 class
        const isCollapsed = sidebar.classList.contains("w-20");

        if (isCollapsed) {
          // Expand sidebar
          sidebar.classList.remove("w-20");
          sidebar.classList.add("w-64");
          mainContent.classList.remove("lg:ml-20");
          mainContent.classList.add("lg:ml-64");

          // Show text labels and user info
          sidebar.querySelectorAll(".nav-item span").forEach((span) => {
            span.classList.remove("hidden");
          });

          // Show user profile info
          const userInfo = sidebar.querySelector(
            ".flex.items-center.space-x-3.mb-5 > div:last-child"
          );
          if (userInfo) userInfo.classList.remove("hidden");
        } else {
          // Collapse sidebar
          sidebar.classList.remove("w-64");
          sidebar.classList.add("w-20");
          mainContent.classList.remove("lg:ml-64");
          mainContent.classList.add("lg:ml-20");

          // Hide text labels
          sidebar.querySelectorAll(".nav-item span").forEach((span) => {
            span.classList.add("hidden");
          });

          // Hide user profile text info
          const userInfo = sidebar.querySelector(
            ".flex.items-center.space-x-3.mb-5 > div:last-child"
          );
          if (userInfo) userInfo.classList.add("hidden");
        }
      }
    });
  }
}

// Store current data for rendering
let currentTasks = [];
let currentFields = [];

/**
 * Load data for specific section
 */
async function loadSectionData(sectionId) {
  switch (sectionId) {
    case "dashboard":
    case "dashboard-overview":
      await loadDashboardData();
      break;
    case "my-fields":
      // Re-render with current fields data
      console.log(
        "Rendering fields section with",
        currentFields.length,
        "fields"
      );
      renderFieldsList(currentFields);
      break;
    case "my-tasks":
      // Re-render with current tasks data
      console.log("Rendering tasks section with", currentTasks.length, "tasks");
      renderTasksList(currentTasks);
      break;
    case "transport":
      await loadTransportData();
      break;
  }
}

// ============================================================
// DATA LOADING FUNCTIONS
// ============================================================

/**
 * Load dashboard statistics and data
 */
async function loadDashboardData() {
  try {
    const stats = await getDriverStatistics();

    // Update stat cards - FIXED: Use correct IDs matching HTML
    const activeFieldsCount = document.getElementById("activeFieldsCount");
    const totalTasksCount = document.getElementById("totalTasksCount");
    const pendingTasksCount = document.getElementById("pendingTasksCount");
    const rentalRequestsCount = document.getElementById("pendingRentalsCount");

    if (activeFieldsCount)
      activeFieldsCount.textContent = stats.totalFields || 0;
    if (totalTasksCount) totalTasksCount.textContent = stats.totalTasks || 0;
    if (pendingTasksCount)
      pendingTasksCount.textContent = stats.pendingTasks || 0;
    if (rentalRequestsCount)
      rentalRequestsCount.textContent = stats.pendingRentalRequests || 0;

    // Load recent activity
    await loadRecentActivity();
  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

/**
 * Load recent activity feed
 */
async function loadRecentActivity() {
  const activityList = document.getElementById("recentActivityList");
  if (!activityList) return;

  try {
    // Get recent tasks
    const tasks = await getDriverTasks();
    const recentTasks = tasks
      .filter((t) => t.status === "done" || t.status === "pending")
      .sort((a, b) => {
        const aTime = a.completedAt || a.updatedAt || a.createdAt;
        const bTime = b.completedAt || b.updatedAt || b.createdAt;
        return (bTime?.seconds || 0) - (aTime?.seconds || 0);
      })
      .slice(0, 5);

    if (recentTasks.length === 0) {
      activityList.innerHTML = `
        <div class="py-8 text-center text-gray-500 text-sm">
          <i class="fas fa-inbox text-3xl mb-2"></i>
          <p>No recent activity</p>
        </div>
      `;
      return;
    }

    activityList.innerHTML = recentTasks
      .map((task) => {
        const timestamp = task.completedAt || task.updatedAt || task.createdAt;
        const timeAgo = timestamp ? formatTimeAgo(timestamp) : "";
        const action = task.status === "done" ? "Completed" : "Assigned";
        const icon =
          task.status === "done"
            ? "fa-check-circle text-green-600"
            : "fa-clock text-yellow-600";

        return `
        <div class="py-3 flex items-start justify-between">
          <div class="flex items-start gap-2">
            <i class="fas ${icon} mt-1"></i>
            <span class="text-[var(--cane-800)]">${action}: ${
          task.title || task.taskType || "Task"
        }</span>
          </div>
          <span class="text-[var(--cane-600)] text-xs whitespace-nowrap ml-2">${timeAgo}</span>
        </div>
      `;
      })
      .join("");
  } catch (error) {
    console.error("Error loading recent activity:", error);
    activityList.innerHTML = `
      <div class="py-4 text-center text-red-500 text-sm">
        Failed to load activity
      </div>
    `;
  }
}

/**
 * Format timestamp to relative time
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return "";

  const date = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp.seconds * 1000);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 0) return "Today";
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}

// Note: loadFieldsData is now handled by real-time listeners
// Keeping this as a fallback for manual refresh if needed
async function loadFieldsData() {
  // Real-time listener already handles this
  console.log("Fields are loaded via real-time listener");
}

/**
 * Helper function to escape HTML
 */
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Note: loadTasksData is now handled by real-time listeners
// Keeping this as a fallback for manual refresh if needed
async function loadTasksData() {
  // Real-time listener already handles this
  console.log("Tasks are loaded via real-time listener");
  renderTasksList(currentTasks);
}

/**
 * Load transport/rental data
 */
async function loadTransportData() {
  const rentalList = document.getElementById("rentalRequestsList");
  if (!rentalList) return;

  // Show loading
  rentalList.innerHTML = `
    <div class="flex items-center justify-center py-12 text-gray-500">
      <i class="fas fa-spinner fa-spin text-3xl"></i>
    </div>
  `;

  try {
    const { getDriverRentalRequests } = await import("./driver-dashboard.js");
    const rentals = await getDriverRentalRequests();
    console.log("Rental requests loaded:", rentals.length);

    if (rentals.length === 0) {
      rentalList.innerHTML = `
        <div class="text-center py-12 text-gray-500">
          <i class="fas fa-car text-4xl mb-3"></i>
          <p class="text-lg font-medium">No rental requests</p>
          <p class="text-sm mt-2">You haven't received any rental requests yet</p>
        </div>
      `;
      return;
    }

    rentalList.innerHTML = rentals
      .map((rental) => {
        const statusColor =
          rental.status === "approved"
            ? "bg-green-100 text-green-800"
            : rental.status === "rejected"
            ? "bg-red-100 text-red-800"
            : "bg-yellow-100 text-yellow-800";

        const scheduledDate = rental.scheduledStart?.toDate?.() || new Date();
        const dateStr = scheduledDate.toLocaleDateString();
        const isPending = rental.status === "pending";

        return `
        <div class="bg-white border border-[var(--cane-200)] rounded-lg p-4 hover:shadow-md transition">
          <div class="flex flex-col gap-3">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <h3 class="font-semibold text-[var(--cane-900)]">Rental Request</h3>
                  <span class="px-2 py-1 rounded-full text-xs font-medium ${statusColor}">
                    ${rental.status}
                  </span>
                </div>
                <p class="text-sm text-gray-600 mb-1">
                  <i class="fas fa-user text-[var(--cane-500)] mr-1"></i>
                  Handler: ${escapeHtml(rental.handlerName || "Unknown")}
                </p>
                <p class="text-sm text-gray-600 mb-1">
                  <i class="fas fa-calendar text-[var(--cane-500)] mr-1"></i>
                  Scheduled: ${dateStr}
                </p>
                ${
                  rental.remarks
                    ? `<p class="text-sm text-gray-500 mt-2 italic">"${escapeHtml(
                        rental.remarks
                      )}"</p>`
                    : ""
                }
              </div>
            </div>
            ${
              isPending
                ? `
              <div class="flex gap-2 pt-2 border-t border-gray-200">
                <button
                  onclick="handleRentalApprove('${rental.id}', '${rental.handlerId}')"
                  class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                  <i class="fas fa-check"></i>
                  Approve
                </button>
                <button
                  onclick="handleRentalReject('${rental.id}', '${rental.handlerId}')"
                  class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                  <i class="fas fa-times"></i>
                  Reject
                </button>
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;
      })
      .join("");
  } catch (error) {
    console.error("Error loading transport data:", error);
    rentalList.innerHTML = `
      <div class="text-center py-8 text-red-500">
        <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
        <p>Failed to load rental requests</p>
      </div>
    `;
  }
}

// ============================================================
// PROFILE DROPDOWN
// ============================================================

function setupProfileDropdown() {
  const profileBtn = document.getElementById("profileDropdownBtn");
  const profileDropdown = document.getElementById("profileDropdown");

  if (!profileBtn || !profileDropdown) {
    console.warn("Profile dropdown elements not found");
    return;
  }

  // Remove any existing listeners by cloning
  const newProfileBtn = profileBtn.cloneNode(true);
  profileBtn.parentNode.replaceChild(newProfileBtn, profileBtn);

  newProfileBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("Profile button clicked");

    const isHidden = profileDropdown.classList.contains("invisible");

    if (isHidden) {
      // Show dropdown
      profileDropdown.classList.remove("opacity-0", "invisible", "scale-95");
      newProfileBtn
        .querySelector(".fa-chevron-down")
        ?.classList.add("rotate-180");
    } else {
      // Hide dropdown
      profileDropdown.classList.add("opacity-0", "invisible", "scale-95");
      newProfileBtn
        .querySelector(".fa-chevron-down")
        ?.classList.remove("rotate-180");
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (
      !newProfileBtn.contains(e.target) &&
      !profileDropdown.contains(e.target)
    ) {
      profileDropdown.classList.add("opacity-0", "invisible", "scale-95");
      newProfileBtn
        .querySelector(".fa-chevron-down")
        ?.classList.remove("rotate-180");
    }
  });
}

// ============================================================
// SUBMENU TOGGLES
// ============================================================

window.toggleSubmenu = function (submenuId) {
  const submenu = document.getElementById(`${submenuId}-submenu`);
  const arrow = document.getElementById(`${submenuId}-arrow`);

  if (submenu && arrow) {
    submenu.classList.toggle("hidden");
    arrow.classList.toggle("rotate-180");
  }
};

// ============================================================
// LOGOUT FUNCTIONALITY
// ============================================================

window.logout = async function () {
  try {
    await signOut(auth);
    window.location.href = "../Common/farmers_login.html";
  } catch (error) {
    console.error("Error logging out:", error);
    alert("Failed to log out. Please try again.");
  }
};

// ============================================================
// LEGACY NAVIGATION FUNCTIONS (for onclick handlers in HTML)
// ============================================================

window.navigateToSection = function (sectionId) {
  showSection(sectionId);
  loadSectionData(sectionId);
};

// ============================================================
// FIELD DETAILS (placeholder for future implementation)
// ============================================================

window.viewFieldDetails = async function (fieldId) {
  console.log("View field details:", fieldId);

  try {
    // Fetch field details
    const { db } = await import("../Common/firebase-config.js");
    const { doc, getDoc, collection, query, where, getDocs } = await import(
      "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"
    );

    const fieldRef = doc(db, "fields", fieldId);
    const fieldSnap = await getDoc(fieldRef);

    if (!fieldSnap.exists()) {
      alert("Field not found");
      return;
    }

    const fieldData = fieldSnap.data();
    const fieldName =
      fieldData.fieldName ||
      fieldData.field_name ||
      fieldData.name ||
      "Unknown Field";
    const area = fieldData.area || fieldData.size || "N/A";
    const variety = fieldData.variety || fieldData.caneVariety || "N/A";
    const location = fieldData.location || fieldData.address || "";
    const barangay = fieldData.barangay || "";

    // Fetch tasks for this field
    const tasksQuery = query(
      collection(db, "tasks"),
      where("fieldId", "==", fieldId)
    );
    const tasksSnap = await getDocs(tasksQuery);
    const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Filter tasks assigned to this driver
    const myTasks = tasks.filter((t) => {
      if (Array.isArray(t.assignedTo)) {
        return t.assignedTo.includes(currentUserId);
      }
      return t.assigned_to === currentUserId;
    });

    // Create modal
    const modal = document.createElement("div");
    modal.className =
      "fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4";
    modal.innerHTML = `
      <div class="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-[var(--cane-600)]">
          <h3 class="text-xl font-bold text-white">${escapeHtml(fieldName)}</h3>
          <button id="closeFieldModal" class="text-white hover:text-gray-200 text-2xl">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="p-6 overflow-y-auto max-h-[calc(90vh-5rem)]">
          <!-- Field Information -->
          <div class="mb-6">
            <h4 class="text-lg font-semibold text-[var(--cane-900)] mb-3">Field Information</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div class="flex items-start gap-2">
                <i class="fas fa-ruler-combined text-[var(--cane-500)] mt-1"></i>
                <div>
                  <span class="text-gray-600">Area:</span>
                  <span class="ml-1 font-medium text-gray-900">${escapeHtml(
                    area
                  )} hectares</span>
                </div>
              </div>
              <div class="flex items-start gap-2">
                <i class="fas fa-seedling text-[var(--cane-500)] mt-1"></i>
                <div>
                  <span class="text-gray-600">Variety:</span>
                  <span class="ml-1 font-medium text-gray-900">${escapeHtml(
                    variety
                  )}</span>
                </div>
              </div>
              ${
                barangay
                  ? `
              <div class="flex items-start gap-2">
                <i class="fas fa-map-marker-alt text-[var(--cane-500)] mt-1"></i>
                <div>
                  <span class="text-gray-600">Barangay:</span>
                  <span class="ml-1 font-medium text-gray-900">${escapeHtml(
                    barangay
                  )}</span>
                </div>
              </div>
              `
                  : ""
              }
              ${
                location
                  ? `
              <div class="flex items-start gap-2 md:col-span-2">
                <i class="fas fa-location-dot text-[var(--cane-500)] mt-1"></i>
                <div>
                  <span class="text-gray-600">Location:</span>
                  <span class="ml-1 font-medium text-gray-900">${escapeHtml(
                    location
                  )}</span>
                </div>
              </div>
              `
                  : ""
              }
            </div>
          </div>

          <!-- My Tasks on This Field -->
          <div>
            <h4 class="text-lg font-semibold text-[var(--cane-900)] mb-3">My Tasks</h4>
            ${
              myTasks.length === 0
                ? `
              <div class="text-center py-8 text-gray-500">
                <i class="fas fa-inbox text-3xl mb-2"></i>
                <p>No tasks assigned to you on this field</p>
              </div>
            `
                : `
              <div class="space-y-2">
                ${myTasks
                  .map((task) => {
                    const statusColor =
                      task.status === "done"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800";
                    const timeField = task.deadline || task.createdAt;
                    const dateStr = timeField
                      ? (timeField.toDate
                          ? timeField.toDate()
                          : new Date(timeField)
                        ).toLocaleDateString()
                      : "—";

                    return `
                    <div class="border border-gray-200 rounded-lg p-3 hover:shadow-md transition">
                      <div class="flex items-start justify-between">
                        <div class="flex-1">
                          <div class="flex items-center gap-2 mb-1">
                            <span class="font-semibold text-gray-900">${escapeHtml(
                              task.title || "Task"
                            )}</span>
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${statusColor}">
                              ${task.status || "pending"}
                            </span>
                          </div>
                          <p class="text-xs text-gray-600">
                            <i class="far fa-calendar mr-1"></i>${dateStr}
                          </p>
                        </div>
                      </div>
                    </div>
                  `;
                  })
                  .join("")}
              </div>
            `
            }
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button id="closeFieldModalBtn" class="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium transition-colors">
            Close
          </button>
          <button id="viewAllTasksBtn" class="px-4 py-2 rounded-lg bg-[var(--cane-600)] hover:bg-[var(--cane-700)] text-white font-medium transition-colors">
            <i class="fas fa-list mr-2"></i>View All Tasks
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => modal.remove();
    modal
      .querySelector("#closeFieldModal")
      .addEventListener("click", closeModal);
    modal
      .querySelector("#closeFieldModalBtn")
      .addEventListener("click", closeModal);
    modal.querySelector("#viewAllTasksBtn").addEventListener("click", () => {
      closeModal();
      showSection("my-tasks");
      loadSectionData("my-tasks");
    });

    // Close on backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);
  } catch (error) {
    console.error("Error loading field details:", error);
    alert("Failed to load field details");
  }
};

// ============================================================
// RENTAL REQUEST HANDLERS
// ============================================================

window.handleRentalApprove = async function (rentalId, handlerId) {
  try {
    console.log("Approving rental request:", rentalId);

    const { respondToRentalRequest } = await import("./driver-dashboard.js");
    await respondToRentalRequest(rentalId, true, handlerId);

    // Reload rental requests to show updated status
    await loadTransportData();

    console.log("✅ Rental request approved");
  } catch (error) {
    console.error("Error approving rental request:", error);
    alert("Failed to approve rental request. Please try again.");
  }
};

window.handleRentalReject = async function (rentalId, handlerId) {
  try {
    console.log("Rejecting rental request:", rentalId);

    const { respondToRentalRequest } = await import("./driver-dashboard.js");
    await respondToRentalRequest(rentalId, false, handlerId);

    // Reload rental requests to show updated status
    await loadTransportData();

    console.log("✅ Rental request rejected");
  } catch (error) {
    console.error("Error rejecting rental request:", error);
    alert("Failed to reject rental request. Please try again.");
  }
};

// ============================================================
// TASK COMPLETION HANDLERS
// ============================================================

window.markDriverTaskAsDone = async function (taskId) {
  try {
    console.log(`Marking task ${taskId} as done...`);

    // Get task details to notify handler
    const { db } = await import("../Common/firebase-config.js");
    const { doc, getDoc, updateDoc, serverTimestamp } = await import(
      "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"
    );

    const taskRef = doc(db, "tasks", taskId);
    const taskSnap = await getDoc(taskRef);

    if (!taskSnap.exists()) {
      alert("Task not found");
      return;
    }

    const task = taskSnap.data();

    // Update task status
    await updateDoc(taskRef, {
      status: "done",
      completedAt: serverTimestamp(),
      completedBy: currentUserId,
    });

    // REQ-5: Trigger growth tracking if this is a planting or fertilization task
    const fieldId = task.fieldId;
    const handlerId = task.created_by || task.createdBy;

    if (fieldId && handlerId) {
      // Normalize task title: replace underscores with spaces and convert to lowercase
      const taskTitle = (task.title || "").toLowerCase().replace(/_/g, " ");

      console.log(
        `📋 Driver marked task as done - Title: "${task.title}", Field: ${fieldId}`
      );

      // Check if this is a planting task
      if (taskTitle === "planting" || taskTitle.includes("planting")) {
        const variety = task.metadata?.variety || task.variety;
        if (variety) {
          try {
            console.log(
              `🌱 Triggering planting completion for field ${fieldId} with variety ${variety}`
            );
            await handlePlantingCompletion(handlerId, fieldId, variety);
            console.log(`✅ Growth tracking initialized for field ${fieldId}`);
          } catch (error) {
            console.error("❌ Error triggering growth tracking:", error);
          }
        }
      }
      // Check if this is basal fertilization
      else if (
        taskTitle === "basal fertilizer" ||
        taskTitle.includes("basal")
      ) {
        try {
          console.log(`🌿 Triggering basal fertilization for field ${fieldId}`);
          await handleBasalFertilizationCompletion(handlerId, fieldId);
          console.log(`✅ Basal fertilization tracked for field ${fieldId}`);
        } catch (error) {
          console.error("❌ Error triggering basal fertilization:", error);
        }
      }
      // Check if this is main fertilization
      else if (
        taskTitle === "main fertilization" ||
        taskTitle.includes("main fertiliz")
      ) {
        try {
          console.log(`🌾 Triggering main fertilization for field ${fieldId}`);
          await handleMainFertilizationCompletion(handlerId, fieldId);
          console.log(`✅ Main fertilization tracked for field ${fieldId}`);
        } catch (error) {
          console.error("❌ Error triggering main fertilization:", error);
        }
      }
      // Check if this is harvesting
      else if (taskTitle === "harvesting" || taskTitle.includes("harvest")) {
        try {
          console.log(`🚜 Triggering harvest completion for field ${fieldId}`);
          const yieldData =
            task.metadata?.expected_yield ||
            task.metadata?.actual_yield ||
            null;
          await handleHarvestCompletion(
            handlerId,
            fieldId,
            new Date(),
            yieldData
          );
          console.log(
            `✅ Harvest completed and field finalized for ${fieldId}`
          );
        } catch (error) {
          console.error("❌ Error triggering harvest completion:", error);
        }
      }
    }

    // Notify handler
    if (handlerId) {
      const { createNotification } = await import("../Common/notifications.js");
      const driverName = localStorage.getItem("userFullName") || "A driver";
      const taskTitle = task.title || task.taskType || "Task";
      await createNotification(
        handlerId,
        `${driverName} completed task: ${taskTitle}`,
        "task_completed",
        taskId
      );
      console.log(`✅ Notification sent to handler ${handlerId}`);
    } else {
      console.warn("⚠️ No handler ID found (created_by field missing)");
    }

    alert("Task marked as done!");
    console.log(`✅ Task ${taskId} marked as done`);

    // Reload tasks to show updated status
    await loadTasksData();
  } catch (error) {
    console.error("Error marking task as done:", error);
    alert("Failed to mark task as done. Please try again.");
  }
};

// ============================================================
// TASK FILTERING HELPER - Same logic as worker filtering
// ============================================================

/**
 * Get available tasks based on field status and growth stage
 */
function getAvailableTasksForField(fieldData) {
  const tasks = [];
  const status = fieldData.status?.toLowerCase() || "active";
  const plantingDate =
    fieldData.plantingDate?.toDate?.() || fieldData.plantingDate;
  const harvestDate =
    fieldData.harvestDate?.toDate?.() || fieldData.harvestDate;

  // Calculate DAP (Days After Planting)
  let currentDAP = null;
  if (plantingDate) {
    const planting = new Date(plantingDate);
    const today = new Date();
    const diffTime = today.getTime() - planting.getTime();
    currentDAP = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  // ========================================
  // PRE-PLANTING TASKS (only if NOT planted)
  // ========================================
  if (!plantingDate || currentDAP === null) {
    tasks.push(
      { value: "plowing", label: "Plowing (Land Preparation)" },
      { value: "harrowing", label: "Harrowing (Land Preparation)" },
      { value: "furrowing", label: "Furrowing (Land Preparation)" },
      { value: "planting", label: "Planting (0 DAP)" }
    );
  }

  // ========================================
  // POST-PLANTING TASKS (only if planted)
  // ========================================
  if (plantingDate && currentDAP !== null && currentDAP >= 0) {
    // Re-planting (only if significant time has passed or field was harvested)
    if (harvestDate || currentDAP > 365) {
      tasks.push({ value: "replanting", label: "Replanting" });
    }

    // Basal Fertilization (0-30 DAP)
    if (currentDAP <= 30) {
      tasks.push({
        value: "basal_fertilizer",
        label: `Basal Fertilizer (0-30 DAP, Current: ${currentDAP} DAP)`,
      });
    } else if (currentDAP <= 45) {
      tasks.push({
        value: "basal_fertilizer",
        label: `Basal Fertilizer (Late - ${currentDAP} DAP)`,
      });
    }

    // Main Fertilization (45-60 DAP)
    if (currentDAP >= 40 && currentDAP <= 60) {
      tasks.push({
        value: "main_fertilization",
        label: `Main Fertilization (45-60 DAP, Current: ${currentDAP} DAP)`,
      });
    } else if (currentDAP > 60 && currentDAP <= 90) {
      tasks.push({
        value: "main_fertilization",
        label: `Main Fertilization (Late - ${currentDAP} DAP)`,
      });
    }

    // General Maintenance (any time after planting)
    tasks.push(
      { value: "spraying", label: "Spraying (Pest/Disease Control)" },
      { value: "irrigation", label: "Irrigation" },
      { value: "weeding", label: "Weeding" }
    );

    // Harvesting (only if mature enough and NOT already harvested)
    if (currentDAP >= 200 && !harvestDate && status !== "harvested") {
      const maturityMsg =
        currentDAP >= 300 ? "Optimal Maturity" : "Early Harvest";
      tasks.push({
        value: "harvesting",
        label: `Harvesting (${currentDAP} DAP - ${maturityMsg})`,
      });
    } else if (currentDAP < 200 && currentDAP >= 150) {
      // Show but mark as disabled
      tasks.push({
        value: "harvesting_disabled",
        label: `Harvesting (Too Early - ${currentDAP} DAP)`,
        disabled: true,
      });
    }
  }

  // ========================================
  // POST-HARVEST TASKS (only if harvested)
  // ========================================
  if (status === "harvested" || harvestDate) {
    tasks.push(
      { value: "field_cleanup", label: "Field Cleanup (Post-Harvest)" },
      { value: "ratoon_management", label: "Ratoon Management" }
    );
  }

  // ========================================
  // GENERAL DRIVER TASKS (always available)
  // ========================================
  tasks.push(
    { value: "transport", label: "Transport" },
    { value: "equipment_operation", label: "Equipment Operation" },
    { value: "material_delivery", label: "Material Delivery" },
    { value: "field_support", label: "Field Support" },
    { value: "others", label: "Others (Specify in Notes)" }
  );

  return tasks;
}

// ============================================================
// MANUAL WORK LOGGING (REQ-10)
// ============================================================

window.openDriverLogWorkModal = async function () {
  try {
    // Check if SweetAlert2 is loaded
    if (typeof Swal === "undefined") {
      alert("SweetAlert2 library is not loaded. Please refresh the page.");
      return;
    }

    // Fetch driver fields for dropdown
    const fields = await getDriverFields();

    if (!fields || fields.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No Fields Available",
        text: "You need to be assigned to at least one field before logging work.",
        confirmButtonColor: "#166534",
      });
      return;
    }

    const fieldsOptions = fields
      .map(
        (f) =>
          `<option value="${f.id}">${escapeHtml(
            f.fieldName || f.name || "Unknown Field"
          )}</option>`
      )
      .join("");

    const { value: formValues } = await Swal.fire({
      title: "Log Work Activity",
      html: `
        <div class="text-left space-y-4 max-h-[70vh] overflow-y-auto px-2">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Field *</label>
            <select id="swal-fieldId" class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-base">
              <option value="">Select field...</option>
              ${fieldsOptions}
            </select>
            <p class="text-xs text-gray-500 mt-1.5">Select the field where this work was done</p>
          </div>

          <!-- ✅ Task suggestions panel (dynamically populated) -->
          <div id="task-suggestions-panel" style="display: none;" class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div class="flex items-center gap-2 mb-2">
              <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span class="text-xs font-semibold text-blue-900">Common Tasks for This Field:</span>
            </div>
            <div id="task-suggestions-chips" class="flex flex-wrap gap-2"></div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Task Type *</label>
            <select id="swal-taskType" class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-base">
              <option value="">Select a field first...</option>
            </select>
            <p class="text-xs text-gray-500 mt-1.5">Tasks are filtered based on field status and growth stage</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Completion Date *</label>
            <input type="date" id="swal-completionDate" class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-base" max="${
              new Date().toISOString().split("T")[0]
            }">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Driver Name</label>
            <input id="swal-driverName" class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-base" placeholder="If logging from another device...">
            <p class="text-xs text-gray-500 mt-1.5">Leave blank if this is you</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea id="swal-notes" class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-base resize-none" placeholder="Describe what you did..." rows="4"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Photo (optional)</label>
            <input type="file" id="swal-photo" accept="image/*" class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-base file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100">
            <p class="text-xs text-gray-500 mt-1.5">Upload a photo to verify task completion</p>
          </div>
          <div class="flex items-start gap-3 p-4 bg-green-50 rounded-lg border-2 border-green-200">
            <input type="checkbox" id="swal-verification" class="w-5 h-5 mt-0.5 accent-green-600">
            <label for="swal-verification" class="text-sm text-gray-700 font-medium">I verify this work was completed as described *</label>
          </div>
        </div>
      `,
      width: "95%",
      maxWidth: "650px",
      padding: "2rem",
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: '<i class="fas fa-check mr-2"></i>Log Work',
      cancelButtonText: '<i class="fas fa-times mr-2"></i>Cancel',
      buttonsStyling: false,
      customClass: {
        popup: "rounded-xl shadow-2xl",
        title: "text-2xl font-bold text-gray-800 mb-4",
        htmlContainer: "text-base",
        confirmButton:
          "px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors shadow-md mr-2",
        cancelButton:
          "px-6 py-3 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors shadow-md",
        actions: "gap-3 mt-6",
      },
      didOpen: async () => {
        // ✅ Setup field change listener to update task suggestions dynamically
        const { db } = await import("../Common/firebase-config.js");
        const { doc, getDoc } = await import(
          "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"
        );

        const fieldSelect = document.getElementById("swal-fieldId");
        const taskTypeSelect = document.getElementById("swal-taskType");
        const suggestionsPanel = document.getElementById(
          "task-suggestions-panel"
        );
        const suggestionsChips = document.getElementById(
          "task-suggestions-chips"
        );

        fieldSelect.addEventListener("change", async () => {
          const selectedFieldId = fieldSelect.value;

          if (!selectedFieldId) {
            // Reset task dropdown
            taskTypeSelect.innerHTML =
              '<option value="">Select a field first...</option>';
            suggestionsPanel.style.display = "none";
            return;
          }

          try {
            // Fetch field data to get planting date, status, and variety
            const fieldRef = doc(db, "fields", selectedFieldId);
            const fieldSnap = await getDoc(fieldRef);

            if (!fieldSnap.exists()) {
              taskTypeSelect.innerHTML =
                '<option value="">Field not found</option>';
              suggestionsPanel.style.display = "none";
              return;
            }

            const fieldData = fieldSnap.data();
            const plantingDate =
              fieldData.plantingDate?.toDate?.() || fieldData.plantingDate;
            const variety = fieldData.sugarcane_variety || fieldData.variety;
            const status = fieldData.status;

            // ========================================
            // ✅ POPULATE TASKS DYNAMICALLY BASED ON FIELD STATUS
            // ========================================
            const availableTasks = getAvailableTasksForField(fieldData);

            // Clear and populate task dropdown
            taskTypeSelect.innerHTML =
              '<option value="">Select task...</option>';
            availableTasks.forEach((task) => {
              const option = document.createElement("option");
              option.value = task.value;
              option.textContent = task.label;
              if (task.disabled) {
                option.disabled = true;
                option.textContent += " (Not available)";
              }
              taskTypeSelect.appendChild(option);
            });

            // ========================================
            // ✅ SHOW TASK SUGGESTIONS (only for planted fields)
            // ========================================
            if (
              !plantingDate ||
              status === "harvested" ||
              status === "inactive"
            ) {
              suggestionsPanel.style.display = "none";
              return;
            }

            // Calculate current DAP
            const currentDAP = Math.floor(
              (new Date() - new Date(plantingDate)) / (1000 * 60 * 60 * 24)
            );

            if (currentDAP < 0) {
              suggestionsPanel.style.display = "none";
              return;
            }

            // Get recommendations (limit to top 3)
            const recommendations = getRecommendedTasksForDAP(
              currentDAP,
              variety
            );
            const topRecommendations = recommendations.slice(0, 3);

            if (topRecommendations.length === 0) {
              suggestionsPanel.style.display = "none";
              return;
            }

            // Render suggestion chips
            suggestionsChips.innerHTML = topRecommendations
              .map((rec) => {
                // Map taskType to dropdown values
                const taskValue = rec.taskType;
                const urgencyColors = {
                  critical:
                    "bg-red-100 border-red-300 text-red-800 hover:bg-red-200",
                  high: "bg-orange-100 border-orange-300 text-orange-800 hover:bg-orange-200",
                  medium:
                    "bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200",
                  low: "bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200",
                };
                const colorClass =
                  urgencyColors[rec.urgency] || urgencyColors["medium"];

                return `
                <button
                  type="button"
                  class="text-xs px-3 py-1.5 rounded-full border ${colorClass} font-medium transition-colors cursor-pointer"
                  data-task-value="${taskValue}"
                  onclick="document.getElementById('swal-taskType').value='${taskValue}';"
                >
                  ${rec.task}
                </button>
              `;
              })
              .join("");

            suggestionsPanel.style.display = "block";
          } catch (error) {
            console.error("Error loading field data:", error);
            taskTypeSelect.innerHTML =
              '<option value="">Error loading tasks</option>';
            suggestionsPanel.style.display = "none";
          }
        });
      },
      preConfirm: () => {
        const fieldId = document.getElementById("swal-fieldId").value;
        const taskType = document.getElementById("swal-taskType").value;
        const completionDate = document.getElementById(
          "swal-completionDate"
        ).value;
        const driverName = document.getElementById("swal-driverName").value;
        const notes = document.getElementById("swal-notes").value;
        const photoFile = document.getElementById("swal-photo").files[0];
        const verification =
          document.getElementById("swal-verification").checked;

        if (!fieldId) {
          Swal.showValidationMessage("Field is required");
          return false;
        }

        if (!taskType) {
          Swal.showValidationMessage("Task type is required");
          return false;
        }

        if (!completionDate) {
          Swal.showValidationMessage("Completion date is required");
          return false;
        }

        if (!verification) {
          Swal.showValidationMessage(
            "You must verify that this work was completed"
          );
          return false;
        }

        return {
          fieldId,
          taskType,
          completionDate,
          driverName,
          notes,
          photoFile,
          verification,
        };
      },
    });

    if (formValues) {
      await createDriverLog(formValues);
    }
  } catch (error) {
    console.error("Error showing work log modal:", error);
    alert("Error showing work log form. Please try again.");
  }
};

async function createDriverLog(logData) {
  if (!currentUserId) {
    alert("Please log in to create work logs");
    return;
  }

  try {
    // ========================================
    // ✅ VALIDATE TASK LOGIC BEFORE SUBMITTING
    // ========================================
    const { db } = await import("../Common/firebase-config.js");
    const { doc, getDoc, collection, addDoc, serverTimestamp, Timestamp } =
      await import(
        "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"
      );

    // Fetch field data for validation
    const fieldRef = doc(db, "fields", logData.fieldId);
    const fieldSnap = await getDoc(fieldRef);

    if (fieldSnap.exists()) {
      const fieldData = fieldSnap.data();
      const taskLower = logData.taskType.toLowerCase();
      const plantingDate =
        fieldData.plantingDate?.toDate?.() || fieldData.plantingDate;
      const harvestDate =
        fieldData.harvestDate?.toDate?.() || fieldData.harvestDate;
      const status = fieldData.status?.toLowerCase() || "active";

      // Calculate DAP
      let currentDAP = null;
      if (plantingDate) {
        const planting = new Date(plantingDate);
        const today = new Date();
        currentDAP = Math.floor((today - planting) / (1000 * 60 * 60 * 24));
      }

      // VALIDATION 1: Prevent harvesting already harvested field
      if (
        taskLower.includes("harvest") &&
        !taskLower.includes("post") &&
        !taskLower.includes("cleanup")
      ) {
        if (status === "harvested" || harvestDate) {
          Swal.fire({
            icon: "error",
            title: "Invalid Task",
            text: "This field was already harvested. Please select a post-harvest task instead.",
            confirmButtonColor: "#166534",
          });
          return;
        }

        if (currentDAP !== null && currentDAP < 200) {
          Swal.fire({
            icon: "error",
            title: "Cannot Harvest",
            text: `This field is only ${currentDAP} days old. Sugarcane must be at least 200 DAP (preferably 300-400 DAP) for harvesting.`,
            confirmButtonColor: "#166534",
          });
          return;
        }
      }

      // VALIDATION 2: Prevent duplicate planting
      if (taskLower === "planting" && plantingDate && !harvestDate) {
        const plantingDateStr = new Date(plantingDate).toLocaleDateString();
        Swal.fire({
          icon: "error",
          title: "Already Planted",
          text: `This field was already planted on ${plantingDateStr}. If you need to replant, please select "Replanting" instead.`,
          confirmButtonColor: "#166534",
        });
        return;
      }

      // VALIDATION 3: Prevent pre-planting tasks on already planted field
      const prePlantingTasks = ["plowing", "harrowing", "furrowing"];
      if (
        prePlantingTasks.includes(taskLower) &&
        plantingDate &&
        !harvestDate &&
        currentDAP < 365
      ) {
        Swal.fire({
          icon: "error",
          title: "Invalid Task",
          text: "This field is already planted. Pre-planting tasks are not applicable.",
          confirmButtonColor: "#166534",
        });
        return;
      }
    }

    // ========================================
    // ✅ PROCEED WITH WORK LOG CREATION
    // ========================================
    Swal.fire({
      title: "Creating work log...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    let photoURL = "";

    // Upload photo if provided
    if (logData.photoFile) {
      const { getStorage, ref, uploadBytes, getDownloadURL } = await import(
        "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js"
      );
      const storage = getStorage();
      const timestamp = Date.now();
      const fileName = `driver_logs/${currentUserId}_${timestamp}_${logData.photoFile.name}`;
      const storageRef = ref(storage, fileName);

      await uploadBytes(storageRef, logData.photoFile);
      photoURL = await getDownloadURL(storageRef);
    }

    // Create work log as a task (same as worker implementation)
    // Convert completion date to Firestore timestamp
    const completionDate = logData.completionDate
      ? Timestamp.fromDate(new Date(logData.completionDate))
      : Timestamp.now();

    // Get driver name (use provided name or get from localStorage)
    let driverName = logData.driverName || "";
    if (!driverName) {
      driverName = localStorage.getItem("userFullName") || "Unknown Driver";
    }

    // Get field details including variety for growth tracking
    let fieldName = "Unknown Field";
    let handlerId = null;
    let fieldVariety = null;
    if (logData.fieldId) {
      const fieldRef = doc(db, "fields", logData.fieldId);
      const fieldSnap = await getDoc(fieldRef);
      if (fieldSnap.exists()) {
        const fieldData = fieldSnap.data();
        fieldName =
          fieldData.fieldName ||
          fieldData.field_name ||
          fieldData.name ||
          "Unknown Field";
        handlerId = fieldData.userId || fieldData.handlerId || null;
        fieldVariety = fieldData.sugarcane_variety || fieldData.variety || null;
      }
    }

    // Create task document with driver_log type (similar to worker_log)
    const taskData = {
      taskType: "driver_log",
      title: getTaskDisplayName(logData.taskType), // Use display name as title
      details: getTaskDisplayName(logData.taskType),
      description: logData.notes || "",
      notes: logData.notes || "",
      photoURL: photoURL,
      status: "done",
      assignedTo: [currentUserId],
      createdAt: serverTimestamp(),
      createdBy: currentUserId,
      created_by: currentUserId, // For compatibility
      completionDate: completionDate,
      completedAt: serverTimestamp(),
      driverName: driverName,
      verified: logData.verification || false,
      fieldId: logData.fieldId,
      fieldName: fieldName,
      handlerId: handlerId, // Include handler ID so handlers can see this task
      variety: fieldVariety, // Include variety for growth tracking
      metadata: {
        variety: fieldVariety, // Also in metadata for compatibility
      },
    };

    const taskRef = await addDoc(collection(db, "tasks"), taskData);

    // REQ-5: Trigger growth tracking if this is a relevant task type
    // Normalize task title: replace underscores with spaces and convert to lowercase
    const taskTitle = logData.taskType.toLowerCase().replace(/_/g, " ");
    console.log(
      `📋 Driver log created - Task: "${logData.taskType}", Field: ${logData.fieldId}, Variety: ${fieldVariety}`
    );

    // Check if this is a planting task (handles: "planting", "Planting (0 DAP)")
    if (taskTitle === "planting" || taskTitle.includes("planting")) {
      if (fieldVariety && handlerId && logData.fieldId) {
        try {
          console.log(
            `🌱 Triggering planting completion for field ${logData.fieldId} with variety ${fieldVariety}`
          );
          await handlePlantingCompletion(
            handlerId,
            logData.fieldId,
            fieldVariety,
            completionDate.toDate()
          );
          console.log(
            `✅ Growth tracking initialized successfully for field ${logData.fieldId}`
          );
        } catch (error) {
          console.error("❌ Error triggering growth tracking:", error);
          console.error("Error details:", error.message, error.stack);
        }
      } else {
        console.warn(
          `⚠️ Missing data for growth tracking: variety=${fieldVariety}, handlerId=${handlerId}, fieldId=${logData.fieldId}`
        );
      }
    }
    // Check if this is basal fertilization (handles: "basal_fertilizer", "basal fertilizer", "Basal Fertilizer (0–30 DAP)")
    else if (taskTitle === "basal fertilizer" || taskTitle.includes("basal")) {
      if (handlerId && logData.fieldId) {
        try {
          console.log(
            `🌿 Triggering basal fertilization completion for field ${logData.fieldId}`
          );
          await handleBasalFertilizationCompletion(
            handlerId,
            logData.fieldId,
            completionDate.toDate()
          );
          console.log(
            `✅ Basal fertilization tracked successfully for field ${logData.fieldId}`
          );
        } catch (error) {
          console.error(
            "❌ Error triggering basal fertilization tracking:",
            error
          );
          console.error("Error details:", error.message, error.stack);
        }
      }
    }
    // Check if this is main fertilization (handles: "main_fertilization", "main fertilization", "Main Fertilization (45–60 DAP)")
    else if (
      taskTitle === "main fertilization" ||
      taskTitle.includes("main fertiliz")
    ) {
      if (handlerId && logData.fieldId) {
        try {
          console.log(
            `🌾 Triggering main fertilization completion for field ${logData.fieldId}`
          );
          await handleMainFertilizationCompletion(
            handlerId,
            logData.fieldId,
            completionDate.toDate()
          );
          console.log(
            `✅ Main fertilization tracked successfully for field ${logData.fieldId}`
          );
        } catch (error) {
          console.error(
            "❌ Error triggering main fertilization tracking:",
            error
          );
          console.error("Error details:", error.message, error.stack);
        }
      }
    }
    // Check if this is harvesting (handles: "harvesting", "Harvesting")
    else if (taskTitle === "harvesting" || taskTitle.includes("harvest")) {
      if (handlerId && logData.fieldId) {
        try {
          console.log(
            `🚜 Triggering harvest completion for field ${logData.fieldId}`
          );
          // Check if yield was logged
          const yieldData = logData.yield || null;
          await handleHarvestCompletion(
            handlerId,
            logData.fieldId,
            completionDate.toDate(),
            yieldData
          );
          console.log(
            `✅ Harvest completed and field finalized for ${logData.fieldId}`
          );
        } catch (error) {
          console.error("❌ Error completing harvest:", error);
          console.error("Error details:", error.message, error.stack);
        }
      }
    }

    // Notify handler if available
    if (handlerId) {
      const { createNotification } = await import("../Common/notifications.js");
      await createNotification(
        handlerId,
        `${driverName} logged work: ${getTaskDisplayName(logData.taskType)}`,
        "work_logged",
        logData.fieldId
      );
    }

    Swal.fire({
      icon: "success",
      title: "Work Logged!",
      text: "Your work activity has been recorded successfully.",
      confirmButtonColor: "#166534",
    });

    console.log("✅ Driver work log created successfully");
  } catch (error) {
    console.error("Error creating work log:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Failed to create work log. Please try again.",
      confirmButtonColor: "#166534",
    });
  }
}

// ============================================================
// INITIALIZATION (called from Driver_Dashboard.js after auth)
// ============================================================

export function initializeDriverDashboard() {
  console.log("Driver dashboard initializing...");

  // Setup all navigation
  setupNavigation();

  // Setup profile dropdown
  setupProfileDropdown();

  // Load initial dashboard data
  loadDashboardData();

  console.log("Driver dashboard initialized");
}

// Setup navigation on DOM load (safe to do before auth)
document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupProfileDropdown();
});
