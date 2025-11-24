// SRA Reports Management System
// Implements REQ-7: SRA side of Reports & SRA Integration

import { db, auth } from '../Common/firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where, orderBy, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { notifyReportRequest } from '../Common/notifications.js';

let currentUserId = null;
onAuthStateChanged(auth, user => { currentUserId = user ? user.uid : null; });

/**
 * Get all submitted reports with optional filters
 * @param {Object} filters - Filter options { status, reportType, handlerId, startDate, endDate }
 * @returns {Promise<Array>} Array of reports
 */
export async function getAllReports(filters = {}) {
  try {
    // Start with base query
    let reportsQuery = query(
      collection(db, 'reports'),
      orderBy('submittedDate', 'desc')
    );

    // Apply status filter if provided
    if (filters.status) {
      reportsQuery = query(
        collection(db, 'reports'),
        where('status', '==', filters.status),
        orderBy('submittedDate', 'desc')
      );
    }

    const snapshot = await getDocs(reportsQuery);
    let reports = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();

      // Fetch handler details
      const handlerName = await getHandlerName(data.handlerId);

      // Fetch field details if fieldId exists
      let fieldName = 'No field';
      if (data.fieldId) {
        fieldName = await getFieldName(data.fieldId);
      }

      reports.push({
        id: docSnap.id,
        ...data,
        handlerName,
        fieldName
      });
    }

    // Apply client-side filters (Firestore doesn't support multiple where clauses on different fields without composite indexes)
    if (filters.reportType) {
      reports = reports.filter(r => r.reportType === filters.reportType);
    }

    if (filters.handlerId) {
      reports = reports.filter(r => r.handlerId === filters.handlerId);
    }

    if (filters.startDate) {
      const startTime = new Date(filters.startDate).getTime();
      reports = reports.filter(r => {
        const reportTime = r.submittedDate?.toDate ? r.submittedDate.toDate().getTime() : 0;
        return reportTime >= startTime;
      });
    }

    if (filters.endDate) {
      const endTime = new Date(filters.endDate).getTime() + (24 * 60 * 60 * 1000); // End of day
      reports = reports.filter(r => {
        const reportTime = r.submittedDate?.toDate ? r.submittedDate.toDate().getTime() : 0;
        return reportTime <= endTime;
      });
    }

    return reports;

  } catch (error) {
    console.error('Error getting all reports:', error);
    return [];
  }
}

/**
 * Get handler name from users collection
 * @param {string} handlerId - Handler user ID
 * @returns {Promise<string>} Handler name
 */
async function getHandlerName(handlerId) {
  try {
    const userRef = doc(db, 'users', handlerId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      return data.name || data.full_name || data.fullname || 'Unknown Handler';
    }

    return 'Unknown Handler';
  } catch (error) {
    console.error('Error getting handler name:', error);
    return 'Unknown Handler';
  }
}

/**
 * Get field name from fields collection
 * @param {string} fieldId - Field document ID
 * @returns {Promise<string>} Field name
 */
async function getFieldName(fieldId) {
  try {
    const fieldRef = doc(db, 'fields', fieldId);
    const fieldSnap = await getDoc(fieldRef);

    if (fieldSnap.exists()) {
      const data = fieldSnap.data();
      return data.field_name || data.fieldName || 'Unnamed Field';
    }

    return 'Unknown Field';
  } catch (error) {
    console.error('Error getting field name:', error);
    return 'Unknown Field';
  }
}

/**
 * Update report status
 * @param {string} reportId - Report document ID
 * @param {string} newStatus - New status ('approved', 'rejected', 'pending_review')
 * @param {string} remarks - Optional remarks
 * @returns {Promise<void>}
 */
export async function updateReportStatus(reportId, newStatus, remarks = '') {
  try {
    if (!currentUserId) {
      throw new Error('User not authenticated');
    }

    const reportRef = doc(db, 'reports', reportId);

    const updates = {
      status: newStatus,
      reviewedBy: currentUserId,
      reviewedAt: serverTimestamp(),
      remarks: remarks
    };

    await updateDoc(reportRef, updates);

    console.log(`✅ Report ${reportId} status updated to ${newStatus}`);

  } catch (error) {
    console.error('Error updating report status:', error);
    throw new Error(`Failed to update report status: ${error.message}`);
  }
}

/**
 * Request a report from a handler
 * @param {string} handlerId - Handler user ID
 * @param {string} reportType - Type of report to request
 * @param {string} notes - Optional notes for the handler
 * @returns {Promise<string>} Request ID
 */
