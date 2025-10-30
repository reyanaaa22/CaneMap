
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
                        
                    //Recent Field Applications loader ---
                        try {
                        const list = document.getElementById("recentAppsList");
                        if (list) {
                            list.innerHTML = `<p class="text-gray-500 text-sm italic">Loading recent field applications...</p>`;

                            // import Firestore helpers (we re-import same helpers so this block is self-contained)
                            const { collection, collectionGroup, getDocs, query, orderBy, doc, getDoc } =
                            await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");

                            // helper to resolve applicant name from uid if needed
                            const userCache = {};

                            // 1) fetch nested 'fields' documents (existing implementation)
                            let nestedSnap;
                            try {
                            const qNested = query(collectionGroup(db, "fields"), orderBy("submittedAt", "desc"));
                            nestedSnap = await getDocs(qNested);
                            } catch (err) {
                            console.warn("⚠️ Missing index for ordered collectionGroup('fields'), loading unsorted nested fields.", err);
                            nestedSnap = await getDocs(collectionGroup(db, "fields"));
                            }

                            // 2) fetch top-level field_applications documents (if you store apps at top-level)
                            let topSnap;
                            try {
                            const qTop = query(collection(db, "field_applications"), orderBy("submittedAt", "desc"));
                            topSnap = await getDocs(qTop);
                            } catch (err) {
                            // if top-level doesn't exist or no index, fallback to empty result
                            try {
                                topSnap = await getDocs(collection(db, "field_applications"));
                            } catch (e) {
                                topSnap = { docs: [] };
                            }
                            }

                            // normalize function (lightweight; keep fields consistent)
                            function normalizeDoc(d, isNested = false) {
                            const data = d.data();
                            const status = data.status || "pending";
                            let applicantName = data.applicantName || data.requestedBy || data.userId || "—";

                            // resolve applicant UID -> display name if needed
                            async function resolveApplicant(uid) {
                                if (!uid) return uid;
                                if (userCache[uid]) return userCache[uid];
                                try {
                                const uSnap = await getDoc(doc(db, "users", uid));
                                if (uSnap.exists()) {
                                    const u = uSnap.data();
                                    const display = u.name || u.fullName || u.displayName || u.email || uid;
                                    userCache[uid] = display;
                                    return display;
                                }
                                } catch (err) {
                                console.warn("User lookup failed for", uid, err);
                                }
                                return uid;
                            }

                            return {
                                id: d.id,
                                path: d.ref?.path || null,
                                raw: data,
                                status,
                                barangay: data.barangay || data.location || "—",
                                fieldName: data.field_name || data.fieldName || data.title || '—',
                                street: data.street || data.sitio || '—',
                                createdAt: (data.submittedAt && data.submittedAt.toDate) ? data.submittedAt.toDate() : (data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : new Date()),
                                // applicantName may be uid — resolve below
                                _applicantCandidate: applicantName,
                                isNested
                            };
                            }

                            // convert nested docs -> promises to resolve applicantNames
                            const nestedApps = nestedSnap.docs.map(d => normalizeDoc(d, true));
                            const topApps = topSnap.docs.map(d => normalizeDoc(d, false));

                            // combine and resolve applicant names (do user lookups in series to avoid too many parallel reads)
                            const all = [...nestedApps, ...topApps];

                            for (const a of all) {
                            const cand = a._applicantCandidate;
                            if (cand && typeof cand === 'string' && cand.length < 40 && !cand.includes(' ')) {
                                // likely a UID — resolve
                                const resolved = await (async () => {
                                if (userCache[cand]) return userCache[cand];
                                try {
                                    const uSnap = await getDoc(doc(db, "users", cand));
                                    if (uSnap.exists()) {
                                    const u = uSnap.data();
                                    const display = u.name || u.fullName || u.displayName || u.email || cand;
                                    userCache[cand] = display;
                                    return display;
                                    }
                                } catch (err) {
                                    return cand;
                                }
                                return cand;
                                })();
                                a.applicantName = resolved || cand;
                            } else {
                                a.applicantName = cand || '—';
                            }
                            }

                            // Deduplicate by path (nested) or by id (top-level) — keep latest by createdAt
                            const byKey = {};
                            for (const a of all) {
                            const key = a.path || a.id || JSON.stringify([a.fieldName, a.barangay, a.createdAt]);
                            if (!byKey[key] || new Date(a.createdAt) > new Date(byKey[key].createdAt)) {
                                byKey[key] = a;
                            }
                            }
                            const applications = Object.values(byKey);

                            // Sort newest-first by createdAt
                            applications.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));

                            // Render only the three most recent applications
                            list.innerHTML = "";
                            const visible = applications.slice(0, 3);
                            for (const app of visible) {
                            const card = document.createElement("div");
                            card.className = "flex justify-between items-center bg-white border border-gray-200 rounded-lg p-3 mb-2 shadow-sm hover:shadow-md transition";
                            const displayCreated = app.createdAt ? (new Date(app.createdAt)).toLocaleString() : '';
                            card.innerHTML = `
                                <div>
                                <p class="font-semibold text-[var(--cane-900)]">${app.applicantName}</p>
                                <p class="text-sm text-gray-600">${app.fieldName ? app.fieldName + ' · ' : ''}Brgy. ${app.barangay}${app.street ? ' · ' + app.street : ''}</p>
                                <p class="text-xs text-[var(--cane-600)]">${displayCreated}</p>
                                </div>
                                <span class="text-xs font-medium px-2 py-1 rounded-full ${app.status === "reviewed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-700"}">${app.status}</span>
                            `;
                            // optional: click the card to open Review page for the item
                            card.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                // open Review Applications section and initialize Review.js
                                try {
                                // show review section (this already exists elsewhere in your file)
                                const container = document.getElementById('fieldDocsContainer');
                                if (container && container.childElementCount === 0) {
                                    const html = await fetch('SRA_FieldDocuments.html').then(r => r.text());
                                    container.innerHTML = html;
                                }
                                const mod = await import('./Review.js');
                                if (mod && mod.SRAReview && typeof mod.SRAReview.init === 'function') {
                                    mod.SRAReview.init();
                                }
                                showSection('field-documents');
                                } catch (_) {}
                            });

                            list.appendChild(card);
                            }
                        }
                        } catch (err) {
                        console.error("Recent apps unified loader failed:", err);
                        const list = document.getElementById("recentAppsList");
                        if (list) list.innerHTML = `<p class="text-red-500 text-sm">Failed to load recent field applications.</p>`;
                        }


                                                // Live metrics listeners
                                                try {
                                                    const { collection, collectionGroup, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                                                    // Elements
                                                    const elTotal = document.getElementById('metricTotalSubmissions');
                                                    const elPending = document.getElementById('metricPendingReview');
                                                    const elReviewedToday = document.getElementById('metricReviewedToday');
                                                    const ts = data.statusUpdatedAt || data.submittedAt || data.createdAt;
                        if (data.status === "reviewed" && ts) {
                        const dt = ts.toDate ? ts.toDate() : ts;
                        const today = new Date();
                        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                        if (dt >= startOfDay) reviewedToday++;
                        }

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
                            onSnapshot(query(collectionGroup(db, 'fields')), (snap) => { lastNested = snap; recomputeTotals(lastTop, lastNested); });

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
                            onSnapshot(query(collectionGroup(db, 'fields'), where('status', '==', 'reviewed')), (snap) => {
                                rNested = snap; if (elReviewedToday) elReviewedToday.textContent = String(computeReviewedToday([...rTop.docs, ...rNested.docs]));
                            });

                            // Active Fields: count from 'fields' collection
                            onSnapshot(query(collection(db, 'fields')), (snap) => {
                                if (elActiveFields) elActiveFields.textContent = String(snap.size);
                            });
                        } catch(_) {}

                        // --- START: SRA map block (replace existing block) ---
                        try {
                            const mapContainer = document.getElementById('sraFieldsMap');
                            if (mapContainer) {

                                // ---------- Utility: safely pick first existing key ----------
                                function pickFirst(obj, keys = []) {
                                    for (const k of keys) {
                                        if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== '') {
                                            return obj[k];
                                        }
                                    }
                                    return null;
                                }

                                // ---------- Fetch reviewed/approved fields (collectionGroup from nested fields) ----------
                                async function fetchApprovedFields() {
                                    try {
                                        const { db } = await import('../Common/firebase-config.js');
                                        const { collectionGroup, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

                                        // Fetch from nested field_applications/{uid}/fields where status === 'reviewed'
                                        const q = query(collectionGroup(db, 'fields'), where('status', '==', 'reviewed'));
                                        const snap = await getDocs(q);
                                        if (snap.empty) {
                                            console.warn('⚠️ No reviewed fields found.');
                                            return [];
                                        }

                                        const fields = snap.docs.map(d => {
                                            const data = d.data();
                                            const lat = pickFirst(data, ['lat', 'latitude']);
                                            const lng = pickFirst(data, ['lng', 'longitude']);
                                            return {
                                                id: d.id,
                                                path: d.ref.path,
                                                raw: data,
                                                lat: typeof lat === 'string' ? parseFloat(lat) : lat,
                                                lng: typeof lng === 'string' ? parseFloat(lng) : lng,
                                                barangay: pickFirst(data, ['barangay', 'location']) || '—',
                                                fieldName: pickFirst(data, ['field_name', 'fieldName']) || '—',
                                                street: pickFirst(data, ['street', 'sitio']) || '—',
                                                size: pickFirst(data, ['field_size', 'size', 'fieldSize']) || '—',
                                                terrain: pickFirst(data, ['terrain_type', 'terrain']) || '—',
                                                applicantName: pickFirst(data, ['applicantName', 'requestedBy', 'userId', 'requester']) || '—',
                                                status: pickFirst(data, ['status']) || 'pending'
                                            };
                                        });

                                        // Enrich applicantName using the UID from path if necessary
                                        const userCache = {};
                                        for (const f of fields) {
                                            const pathParts = f.path.split('/');
                                            const uidFromPath = pathParts.length >= 2 ? pathParts[1] : null;
                                            let possibleUid = null;

                                            if (f.applicantName && f.applicantName.length < 25 && !f.applicantName.includes(' ')) {
                                                possibleUid = f.applicantName;
                                            } else if (uidFromPath) {
                                                possibleUid = uidFromPath;
                                            }

                                            if (possibleUid) {
                                                if (userCache[possibleUid]) {
                                                    f.applicantName = userCache[possibleUid];
                                                    continue;
                                                }
                                                try {
                                                    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                                                    const userSnap = await getDoc(doc(db, 'users', possibleUid));
                                                    if (userSnap.exists()) {
                                                        const u = userSnap.data();
                                                        const displayName = u.name || u.fullName || u.displayName || u.email || possibleUid;
                                                        f.applicantName = displayName;
                                                        userCache[possibleUid] = displayName;
                                                    }
                                                } catch (err) {
                                                    console.warn('User lookup failed for', possibleUid, err);
                                                }
                                            }
                                        }

                                        console.info(`✅ fetched ${fields.length} reviewed fields from nested field_applications/*/fields`);
                                        return fields;
                                    } catch (e) {
                                        console.error('fetchApprovedFields() failed:', e);
                                        return [];
                                    }
                                }

                                // ---------- Show reviewed fields on map (tooltips + click opens modal) ----------
                                async function showApprovedFieldsOnMap(map) {
                                    try {
                                        const caneIcon = L.icon({
                                            // You may need to adjust this path depending on your folder structure:
                                            // - If the dashboard page lives in frontend/SRA, use '../../frontend/img/PIN.png'
                                            // - If the path is different, change to appropriate relative path.
                                            iconUrl: '../../frontend/img/PIN.png',
                                            iconSize: [32, 32],
                                            iconAnchor: [16, 30],
                                            popupAnchor: [0, -28]
                                        });

                                        const markerGroup = L.layerGroup().addTo(map);
                                        const fields = await fetchApprovedFields();
                                        if (!Array.isArray(fields) || fields.length === 0) {
                                            console.warn('⚠️ No reviewed fields to display.');
                                            return;
                                        }

                                        window.__caneMarkers = []; // store markers for searching later

                                        fields.forEach(f => {
                                            if (!f.lat || !f.lng) return;

                                            const marker = L.marker([f.lat, f.lng], { icon: caneIcon }).addTo(markerGroup);

                                            const tooltipHtml = `
                                            <div style="font-size:12px; line-height:1.4; max-width:250px; color:#14532d;">
                                                <b style="font-size:14px; color:#166534;">${f.fieldName}</b>
                                                <br><span style="font-size:10px; color:#15803d;">🏠︎ <i>${f.street}, Brgy. ${f.barangay},<br>Ormoc City, Leyte</i></span>
                                                <br><a href="#" class="seeFieldDetails" style="font-size:10px; color:gray; display:inline-block; margin-top:3px;">Click to see more details.</a>
                                            </div>
                                            `;

                                            marker.bindTooltip(tooltipHtml, {
                                                permanent: false,
                                                direction: 'top',
                                                offset: [0, -25],
                                                opacity: 0.9
                                            });

                                            marker.on('mouseover', () => marker.openTooltip());
                                            marker.on('mouseout', () => marker.closeTooltip());
                                            marker.on('click', () => openFieldDetailsModal(f));

                                            window.__caneMarkers.push({ marker, data: f });
                                        });

                                        console.info(`✅ Displayed ${fields.length} reviewed field markers on map.`);
                                    } catch (err) {
                                        console.error('showApprovedFieldsOnMap() failed:', err);
                                    }
                                }

                                // ---------- Barangays list (copy from lobby.js) ----------
                                const barangays = [
                                    { name: "Airport", coords: [11.0583, 124.5541] },
                                    { name: "Alegria", coords: [11.0130, 124.6300] },
                                    { name: "Alta Vista", coords: [11.0174, 124.6260] },
                                    { name: "Bagong", coords: [11.0230, 124.6000] },
                                    { name: "Bagong Buhay", coords: [11.0300, 124.5900] },
                                    { name: "Bantigue", coords: [11.0200, 124.5800] },
                                    { name: "Batuan", coords: [11.0100, 124.5800] },
                                    { name: "Bayog", coords: [11.0400, 124.5900] },
                                    { name: "Biliboy", coords: [11.0565, 124.5792] },
                                    { name: "Cabaon-an", coords: [11.0333, 124.5458] },
                                    { name: "Cabintan", coords: [11.1372, 124.7777] },
                                    { name: "Cabulihan", coords: [11.0094, 124.5700] },
                                    { name: "Cagbuhangin", coords: [11.0180, 124.5700] },
                                    { name: "Camp Downes", coords: [11.0300, 124.6500] },
                                    { name: "Can-adieng", coords: [11.0240, 124.5940] },
                                    { name: "Can-untog", coords: [11.0320, 124.5880] },
                                    { name: "Catmon", coords: [11.0110, 124.6000] },
                                    { name: "Cogon Combado", coords: [11.0125, 124.6035] },
                                    { name: "Concepcion", coords: [11.0140, 124.6130] },
                                    { name: "Curva", coords: [10.9940, 124.6240] },
                                    { name: "Danao", coords: [11.072680, 124.701324] },
                                    { name: "Danhug", coords: [10.961806, 124.648155] },
                                    { name: "Dayhagan", coords: [11.0090, 124.5560] },
                                    { name: "Dolores", coords: [11.073484, 124.625336] },
                                    { name: "Domonar", coords: [11.063030, 124.533590] },
                                    { name: "Don Felipe Larrazabal", coords: [11.0250, 124.6100] },
                                    { name: "Don Potenciano Larrazabal", coords: [11.0150, 124.6100] },
                                    { name: "Doña Feliza Z. Mejia", coords: [11.0210, 124.6080] },
                                    { name: "Don Carlos B. Rivilla Sr. (Boroc)", coords: [11.0400, 124.6050] },
                                    { name: "Donghol", coords: [11.0064, 124.6075] },
                                    { name: "East (Poblacion)", coords: [11.0110, 124.6075] },
                                    { name: "Esperanza", coords: [10.9780, 124.6210] },
                                    { name: "Gaas", coords: [11.0750, 124.7000] },
                                    { name: "Green Valley", coords: [11.0320, 124.6350] },
                                    { name: "Guintigui-an", coords: [11.0010, 124.6210] },
                                    { name: "Hibunawon", coords: [11.116922, 124.634636] },
                                    { name: "Hugpa", coords: [11.017476, 124.663765] },
                                    { name: "Ipil", coords: [11.0190, 124.6220] },
                                    { name: "Juaton", coords: [11.073599, 124.593590] },
                                    { name: "Kadaohan", coords: [11.110463, 124.573050] },
                                    { name: "Labrador", coords: [11.069711, 124.548433] },
                                    { name: "Lao", coords: [11.014082, 124.565109] },
                                    { name: "Leondoni", coords: [11.093463, 124.525435] },
                                    { name: "Libertad", coords: [11.0290, 124.5700] },
                                    { name: "Liberty", coords: [11.025092, 124.704627] },
                                    { name: "Licuma", coords: [11.039680, 124.528900] },
                                    { name: "Liloan", coords: [11.040502, 124.549866] },
                                    { name: "Linao", coords: [11.0160, 124.5900] },
                                    { name: "Luna", coords: [11.0080, 124.5800] },
                                    { name: "Mabato", coords: [11.039920, 124.535580] },
                                    { name: "Mabini", coords: [10.993786, 124.678680] },
                                    { name: "Macabug", coords: [11.0500, 124.5800] },
                                    { name: "Magaswi", coords: [11.048665, 124.612040] },
                                    { name: "Mahayag", coords: [11.0400, 124.5700] },
                                    { name: "Mahayahay", coords: [10.976500, 124.688850] },
                                    { name: "Manlilinao", coords: [11.105776, 124.499760] },
                                    { name: "Margen", coords: [11.015798, 124.529884] },
                                    { name: "Mas-in", coords: [11.062307, 124.515160] },
                                    { name: "Matica-a", coords: [11.0300, 124.5600] },
                                    { name: "Milagro", coords: [11.0250, 124.6300] },
                                    { name: "Monterico", coords: [11.119205, 124.514590] },
                                    { name: "Nasunogan", coords: [11.0100, 124.5800] },
                                    { name: "Naungan", coords: [11.0200, 124.6200] },
                                    { name: "Nueva Sociedad", coords: [11.0180, 124.6320] },
                                    { name: "Nueva Vista", coords: [11.093860, 124.619290] },
                                    { name: "Patag", coords: [11.0280, 124.5700] },
                                    { name: "Punta", coords: [11.0150, 124.5700] },
                                    { name: "Quezon Jr.", coords: [11.005818, 124.667200] },
                                    { name: "Rufina M. Tan", coords: [11.085495, 124.525894] },
                                    { name: "Sabang Bao", coords: [11.0100, 124.6400] },
                                    { name: "Salvacion", coords: [11.059892, 124.583080] },
                                    { name: "San Antonio", coords: [10.966187, 124.647060] },
                                    { name: "San Isidro", coords: [11.022854, 124.585710] },
                                    { name: "San Jose", coords: [11.0064, 124.6075] },
                                    { name: "San Juan", coords: [11.0090, 124.6070] },
                                    { name: "San Pablo", coords: [11.047495, 124.606026] },
                                    { name: "San Vicente", coords: [11.0120, 124.6100] },
                                    { name: "Santo Niño", coords: [11.0140, 124.6050] },
                                    { name: "South (Poblacion)", coords: [11.0000, 124.6075] },
                                    { name: "Sumangga", coords: [10.9900, 124.5600] },
                                    { name: "Tambulilid", coords: [11.0470, 124.5960] },
                                    { name: "Tongonan", coords: [11.1240, 124.7810] },
                                    { name: "Valencia", coords: [11.0140, 124.6250] },
                                    { name: "West (Poblacion)", coords: [11.0064, 124.6000] },
                                    // placeholder barangays (if needed)
                                    { name: "Barangay 1", coords: [null, null] },
                                    { name: "Barangay 2", coords: [null, null] },
                                    // ... keep rest if you want them listed
                                ];

                                // ---------- Field Details Modal (same as lobby but Join hidden for SRA) ----------
                                function openFieldDetailsModal(field) {
                                    const old = document.getElementById('fieldDetailsModal');
                                    if (old) old.remove();

                                    const modal = document.createElement('div');
                                    modal.id = 'fieldDetailsModal';
                                    modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]';

                                    modal.innerHTML = `
                                        <div class="bg-white rounded-xl p-5 w-[90%] max-w-sm relative text-[var(--cane-900)] border border-[var(--cane-200)] shadow-md">
                                            <button id="closeFieldModal" class="absolute top-3 right-4 text-gray-500 hover:text-gray-700 text-xl font-bold transition">&times;</button>

                                            <div class="flex items-center justify-center mb-3">
                                                <div class="w-11 h-11 bg-[var(--cane-100)] text-[var(--cane-700)] rounded-full flex items-center justify-center border border-[var(--cane-200)]">
                                                    <i class="fas fa-map-marker-alt text-lg"></i>
                                                </div>
                                            </div>

                                            <h2 class="text-lg font-bold text-center text-[var(--cane-900)] mb-2">${field.fieldName}</h2>

                                            <p class="text-sm text-center mb-3 text-[var(--cane-700)]">
                                                <span class="font-semibold">Owner:</span> ${field.applicantName}
                                            </p>

                                            <div class="text-[13px] text-[var(--cane-800)] bg-[var(--cane-50)] p-3 rounded-md border border-[var(--cane-200)] leading-relaxed mb-2 text-center">
                                                🏠︎ ${field.street}, Brgy. ${field.barangay}, Ormoc City, Leyte
                                            </div>

                                            <div class="text-[11px] text-[var(--cane-600)] italic text-center mb-4">
                                                ⟟ Lat: ${Number(field.lat).toFixed(5)} | Lng: ${Number(field.lng).toFixed(5)}
                                            </div>

                                            <button id="joinBtn" class="w-full py-2.5 rounded-md bg-[var(--cane-700)] text-white font-semibold hover:bg-[var(--cane-800)] transition">
                                                Join Field
                                            </button>
                                        </div>
                                    `;
                                    document.body.appendChild(modal);
                                    document.getElementById('closeFieldModal').onclick = () => modal.remove();

                                    const joinBtn = document.getElementById('joinBtn');
                                    const userRole = (localStorage.getItem('userRole') || '').toLowerCase();

                                    // Hide Join button for SRA
                                    if (userRole === 'sra') {
                                        if (joinBtn) joinBtn.style.display = 'none';
                                        return;
                                    }

                                    // For other roles, keep lobby behaviour (if you want the Join flow here, implement openJoinModal)
                                    if (joinBtn) {
                                        joinBtn.onclick = () => {
                                            // if you want the join modal on SRA dashboard for non-SRA roles, call openJoinModal(field)
                                            openJoinModal && openJoinModal(field);
                                        };
                                    }
                                }

                                // ---------- Initialize Leaflet map and wire search (same UX as lobby) ----------
                                // Load Leaflet if missing
                                async function ensureLeaflet() {
                                    if (window.L) return;
                                    const css = document.createElement('link');
                                    css.rel = 'stylesheet';
                                    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                                    document.head.appendChild(css);
                                    await new Promise((res, rej) => {
                                        const s = document.createElement('script');
                                        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                                        s.onload = res;
                                        s.onerror = rej;
                                        document.body.appendChild(s);
                                    });
                                }

                                (async () => {
                                    await ensureLeaflet();

                                    const map = L.map(mapContainer, {
                                        zoomControl: true,
                                        scrollWheelZoom: false,
                                    }).setView([11.0064, 124.6075], 12);

                                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                        attribution: '© OpenStreetMap contributors',
                                    }).addTo(map);

                                    const bounds = L.latLngBounds(L.latLng(10.85, 124.45), L.latLng(11.20, 124.80));
                                    map.setMaxBounds(bounds);
                                    map.on('drag', () => map.panInsideBounds(bounds, { animate: true }));

                                    // show reviewed field pins
                                    await showApprovedFieldsOnMap(map);

                                    // unified search (uses same input/button IDs used in other pages)
                                    const input = document.getElementById('mapSearchInput');
                                    const btn = document.getElementById('mapSearchBtn');

                                    function showToast(msg, color = 'green') {
                                        let container = document.getElementById('toastContainer');
                                        if (!container) {
                                            container = document.createElement('div');
                                            container.id = 'toastContainer';
                                            Object.assign(container.style, {
                                                position: 'fixed',
                                                top: '20px',
                                                right: '20px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '10px',
                                                zIndex: 99999
                                            });
                                            document.body.appendChild(container);
                                        }
                                        const toast = document.createElement('div');
                                        toast.innerHTML = msg;
                                        Object.assign(toast.style, {
                                            background: color === 'green' ? '#166534' : (color === 'gray' ? '#6b7280' : '#b91c1c'),
                                            color: 'white',
                                            padding: '12px 18px',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            fontWeight: '500',
                                            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                                            opacity: '0',
                                            transform: 'translateY(-10px)',
                                            transition: 'opacity 0.3s ease, transform 0.3s ease'
                                        });
                                        container.appendChild(toast);
                                        setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 50);
                                        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
                                    }

                                    const searchHandler = () => {
                                        const val = (input && input.value ? input.value.trim().toLowerCase() : '');
                                        if (!val) {
                                            map.setView([11.0064, 124.6075], 12);
                                            if (window.__caneMarkers && window.__caneMarkers.length) {
                                                window.__caneMarkers.forEach(({ marker }) => marker.addTo(map));
                                            }
                                            showToast('🔄 Map reset to default view.', 'gray');
                                            return;
                                        }

                                        // 1) try field match in window.__caneMarkers
                                        const matchedFields = (window.__caneMarkers || []).filter(m => {
                                            const d = m.data;
                                            return (
                                                (d.fieldName && d.fieldName.toLowerCase().includes(val)) ||
                                                (d.barangay && d.barangay.toLowerCase().includes(val)) ||
                                                (d.street && d.street.toLowerCase().includes(val)) ||
                                                (String(d.lat).toLowerCase().includes(val)) ||
                                                (String(d.lng).toLowerCase().includes(val))
                                            );
                                        });

                                        if (matchedFields.length > 0) {
                                            const { marker, data } = matchedFields[0];
                                            map.setView([data.lat, data.lng], 15);
                                            marker.openTooltip();
                                            // small bounce (if icon DOM exists)
                                            try { marker._icon.classList.add('leaflet-marker-bounce'); setTimeout(() => marker._icon.classList.remove('leaflet-marker-bounce'), 1200); } catch(_) {}
                                            showToast(`📍 Found: ${data.fieldName} (${data.barangay})`, 'green');
                                            return;
                                        }

                                        // 2) try barangays fallback
                                        const brgyMatch = barangays.find(b => b.name.toLowerCase().includes(val));
                                        if (brgyMatch && brgyMatch.coords[0] && brgyMatch.coords[1]) {
                                            const caneIcon = L.icon({
                                                iconUrl: '../../frontend/img/PIN.png',
                                                iconSize: [36, 36],
                                                iconAnchor: [18, 34],
                                                popupAnchor: [0, -28]
                                            });
                                            map.setView(brgyMatch.coords, 14);
                                            L.marker(brgyMatch.coords, { icon: caneIcon })
                                                .addTo(map)
                                                .bindPopup(`<b>${brgyMatch.name}</b>`)
                                                .openPopup();

                                            showToast(`📍 Barangay: ${brgyMatch.name}`, 'green');
                                            return;
                                        }

                                        showToast('❌ No matching field or barangay found.', 'gray');
                                    };

                                    if (btn) {
                                        btn.addEventListener('click', (e) => { e.preventDefault(); searchHandler(); });
                                    }
                                    if (input) {
                                        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchHandler(); }});
                                    }

                                    window.map = map;
                                })();
                            }
                        } catch (err) {
                            console.error('SRA Field Map initialization failed:', err);
                        }


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