// Import Firebase from existing config
import { auth, db } from '../Common/firebase-config.js';
import { collection, query, where, onSnapshot,  doc,
  getDoc,
  getDocs,
  orderBy,
  limit,
  collectionGroup } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { openCreateTaskModal } from './create-task.js';

// Initialize Leaflet Map for Fields Section
export function initializeFieldsSection() {
  let fieldsMap = null;
  let markersLayer = null;
  let currentUserId = null;
  let fieldsData = [];
  let topFieldsUnsub = null;
  let nestedFieldsUnsub = null;
  const fieldStore = new Map();
  let topFieldKeys = new Set();
  let nestedFieldKeys = new Set();
  let activeHighlightedField = null;

function highlightFieldInList(fieldName) {
  const listContainer = document.getElementById('handlerFieldsList');
  if (!listContainer) return;

  if (activeHighlightedField) {
    activeHighlightedField.classList.remove('ring-2', 'ring-green-400', 'bg-green-50');
    activeHighlightedField = null;
  }

  const items = Array.from(listContainer.children);
  const match = items.find(item =>
    item.textContent.toLowerCase().includes((fieldName || '').toLowerCase())
  );

  if (match) {
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    match.classList.add('ring-2', 'ring-green-400', 'bg-green-50');
    activeHighlightedField = match;
  }
}

document.addEventListener('click', (e) => {
  if (activeHighlightedField && !e.target.closest('#handlerFieldsList') && !e.target.closest('.leaflet-popup') && !e.target.closest('.leaflet-container')) {
    activeHighlightedField.classList.remove('ring-2', 'ring-green-400', 'bg-green-50');
    activeHighlightedField = null;
  }
});

  const STATUS_META = {
    reviewed: {
      label: 'Reviewed',
      badgeClass: 'bg-green-100',
      textClass: 'text-green-800',
      color: '#16a34a'
    },
    approved: {
      label: 'Approved',
      badgeClass: 'bg-green-100',
      textClass: 'text-green-800',
      color: '#16a34a'
    },
    pending: {
      label: 'Pending Review',
      badgeClass: 'bg-yellow-100',
      textClass: 'text-yellow-700',
      color: '#eab308'
    },
    'to edit': {
      label: 'Needs Update',
      badgeClass: 'bg-yellow-100',
      textClass: 'text-yellow-700',
      color: '#d97706'
    },
    declined: {
      label: 'Declined',
      badgeClass: 'bg-red-100',
      textClass: 'text-red-700',
      color: '#dc2626'
    },
    rejected: {
      label: 'Rejected',
      badgeClass: 'bg-red-100',
      textClass: 'text-red-700',
      color: '#dc2626'
    },
    active: {
      label: 'Active',
      badgeClass: 'bg-green-100',
      textClass: 'text-green-800',
      color: '#16a34a'
    },
    'for certification': {
      label: 'For Certification',
      badgeClass: 'bg-blue-100',
      textClass: 'text-blue-700',
      color: '#2563eb'
    },
    'for_certification': {
      label: 'For Certification',
      badgeClass: 'bg-blue-100',
      textClass: 'text-blue-700',
      color: '#2563eb'
    }
  };

  const DEFAULT_STATUS_META = {
    label: 'Pending Review',
    badgeClass: 'bg-gray-100',
    textClass: 'text-gray-700',
    color: '#6b7280'
  };

  const SAMPLE_FIELDS = [
    {
      name: 'North Ridge Plot',
      location: 'Poblacion, Ormoc City',
      area: '3.5 hectares',
      status: 'reviewed'
    },
    {
      name: 'Riverside Block',
      location: 'Barangay Biliboy, Ormoc City',
      area: '2.1 hectares',
      status: 'pending'
    },
    {
      name: 'Hillside Reserve',
      location: 'Barangay San Jose, Ormoc City',
      area: '4.0 hectares',
      status: 'for certification'
    }
  ];

  const sampleFieldsTemplate = (() => {
    const items = SAMPLE_FIELDS.map(sample => {
      const meta = getStatusMeta(sample.status);
      return `
        <li class="flex items-start justify-between gap-2 rounded-lg border border-[var(--cane-200)] bg-white px-3 py-2.5">
          <div>
            <p class="text-sm font-semibold text-[var(--cane-900)]">${sample.name}</p>
            <p class="text-xs text-[var(--cane-700)]">${sample.location}</p>
            <p class="text-[11px] text-[var(--cane-600)] mt-1">${sample.area}</p>
          </div>
          <div class="flex flex-col items-end gap-1.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.badgeClass} ${meta.textClass}">
              ${meta.label}
            </span>
            <button class="inline-flex items-center gap-2 px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 text-[var(--cane-800)] hover:bg-gray-100 transition" type="button">
              <i class="fas fa-eye"></i>
              View Details
            </button>
          </div>
        </li>
      `;
    }).join('');

    return `
      <div class="rounded-xl border border-[var(--cane-200)] bg-white p-4 shadow-sm">
        <h3 class="text-sm font-semibold text-[var(--cane-900)] mb-2">Sample Summary</h3>
        <ul class="space-y-2 text-sm text-[var(--cane-900)]">
          ${items}
        </ul>
      </div>
    `;
  })();

  function getStatusMeta(status) {
    const key = typeof status === 'string' ? status.toLowerCase().trim() : '';
    return STATUS_META[key] || DEFAULT_STATUS_META;
  }

  function getStatusLabel(status) {
    return getStatusMeta(status).label;
  }

  function getStatusColor(status) {
    return getStatusMeta(status).color;
  }

  function getBadgeClasses(status) {
    const meta = getStatusMeta(status);
    return { badgeClass: meta.badgeClass, textClass: meta.textClass };
  }

  function initFieldsMap() {
    const mapContainer = document.getElementById('handlerFieldsMap');
    if (!mapContainer) {
      console.error('❌ Map container not found!');
      return;
    }
    
    if (fieldsMap) {
      console.log('⚠️ Map already initialized, skipping...');
      return;
    }

    try {
      // Default center (Ormoc City, Leyte)
      const defaultCenter = [11.0042, 124.6035];
      const defaultZoom = 13;

      console.log('📍 Creating Leaflet map instance...');
      
      // Initialize map
      fieldsMap = L.map('handlerFieldsMap', {
        zoomControl: false, // We'll use custom controls
        preferCanvas: true
      }).setView(defaultCenter, defaultZoom);

      console.log('🗺️ Map instance created, adding tile layer...');

      // Add OpenStreetMap tiles
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      }).addTo(fieldsMap);

      tileLayer.on('loading', () => console.log('🔄 Loading map tiles...'));
      tileLayer.on('load', () => console.log('✅ Map tiles loaded'));
      tileLayer.on('tileerror', (e) => console.warn('⚠️ Tile load error:', e));

      // Create markers layer
      markersLayer = L.layerGroup().addTo(fieldsMap);

      // Custom zoom controls
      document.getElementById('mapZoomIn')?.addEventListener('click', () => fieldsMap.zoomIn());
      document.getElementById('mapZoomOut')?.addEventListener('click', () => fieldsMap.zoomOut());
      
      // Locate user
      document.getElementById('mapLocate')?.addEventListener('click', () => {
        fieldsMap.locate({setView: true, maxZoom: 16});
      });

      // Handle location found
      fieldsMap.on('locationfound', (e) => {
        const radius = e.accuracy / 2;
        L.marker(e.latlng, {
          icon: L.divIcon({
            className: 'custom-location-marker',
            html: '<div style="background: #3b82f6; width: 12px; height: 12px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59,130,246,0.5);"></div>',
            iconSize: [18, 18]
          })
        }).addTo(markersLayer)
          .bindPopup(`You are within ${Math.round(radius)} meters from this point`);
        
        L.circle(e.latlng, {
          radius: radius,
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.1,
          weight: 1
        }).addTo(markersLayer);
      });

      // Handle location error
      fieldsMap.on('locationerror', (e) => {
        console.warn('⚠️ Location access denied:', e.message);
      });

      console.log('✅ Fields map initialized successfully');
      
      // Hide loading indicator
      const loadingIndicator = document.getElementById('mapLoadingIndicator');
      if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
      }
      
      // Force map to recalculate its size
      setTimeout(() => {
        if (fieldsMap) {
          fieldsMap.invalidateSize();
          console.log('✅ Map size invalidated and recalculated');
        }
      }, 250);
      
      
      // Load user's fields after map is ready
      loadUserFields();
      
    } catch (error) {
      console.error('❌ Error initializing map:', error);
      showMessage('Failed to initialize map: ' + error.message, 'error');
      
      // Hide loading indicator and show error
      const loadingIndicator = document.getElementById('mapLoadingIndicator');
      if (loadingIndicator) {
        loadingIndicator.innerHTML = `
          <div class="text-center">
            <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-2"></i>
            <p class="text-sm text-red-600">Failed to load map</p>
            <p class="text-xs text-gray-500 mt-1">${error.message}</p>
          </div>
        `;
      }
    }
  }

  // Fetch user's fields from Firebase
  async function loadUserFields() {
    if (!currentUserId) {
      console.warn('⚠️ No user logged in, cannot load fields');
      showMessage('Please log in to view your fields', 'error');
      return;
    }

    console.log('📡 Fetching fields for user:', currentUserId);
    showMessage('Loading your reviewed fields...', 'info');

    try {
      if (topFieldsUnsub) {
        topFieldsUnsub();
        topFieldsUnsub = null;
      }
      if (nestedFieldsUnsub) {
        nestedFieldsUnsub();
        nestedFieldsUnsub = null;
      }

      const renderFromStore = () => {
        fieldsData = Array.from(fieldStore.values());

        if (!markersLayer) {
          markersLayer = L.layerGroup().addTo(fieldsMap);
        }

        markersLayer.clearLayers();
        let markersAdded = 0;

        fieldsData.forEach((field) => {
          const lat = parseFloat(field.latitude ?? field.lat ?? '');
          const lng = parseFloat(field.longitude ?? field.lng ?? '');
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            console.warn('⚠️ No coordinates for field:', field.field_name || field.fieldName || field.id);
            return;
          }
          addFieldMarker({ ...field, latitude: lat, longitude: lng });
          markersAdded += 1;
        });

        updateFieldsList();
        updateFieldsCount();

        if (fieldsData.length > 0 && markersAdded > 0) {
          const group = new L.featureGroup(markersLayer.getLayers());
          fieldsMap.fitBounds(group.getBounds().pad(0.1));
          showMessage(`Showing ${fieldsData.length} field(s) on the map`, 'info');
        } else if (fieldsData.length > 0) {
          showMessage(`Found ${fieldsData.length} field(s) but no coordinates available`, 'error');
        } else {
          showMessage('No fields registered yet', 'info');
        }

        console.log(`✅ Loaded ${fieldsData.length} fields, ${markersAdded} markers`);
      };

      const createTopKey = (doc) => doc.data()?.sourceRef || doc.ref.path;

      // --- Only fetch top-level fields that belong to user AND are reviewed ---
      // We use `in` to cover both 'reviewed' and 'Reviewed' variants in case of inconsistent casing.
      // If your DB is normalized to lowercase, you can switch to where('status','==','reviewed')
      const topQuery = query(
        collection(db, 'fields'),
        where('userId', '==', currentUserId),
        where('status', '==', 'reviewed')
      );
      topFieldsUnsub = onSnapshot(topQuery, (snapshot) => {
        console.log('📦 Top-level fields snapshot (reviewed) size:', snapshot.size);
        const seen = new Set();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const key = createTopKey(docSnap);
          seen.add(key);
          fieldStore.set(key, {
            id: docSnap.id,
            ...data,
            userId: data.userId || currentUserId,
            sourceRef: key
          });
        });

        topFieldKeys.forEach((key) => {
          if (!seen.has(key) && !nestedFieldKeys.has(key)) {
            fieldStore.delete(key);
          }
        });
        topFieldKeys = seen;

        renderFromStore();
      }, (error) => {
        console.error('❌ Error fetching fields (top-level reviewed):', error);
        showMessage('Error loading fields: ' + error.message, 'error');
      });

      // --- Only fetch nested field applications that are reviewed ---
      const nestedQuery = query(
        collection(db, 'field_applications', currentUserId, 'fields'),
        where('status', '==', 'reviewed')
      );
      nestedFieldsUnsub = onSnapshot(nestedQuery, (snapshot) => {
        console.log('📦 Nested fields snapshot (reviewed) size:', snapshot.size);
        const seen = new Set();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const key = docSnap.ref.path;
          seen.add(key);
          // keep user's nested fields; overwrite only if not present (top-level takes precedence)
          fieldStore.set(key, {
            id: docSnap.id,
            ...data,
            userId: data.userId || currentUserId,
            sourceRef: key
          });
        });

        nestedFieldKeys.forEach((key) => {
          if (!seen.has(key) && !topFieldKeys.has(key)) {
            fieldStore.delete(key);
          }
        });
        nestedFieldKeys = seen;

        renderFromStore();
      }, (error) => {
        console.error('❌ Error fetching nested fields (reviewed):', error);
        showMessage('Error loading fields: ' + error.message, 'error');
      });

    } catch (error) {
      console.error('❌ Error loading fields:', error);
      showMessage('Error loading fields: ' + error.message, 'error');
    }
  }

  // Add field marker to map
  function addFieldMarker(field) {
    const lat = field.latitude || field.lat;
    const lng = field.longitude || field.lng;
    if (!lat || !lng) return;

    const fieldIcon = L.icon({
      iconUrl: '../../frontend/img/PIN.png',
      iconSize: [38, 44],
      iconAnchor: [19, 44],
      popupAnchor: [0, -36]
    });

    if (!markersLayer) {
      markersLayer = L.layerGroup().addTo(fieldsMap);
    }

    const marker = L.marker([lat, lng], { icon: fieldIcon }).addTo(markersLayer);

    const statusLabel = getStatusLabel(field.status);
    const statusColor = getStatusColor(field.status);
    const popupContent = `
      <div style="min-width: 200px;">
        <h3 style="font-weight: bold; font-size: 1rem; margin-bottom: 0.5rem; color: #1f2937;">
          ${field.field_name || field.fieldName || 'Unnamed Field'}
        </h3>
        <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem;">
          <p><strong>Location:</strong> ${field.barangay || 'N/A'}</p>
          <p><strong>Area:</strong> ${field.area_size || field.area || 'N/A'} hectares</p>
          <p><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: 600;">${statusLabel}</span></p>
        </div>
        <button onclick="viewFieldDetails('${field.id}')" style="background: #7ccf00; color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; width: 100%; border: none; cursor: pointer;">
          View Details
        </button>
      </div>
    `;
    marker.bindPopup(popupContent);

    marker.on('click', () => {
      highlightFieldInList(field.field_name || field.fieldName || '');
    });

  }

  // --- Fetch field details from Firestore nested structure ---
  async function fetchFieldApplicationDetails(requestedBy, fieldId) {
    try {
      const fieldRef = doc(db, "field_applications", requestedBy, "fields", fieldId);
      const snap = await getDoc(fieldRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() };
      } else {
        console.warn("No field data found for:", fieldId);
        return null;
      }
    } catch (err) {
      console.error("Failed to fetch field application details:", err);
      return null;
    }
  }

  // Update fields list in sidebar
  function updateFieldsList() {
    const listContainer = document.getElementById('handlerFieldsList');
    const emptyState = document.getElementById('fieldsEmpty');
    
    if (!listContainer) return;

    if (fieldsData.length === 0) {
      listContainer.classList.remove('hidden');
      listContainer.innerHTML = sampleFieldsTemplate;
      emptyState?.classList.remove('hidden');
      return;
    }

    listContainer.classList.remove('hidden');
    emptyState?.classList.add('hidden');

    listContainer.innerHTML = fieldsData.map(field => {
      const statusLabel = getStatusLabel(field.status);
      const { badgeClass, textClass } = getBadgeClasses(field.status);
      return `
        <div class="p-3 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1">
              <h4 class="text-sm font-semibold text-gray-900 mb-1">${field.field_name || field.fieldName || 'Unnamed Field'}</h4>
              <p class="text-xs text-gray-600">
                <i class="fas fa-map-marker-alt text-[var(--cane-600)] mr-1"></i>
                ${field.barangay || 'Unknown location'}
              </p>
              <p class="text-[11px] text-gray-500 mt-1">
                ${field.area_size || field.area || 'N/A'} hectares
              </p>
            </div>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeClass} ${textClass}">
              ${statusLabel}
            </span>
          </div>
          <div class="mt-2.5 flex items-center gap-2">
            <button class="inline-flex items-center gap-1.5 px-3 py-1.25 text-sm font-semibold rounded-lg text-white bg-[var(--cane-700)] hover:bg-[var(--cane-800)] transition" onclick="focusField('${field.id}')">
              <i class="fas fa-location-arrow"></i>
              Focus on Map
            </button>
            <button class="inline-flex items-center gap-1.5 px-3 py-1.25 text-sm font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition" onclick="viewFieldDetails('${field.id}')">
              <i class="fas fa-eye"></i>
              View Details
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Update fields count
  function updateFieldsCount() {
    const countElement = document.getElementById('handlerFieldsTotal');
    if (countElement) {
      countElement.innerHTML = `<i class="fas fa-map-pin text-[var(--cane-700)]"></i><span>${fieldsData.length} fields</span>`;
    }
  }

  // Focus on specific field
    window.focusField = function(fieldId) {
      const field = fieldsData.find(f => f.id === fieldId);
      if (!field) return;

      const lat = field.latitude || field.lat;
      const lng = field.longitude || field.lng;
      if (!lat || !lng) return;

      fieldsMap.setView([lat, lng], 16);

      markersLayer.eachLayer(layer => {
        if (layer instanceof L.Marker) {
          const markerLatLng = layer.getLatLng();
          if (Math.abs(markerLatLng.lat - lat) < 0.0001 && Math.abs(markerLatLng.lng - lng) < 0.0001) {
            layer.openPopup();
          }
        }
      });

      highlightFieldInList(field.field_name || field.fieldName || '');
    };

// ============================================================
// View Field Details Modal (replaces stub)
// ============================================================
window.viewFieldDetails = async function(fieldId) {
  try {
    console.log('Opening Field Details modal for:', fieldId);

    // --- Get field data (prefer in-memory store) ---
    // fieldStore exists in this module (populated by loadUserFields)
    let field = null;
    // Try to find by id in fieldsData first (fast)
    if (Array.isArray(fieldsData) && fieldsData.length) {
      field = fieldsData.find(f => (f.id || f.field_id || f.fieldId) === fieldId);
    }
    // Then try fieldStore entries
    if (!field && fieldStore && fieldStore.size) {
      for (const item of fieldStore.values()) {
        if ((item.id || item.field_id || item.fieldId) === fieldId) { field = item; break; }
      }
    }
    // Final fallback: fetch field doc from Firestore
    if (!field) {
      try {
        const fieldRef = doc(db, 'fields', fieldId);
        const snap = await getDoc(fieldRef);
        if (snap.exists()) field = { id: snap.id, ...(snap.data()||{}) };
      } catch (err) {
        console.warn('Failed to fetch field doc from Firestore:', err);
      }
    }

    if (!field) {
      alert('Field not found.');
      return;
    }

    // --- Fetch additional field data from field_applications/{requestedBy}/fields/{fieldId} ---
    let detailedField = null;

    if (field.requestedBy) {
      detailedField = await fetchFieldApplicationDetails(field.requestedBy, fieldId);
    }

    if (!detailedField) {
      console.warn("No detailed field info found in field_applications path.");
      detailedField = {};
    }

    // Use detailed data (fallback to base if missing)
    const fieldName = detailedField.field_name || field.field_name || 'Unnamed Field';
    const street = detailedField.street || '—';
    const barangay = detailedField.barangay || '—';
    const caneType = detailedField.sugarcane_variety || field.cane_type || 'N/A';
    const area = detailedField.field_size || field.area_size || 'N/A';
    const terrain = detailedField.terrain_type || 'N/A';

    // Format address
    const formattedAddress = `${street}, ${barangay}, Ormoc City`;

    // --- Build modal DOM (centered) ---
    // Remove any existing details modal first
    const existing = document.getElementById('fieldDetailsModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');


    modal.id = 'fieldDetailsModal';
    modal.className = 'fixed inset-0 z-[20000] flex items-center justify-center p-4';
    modal.innerHTML = `
      <div id="fieldDetailsBackdrop" class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      <section class="relative w-full max-w-[1300px] max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-[var(--cane-200)] flex flex-col">
        <header class="flex items-start justify-between gap-4 p-6 border-b">
          <div>
          <h2 id="fd_name" class="text-2xl font-bold text-[var(--cane-900)] leading-tight">${escapeHtml(fieldName)}</h2>
          <div id="fd_address" class="flex items-center gap-1.5 mt-1 text-sm text-[var(--cane-700)]">
            <i class="fas fa-map-marker-alt text-[var(--cane-600)] opacity-80"></i>
            <span>${escapeHtml(formattedAddress)}</span>
          </div><div class="mt-2 text-xs text-[var(--cane-600)] flex flex-wrap gap-x-3 gap-y-1">
            <span><strong>Type:</strong> ${escapeHtml(caneType)}</span>
            <span><strong>Area:</strong> ${escapeHtml(String(area))} ha</span>
            <span><strong>Terrain:</strong> ${escapeHtml(terrain)}</span>
          </div>
          </div>
          <div class="ml-4 flex-shrink-0">
            <div id="fd_status" class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-[var(--cane-100)] text-[var(--cane-800)]"></div>
          </div>
        </header>


<div class="p-6 modal-content">
  <!-- LEFT COLUMN -->
  <div class="space-y-5">

    <!-- Month Selector & View Toggle -->
    <div class="flex items-center justify-between">
      <h3 class="text-base font-bold text-[var(--cane-900)]">Month of <span id="fd_month_label">November</span></h3>
      <div class="flex items-center gap-2">
        <select id="fd_month_selector" class="text-xs">
          <option value="0">January</option>
          <option value="1">February</option>
          <option value="2">March</option>
          <option value="3">April</option>
          <option value="4">May</option>
          <option value="5">June</option>
          <option value="6">July</option>
          <option value="7">August</option>
          <option value="8">September</option>
          <option value="9">October</option>
          <option value="10" selected>November</option>
          <option value="11">December</option>
        </select>
        <select id="fd_week_selector"></select>

      </div>
    </div>

    <!-- Field Tasks -->
    <div class="fd_table_card p-3">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold">Field Tasks</h3>
        <select id="fd_tasks_filter" class="text-xs rounded-md border px-2 py-1">
          <option value="all">All</option>
          <option value="todo">To Do</option>
          <option value="pending">Pending</option>
          <option value="done">Done</option>
        </select>
      </div>
      <div id="fd_tasks_container">
        <p class="text-xs text-[var(--cane-600)]">Loading tasks...</p>
      </div>
    </div>
  </div>

  <!-- RIGHT COLUMN -->
  <div class="fd_table_card p-3">
    <h3 class="text-sm font-semibold mb-2">Growth Tracker (Monthly)</h3>
    <div id="fd_growth_container" class="text-xs text-[var(--cane-600)]">Loading growth tracker...</div>
  </div>
</div>


        <footer class="flex items-center justify-end gap-3 p-6 border-t">
          <button id="fd_create_task_btn" class="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 text-sm text-[var(--cane-800)] hover:bg-gray-50 transition">
            <i class="fas fa-plus"></i>
            Create Task
          </button>
          <button id="fd_close_btn" class="px-4 py-2 rounded-lg font-semibold bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white shadow-lg">
            Close
          </button>
        </footer>
      </section>
    `;

// --- New Responsive Scroll Behavior ---
const modalStyle = document.createElement('style');
modalStyle.textContent = `
  /* Base modal layout */
  #fieldDetailsModal section {
    display: flex;
    flex-direction: column;
    height: 90vh;
    overflow: hidden; /* lock global scroll */
  }

  /* Header & footer always visible */
  #fieldDetailsModal header,
  #fieldDetailsModal footer {
    flex: 0 0 auto;
    z-index: 5;
    background: white;
  }

  /* Modal content fills available height */
  #fieldDetailsModal .modal-content {
    flex: 1 1 auto;
    display: flex;
    gap: 20px;
    overflow: hidden; /* hide default scroll */
  }

  /* Field tasks scrollable only on DESKTOP */
  @media (min-width: 769px) {
    #fieldDetailsModal #fd_tasks_container {
      overflow-y: auto;
      max-height: calc(90vh - 240px); /* header + other UI height */
      padding-right: 8px;
      padding-bottom: 24px; /* gap before footer */
    }
    #fieldDetailsModal .modal-content {
      overflow: hidden;
    }
  }

  /* MOBILE: make full body scrollable */
  @media (max-width: 768px) {
    #fieldDetailsModal .modal-content {
      flex-direction: column;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 24px;
    }
    #fieldDetailsModal #fd_tasks_container {
      overflow: visible;
      max-height: none;
    }
  }

  /* Extra spacing between Field Tasks and footer */
  #fieldDetailsModal #fd_tasks_container {
    margin-bottom: 16px;
  }
