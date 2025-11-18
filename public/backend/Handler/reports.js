// Handler Reports System
// Implements REQ-7: Reports & SRA Integration

import { db, auth } from '../Common/firebase-config.js';
import { collection, addDoc, doc, getDocs, getDoc, query, where, orderBy, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';

let currentUserId = null;
onAuthStateChanged(auth, user => { currentUserId = user ? user.uid : null; });

// Report type configurations
const REPORT_TYPES = {
  'crop_planting_records': {
    label: 'Crop Planting Records',
    icon: 'fa-seedling',
    fields: [
      { name: 'plantingDates', label: 'Planting Dates', type: 'date-array', required: true },
      { name: 'notes', label: 'Additional Notes', type: 'textarea', required: false }
    ],
    autoFields: ['variety', 'area'] // Auto-filled from field data
  },
  'growth_updates': {
    label: 'Growth Updates',
    icon: 'fa-chart-line',
    fields: [
      { name: 'observations', label: 'Growth Observations', type: 'textarea', required: true },
      { name: 'photos', label: 'Field Photos', type: 'file', required: false, accept: 'image/*', multiple: true }
    ],
    autoFields: ['currentStage', 'DAP', 'variety'] // Auto-filled from field tracking
  },
  'harvest_schedules': {
    label: 'Harvest Schedules',
    icon: 'fa-calendar-alt',
    fields: [
      { name: 'actualDate', label: 'Actual Harvest Date', type: 'date', required: false },
      { name: 'actualYield', label: 'Actual Yield (tons)', type: 'number', required: false },
      { name: 'notes', label: 'Harvest Notes', type: 'textarea', required: false }
    ],
    autoFields: ['expectedDate', 'estimatedYield', 'variety', 'area'] // Auto-filled from field data
  },
  'fertilizer_usage': {
    label: 'Fertilizer Usage',
    icon: 'fa-flask',
    fields: [
      { name: 'chemicalType', label: 'Fertilizer/Chemical Type', type: 'text', required: true },
      { name: 'applicationDate', label: 'Application Date', type: 'date', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true },
      { name: 'unit', label: 'Unit', type: 'select', required: true, options: ['kg', 'liters', 'bags', 'gallons'] },
      { name: 'purpose', label: 'Purpose', type: 'textarea', required: false }
    ]
  },
  'land_titles': {
    label: 'Land Titles',
    icon: 'fa-file-contract',
    fields: [
      { name: 'titleNumber', label: 'Title Number', type: 'text', required: true },
      { name: 'registeredOwner', label: 'Registered Owner', type: 'text', required: true },
      { name: 'lotNumber', label: 'Lot Number', type: 'text', required: false },
      { name: 'area', label: 'Total Area (hectares)', type: 'number', required: true },
      { name: 'remarks', label: 'Remarks', type: 'textarea', required: false }
    ]
  },
  'barangay_certifications': {
    label: 'Barangay Certifications',
    icon: 'fa-certificate',
    fields: [
      { name: 'certificateNumber', label: 'Certificate Number', type: 'text', required: true },
      { name: 'issuedDate', label: 'Issued Date', type: 'date', required: true },
      { name: 'barangay', label: 'Barangay', type: 'text', required: true },
      { name: 'purpose', label: 'Purpose', type: 'textarea', required: true }
    ]
  },
  'production_costs': {
    label: 'Production Costs',
    icon: 'fa-coins',
    fields: [
      { name: 'period', label: 'Period (e.g., Q1 2024)', type: 'text', required: true },
      { name: 'laborCosts', label: 'Labor Costs (PHP)', type: 'number', required: true },
      { name: 'fertilizerCosts', label: 'Fertilizer Costs (PHP)', type: 'number', required: true },
      { name: 'equipmentCosts', label: 'Equipment Costs (PHP)', type: 'number', required: false },
      { name: 'otherCosts', label: 'Other Costs (PHP)', type: 'number', required: false },
      { name: 'notes', label: 'Notes', type: 'textarea', required: false }
    ]
  }
};

/**
 * Get all available report types
 * @returns {Object} Report types configuration
 */
export function getReportTypes() {
  return REPORT_TYPES;
}

/**
 * Submit a report
 * @param {string} reportType - Type of report
 * @param {Object} reportData - Report data
 * @param {string} fieldId - Field ID (optional)
 * @returns {Promise<string>} Report document ID
 */
export async function submitReport(reportType, reportData, fieldId = null) {
  try {
    if (!currentUserId) {
      throw new Error('User not authenticated');
    }

    if (!REPORT_TYPES[reportType]) {
      throw new Error('Invalid report type');
    }

    // Validate required fields
    const typeConfig = REPORT_TYPES[reportType];
    for (const field of typeConfig.fields) {
      if (field.required && !reportData[field.name]) {
        throw new Error(`${field.label} is required`);
      }
    }

    // Auto-fill field data if fieldId is provided
    let autoFilledData = {};
    if (fieldId && typeConfig.autoFields) {
      try {
        const fieldDoc = await getDoc(doc(db, 'fields', fieldId));
        if (fieldDoc.exists()) {
          const fieldData = fieldDoc.data();

          // Only add auto-filled fields if they have actual values (not undefined)
          if (typeConfig.autoFields.includes('variety') && fieldData.variety != null) {
            autoFilledData.variety = fieldData.variety;
          }
          if (typeConfig.autoFields.includes('area') && fieldData.area != null) {
            autoFilledData.area = fieldData.area;
          }
          if (typeConfig.autoFields.includes('currentStage') && fieldData.currentGrowthStage != null) {
            autoFilledData.currentStage = fieldData.currentGrowthStage;
          }
          if (typeConfig.autoFields.includes('DAP')) {
            const plantingDate = fieldData.plantingDate?.toDate ? fieldData.plantingDate.toDate() : null;
            if (plantingDate) {
              const dap = Math.floor((new Date() - plantingDate) / (1000 * 60 * 60 * 24));
              autoFilledData.DAP = dap;
            }
          }
          if (typeConfig.autoFields.includes('expectedDate') && fieldData.expectedHarvestDate != null) {
            autoFilledData.expectedHarvestDate = fieldData.expectedHarvestDate;
          }
          if (typeConfig.autoFields.includes('estimatedYield') && fieldData.estimatedYield != null) {
            autoFilledData.estimatedYield = fieldData.estimatedYield;
          }
        }
      } catch (error) {
        console.warn('Could not auto-fill field data:', error);
      }
    }

    // Calculate total cost for production_costs report type
    let totalCost = 0;
    if (reportType === 'production_costs') {
      const laborCosts = parseFloat(reportData.laborCosts) || 0;
      const fertilizerCosts = parseFloat(reportData.fertilizerCosts) || 0;
      const equipmentCosts = parseFloat(reportData.equipmentCosts) || 0;
      const otherCosts = parseFloat(reportData.otherCosts) || 0;
      totalCost = laborCosts + fertilizerCosts + equipmentCosts + otherCosts;
    }

    // Merge user-entered data with auto-filled data
    const finalReportData = {
      ...autoFilledData,
      ...reportData
    };

    const report = {
      handlerId: currentUserId,
      reportType,
      data: finalReportData,
      fieldId: fieldId,
      totalCost: totalCost, // Store calculated total cost
      status: 'pending_review',
      submittedDate: serverTimestamp(),
      createdAt: serverTimestamp()
    };

    const reportsRef = collection(db, 'reports');
    const docRef = await addDoc(reportsRef, report);

    // ✅ Notify SRA officers about new report (using broadcast pattern)
    try {
      const reportLabel = REPORT_TYPES[reportType]?.label || reportType;
      await addDoc(collection(db, 'notifications'), {
        role: 'sra', // Broadcast to all SRA officers
        title: 'New Report Submitted',
        message: `A new ${reportLabel} report has been submitted and requires review.`,
        type: 'report_submitted',
        relatedEntityId: docRef.id,
        status: 'unread',
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      console.log('✅ SRA notification created for report:', docRef.id);
    } catch (err) {
      console.warn('⚠️ Failed to create SRA notification (non-critical):', err);
      // Don't throw - this is non-critical, report was still submitted
    }

    console.log(`✅ Report submitted: ${docRef.id}`);
    return docRef.id;

  } catch (error) {
    console.error('Error submitting report:', error);
    throw new Error(`Failed to submit report: ${error.message}`);
  }
}

/**
 * Get handler's submitted reports
 * @param {number} limitCount - Maximum number of reports to fetch
 * @returns {Promise<Array>} Array of reports
 */
export async function getHandlerReports(limitCount = 50) {
  try {
    if (!currentUserId) {
      throw new Error('User not authenticated');
    }

    const reportsQuery = query(
      collection(db, 'reports'),
      where('handlerId', '==', currentUserId),
      orderBy('submittedDate', 'desc')
    );

    const snapshot = await getDocs(reportsQuery);
    const reports = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return reports;

  } catch (error) {
    console.error('Error getting handler reports:', error);
    return [];
  }
}

/**
 * Render report form for a specific type
 * @param {string} reportType - Report type
 * @param {string} containerId - Container element ID
 * @param {Object} prefillData - Pre-filled data (optional)
 */
export async function renderReportForm(reportType, containerId, prefillData = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container #${containerId} not found`);
    return;
  }

  const typeConfig = REPORT_TYPES[reportType];
  if (!typeConfig) {
    container.innerHTML = '<p class="text-red-500">Invalid report type</p>';
    return;
  }

  // Fetch handler's fields for field selection
  let fieldsHTML = '<option value="">Loading fields...</option>';
  if (currentUserId) {
    try {
      const fieldsQuery = query(
        collection(db, 'fields'),
        where('userId', '==', currentUserId),
        where('status', 'in', ['reviewed', 'active'])
      );
      const fieldsSnapshot = await getDocs(fieldsQuery);

      if (fieldsSnapshot.empty) {
        fieldsHTML = '<option value="">No fields found - Register a field first</option>';
      } else {
        fieldsHTML = '<option value="">Select a field</option>';
        fieldsSnapshot.forEach(doc => {
          const field = doc.data();
          const fieldName = field.field_name || field.fieldName || 'Unnamed Field';
          fieldsHTML += `<option value="${doc.id}">${fieldName}</option>`;
        });
      }
    } catch (error) {
      console.error('Error fetching fields:', error);
      fieldsHTML = '<option value="">Error loading fields</option>';
    }
  }

  const formHTML = `
    <div class="space-y-6">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-lg bg-[var(--cane-100)] flex items-center justify-center">
          <i class="fas ${typeConfig.icon} text-[var(--cane-700)] text-xl"></i>
        </div>
        <div>
          <h3 class="text-lg font-semibold text-gray-900">${typeConfig.label}</h3>
          <p class="text-sm text-gray-600">Fill in the required information below</p>
        </div>
      </div>

      <form id="reportForm" class="space-y-4">
        <!-- Field Selection (Required for all reports) -->
        <div class="bg-[var(--cane-50)] border-2 border-[var(--cane-300)] rounded-lg p-4">
          <label class="block text-sm font-semibold text-[var(--cane-800)] mb-2">
            <i class="fas fa-map-marker-alt mr-1"></i> Select Field <span class="text-red-500">*</span>
          </label>
          <select name="fieldId" id="fieldIdSelect" required class="w-full px-4 py-3 border-2 border-[var(--cane-300)] rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent text-base font-medium">
            ${fieldsHTML}
          </select>
          <p class="text-xs text-[var(--cane-700)] mt-2">
            <i class="fas fa-info-circle mr-1"></i>
            ${typeConfig.autoFields ? 'Field details (variety, area, growth stage) will be auto-filled based on your selection' : 'Choose which field this report is for'}
          </p>
        </div>

        <!-- Auto-filled field info (shown after field selection) -->
        <div id="fieldInfoDisplay" class="hidden bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 class="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <i class="fas fa-info-circle"></i> Field Information
          </h4>
          <div id="fieldInfoContent" class="text-sm text-blue-800 space-y-1"></div>
        </div>

        ${typeConfig.fields.map(field => renderFormField(field, prefillData[field.name])).join('')}

        <div class="flex items-center justify-end pt-4 border-t">
          <button type="submit" id="submitReportBtn" class="px-6 py-3 rounded-lg bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white font-semibold shadow-md hover:shadow-lg transition-all">
            <i class="fas fa-paper-plane mr-2"></i>Submit Report
          </button>
        </div>
      </form>
    </div>
  `;

  container.innerHTML = formHTML;

  // Setup field selection handler to show field info
  const fieldSelect = document.getElementById('fieldIdSelect');
  if (fieldSelect && typeConfig.autoFields) {
    fieldSelect.addEventListener('change', async (e) => {
      const fieldId = e.target.value;
      if (!fieldId) {
        document.getElementById('fieldInfoDisplay').classList.add('hidden');
        return;
      }

      try {
        const fieldDoc = await getDoc(doc(db, 'fields', fieldId));
        if (fieldDoc.exists()) {
          const fieldData = fieldDoc.data();
          const fieldInfoContent = document.getElementById('fieldInfoContent');
          const fieldInfoDisplay = document.getElementById('fieldInfoDisplay');

          let infoHTML = '';
          if (typeConfig.autoFields.includes('variety')) {
            infoHTML += `<div><strong>Variety:</strong> ${fieldData.variety || 'Not specified'}</div>`;
          }
          if (typeConfig.autoFields.includes('area')) {
            infoHTML += `<div><strong>Area:</strong> ${fieldData.area || 'Not specified'} hectares</div>`;
          }
          if (typeConfig.autoFields.includes('currentStage')) {
            infoHTML += `<div><strong>Current Growth Stage:</strong> ${fieldData.currentGrowthStage || 'Not tracked'}</div>`;
          }
          if (typeConfig.autoFields.includes('DAP')) {
            const plantingDate = fieldData.plantingDate?.toDate ? fieldData.plantingDate.toDate() : null;
            if (plantingDate) {
              const dap = Math.floor((new Date() - plantingDate) / (1000 * 60 * 60 * 24));
              infoHTML += `<div><strong>Days After Planting (DAP):</strong> ${dap} days</div>`;
            }
          }
          if (typeConfig.autoFields.includes('expectedDate')) {
            const expectedHarvest = fieldData.expectedHarvestDate?.toDate ? fieldData.expectedHarvestDate.toDate() : null;
            if (expectedHarvest) {
              infoHTML += `<div><strong>Expected Harvest:</strong> ${expectedHarvest.toLocaleDateString()}</div>`;
            }
          }

          fieldInfoContent.innerHTML = infoHTML;
          fieldInfoDisplay.classList.remove('hidden');
        }
      } catch (error) {
        console.error('Error loading field info:', error);
      }
    });
  }

  // Setup form handlers
  setupFormHandlers(reportType, containerId);
}

/**
 * Render individual form field
 */
function renderFormField(field, prefillValue = '') {
  const value = prefillValue || '';
  const required = field.required ? 'required' : '';
  const requiredLabel = field.required ? '<span class="text-red-500">*</span>' : '';

  switch (field.type) {
    case 'text':
      return `
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            ${field.label} ${requiredLabel}
          </label>
          <input type="text" name="${field.name}" value="${value}" ${required}
                 class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
        </div>
      `;

    case 'number':
      const min = field.min !== undefined ? `min="${field.min}"` : '';
      const max = field.max !== undefined ? `max="${field.max}"` : '';
      return `
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            ${field.label} ${requiredLabel}
          </label>
          <input type="number" name="${field.name}" value="${value}" ${required} ${min} ${max} step="0.01"
                 class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
        </div>
      `;

    case 'date':
      return `
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            ${field.label} ${requiredLabel}
          </label>
          <input type="date" name="${field.name}" value="${value}" ${required}
                 class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
        </div>
      `;

    case 'select':
      return `
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            ${field.label} ${requiredLabel}
          </label>
          <select name="${field.name}" ${required}
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
            <option value="">Select ${field.label}</option>
            ${field.options.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}
          </select>
        </div>
      `;

    case 'textarea':
      return `
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            ${field.label} ${requiredLabel}
          </label>
          <textarea name="${field.name}" rows="4" ${required}
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">${value}</textarea>
        </div>
      `;

    case 'date-array':
      return `
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            ${field.label} ${requiredLabel}
          </label>
          <div id="dateArrayContainer_${field.name}" class="space-y-2">
            <input type="date" name="${field.name}[]" ${required}
                   class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent">
          </div>
          <button type="button" onclick="addDateField('${field.name}')" class="mt-2 text-sm text-[var(--cane-700)] hover:text-[var(--cane-800)] font-medium">
            <i class="fas fa-plus mr-1"></i> Add Another Date
          </button>
        </div>
      `;

    case 'file':
      const accept = field.accept || '*';
      const multiple = field.multiple ? 'multiple' : '';
      return `
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            ${field.label} ${requiredLabel}
          </label>
          <input type="file" name="${field.name}" accept="${accept}" ${multiple} ${required}
                 class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--cane-50)] file:text-[var(--cane-700)] hover:file:bg-[var(--cane-100)]">
          <p class="text-xs text-gray-500 mt-1">Note: File uploads are for reference only. Files are not stored on the server.</p>
        </div>
      `;

    default:
      return '';
  }
}

/**
 * Setup form event handlers
 */
function setupFormHandlers(reportType, containerId) {
  const form = document.getElementById('reportForm');
  const submitBtn = document.getElementById('submitReportBtn');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Disable submit button
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Submitting...';

      try {
        // Collect form data
        const formData = new FormData(form);
        const reportData = {};
        let fieldId = null;

        for (const [key, value] of formData.entries()) {
          if (key === 'fieldId') {
            // Extract fieldId separately
            fieldId = value;
          } else if (key.endsWith('[]')) {
            // Handle arrays
            const cleanKey = key.replace('[]', '');
            if (!reportData[cleanKey]) reportData[cleanKey] = [];
            if (value) reportData[cleanKey].push(value);
          } else {
            // Handle file inputs - store file names as string
            const input = form.elements[key];
            if (input && input.type === 'file') {
              if (input.files.length > 0) {
                const fileNames = Array.from(input.files).map(f => f.name);
                reportData[key] = fileNames.join(', ');
              }
            } else {
              reportData[key] = value;
            }
          }
        }

        // Validate fieldId
        if (!fieldId) {
          throw new Error('Please select a field for this report');
        }

        // Submit report
        const reportId = await submitReport(reportType, reportData, fieldId);

        // Show success message
        showSuccessMessage('Report submitted successfully!');

        // Clear form
        form.reset();

        // Close modal instead of full page reload
        // Reports list will auto-update via onSnapshot real-time listener
        setTimeout(() => {
          const modal = document.getElementById('reportModal');
          if (modal) modal.classList.remove('active');
        }, 1500);

      } catch (error) {
        console.error('Error submitting report:', error);
        showErrorMessage(error.message || 'Failed to submit report');

        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Report';
      }
    });
  }
}

/**
 * Add date field for date arrays
 */
window.addDateField = function(fieldName) {
  const container = document.getElementById(`dateArrayContainer_${fieldName}`);
  if (!container) return;

  const input = document.createElement('input');
  input.type = 'date';
  input.name = `${fieldName}[]`;
  input.className = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--cane-600)] focus:border-transparent';
  container.appendChild(input);
};

/**
 * Show success message
 */
function showSuccessMessage(message) {
  const div = document.createElement('div');
  div.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2';
  div.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
  document.body.appendChild(div);

  setTimeout(() => div.remove(), 3000);
}

/**
 * Show error message
 */
function showErrorMessage(message) {
  const div = document.createElement('div');
  div.className = 'fixed top-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2';
  div.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
  document.body.appendChild(div);

  setTimeout(() => div.remove(), 4000);
}

// Export for global access
if (typeof window !== 'undefined') {
  window.HandlerReports = {
    getReportTypes,
    submitReport,
    getHandlerReports,
    renderReportForm
  };
}