export async function requestReport(handlerId, reportType, notes = '') {
  try {
    if (!currentUserId) {
      throw new Error('User not authenticated');
    }

    // Get SRA user name
    const sraName = await getSRAName(currentUserId);

    // Create notification for handler
    const message = `SRA requested a ${getReportTypeLabel(reportType)} report${notes ? ': ' + notes : ''}`;
    await notifyReportRequest(handlerId, reportType, message);

    console.log(`✅ Report request sent to handler ${handlerId}`);
    return 'success';

  } catch (error) {
    console.error('Error requesting report:', error);
    throw new Error(`Failed to request report: ${error.message}`);
  }
}

/**
 * Get SRA user name
 */
async function getSRAName(sraId) {
  try {
    const userRef = doc(db, 'users', sraId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      return data.name || data.full_name || 'SRA';
    }

    return 'SRA';
  } catch (error) {
    return 'SRA';
  }
}

/**
 * Get report type label
 */
function getReportTypeLabel(reportType) {
  const labels = {
    'crop_planting_records': 'Crop Planting Records',
    'growth_updates': 'Growth Updates',
    'harvest_schedules': 'Harvest Schedules',
    'fertilizer_usage': 'Fertilizer Usage',
    'land_titles': 'Land Titles',
    'barangay_certifications': 'Barangay Certifications',
    'production_costs': 'Production Costs'
  };

  return labels[reportType] || reportType;
}

/**
 * Get report statistics
 * @returns {Promise<Object>} Report statistics by status
 */
export async function getReportStatistics() {
  try {
    const reportsQuery = query(collection(db, 'reports'));
    const snapshot = await getDocs(reportsQuery);

    const stats = {
      total: snapshot.size,
      pending_review: 0,
      approved: 0,
      rejected: 0
    };

    snapshot.docs.forEach(doc => {
      const status = doc.data().status || 'pending_review';
      if (stats[status] !== undefined) {
        stats[status]++;
      }
    });

    return stats;

  } catch (error) {
    console.error('Error getting report statistics:', error);
    return { total: 0, pending_review: 0, approved: 0, rejected: 0 };
  }
}

/**
 * Get all handlers for report request
 * @returns {Promise<Array>} Array of handlers
 */
export async function getAllHandlers() {
  try {
    const handlersQuery = query(
      collection(db, 'users'),
      where('role', '==', 'handler')
    );

    const snapshot = await getDocs(handlersQuery);
    const handlers = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name || doc.data().full_name || doc.data().fullname || 'Unknown',
      email: doc.data().email || ''
    }));

    return handlers;

  } catch (error) {
    console.error('Error getting handlers:', error);
    return [];
  }
}

/**
 * Render reports table with filters and export
 * @param {string} containerId - Container element ID
 * @param {Object} filters - Filter options
 */