`;

modalStyle.textContent += `
  /* MOBILE FIX: keep month header, tasks header, and date row fixed */
  @media (max-width: 768px) {
    #fieldDetailsModal .modal-content {
      flex-direction: column;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 24px;
      scroll-behavior: smooth;
    }

    /* 1️⃣ Keep the "Month of November" + dropdowns fixed */
    #fieldDetailsModal .modal-content > .space-y-5 > div:first-child {
      position: sticky;
      top: 0;
      background: white;
      z-index: 30;
    }

    /* 2️⃣ Keep "Field Tasks" title + filter sticky (just below month selector) */
    #fieldDetailsModal .fd_table_card > div:first-child {
      position: sticky;
      top: 48px;
      background: white;
      z-index: 25;
    }

    /* 3️⃣ Keep the full date-row (Mon–Sun) fixed */
    #fieldDetailsModal #fd_tasks_container > div.overflow-x-auto {
      position: sticky;
      top: 90px;
      background: white;
      z-index: 20;
    }

    /* 4️⃣ Allow only tasks content + growth tracker to scroll */
    #fieldDetailsModal #fd_tasks_container,
    #fieldDetailsModal #fd_growth_container {
      overflow: visible;
      max-height: none;
    }
  }
`;



modal.appendChild(modalStyle);


  const monthSelector = modal.querySelector('#fd_month_selector');
const weekSelector = modal.querySelector('#fd_week_selector');
const monthLabel = modal.querySelector('#fd_month_label');

function populateWeeks(monthIndex) {
  if (!weekSelector) return;
  weekSelector.innerHTML = '';
  // Determine number of weeks in the month dynamically
  const year = new Date().getFullYear();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const weeksInMonth = Math.ceil((lastDay.getDate() + firstDay.getDay()) / 7);

  for (let i = 1; i <= weeksInMonth; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.text = `Week ${i}`;
    weekSelector.appendChild(option);
  }

  // Auto-select current week if month is current
  const today = new Date();
  if (today.getMonth() === parseInt(monthIndex)) {
    const currentWeek = Math.ceil((today.getDate() + firstDay.getDay()) / 7);
    weekSelector.value = currentWeek;
  } else {
    weekSelector.value = 1;
  }
}

// Initial population
populateWeeks(monthSelector.value);

// ---------- WEEK SELECTION SUPPORT: compute date range for chosen month/week ----------
function getWeekDateRange(monthIndex, weekNumber) {
  const year = new Date().getFullYear();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  // find first date in month that belongs to that week number
  let start = new Date(firstDay);
  while (Math.ceil((start.getDate() + firstDay.getDay()) / 7) < weekNumber && start <= lastDay) {
    start.setDate(start.getDate() + 1);
  }
  // end date: last date that has same weekNumber (or month end)
  let end = new Date(start);
  while (Math.ceil((end.getDate() + firstDay.getDay()) / 7) === weekNumber && end <= lastDay) {
    end.setDate(end.getDate() + 1);
  }
  end.setDate(end.getDate() - 1);
  return { start, end };
}


function renderTasksForWeek(tasks = [], monthIndex = (new Date()).getMonth(), weekNumber = 1, filter = 'all') {
  const { start, end } = getWeekDateRange(monthIndex, weekNumber);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const grouped = {};
  tasks.forEach(t => {
    if (filter !== 'all' && (t.status || '').toLowerCase() !== filter) return;
    const scheduled = t.scheduled_at ? (t.scheduled_at.toDate ? t.scheduled_at.toDate() : new Date(t.scheduled_at)) : null;
    const key = scheduled ? scheduled.toISOString().slice(0,10) : (t.date || 'unspecified');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  const cols = days.map(d => {
    const key = d.toISOString().slice(0,10);
    const items = grouped[key] || [];
    const dayLabel = d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
    const inner = items.map(it => {
      const title = it.title || it.task || 'Untitled task';
      const time = it.scheduled_at ? (it.scheduled_at.toDate ? it.scheduled_at.toDate().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : new Date(it.scheduled_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})) : '';
      const status = (it.status || 'todo').toLowerCase();
      const statusBadge = status === 'done' ? '<span class="px-2 py-0.5 rounded text-xs">Done</span>' : (status === 'pending' ? '<span class="px-2 py-0.5 rounded text-xs">Pending</span>' : '<span class="px-2 py-0.5 rounded text-xs">To Do</span>');
      return `<div class="fd_task_item mb-2 p-2 rounded border border-gray-100">
  <div class="text-sm font-semibold">${escapeHtml(title)}</div>
  <div class="text-xs text-[var(--cane-600)]">${escapeHtml(time)} • ${statusBadge}</div>
