
        // Global variables
        let currentSection = 'dashboard';

        // Initialize dashboard when DOM is loaded
        document.addEventListener('DOMContentLoaded', async function() {
            setupEventListeners();
            try {
                const { auth, db } = await import('../Common/firebase-config.js');
                const { onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
                const { collection, collectionGroup, query, orderBy, limit, getDocs, doc, getDoc, onSnapshot, where } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                onAuthStateChanged(auth, async (user) => {
                    if (user) {
                        // Check if user is verified
                        if (!user.emailVerified) {
                            alert('Please verify your email before accessing the SRA dashboard.');
                            window.location.href = '../Common/farmers_login.html';
                            return;
                        }
                        
                        // Check user role in Firestore
                        const userRef = doc(db, 'users', user.uid);
                        const userSnap = await getDoc(userRef);
                        const userRole = userSnap.exists() ? userSnap.data().role : 'farmer';
                        
                        if (userRole !== 'sra') {
                            alert('Access denied. This dashboard is only for SRA Officers.');
                            window.location.href = '../Common/lobby.html';
                            return;
                        }
                        
                        const display = user.displayName || user.email || 'SRA Officer';
                        const headerName = document.getElementById('headerUserName');
                        const sideName = document.getElementById('sidebarUserName');
                        if (headerName) headerName.textContent = display;
                        if (sideName) sideName.textContent = display;
                        // Load recent applications into dashboard card
                        try {
                            const list = document.getElementById('recentAppsList');
                            if (list) {
                                list.innerHTML = '<div class="text-sm text-[var(--cane-700)] p-4">Loading applications…</div>';
                                // Fetch recent from both top-level and nested subcollection `field`
                                async function fetchRecent() {
                                    // Avoid server-side orderBy to prevent missing-index errors; we'll sort client-side
                                    let topSnap = { docs: [] };
                                    let nestedSnap = { docs: [] };
                                    try {
                                        topSnap = await getDocs(collection(db, 'field_applications'));
                                    } catch(_) { topSnap = { docs: [] }; }
                                    try {
                                        nestedSnap = await getDocs(collectionGroup(db, 'fields'));
                                    } catch(_) { nestedSnap = { docs: [] }; }
                                    const normalize = (d, isNested) => {
                                        const a = d.data();
                                        const name = a.applicantName || a.applicant || 'Applicant';
                                        const brgy = a.barangay || a.location || '';
                                        const status = (a.status == null ? 'pending' : String(a.status)).toLowerCase();
                                        const ts = a.submittedAt || a.createdAt || a.statusUpdatedAt || null;
                                        return { name, brgy, status, ts, _raw: a, _isNested: isNested };
                                    };
                                    const items = [
                                        ...topSnap.docs.map(d => normalize(d, false)),
                                        ...nestedSnap.docs.map(d => normalize(d, true))
                                    ];
                                    // sort desc by timestamp
                                    items.sort((a,b)=>{
                                        const toMs = (t)=> t && t.seconds ? t.seconds*1000 : (t ? new Date(t).getTime() : 0);
                                        return toMs(b.ts) - toMs(a.ts);
                                    });
                                    return items.slice(0,5);
                                }
                                try {
                                    const items = await fetchRecent();
                                    if (!items.length) {
                                        list.innerHTML = '<div class="text-sm text-[var(--cane-700)] p-4 text-center">No recent applications to display</div>';
                                    } else {
                                        list.innerHTML = '';
                                        for (const a of items) {
                                            const item = document.createElement('div');
                                            item.className = 'flex items-start justify-between px-4 py-3 border border-[var(--cane-200)] rounded-lg bg-white/60';
                                            const left = document.createElement('div');
                                            left.className = 'flex items-start space-x-3';
                                            left.innerHTML = '<div class="w-8 h-8 bg-[var(--cane-500)] text-white rounded-full flex items-center justify-center">\n  <i class="fas fa-user"></i>\n</div>'+
                                                '<div><div class="font-medium text-[var(--cane-900)]">'+a.name+'</div>'+
                                                '<div class="text-xs text-[var(--cane-600)]">'+a.brgy+'</div></div>';
                                            const badge = document.createElement('span');
                                            const status = a.status || 'pending';
                                            badge.className = 'text-xs px-2 py-1 rounded '+(status==='reviewed'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-700');
                                            badge.textContent = status==='reviewed'?'Reviewed':'Pending Review';
                                            item.appendChild(left); item.appendChild(badge);
                                            list.appendChild(item);
                                        }
                                    }
                                } catch(e) {
                                    list.innerHTML = '<div class="text-sm text-[var(--cane-700)] p-4 text-center">Unable to load applications.</div>';
                                }
                            }
                        } catch(_) {}

                        // Live metrics listeners
                        try {
                            const { collection, collectionGroup, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                            // Elements
                            const elTotal = document.getElementById('metricTotalSubmissions');
                            const elPending = document.getElementById('metricPendingReview');
                            const elReviewedToday = document.getElementById('metricReviewedToday');
                            const elActiveFields = document.getElementById('metricActiveFields');

                            // Total Submissions (field_applications count)
                            function recomputeTotals(topSnap, nestedSnap){
                                const allDocs = [...topSnap.docs, ...nestedSnap.docs];
                                if (elTotal) elTotal.textContent = String(allDocs.length);
                                if (elPending) {
                                    let pendingCount = 0;
                                    allDocs.forEach(d => {
                                        const data = d.data();
                                        const s = (data.status == null) ? 'pending' : String(data.status).toLowerCase();
                                        if (s === 'pending') pendingCount += 1;
                                    });
                                    elPending.textContent = String(pendingCount);
                                }
                            }
                            let lastTop = { docs: [] }, lastNested = { docs: [] };
                            onSnapshot(query(collection(db, 'field_applications')), (snap) => { lastTop = snap; recomputeTotals(lastTop, lastNested); });
                            onSnapshot(query(collectionGroup(db, 'field')), (snap) => { lastNested = snap; recomputeTotals(lastTop, lastNested); });

                            // Reviewed Today: status==='reviewed' with statusUpdatedAt today
                            function computeReviewedToday(docs){
                                const today = new Date();
                                const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
                                const start = new Date(y, m, d, 0, 0, 0, 0);
                                const end = new Date(y, m, d, 23, 59, 59, 999);
                                let count = 0;
                                docs.forEach(docu => {
                                    const data = docu.data();
                                    const ts = data.statusUpdatedAt || data.submittedAt || data.createdAt;
                                    const t = ts && ts.seconds ? new Date(ts.seconds * 1000) : (ts ? new Date(ts) : null);
                                    if (t && t >= start && t <= end) count += 1;
                                });
                                return count;
                            }
                            let rTop = { docs: [] }, rNested = { docs: [] };
                            onSnapshot(query(collection(db, 'field_applications'), where('status', '==', 'reviewed')), (snap) => {
                                rTop = snap; if (elReviewedToday) elReviewedToday.textContent = String(computeReviewedToday([...rTop.docs, ...rNested.docs]));
                            });
                            onSnapshot(query(collectionGroup(db, 'field'), where('status', '==', 'reviewed')), (snap) => {
                                rNested = snap; if (elReviewedToday) elReviewedToday.textContent = String(computeReviewedToday([...rTop.docs, ...rNested.docs]));
                            });

                            // Active Fields: count from 'fields' collection
                            onSnapshot(query(collection(db, 'fields')), (snap) => {
                                if (elActiveFields) elActiveFields.textContent = String(snap.size);
                            });
                        } catch(_) {}

                        // Initialize SRA Fields map with active fields
                        try {
                            const mapBox = document.getElementById('sraFieldsMap');
                            if (mapBox) {
                                // ensure Leaflet loaded
                                async function ensureLeaflet(){
                                    if (window.L) return;
                                    const link = document.createElement('link');
                                    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                                    document.head.appendChild(link);
                                    await new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload=resolve; s.onerror=reject; document.body.appendChild(s); });
                                }
                                await ensureLeaflet();
                                const map = L.map(mapBox, { zoomControl: true }).setView([11.0064, 124.6075], 12);
                                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
                                const caneIcon = L.icon({ iconUrl: '../img/PIN.png', iconSize: [32,32], iconAnchor: [16,30], popupAnchor: [0,-28] });
                                const markers = new Map(); // id => marker
                                const fieldsQ = query(collection(db, 'fields'));
                                onSnapshot(fieldsQ, (snap) => {
                                    // Update markers live
                                    const seen = new Set();
                                    snap.forEach(docu => {
                                        const d = docu.data();
                                        const id = docu.id;
                                        seen.add(id);
                                        const lat = d.lat, lng = d.lng;
                                        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;
                                        const label = (d.applicantName || 'Field') + (d.barangay ? ` — ${d.barangay}` : '');
                                        if (markers.has(id)) {
                                            const mk = markers.get(id);
                                            mk.setLatLng([lat, lng]);
                                            mk.bindPopup(label);
                                        } else {
                                            const mk = L.marker([lat, lng], { icon: caneIcon }).addTo(map).bindPopup(label);
                                            markers.set(id, mk);
                                        }
                                    });
                                    // Remove markers not present anymore
                                    for (const [id, mk] of markers.entries()) {
                                        if (!seen.has(id)) { map.removeLayer(mk); markers.delete(id); }
                                    }
                                    // Fit bounds if we have markers
                                    try {
                                        const latlngs = Array.from(markers.values()).map(mk => mk.getLatLng());
                                        if (latlngs.length) {
                                            const b = L.latLngBounds(latlngs);
                                            map.fitBounds(b, { padding: [20,20], maxZoom: 15 });
                                        }
                                    } catch(_) {}
                                });
                                setTimeout(()=>{ map.invalidateSize(); }, 200);

                                // Constrain to Ormoc City vicinity
                                try {
                                    // Rough bounding box around Ormoc City, Leyte
                                    const southWest = L.latLng(10.85, 124.45);
                                    const northEast = L.latLng(11.20, 124.80);
                                    const bounds = L.latLngBounds(southWest, northEast);
                                    map.setMaxBounds(bounds);
                                    map.on('drag', function() { map.panInsideBounds(bounds, { animate: true }); });
                                } catch(_) {}

                                // Focus-to-zoom behavior: enable zoom only after clicking the map; disable on outside click
                                try {
                                    let zoomActive = false;
                                    function disableZoom(){
                                        map.scrollWheelZoom.disable();
                                        map.doubleClickZoom.disable();
                                        map.touchZoom.disable();
                                        zoomActive = false;
                                        mapBox.classList.remove('ring-2','ring-[var(--cane-500)]');
                                    }
                                    function enableZoom(){
                                        map.scrollWheelZoom.enable();
                                        map.doubleClickZoom.enable();
                                        map.touchZoom.enable();
                                        zoomActive = true;
                                        mapBox.classList.add('ring-2','ring-[var(--cane-500)]');
                                    }
                                    // Start disabled
                                    disableZoom();
                                    // Activate on map click
                                    mapBox.addEventListener('mousedown', function(){ enableZoom(); });
                                    // Deactivate when clicking outside the map
                                    document.addEventListener('mousedown', function(e){
                                        if (!mapBox.contains(e.target)) { disableZoom(); }
                                    });
                                    // When not active, ensure wheel scrolling scrolls the page, not the map
                                    mapBox.addEventListener('wheel', function(e){
                                        if (!zoomActive) {
                                            // Do not prevent default; just ensure map doesn't handle it
                                            e.stopPropagation();
                                        }
                                    }, { capture: true });
                                } catch(_) {}
                            }
                        } catch(_) {}

                        // Live notifications (for SRA officer)
                        try {
                            const nList = document.getElementById('notificationsList');
                            const badge = document.getElementById('notificationsBadge');
                            const bellList = document.getElementById('bellPopupList');
                            const notifContainer = document.getElementById('notifList');
                            const notifSearch = document.getElementById('notifSearch');
                            const notifSort = document.getElementById('notifSort');
                            if (nList && badge) {
                                nList.innerHTML = '<div class="text-sm text-[var(--cane-700)] p-4">Loading notifications…</div>';
                                const notiRef = collection(db, 'notifications');
                                // Scope: SRA-wide notifications (no userId) or targeted to this officer role
                                const nq = query(notiRef, orderBy('createdAt', 'desc'));
                                const { onSnapshot } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                                onSnapshot(nq, (nsnap) => {
                                    let docs = nsnap.docs
                                      .map(d => ({ id: d.id, ...d.data() }))
                                      .filter(n => !n.userId || n.role === 'sra');
                                    badge.textContent = String(docs.length);
                                    if (docs.length === 0) {
                                        nList.innerHTML = '<div class="text-sm text-[var(--cane-700)] p-4 text-center">No notifications</div>';
                                        if (bellList) bellList.innerHTML = '<div class="text-sm text-[var(--cane-700)] p-3">No notifications</div>';
                                        if (notifContainer) notifContainer.innerHTML = '<div class="text-sm text-[var(--cane-700)] p-4 text-center">No notifications</div>';
                                        return;
                                    }
                                    nList.innerHTML = '';
                                    if (bellList) bellList.innerHTML = '';
                                    docs.slice(0, 8).forEach(n => {
                                        const row = document.createElement('div');
                                        row.className = 'flex items-start space-x-3';
                                        row.innerHTML = '<div class="w-2 h-2 bg-[var(--cane-500)] rounded-full mt-2"></div>'+
                                            '<div><p class="text-sm font-medium text-[var(--cane-800)]">'+(n.title||'Notification')+'</p>'+
                                            '<p class="text-xs text-[var(--cane-600)]">'+formatRelativeTime(n.createdAt)+'</p></div>';
                                        nList.appendChild(row);
                                    });
                                    // Bell popup items
                                    docs.slice(0, 6).forEach(n => {
                                        if (!bellList) return;
                                        const row = document.createElement('a');
                                        row.href = '#';
                                        row.className = 'block px-4 py-2 hover:bg-[var(--cane-50)]';
                                        row.innerHTML = '<div class="text-sm font-medium text-[var(--cane-800)]">'+(n.title||'Notification')+'</div>'+
                                            '<div class="text-xs text-[var(--cane-600)]">'+(n.type||'info')+' · '+formatRelativeTime(n.createdAt)+'</div>';
                                        row.addEventListener('click', (e)=>{
                                            e.preventDefault();
                                            showSection('notifications');
                                            const popup = document.getElementById('bellPopup'); if (popup) popup.classList.add('hidden');
                                        });
                                        bellList.appendChild(row);
                                    });

                                    // Render full notifications list with search and sort
                                    function renderNotifications() {
                                        if (!notifContainer) return;
                                        let filtered = docs.slice();
                                        const q = (notifSearch && notifSearch.value ? notifSearch.value.trim().toLowerCase() : '');
                                        if (q) {
                                            filtered = filtered.filter(n =>
                                                String(n.title||'').toLowerCase().includes(q) ||
                                                String(n.message||'').toLowerCase().includes(q) ||
                                                String(n.type||'').toLowerCase().includes(q)
                                            );
                                        }
                                        const sort = notifSort ? notifSort.value : 'newest';
                                        filtered.sort((a,b)=>{
                                            if (sort === 'oldest') {
                                                const ta = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
                                                const tb = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
                                                return ta - tb;
                                            }
                                            if (sort === 'type') {
                                                return String(a.type||'').localeCompare(String(b.type||''));
                                            }
                                            if (sort === 'title') {
                                                return String(a.title||'').localeCompare(String(b.title||''));
                                            }
                                            const ta = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
                                            const tb = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
                                            return tb - ta;
                                        });
                                        notifContainer.innerHTML = '';
                                        filtered.forEach(n => {
                                            const row = document.createElement('div');
                                            row.className = 'px-4 py-3 hover:bg-[var(--cane-50)] cursor-pointer';
                                            row.innerHTML = '<div class="flex items-start justify-between">'
                                                +'<div>'
                                                +'<div class="text-sm font-medium text-[var(--cane-800)]">'+(n.title||'Notification')+'</div>'
                                                +'<div class="text-xs text-[var(--cane-600)]">'+(n.type||'info')+' · '+formatRelativeTime(n.createdAt)+'</div>'
                                                +'</div>'
                                                +'</div>'
                                                +'<div class="text-sm text-[var(--cane-700)] mt-1 line-clamp-2">'+(n.message||'')+'</div>';
                                            row.addEventListener('click', ()=>{
                                                // Detail modal
                                                const m = document.createElement('div');
                                                m.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
                                                m.innerHTML = '<div class="bg-white rounded-xl p-5 shadow-2xl max-w-md w-[92%]">'
                                                    +'<div class="flex items-center justify-between mb-2">'
                                                    +'<div class="text-lg font-semibold">'+(n.title||'Notification')+'</div>'
                                                    +'<button id="closeNotifModalBtn" class="text-xl">&times;</button>'
                                                    +'</div>'
                                                    +'<div class="text-xs text-[var(--cane-600)] mb-3">'+(n.type||'info')+' · '+formatRelativeTime(n.createdAt)+'</div>'
                                                    +'<div class="text-[var(--cane-900)] text-sm whitespace-pre-wrap">'+(n.message||'')+'</div>'
                                                    +'</div>';
                                                document.body.appendChild(m);
                                                document.getElementById('closeNotifModalBtn').onclick = function(){ m.remove(); };
                                            });
                                            notifContainer.appendChild(row);
                                        });
                                    }
                                    if (notifContainer) renderNotifications();
                                    if (notifSearch) notifSearch.addEventListener('input', renderNotifications);
                                    if (notifSort) notifSort.addEventListener('change', renderNotifications);
                                });
                            }
                        } catch(_) {}
                    } else {
                        // redirect to login if needed
                    }
                });
                const profileBtn = document.getElementById('profileBtn');
                const profileMenu = document.getElementById('profileMenu');
                if (profileBtn && profileMenu) {
                    profileBtn.addEventListener('click', () => {
                        profileMenu.classList.toggle('hidden');
                    });
                    window.addEventListener('click', (e) => {
                        if (!profileBtn.contains(e.target) && !profileMenu.contains(e.target)) {
                            profileMenu.classList.add('hidden');
                        }
                    });
                }
                const profileSettingsLink = document.getElementById('profileSettings');
                if (profileSettingsLink) {
                    profileSettingsLink.addEventListener('click', function(e){
                        e.preventDefault();
                        window.location.href = '../Common/profile-settings.html';
                    });
                }
                const viewAllNotifLink = document.getElementById('viewAllNotificationsLink');
                if (viewAllNotifLink) {
                    viewAllNotifLink.addEventListener('click', function(e){
                        e.preventDefault();
                        showSection('notifications');
                    });
                }
                const logoutBtn = document.getElementById('logoutBtn');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const modal = document.getElementById('sraLogoutModal');
                        const dialog = document.getElementById('sraLogoutDialog');
                        if (!modal || !dialog) return;
                        modal.classList.remove('invisible', 'opacity-0');
                        dialog.classList.remove('opacity-0', 'scale-95', 'translate-y-2', 'pointer-events-none');
                    });
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Auth init failed', e);
            }
        });

        // Navigation functionality
        function showSection(sectionId) {
            // Hide all content sections
            document.querySelectorAll('.content-section').forEach(section => {
                section.classList.add('hidden');
            });
            
            // Show selected section
            const selectedSection = document.getElementById(sectionId);
            if (selectedSection) {
                selectedSection.classList.remove('hidden');
            }
            
            // Update active nav item using Tailwind classes
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('bg-slate-800', 'text-white');
                item.classList.add('text-slate-300');
            });
            
            const activeNavItem = document.querySelector(`[data-section="${sectionId}"]`);
            if (activeNavItem) {
                activeNavItem.classList.add('bg-slate-800', 'text-white');
                activeNavItem.classList.remove('text-slate-300');
            }
            
            currentSection = sectionId;
        }

        function formatRelativeTime(ts){
            try{
                const d = ts && ts.seconds ? new Date(ts.seconds*1000) : new Date(ts || Date.now());
                const diff = Math.floor((Date.now() - d.getTime())/1000);
                if (diff < 60) return `${diff}s ago`;
                const m = Math.floor(diff/60); if (m < 60) return `${m} minute${m>1?'s':''} ago`;
                const h = Math.floor(m/60); if (h < 24) return `${h} hour${h>1?'s':''} ago`;
                const days = Math.floor(h/24); return `${days} day${days>1?'s':''} ago`;
            }catch{ return ''; }
        }

        // Sidebar functionality
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            
            if (sidebar && overlay) {
                if (sidebar.classList.contains('-translate-x-full')) {
                    sidebar.classList.remove('-translate-x-full');
                    overlay.classList.remove('hidden');
                } else {
                    sidebar.classList.add('-translate-x-full');
                    overlay.classList.add('hidden');
                }
            }
        }

        function closeSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            
            if (sidebar && overlay) {
                sidebar.classList.add('-translate-x-full');
                overlay.classList.add('hidden');
            }
        }

        // Setup event listeners
        function setupEventListeners() {
            // Sidebar toggle
            const hamburgerBtn = document.getElementById('hamburgerBtn');
            const closeSidebarBtn = document.getElementById('closeSidebarBtn');
            const overlay = document.getElementById('sidebarOverlay');
            
            if (closeSidebarBtn) {
                closeSidebarBtn.addEventListener('click', closeSidebar);
            }
            
            if (overlay) {
                overlay.addEventListener('click', closeSidebar);
            }
            
            // Navigation menu
            document.querySelectorAll('.nav-item').forEach(item => {
                item.addEventListener('click', function(e) {
                        e.preventDefault();
                    const sectionId = this.getAttribute('data-section');
                    showSection(sectionId);
                    if (sectionId === 'field-documents') {
                        // simple fetch to load the partial once
                        const container = document.getElementById('fieldDocsContainer');
                        if (container && container.childElementCount === 0) {
                            fetch('SRA_FieldDocuments.html')
                                .then(r => r.text())
                                .then(html => { 
                                    container.innerHTML = html; 
                                    // initialize dynamic review list
                                    import('./Review.js').then(m => m.SRAReview.init());
                                })
                                .catch(() => { container.innerHTML = '<div class="text-[var(--cane-700)]">Unable to load field documents.</div>'; });
                        }
                    }
                    
                    // Close sidebar on mobile after navigation
                    if (window.innerWidth < 1024) {
                        closeSidebar();
                    }
                });
            });
            
            // Handle window resize
            window.addEventListener('resize', function() {
                if (window.innerWidth >= 1024) {
                    closeSidebar();
                }
            });

            // Click-through: Recent Field Applications -> Review Applications section
            const recentCard = document.getElementById('recentFieldApplicationsCard');
            if (recentCard) {
                recentCard.addEventListener('click', async function() {
                    try {
                        showSection('field-documents');
                        const container = document.getElementById('fieldDocsContainer');
                        if (container && container.childElementCount === 0) {
                            const html = await fetch('SRA_FieldDocuments.html').then(r => r.text());
                            container.innerHTML = html;
                        }
                        // initialize/refresh review list
                        const mod = await import('./Review.js');
                        if (mod && mod.SRAReview && typeof mod.SRAReview.init === 'function') {
                            mod.SRAReview.init();
                        }
                        // Ensure sidebar section highlights the Review menu
                        const activeNavItem = document.querySelector('[data-section="field-documents"]');
                        if (activeNavItem) {
                            document.querySelectorAll('.nav-item').forEach(item => {
                                item.classList.remove('bg-slate-800', 'text-white');
                                item.classList.add('text-slate-300');
                            });
                            activeNavItem.classList.add('bg-slate-800', 'text-white');
                            activeNavItem.classList.remove('text-slate-300');
                        }
                    } catch(_) {}
                });
            }

            // Notifications card click-through
            const notificationsCard = document.getElementById('notificationsCard');
            if (notificationsCard) {
                notificationsCard.addEventListener('click', function(){
                    showSection('notifications');
                });
            }

            // Bell popup interactions
            const bellBtn = document.getElementById('headerBellBtn');
            const bellPopup = document.getElementById('bellPopup');
            const bellViewAll = document.getElementById('bellViewAll');
            if (bellBtn && bellPopup) {
                bellBtn.addEventListener('click', function(e){
                    e.stopPropagation();
                    bellPopup.classList.toggle('hidden');
                });
                document.addEventListener('click', function(e){
                    if (!bellPopup.contains(e.target) && e.target !== bellBtn) {
                        bellPopup.classList.add('hidden');
                    }
                });
            }
            if (bellViewAll) {
                bellViewAll.addEventListener('click', function(e){
                    e.preventDefault();
                    showSection('notifications');
                    const popup = document.getElementById('bellPopup');
                    if (popup) popup.classList.add('hidden');
                });
            }

            // Logout modal controls
            const modal = document.getElementById('sraLogoutModal');
            const dialog = document.getElementById('sraLogoutDialog');
            const cancelBtn = document.getElementById('sraLogoutCancel');
            const confirmBtn = document.getElementById('sraLogoutConfirm');
            function hideLogoutModal(){
                if (!modal || !dialog) return;
                dialog.classList.add('opacity-0','scale-95','translate-y-2','pointer-events-none');
                modal.classList.add('opacity-0','invisible');
            }
            if (cancelBtn) cancelBtn.addEventListener('click', hideLogoutModal);
            if (modal) modal.addEventListener('click', (e)=>{ if (e.target === modal) hideLogoutModal(); });
            if (confirmBtn) confirmBtn.addEventListener('click', async ()=>{
                try {
                    const { auth } = await import('../Common/firebase-config.js');
                    const { signOut } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
                    await signOut(auth);
                    localStorage.removeItem('farmerName');
                    localStorage.removeItem('userRole');
                    localStorage.removeItem('userId');
                    window.location.href = '../Common/farmers_login.html';
                } catch(_) { hideLogoutModal(); }
            });
        }

        // Export functions for use in HTML
        window.showSection = showSection;
        window.toggleSidebar = toggleSidebar;
        window.closeSidebar = closeSidebar;