export async function renderReportsTable(containerId, filters = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container #${containerId} not found`);
    return;
  }

  // Add filter UI if not already present
  let filterContainer = document.getElementById('reportsFilterContainer');
  if (!filterContainer) {
    filterContainer = document.createElement('div');
    filterContainer.id = 'reportsFilterContainer';
    filterContainer.className = 'mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200';
    container.parentElement.insertBefore(filterContainer, container);
  }

  // Render filter controls
  const handlers = await getAllHandlers();
  filterContainer.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">Status</label>
        <select id="filterStatus" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
          <option value="">All Status</option>
          <option value="pending_review">Pending Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">Report Type</label>
        <select id="filterReportType" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
          <option value="">All Types</option>
          <option value="crop_planting_records">Crop Planting Records</option>
          <option value="growth_updates">Growth Updates</option>
          <option value="harvest_schedules">Harvest Schedules</option>
          <option value="fertilizer_usage">Fertilizer Usage</option>
          <option value="land_titles">Land Titles</option>
          <option value="barangay_certifications">Barangay Certifications</option>
          <option value="production_costs">Production Costs</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">Handler</label>
        <select id="filterHandler" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
          <option value="">All Handlers</option>
          ${handlers.map(h => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
        <input type="date" id="filterStartDate" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">End Date</label>
        <input type="date" id="filterEndDate" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
      </div>
    </div>
    <div class="flex items-center gap-2 mt-3">
      <button id="applyFiltersBtn" class="px-4 py-2 bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white text-sm rounded-lg font-medium transition">
        <i class="fas fa-filter mr-2"></i>Apply Filters
      </button>
      <button id="clearFiltersBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-lg font-medium transition">
        <i class="fas fa-times mr-2"></i>Clear
      </button>
      <button id="exportCSVBtn" class="ml-auto px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition">
        <i class="fas fa-download mr-2"></i>Export CSV
      </button>
    </div>
  `;

  // Setup filter event listeners
  document.getElementById('applyFiltersBtn').addEventListener('click', () => {
    const filters = {
      status: document.getElementById('filterStatus').value,
      reportType: document.getElementById('filterReportType').value,
      handlerId: document.getElementById('filterHandler').value,
      startDate: document.getElementById('filterStartDate').value,
      endDate: document.getElementById('filterEndDate').value
    };
    renderReportsTable(containerId, filters);
  });

  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterReportType').value = '';
    document.getElementById('filterHandler').value = '';
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    renderReportsTable(containerId, {});
  });

  document.getElementById('exportCSVBtn').addEventListener('click', async () => {
    const filters = {
      status: document.getElementById('filterStatus').value,
      reportType: document.getElementById('filterReportType').value,
      handlerId: document.getElementById('filterHandler').value,
      startDate: document.getElementById('filterStartDate').value,
      endDate: document.getElementById('filterEndDate').value
    };
    await exportReportsToCSV(filters);
  });

  // Show loading state
  container.innerHTML = `
    <div class="flex items-center justify-center py-12">
      <i class="fas fa-spinner fa-spin text-3xl text-[var(--cane-600)]"></i>
    </div>
  `;

  try {
    const reports = await getAllReports(filters);

    if (reports.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-500">
          <i class="fas fa-inbox text-4xl mb-3"></i>
          <p>No reports found</p>
        </div>
      `;
      return;
    }

    const tableHTML = `
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date Submitted</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Handler</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Report Type</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            ${reports.map(report => renderReportRow(report)).join('')}
          </tbody>
        </table>
        <div class="mt-3 text-sm text-gray-600 px-4">
          Showing ${reports.length} report${reports.length !== 1 ? 's' : ''}
        </div>
      </div>
    `;

    container.innerHTML = tableHTML;

    // Setup action handlers
    setupActionHandlers();

  } catch (error) {
    console.error('Error rendering reports table:', error);
    container.innerHTML = `
      <div class="text-center py-12 text-red-500">
        <i class="fas fa-exclamation-triangle text-4xl mb-3"></i>
        <p>Failed to load reports</p>
      </div>
    `;
  }
}

/**
 * Render a single report row
 */