</div>
`;
    }).join('');
    return `<div class="min-w-[140px] flex-shrink-0"><div class="text-xs font-semibold mb-2">${escapeHtml(dayLabel)}</div>${inner || '<div class="text-xs text-[var(--cane-500)]">No tasks</div>'}</div>`;
  }).join('');

  return `<div class="overflow-x-auto"><div class="flex gap-4 pb-2">${cols}</div></div>`;
}

function adjustTasksContainerVisibleCount(modalEl, visibleDesktop = 4, visibleMobile = 5) {
  try {
    const tasksContainer = modalEl.querySelector('#fd_tasks_container');
    const modalBody = modalEl.querySelector('.fd_modal_body') || modalEl.querySelector('#fd_modal_body');
    if (!tasksContainer) return;

    const firstItem = tasksContainer.querySelector('.fd_task_item');
    if (!firstItem) {
      setTimeout(() => adjustTasksContainerVisibleCount(modalEl, visibleDesktop, visibleMobile), 120);
      return;
    }

    const style = window.getComputedStyle(firstItem);
    const marginTop = parseFloat(style.marginTop || 0);
    const marginBottom = parseFloat(style.marginBottom || 0);
    const itemHeight = Math.ceil(firstItem.getBoundingClientRect().height + marginTop + marginBottom);

    const isDesktop = window.matchMedia('(min-width: 769px)').matches;
    const visibleCount = isDesktop ? visibleDesktop : visibleMobile;
    const maxH = (itemHeight * visibleCount) + 8;

    // Desktop: only task list scrolls
    if (isDesktop) {
      tasksContainer.style.overflowY = 'auto';
      tasksContainer.style.maxHeight = `${maxH}px`;
      tasksContainer.style.paddingRight = '8px';
      tasksContainer.style.webkitOverflowScrolling = '';
      if (modalBody) {
        modalBody.style.overflowY = 'visible';
        modalBody.style.maxHeight = '';
      }
    }
    // Mobile: entire modal body scrolls (tasks + growth)
    else {
      if (modalBody) {
        modalBody.style.overflowY = 'auto';
        modalBody.style.maxHeight = '75vh'; // limit height to 75% of screen
        modalBody.style.webkitOverflowScrolling = 'touch';
      }
      // remove overflow from task container
      tasksContainer.style.overflowY = 'visible';
      tasksContainer.style.maxHeight = 'unset';
    }

  } catch (err) {
    console.warn('adjustTasksContainerVisibleCount error', err);
  }
}


// call adjust after renders (see next step where to call)

// --- wire week selector changes to re-render tasks ---
if (weekSelector) {
  weekSelector.addEventListener('change', async () => {
    try {
      const mIdx = parseInt(monthSelector.value, 10);
      const wNum = parseInt(weekSelector.value, 10);
      const filterValue = modal.querySelector('#fd_tasks_filter')?.value || 'all';
      const tasks = await fetchTasksForField(fieldId).catch(()=>[]);
      const tasksContainer = modal.querySelector('#fd_tasks_container');
      if (tasksContainer) tasksContainer.innerHTML = renderTasksForWeek(tasks, mIdx, wNum, filterValue === 'all' ? 'all' : filterValue);
    } catch (err) {
      console.error('Error re-rendering tasks for selected week:', err);
    }
  });
}


// Also re-run weeks when month changes
monthSelector.addEventListener('change', async (e) => {
  const idx = parseInt(e.target.value, 10);
  populateWeeks(idx);
  if (weekSelector) weekSelector.dispatchEvent(new Event('change'));
});

// Update weeks when month changes
monthSelector.addEventListener('change', (e) => {
  const idx = parseInt(e.target.value);
  monthLabel.textContent = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ][idx];
  populateWeeks(idx);
});
    // small helper to escape text (prevent popup html injection)
    function escapeHtml(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

    // Append modal
    document.body.appendChild(modal);

    // update visible count on resize / orientation change
    const resizeHandler = () => adjustTasksContainerVisibleCount(modal, 4, 5);
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('orientationchange', resizeHandler);
    // remove listeners when modal is removed
    modal.addEventListener('remove', () => {
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('orientationchange', resizeHandler);
    });


    // --- Month Selector + View Toggle (placed correctly inside modal) ---
    const viewToggle = modal.querySelector('#fd_view_toggle');

    if (monthSelector && viewToggle && monthLabel) {
      // --- Auto-select current month and week ---
      const now = new Date();
      const currentMonthIndex = now.getMonth(); // 0-11
      const monthNames = [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December"
      ];

      // Set default month in both selector and label
      monthSelector.value = currentMonthIndex.toString();
      monthLabel.textContent = monthNames[currentMonthIndex];

      // Always default to weekly view (today's week)
      viewToggle.value = 'weekly';

      // Determine current week of the month (1–5)
      function getWeekOfMonth(date) {
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const dayOfMonth = date.getDate();
        const adjustedDate = dayOfMonth + firstDay.getDay();
        return Math.ceil(adjustedDate / 7);
      }

      console.log(`📅 Auto-selected: ${monthNames[currentMonthIndex]}`);

      monthSelector.addEventListener('change', (e) => {
        const monthNames = [
          "January","February","March","April","May","June",
          "July","August","September","October","November","December"
        ];
        monthLabel.textContent = monthNames[parseInt(e.target.value)];
      });

      viewToggle.addEventListener('change', (e) => {
        const view = e.target.value;
        console.log("Switched to view:", view);
      });
    }

    // scroll to top of modal content
    modal.querySelector('section')?.scrollTo?.({ top: 0 });

    // --- Status badge ---
    const statusEl = modal.querySelector('#fd_status');
    if (statusEl) {
      const status = (field.status || 'active').toString().toLowerCase();
      statusEl.textContent = (status.charAt(0).toUpperCase() + status.slice(1));
      statusEl.classList.add('px-3','py-1');
      // small color mapping for badge (tailwind-ish classes)
      if (status.includes('review') || status.includes('active')) {
        statusEl.style.background = 'rgba(124, 207, 0, 0.12)';
        statusEl.style.color = '#166534';
      } else if (status.includes('pending') || status.includes('edit')) {
        statusEl.style.background = 'rgba(250, 204, 21, 0.12)';
        statusEl.style.color = '#92400e';
      } else {
        statusEl.style.background = 'rgba(239, 68, 68, 0.08)';
        statusEl.style.color = '#991b1b';
      }
    }

    // --- Close handlers ---
    modal.querySelector('#fd_close_btn')?.addEventListener('click', () => modal.remove());
    // --- Open Create Task modal (small) ---
    // FILE: C:\CaneMap\public\backend\Handler\fields-map.js   (replace lines matching "// --- Open Create Task modal (small) ---" block)
    modal.querySelector('#fd_create_task_btn')?.addEventListener('click', (e) => {
      // open the create-task small modal using the imported module function
      try {
        // openCreateTaskModal is imported from ./create-task.js at top of this file
        openCreateTaskModal(fieldId);
      } catch (err) {
        console.error('Failed to open Create Task modal:', err);
        // user-visible fallback
        alert('Unable to open Create Task modal. See console for details.');
      }
    });
    modal.querySelector('#fieldDetailsBackdrop')?.addEventListener('click', (e) => {
      // close when clicking backdrop
      if (e.target.id === 'fieldDetailsBackdrop') modal.remove();
    });
    const escHandler = (e) => { if (e.key === 'Escape') modal.remove(); };
    document.addEventListener('keydown', escHandler);
    modal.addEventListener('remove', () => { document.removeEventListener('keydown', escHandler); });

    // --- Load weather (Open-Meteo free API) ---
    (async () => {
      try {
        const lat = 11.0042, lon = 124.6035; // Ormoc City
        // Use hourly/current weather from open-meteo
        const resp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`);
        const json = await resp.json();
        if (json && json.current_weather) {
          const cw = json.current_weather;
          const weatherIcon = modal.querySelector('#fd_weather_icon');
          const code = cw.weathercode;
          const weatherDesc = getWeatherDescription(code);
          modal.querySelector('#fd_weather_desc').textContent = `${weatherDesc} • Wind ${Math.round(cw.windspeed)} km/h`;
          modal.querySelector('#fd_weather_val').textContent = `${cw.temperature ?? '—'}°C`;
          weatherIcon.src = getWeatherIconUrl(code);
        } else {
          modal.querySelector('#fd_weather_desc').textContent = 'Weather unavailable';
          modal.querySelector('#fd_weather_val').textContent = '—';
        }
      } catch (err) {
        console.warn('Weather fetch failed', err);
        const descEl = modal.querySelector('#fd_weather_desc');
        if (descEl) descEl.textContent = 'Failed to load weather';
      }
    })();

    // --- Load field tasks (try multiple collection patterns) ---
    async function fetchTasksForField(fid) {
      // try subcollection: fields/{fid}/tasks
      try {
        const tasksRef = collection(db, 'fields', fid, 'tasks');
        const snap = await getDocs(query(tasksRef, orderBy('scheduled_at', 'asc')));
        if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err) {
        console.debug('No subcollection tasks or query failed (fields/{id}/tasks):', err?.message || err);
      }
      // fallback: top-level tasks collection with fieldId property
      try {
        const tasksQuery = query(collection(db, 'tasks'), where('fieldId', '==', fid), orderBy('scheduled_at', 'asc'));
        const snap = await getDocs(tasksQuery);
        if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err) {
        console.debug('Fallback tasks query failed:', err?.message || err);
      }
      return [];
    }

    // --- Load growth tracker (try several names) ---
    async function fetchGrowthRecords(fid) {
      const attempts = [
        () => getDocs(collection(db, 'fields', fid, 'growth')),
        () => getDocs(collection(db, 'fields', fid, 'growth_records')),
        () => getDocs(collection(db, 'fields', fid, 'growth_tracker')),
        () => getDocs(query(collection(db, 'growth_records'), where('fieldId', '==', fid), orderBy('month', 'desc'))),
      ];
      for (const attempt of attempts) {
        try {
          const snap = await attempt();
          if (snap && snap.size !== undefined && snap.size > 0) {
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
          }
        } catch (err) {
          // continue to next try
        }
      }
      return [];
    }

    // render tasks into a weekly table (today's week). Each day column can grow vertically.
    function renderTasksWeekly(tasks = [], filter = 'all') {
      // compute current week (Mon..Sun) display keys (use local timezone)
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 Sun .. 6 Sat
      // compute start as Monday
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      const days = [];
      for (let i=0;i<7;i++){
        const d = new Date(monday);
        d.setDate(monday.getDate()+i);
        days.push(d);
      }

      // group tasks by date (date-only)
      const grouped = {};
      tasks.forEach(t => {
        if (filter !== 'all' && (t.status || '').toLowerCase() !== filter) return;
        const scheduled = t.scheduled_at ? (t.scheduled_at.toDate ? t.scheduled_at.toDate() : new Date(t.scheduled_at)) : null;
        const key = scheduled ? scheduled.toISOString().slice(0,10) : (t.date || 'unspecified');
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(t);
      });

      // build HTML (simple, vertical lists per day)
      const cols = days.map(d => {
        const key = d.toISOString().slice(0,10);
        const items = grouped[key] || [];
        const dayLabel = d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
        const inner = items.map(it => {
          const title = it.title || it.task || 'Untitled task';
          const time = it.scheduled_at ? (it.scheduled_at.toDate ? it.scheduled_at.toDate().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : new Date(it.scheduled_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})) : '';
          const status = (it.status || 'todo').toLowerCase();
          const statusBadge = status === 'done' ? '<span class="px-2 py-0.5 rounded text-xs">Done</span>' : (status === 'pending' ? '<span class="px-2 py-0.5 rounded text-xs">Pending</span>' : '<span class="px-2 py-0.5 rounded text-xs">To Do</span>');
          return `<div class="fd_task_item mb-2 p-2 rounded border border-gray-100">
  <div class="text-sm font-semibold">${escapeHtml(title)}</div>
  <div class="text-xs text-[var(--cane-600)]">${escapeHtml(time)} • ${statusBadge}</div>
</div>
`;
        }).join('');
        return `<div class="min-w-[140px] flex-shrink-0"><div class="text-xs font-semibold mb-2">${escapeHtml(dayLabel)}</div>${inner || '<div class="text-xs text-[var(--cane-500)]">No tasks</div>'}</div>`;
      }).join('');

      // make wrapper scrollable horizontally on small screens
      return `<div class="overflow-x-auto"><div class="flex gap-4 pb-2">${cols}</div></div>`;
    }

    // render growth records (simple table by month)
    function renderGrowthTable(records = []) {
      if (!records || records.length === 0) return `<div class="text-xs text-[var(--cane-500)]">No growth data yet.</div>`;
      // sort by month descending if have month property
      records.sort((a,b) => {
        const am = a.month || a.date || '';
        const bm = b.month || b.date || '';
        return (bm > am) ? 1 : ((bm < am) ? -1 : 0);
      });
      const rows = records.map(r => {
        const month = r.month || r.label || (r.timestamp && (r.timestamp.toDate ? r.timestamp.toDate().toLocaleDateString() : new Date(r.timestamp).toLocaleDateString())) || 'Unknown';
        const height = r.height || r.avg_height || r.growth_cm || '—';
        const notes = r.notes || r.comment || '';
        return `<tr class="border-b"><td class="px-2 py-2 text-xs">${escapeHtml(month)}</td><td class="px-2 py-2 text-xs">${escapeHtml(String(height))}</td><td class="px-2 py-2 text-xs">${escapeHtml(notes)}</td></tr>`;
      }).join('');
      return `<div class="overflow-auto"><table class="w-full text-xs"><thead><tr class="border-b"><th class="text-left px-2 py-2">Month</th><th class="text-left px-2 py-2">Height</th><th class="text-left px-2 py-2">Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    // Fetch tasks + growth, render them
    (async () => {
      const tasksContainer = modal.querySelector('#fd_tasks_container');
      const growthContainer = modal.querySelector('#fd_growth_container');
      const filterSelect = modal.querySelector('#fd_tasks_filter');

      try {
        const [tasks, growth] = await Promise.all([
          fetchTasksForField(fieldId).catch(()=>[]),
          fetchGrowthRecords(fieldId).catch(()=>[])
        ]);

        const tasksFilter = modal.querySelector('#fd_tasks_filter');
        const tasksContainer = modal.querySelector('#fd_tasks_container');

        if (tasksFilter && tasksContainer) {
          tasksFilter.addEventListener('change', async (e) => {
            const filterValue = e.target.value; // "all", "todo", "pending", "done"
            const tasks = await fetchTasksForField(fieldId); // fetch tasks for this field
            renderTasksWeekly(tasks, filterValue); // re-render tasks with new filter
          });
        }

        
        const initialTasks = await fetchTasksForField(fieldId);
        const initMonth = parseInt(monthSelector.value, 10);
        const initWeek = parseInt(weekSelector.value, 10) || 1;
        tasksContainer.innerHTML = renderTasksForWeek(initialTasks, initMonth, initWeek, (tasksFilter?.value) || 'all');
        // apply visible-limit
        adjustTasksContainerVisibleCount(modal, 4, 5);

        // default render with current filter
        const currentFilter = (filterSelect?.value) || 'all';
        tasksContainer.innerHTML = renderTasksWeekly(tasks, currentFilter === 'all' ? 'all' : currentFilter);
        // apply visible-limit again (in case different renderer used)
        adjustTasksContainerVisibleCount(modal, 4, 5);
        growthContainer.innerHTML = renderGrowthTable(growth);

        // attach filter handler
        filterSelect?.addEventListener('change', (e) => {
          const val = e.target.value;
          tasksContainer.innerHTML = renderTasksWeekly(tasks, val === 'all' ? 'all' : val);
        });

      } catch (err) {
        console.error('Failed to load tasks/growth:', err);
        if (tasksContainer) tasksContainer.innerHTML = '<div class="text-xs text-red-500">Failed to load tasks.</div>';
        if (growthContainer) growthContainer.innerHTML = '<div class="text-xs text-red-500">Failed to load growth tracker.</div>';
      }
    })();

    // done
  } catch (outerErr) {
    console.error('viewFieldDetails failed', outerErr);
    alert('Failed to open field details: ' + (outerErr.message || outerErr));
  }
};


    // Show message
    function showMessage(message, type = 'info') {
      const messageEl = document.getElementById('handlerFieldsMessage');
      if (messageEl) {
        messageEl.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'info-circle'} text-${type === 'error' ? 'red' : 'blue'}-500"></i><span>${message}</span>`;
      }
    }

    document.getElementById('handlerFieldsSearch')?.addEventListener('input', (e) => {
      const term = e.target.value.trim().toLowerCase();

      if (!term) {
        updateFieldsList();
        updateFieldsCount();
        if (markersLayer) {
          markersLayer.clearLayers();
          fieldsData.forEach(f => addFieldMarker(f));
          const group = new L.featureGroup(markersLayer.getLayers());
          fieldsMap.fitBounds(group.getBounds().pad(0.1));
        }
        return;
      }

      const filtered = fieldsData.filter(f =>
        (f.field_name || f.fieldName || '').toLowerCase().includes(term) ||
        (f.barangay || '').toLowerCase().includes(term) ||
        (f.location || '').toLowerCase().includes(term)
      );

      const listContainer = document.getElementById('handlerFieldsList');
      if (filtered.length === 0) {
        listContainer.innerHTML = `
          <div class="p-3 text-center text-sm text-gray-600">
            <i class="fas fa-search text-[var(--cane-600)] mr-1"></i>
            No fields found.
          </div>`;
      } else {
        const backup = fieldsData;
        fieldsData = filtered;
        updateFieldsList();
        fieldsData = backup;
      }

      if (markersLayer) markersLayer.clearLayers();
      filtered.forEach(f => addFieldMarker(f));

      if (filtered.length > 0 && markersLayer.getLayers().length > 0) {
        const group = new L.featureGroup(markersLayer.getLayers());
        fieldsMap.fitBounds(group.getBounds().pad(0.1));
      }
    });

  // Listen for auth state changes
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUserId = user.uid;
      console.log('✅ User logged in:', currentUserId);
      if (fieldsMap) {
        console.log('🗺️ Map exists, loading fields...');
        loadUserFields();
      } else {
        console.log('⏳ Map not ready yet, will load fields after init');
      }
    } else {
      console.warn('❌ No user logged in');
      currentUserId = null;
      fieldsData = [];
      if (markersLayer) {
        markersLayer.clearLayers();
      }
      updateFieldsList();
      updateFieldsCount();
    }
  });

  // Initialize when section loads
  const initWhenReady = () => {
    console.log('🚀 Initializing fields map...');
    const mapContainer = document.getElementById('handlerFieldsMap');
    
    // Check if Leaflet is loaded first
    if (typeof L === 'undefined') {
      console.log('⏳ Leaflet not loaded yet, retrying...');
      setTimeout(initWhenReady, 200);
      return;
    }
    
    // Check if container exists
    if (!mapContainer) {
      console.log('⏳ Map container not found yet, retrying...');
      setTimeout(initWhenReady, 200);
      return;
    }
    
    // Check if container is visible and has dimensions
    const rect = mapContainer.getBoundingClientRect();
    if (mapContainer.offsetParent === null || rect.width === 0 || rect.height === 0) {
      console.log('⏳ Map container not visible yet (width:', rect.width, 'height:', rect.height, '), retrying...');
      setTimeout(initWhenReady, 200);
      return;
    }
    
    console.log('✅ All conditions met, initializing map...');
    console.log('   - Leaflet loaded:', typeof L !== 'undefined');
    console.log('   - Container found:', !!mapContainer);
    console.log('   - Container dimensions:', rect.width, 'x', rect.height);
    
    // Small delay to ensure everything is ready
    setTimeout(() => {
      initFieldsMap();
    }, 100);
  };

  // Export for use by dashboard.js
  window.initFieldsMap = initFieldsMap;
  window.reloadFieldsMap = () => {
    console.log('🔄 Reloading fields map...');
    if (fieldsMap) {
      fieldsMap.remove();
      fieldsMap = null;
      markersLayer = null;
    }
    initWhenReady();
  };
  
  // Listen for when the fields section becomes visible
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const fieldsSection = document.getElementById('fields');
        if (fieldsSection && !fieldsSection.classList.contains('hidden')) {
          if (!fieldsMap) {
            console.log('📍 Fields section now visible, initializing map...');
            initWhenReady();
          } else {
            // Map already exists, just resize it
            console.log('🔄 Fields section visible, resizing map...');
            setTimeout(() => {
              if (fieldsMap) {
                fieldsMap.invalidateSize();
              }
            }, 100);
          }
        }
      }
    });
  });
  
  // Start observing the fields section
  const fieldsSection = document.getElementById('fields');
  if (fieldsSection) {
    observer.observe(fieldsSection, { attributes: true });
    
    // Also check if already visible
    if (!fieldsSection.classList.contains('hidden')) {
      initWhenReady();
    }
  } else {
    // Fallback if section doesn't exist yet
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initWhenReady);
    } else {
      initWhenReady();
    }
  }
}

