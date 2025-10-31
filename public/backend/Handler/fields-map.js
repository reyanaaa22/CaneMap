// Import Firebase from existing config
import { auth, db } from '../Common/firebase-config.js';
import { collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';

// Initialize Leaflet Map for Fields Section
export function initializeFieldsSection() {
  let fieldsMap = null;
  let markersLayer = null;
  let currentUserId = null;
  let fieldsData = [];

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
        <li class="flex items-start justify-between gap-3 rounded-lg border border-[var(--cane-200)] bg-white px-4 py-3">
          <div>
            <p class="font-semibold text-[var(--cane-900)]">${sample.name}</p>
            <p class="text-xs text-[var(--cane-700)]">${sample.location}</p>
            <p class="text-xs text-[var(--cane-600)] mt-1">${sample.area}</p>
          </div>
          <div class="flex flex-col items-end gap-2">
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${meta.badgeClass} ${meta.textClass}">
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
    showMessage('Loading your fields...', 'info');

    try {
      // Query fields collection where userId matches current user
      const fieldsRef = collection(db, 'fields');
      console.log('📂 Querying collection: fields');
      console.log('🔍 Query: where("userId", "==", "' + currentUserId + '")');
      
      const q = query(fieldsRef, where('userId', '==', currentUserId));
      
      // Real-time listener for field updates
      onSnapshot(q, (snapshot) => {
        console.log('📦 Snapshot received, size:', snapshot.size);
        
        fieldsData = [];
        markersLayer.clearLayers(); // Clear existing markers
        
        snapshot.forEach((doc) => {
          const fieldData = { id: doc.id, ...doc.data() };
          console.log('📍 Field found:', {
            id: doc.id,
            name: fieldData.field_name || fieldData.fieldName,
            hasCoordinates: !!(fieldData.latitude && fieldData.longitude),
            latitude: fieldData.latitude,
            longitude: fieldData.longitude
          });
          
          fieldsData.push(fieldData);
          
          // Add marker to map if coordinates exist
          if (fieldData.latitude && fieldData.longitude) {
            console.log('✅ Adding marker for:', fieldData.field_name || fieldData.fieldName);
            addFieldMarker(fieldData);
          } else {
            console.warn('⚠️ No coordinates for field:', fieldData.field_name || fieldData.fieldName);
          }
        });

        // Update fields list
        updateFieldsList();
        updateFieldsCount();
        
        // Fit map to show all markers
        if (fieldsData.length > 0 && markersLayer.getLayers().length > 0) {
          const group = new L.featureGroup(markersLayer.getLayers());
          fieldsMap.fitBounds(group.getBounds().pad(0.1));
          showMessage(`Showing ${fieldsData.length} field(s) on the map`, 'info');
        } else if (fieldsData.length > 0) {
          showMessage(`Found ${fieldsData.length} field(s) but no coordinates available`, 'error');
        } else {
          showMessage('No fields registered yet', 'info');
        }

        console.log(`✅ Loaded ${fieldsData.length} fields, ${markersLayer.getLayers().length} markers`);
      }, (error) => {
        console.error('❌ Error fetching fields:', error);
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

    // Create custom green marker icon
    const fieldIcon = L.divIcon({
      className: 'custom-field-marker',
      html: `<div style="background: #22c55e; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(34,197,94,0.4);"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    if (!markersLayer) {
      markersLayer = L.layerGroup().addTo(fieldsMap);
    }

    // Create marker
    const marker = L.marker([lat, lng], { icon: fieldIcon }).addTo(markersLayer);

    // Create popup content
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
        <div class="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1">
              <h4 class="font-semibold text-gray-900 mb-1">${field.field_name || field.fieldName || 'Unnamed Field'}</h4>
              <p class="text-sm text-gray-600">
                <i class="fas fa-map-marker-alt text-[var(--cane-600)] mr-1"></i>
                ${field.barangay || 'Unknown location'}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                ${field.area_size || field.area || 'N/A'} hectares
              </p>
            </div>
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${badgeClass} ${textClass}">
              ${statusLabel}
            </span>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <button class="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg text-white bg-[var(--cane-700)] hover:bg-[var(--cane-800)] transition" onclick="focusField('${field.id}')">
              <i class="fas fa-location-arrow"></i>
              Focus on Map
            </button>
            <button class="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition" onclick="viewFieldDetails('${field.id}')">
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
    if (field) {
      const lat = field.latitude || field.lat;
      const lng = field.longitude || field.lng;
      
      if (lat && lng) {
        fieldsMap.setView([lat, lng], 16);
        
        // Find and open popup for this field
        markersLayer.eachLayer(layer => {
          if (layer instanceof L.Marker) {
            const markerLatLng = layer.getLatLng();
            if (Math.abs(markerLatLng.lat - lat) < 0.0001 && Math.abs(markerLatLng.lng - lng) < 0.0001) {
              layer.openPopup();
            }
          }
        });
      }
    }
  };

  // View field details
  window.viewFieldDetails = function(fieldId) {
    console.log('View details for field:', fieldId);
    // Add your field details view logic here
  };

  // Show message
  function showMessage(message, type = 'info') {
    const messageEl = document.getElementById('handlerFieldsMessage');
    if (messageEl) {
      messageEl.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'info-circle'} text-${type === 'error' ? 'red' : 'blue'}-500"></i><span>${message}</span>`;
    }
  }

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