function renderReportRow(report) {
  const date = report.submittedDate?.toDate ? report.submittedDate.toDate().toLocaleDateString() : 'N/A';
  const statusBadge = getStatusBadge(report.status);

  return `
    <tr class="hover:bg-gray-50">
      <td class="px-4 py-3 text-sm text-gray-900">${date}</td>
      <td class="px-4 py-3 text-sm text-gray-900">${escapeHtml(report.handlerName)}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${getReportTypeLabel(report.reportType)}</td>
      <td class="px-4 py-3">${statusBadge}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <button onclick="viewReport('${report.id}')"
                  class="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition">
            <i class="fas fa-eye mr-1"></i> View
          </button>
          ${report.status === 'pending_review' ? `
            <button onclick="approveReport('${report.id}')"
                    class="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition">
              <i class="fas fa-check mr-1"></i> Approve
            </button>
            <button onclick="rejectReport('${report.id}')"
                    class="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition">
              <i class="fas fa-times mr-1"></i> Reject
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `;
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
  const badges = {
    'pending_review': '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pending Review</span>',
    'approved': '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Approved</span>',
    'rejected': '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">Rejected</span>'
  };

  return badges[status] || badges['pending_review'];
}

/**
 * Setup action handlers for report actions
 */
function setupActionHandlers() {
  // View report
  window.viewReport = async function(reportId) {
    try {
      const reportRef = doc(db, 'reports', reportId);
      const reportSnap = await getDoc(reportRef);

      if (!reportSnap.exists()) {
        alert('Report not found');
        return;
      }

      const reportData = reportSnap.data();

      // Fetch handler and field names
      const handlerName = await getHandlerName(reportData.handlerId);
      let fieldName = 'No field';
      if (reportData.fieldId) {
        fieldName = await getFieldName(reportData.fieldId);
      }

      const report = {
        ...reportData,
        handlerName,
        fieldName
      };

      showReportDetailsModal(reportId, report);

    } catch (error) {
      console.error('Error viewing report:', error);
      alert('Failed to load report details');
    }
  };

  // Approve report
  window.approveReport = async function(reportId) {
    if (!confirm('Are you sure you want to approve this report?')) return;

    try {
      await updateReportStatus(reportId, 'approved');
      alert('Report approved successfully');
      location.reload();
    } catch (error) {
      console.error('Error approving report:', error);
      alert('Failed to approve report');
    }
  };

  // Reject report
  window.rejectReport = async function(reportId) {
    const remarks = prompt('Enter rejection remarks (optional):');
    if (remarks === null) return; // User cancelled

    try {
      await updateReportStatus(reportId, 'rejected', remarks);
      alert('Report rejected');
      location.reload();
    } catch (error) {
      console.error('Error rejecting report:', error);
      alert('Failed to reject report');
    }
  };
}

/**
 * Show report details modal
 */
function showReportDetailsModal(reportId, report) {
  const modal = document.createElement('div');
  modal.id = 'reportDetailsModal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50';

  const reportDataHTML = Object.entries(report.data || {}).map(([key, value]) => {
    return `
      <div class="border-b border-gray-200 py-2">
        <dt class="text-sm font-medium text-gray-500">${formatFieldName(key)}</dt>
        <dd class="mt-1 text-sm text-gray-900">${formatFieldValue(value)}</dd>
      </div>
    `;
  }).join('');

  const submittedDate = report.submittedDate?.toDate ? report.submittedDate.toDate().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'N/A';

  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" id="reportDetailsPrintArea">
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-gray-900">${getReportTypeLabel(report.reportType)}</h3>
          <button onclick="document.getElementById('reportDetailsModal').remove()"
                  class="text-gray-400 hover:text-gray-600 print:hidden">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>

        <!-- Report Metadata -->
        <div class="mb-4 p-4 bg-gray-50 rounded-lg space-y-2">
          <div class="flex items-center text-sm">
            <span class="font-medium text-gray-700 w-32">Handler:</span>
            <span class="text-gray-900">${escapeHtml(report.handlerName || 'Unknown')}</span>
          </div>
          <div class="flex items-center text-sm">
            <span class="font-medium text-gray-700 w-32">Field:</span>
            <span class="text-gray-900">${escapeHtml(report.fieldName || 'No field')}</span>
          </div>
          <div class="flex items-center text-sm">
            <span class="font-medium text-gray-700 w-32">Submitted:</span>
            <span class="text-gray-900">${submittedDate}</span>
          </div>
          <div class="flex items-center text-sm">
            <span class="font-medium text-gray-700 w-32">Status:</span>
            <span>${getStatusBadge(report.status || 'pending_review')}</span>
          </div>
        </div>

        <!-- Report Data -->
        <h4 class="text-sm font-semibold text-gray-700 mb-2">Report Details</h4>
        <dl class="divide-y divide-gray-200">
          ${reportDataHTML}
        </dl>

        ${report.remarks ? `
          <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p class="text-sm font-medium text-yellow-800">Remarks:</p>
            <p class="text-sm text-yellow-700 mt-1">${escapeHtml(report.remarks)}</p>
          </div>
        ` : ''}

        <!-- Export Actions -->
        <div class="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-gray-200 print:hidden">
          <button onclick="downloadSRAReportPDF('${reportId}', '${reportTypeName}')"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition flex items-center gap-2">
            <i class="fas fa-download"></i> Download PDF
          </button>
          <button onclick="printReport()"
                  class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition flex items-center gap-2">
            <i class="fas fa-print"></i> Print Report
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

/**
 * Format field name for display
 */
function formatFieldName(fieldName) {
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Format field value for display
 */
function formatFieldValue(value) {
  // Check if value is a photo URL (string containing image extensions or Firebase Storage URL)
  if (typeof value === 'string' && (value.includes('firebasestorage.googleapis.com') || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(value))) {
    return `<a href="${value}" target="_blank" class="inline-block">
              <img src="${value}" alt="Report photo" class="max-w-xs rounded-lg shadow hover:shadow-lg transition cursor-pointer" style="max-height: 200px;">
            </a>`;
  }

  // Check if value is an array of photo URLs
  if (Array.isArray(value)) {
    // Check if all items are photo URLs
    const allPhotos = value.every(item =>
      typeof item === 'string' && (item.includes('firebasestorage.googleapis.com') || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(item))
    );

    if (allPhotos && value.length > 0) {
      return `<div class="grid grid-cols-2 gap-2">
                ${value.map(url => `
                  <a href="${url}" target="_blank" class="inline-block">
                    <img src="${url}" alt="Report photo" class="w-full rounded-lg shadow hover:shadow-lg transition cursor-pointer" style="max-height: 200px; object-fit: cover;">
                  </a>
                `).join('')}
              </div>`;
    }

    // Not photos, display as comma-separated list
    return value.join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show request report modal
 */
export async function showRequestReportModal() {
  const handlers = await getAllHandlers();

  const modal = document.createElement('div');
  modal.id = 'requestReportModal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50';

  const reportTypes = [
    { value: 'crop_planting_records', label: 'Crop Planting Records' },
    { value: 'growth_updates', label: 'Growth Updates' },
    { value: 'harvest_schedules', label: 'Harvest Schedules' },
    { value: 'fertilizer_usage', label: 'Fertilizer Usage' },
    { value: 'land_titles', label: 'Land Titles' },
    { value: 'barangay_certifications', label: 'Barangay Certifications' },
    { value: 'production_costs', label: 'Production Costs' }
  ];

  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-gray-900">Request Report</h3>
          <button id="closeRequestModal"
                  class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>

        <form id="requestReportForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Select Handler <span class="text-red-500">*</span>
            </label>
            <select id="handlerSelect" required
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
              <option value="">Choose a handler</option>
              ${handlers.map(h => `<option value="${h.id}">${escapeHtml(h.name)}${h.email ? ' (' + h.email + ')' : ''}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Report Type <span class="text-red-500">*</span>
            </label>
            <select id="reportTypeSelect" required
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
              <option value="">Choose report type</option>
              ${reportTypes.map(rt => `<option value="${rt.value}">${rt.label}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea id="requestNotes" rows="3"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent"
                      placeholder="Add any specific instructions or details..."></textarea>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t">
            <button type="button" id="cancelRequestBtn"
                    class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">
              Cancel
            </button>
            <button type="submit" id="submitRequestBtn"
                    class="px-4 py-2 rounded-lg bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white font-semibold">
              Send Request
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Setup event handlers
  const closeBtn = modal.querySelector('#closeRequestModal');
  const cancelBtn = modal.querySelector('#cancelRequestBtn');
  const form = modal.querySelector('#requestReportForm');
  const submitBtn = modal.querySelector('#submitRequestBtn');

  const closeModal = () => modal.remove();

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const handlerId = document.getElementById('handlerSelect').value;
    const reportType = document.getElementById('reportTypeSelect').value;
    const notes = document.getElementById('requestNotes').value;

    if (!handlerId || !reportType) {
      alert('Please select both handler and report type');
      return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending...';

    try {
      await requestReport(handlerId, reportType, notes);

      // Show success message
      const successDiv = document.createElement('div');
      successDiv.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2';
      successDiv.innerHTML = '<i class="fas fa-check-circle"></i> Report request sent successfully!';
      document.body.appendChild(successDiv);

      setTimeout(() => successDiv.remove(), 3000);

      // Close modal
      closeModal();

    } catch (error) {
      console.error('Error requesting report:', error);
      alert('Failed to send report request: ' + error.message);

      // Re-enable submit button
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Send Request';
    }
  });
}

/**
 * Print report using browser print dialog
 */
window.printReport = function() {
  window.print();
};

/**
 * Download single report as PDF
 */
window.downloadSRAReportPDF = async function(reportId, reportTypeName) {
  try {
    const element = document.getElementById('reportDetailsPrintArea');
    if (!element) {
      alert('Report content not found');
      return;
    }

    // Check if html2pdf library is loaded
    if (typeof html2pdf === 'undefined') {
      alert('PDF library not loaded. Please refresh the page and try again.');
      return;
    }

    // Clone the content to modify for PDF
    const clone = element.cloneNode(true);

    // Remove buttons from clone
    const buttons = clone.querySelectorAll('button');
    buttons.forEach(btn => btn.remove());

    // Remove elements with print:hidden class
    const hiddenElements = clone.querySelectorAll('.print\\:hidden');
    hiddenElements.forEach(el => el.remove());

    // Configure PDF options
    const timestamp = new Date().toLocaleDateString().replace(/\//g, '-');
    const opt = {
      margin: 10,
      filename: `SRA_Report_${reportTypeName.replace(/\s+/g, '_')}_${timestamp}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Generate PDF
    await html2pdf().set(opt).from(clone).save();
    console.log(`✅ Downloaded report ${reportId} as PDF`);
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again.');
  }
};

/**
 * Export single report as detailed CSV (DEPRECATED - Use PDF instead)
 */
window.exportReportCSV = async function(reportId) {
  try {
    const reportRef = doc(db, 'reports', reportId);
    const reportSnap = await getDoc(reportRef);

    if (!reportSnap.exists()) {
      alert('Report not found');
      return;
    }

    const reportData = reportSnap.data();

    // Fetch handler and field names
    const handlerName = await getHandlerName(reportData.handlerId);
    let fieldName = 'No field';
    if (reportData.fieldId) {
      fieldName = await getFieldName(reportData.fieldId);
    }

    const submittedDate = reportData.submittedDate?.toDate ? reportData.submittedDate.toDate().toLocaleDateString() : 'N/A';

    // Prepare CSV content
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value !== 'string') value = String(value);
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    // CSV structure: Field, Value
    const rows = [
      ['Field', 'Value'],
      ['Report Type', getReportTypeLabel(reportData.reportType)],
      ['Handler', handlerName],
      ['Field', fieldName],
      ['Status', reportData.status || 'pending_review'],
      ['Submitted Date', submittedDate],
      ['Remarks', reportData.remarks || ''],
      [''], // Empty row separator
      ['Report Details', ''],
    ];

    // Add all report data fields
    if (reportData.data && typeof reportData.data === 'object') {
      Object.entries(reportData.data).forEach(([key, value]) => {
        const fieldName = formatFieldName(key);
        let fieldValue = '';

        // Handle different value types
        if (Array.isArray(value)) {
          // For arrays, check if they're photo URLs or regular data
          const allPhotos = value.every(item =>
            typeof item === 'string' && (item.includes('firebasestorage.googleapis.com') || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(item))
          );
          if (allPhotos) {
            fieldValue = value.join('\n'); // Photo URLs on separate lines
          } else {
            fieldValue = value.join(', ');
          }
        } else if (typeof value === 'string' && (value.includes('firebasestorage.googleapis.com') || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(value))) {
          fieldValue = value; // Photo URL
        } else if (typeof value === 'object' && value !== null) {
          fieldValue = JSON.stringify(value);
        } else {
          fieldValue = String(value);
        }

        rows.push([fieldName, fieldValue]);
      });
    }

    // Create CSV content
    const csvContent = rows.map(row => row.map(escapeCSV).join(',')).join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().split('T')[0];
    const reportType = reportData.reportType || 'report';
    const filename = `report_${reportType}_${timestamp}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`✅ Exported report ${reportId} as CSV`);
  } catch (error) {
    console.error('Error exporting report as CSV:', error);
    alert('Failed to export report: ' + error.message);
  }
};

/**
 * Export reports to CSV file
 * @param {Object} filters - Filter options to apply
 */
export async function exportReportsToCSV(filters = {}) {
  try {
    const reports = await getAllReports(filters);

    if (reports.length === 0) {
      alert('No reports to export');
      return;
    }

    // Prepare CSV headers
    const headers = ['Date Submitted', 'Handler', 'Field', 'Report Type', 'Status', 'Remarks'];

    // Prepare CSV rows
    const rows = reports.map(report => {
      const date = report.submittedDate?.toDate ? report.submittedDate.toDate().toLocaleDateString() : 'N/A';
      const handler = report.handlerName || 'Unknown';
      const field = report.fieldName || 'No field';
      const reportType = getReportTypeLabel(report.reportType);
      const status = report.status || 'pending_review';
      const remarks = report.remarks || '';

      // Escape CSV values (handle commas and quotes)
      const escapeCSV = (value) => {
        if (typeof value !== 'string') value = String(value);
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      return [date, handler, field, reportType, status, remarks].map(escapeCSV).join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `sra_reports_${timestamp}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`✅ Exported ${reports.length} reports to ${filename}`);

    // Show success message
    const successDiv = document.createElement('div');
    successDiv.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2';
    successDiv.innerHTML = `<i class="fas fa-check-circle"></i> Exported ${reports.length} reports to CSV`;
    document.body.appendChild(successDiv);

    setTimeout(() => successDiv.remove(), 3000);

  } catch (error) {
    console.error('Error exporting reports to CSV:', error);
    alert('Failed to export reports: ' + error.message);
  }
}

// Export for global access
if (typeof window !== 'undefined') {
  window.SRAReports = {
    getAllReports,
    updateReportStatus,
    requestReport,
    getReportStatistics,
    getAllHandlers,
    renderReportsTable,
    showRequestReportModal,
    exportReportsToCSV
  };
}