window.addEventListener('resize', () => {
  if (fieldsMap) {
    setTimeout(() => fieldsMap.invalidateSize(), 300);
  }
});

function getWeatherDescription(code) {
  const map = {
    0: "Clear Sky", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing Rime Fog",
    51: "Light Drizzle", 53: "Drizzle", 55: "Dense Drizzle",
    61: "Slight Rain", 63: "Moderate Rain", 65: "Heavy Rain",
    71: "Slight Snowfall", 73: "Moderate Snow", 75: "Heavy Snow",
    95: "Thunderstorm", 96: "Thunderstorm w/ Hail", 99: "Severe Thunderstorm"
  };
  return map[code] || "Unknown";
}
function getWeatherIconUrl(code) {
  if ([0,1].includes(code)) return "https://cdn-icons-png.flaticon.com/512/869/869869.png";
  if ([2,3].includes(code)) return "https://cdn-icons-png.flaticon.com/512/1163/1163661.png";
  if ([45,48].includes(code)) return "https://cdn-icons-png.flaticon.com/512/4005/4005901.png";
  if ([61,63,65].includes(code)) return "https://cdn-icons-png.flaticon.com/512/3313/3313888.png";
  if ([95,96,99].includes(code)) return "https://cdn-icons-png.flaticon.com/512/1779/1779940.png";
  return "https://cdn-icons-png.flaticon.com/512/869/869869.png";
}

