

// Scroll animations (define early and run immediately to avoid hidden content if later errors occur)
// Devtrace: identify when the updated lobby.js is actually loaded/executed in the browser
try { console.info('LOBBY.JS loaded — build ts:', new Date().toISOString()); } catch(_) {}
// Global runtime error catcher to assist debugging in the browser
window.addEventListener('error', function (ev) {
    try { console.error('Global runtime error:', ev.message, ev.filename, ev.lineno, ev.colno, ev.error); } catch(_) {}
});
        function animateOnScroll() {
            const elements = document.querySelectorAll('.fade-in-up, .fade-in-left, .fade-in-right, .scale-in, .slide-in-bottom');
            elements.forEach(element => {
                const elementTop = element.getBoundingClientRect().top;
                const elementVisible = 150;
                if (elementTop < window.innerHeight - elementVisible) {
                    element.classList.add('animate');
                }
            });
        }
        // run once in case other code errors before listeners are attached
        try { animateOnScroll(); } catch (_) {}
        window.addEventListener('scroll', animateOnScroll);
        window.addEventListener('load', animateOnScroll);

        // Weather API integration
        async function getWeather() {
            try {
                console.info('getWeather() start');
                const apiKey = '2d59a2816a02c3178386f3d51233b2ea';
                const lat = 11.0064; // Ormoc City latitude
                const lon = 124.6075; // Ormoc City longitude
                const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
                const response = await fetch(url);
                const data = await response.json();
                const weatherContainer = document.getElementById('weatherForecast');
                const wxDaily = document.getElementById('wxDaily');
                
                if (!data.list) {
                    let errorMsg = 'Weather data unavailable.';
                    if (data.message) {
                        errorMsg += `<br><span class='text-xs text-[var(--cane-600)]'>API: ${data.message}</span>`;
                    }
                    if (wxDaily) {
                        wxDaily.innerHTML = `<div class='p-3 rounded-lg border border-[var(--cane-200)] bg-white/10 text-white/90'>${errorMsg}</div>`;
                    }
                    return;
                }
                
                // Group forecasts by day
                const days = {};
                data.list.forEach(item => {
                    const date = new Date(item.dt * 1000);
                    const dayStr = date.toLocaleDateString();
                    if (!days[dayStr]) {
                        days[dayStr] = [];
                    }
                    days[dayStr].push(item);
                });
                
                // Get today, tomorrow, and next day
                const dayKeys = Object.keys(days).slice(0, 3);
                const dayNames = [
                    'Today',
                    dayKeys[1] ? 'Tomorrow' : '',
                    dayKeys[2] ? new Date(dayKeys[2]).toLocaleDateString('en-US', { weekday: 'long' }) : ''
                ].filter(Boolean);
                
                const rows = dayKeys.map((key, idx) => {
                    // Use the forecast closest to noon for each day
                    const forecasts = days[key];
                    let forecast = forecasts.find(f => new Date(f.dt * 1000).getHours() === 12) || forecasts[Math.floor(forecasts.length / 2)];
                    const temp = `${Math.round(forecast.main.temp_min)}°C / ${Math.round(forecast.main.temp_max)}°C`;
                    const icon = forecast.weather[0].icon;
                    const desc = forecast.weather[0].description;
                    return `
                        <div class="flex items-center justify-between p-3 rounded-lg bg-white/10 text-white border border-white/20">
                            <div class="flex items-center space-x-3">
                                <span class="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border border-white/30">
                                    <img src="https://openweathermap.org/img/wn/${icon}.png" alt="${desc}" class="w-5 h-5" />
                                </span>
                                <span class="font-semibold text-sm">${dayNames[idx]}</span>
                            </div>
                            <div class="text-right leading-tight">
                                <div class="font-bold text-sm">${temp}</div>
                                <div class="text-xs opacity-90">${desc}</div>
                            </div>
                        </div>
                    `;
                }).join('');

                // Render into the compact list area only (preserve card structure)
                if (wxDaily) wxDaily.innerHTML = rows;

                // Update big "Today" metrics from first day
                try {
                    const firstKey = dayKeys[0];
                    const forecasts = days[firstKey] || [];
                    const forecast = forecasts.find(f => new Date(f.dt * 1000).getHours() === 12) || forecasts[0];
                    if (forecast) {
                        const tEl = document.getElementById('wxTemp');
                        const wEl = document.getElementById('wxWind');
                        const uvEl = document.getElementById('wxUv');
                        const uvBar = document.getElementById('wxUvBar');
                        const tempNow = Math.round(forecast.main.temp);
                        const windKmh = typeof forecast.wind?.speed === 'number' ? (forecast.wind.speed * 3.6) : null; // m/s → km/h
                        if (tEl) tEl.textContent = String(tempNow);
                        if (wEl && windKmh !== null) wEl.textContent = windKmh.toFixed(1) + ' km/h';
                        // UV not in forecast endpoint; leave as is if not available

                        // Notify background swapper
                        const cond = forecast.weather?.[0]?.description || '';
                        window.dispatchEvent(new CustomEvent('canemap:weather-updated', {
                            detail: { condition: cond, temp: tempNow, windKmh }
                        }));
                    }
                } catch(_) {}
            } catch (error) {
                console.error('Error fetching weather:', error);
                const el = document.getElementById('weatherForecast');
                if (el) el.innerHTML = `<div class='text-[var(--cane-700)] bg-[var(--cane-50)] p-3 rounded-lg border border-[var(--cane-200)]'>Weather data unavailable.<br><span class='text-xs text-[var(--cane-600)]'>${error}</span></div>`;
            }
        }

        // Remove the old expand button
        const expandBtn = document.getElementById('expandMapBtn');
        if (expandBtn) expandBtn.style.display = 'none';

        // New expand/collapse icon logic
        const expandMapIcon = document.getElementById('expandMapIcon');
        const expandIcon = document.getElementById('expandIcon');
        const mainContent = document.getElementById('mainContent');
        const mapPanel = document.getElementById('mapPanel');
        const sidePanel = document.getElementById('sidePanel');
        let expanded = false;

        if (expandMapIcon) {
            expandMapIcon.addEventListener('click', function() {
                expanded = !expanded;
                if (expanded) {
                    if (sidePanel) sidePanel.style.display = 'none';
                    if (mapPanel) mapPanel.classList.add('w-full');
                    if (mainContent) {
                        mainContent.classList.remove('flex', 'lg:flex-row', 'gap-8', 'px-4', 'pb-8');
                        mainContent.classList.add('block', 'p-0');
                    }
                    if (expandIcon) {
                        expandIcon.classList.remove('fa-expand');
                        expandIcon.classList.add('fa-compress');
                    }
                    const mapEl = document.getElementById('map');
                    if (mapEl) {
                        mapEl.classList.remove('mb-6', 'rounded-lg', 'border', 'border-gray-200');
                        mapEl.classList.add('h-[70vh]', 'w-full');
                    }
                    if (window.map) {
                        setTimeout(() => window.map.invalidateSize(), 100);
                    }
                } else {
                    if (sidePanel) sidePanel.style.display = '';
                    if (mapPanel) mapPanel.classList.remove('w-full');
                    if (mainContent) {
                        mainContent.classList.remove('block', 'p-0');
                        mainContent.classList.add('flex', 'lg:flex-row', 'gap-8', 'px-4', 'pb-8');
                    }
                    if (expandIcon) {
                        expandIcon.classList.remove('fa-compress');
                        expandIcon.classList.add('fa-expand');
                    }
                    const mapEl = document.getElementById('map');
                    if (mapEl) {
                        mapEl.classList.remove('h-[70vh]', 'w-full');
                        mapEl.classList.add('mb-6', 'rounded-lg', 'border', 'border-gray-200');
                    }
                    if (window.map) {
                        setTimeout(() => window.map.invalidateSize(), 100);
                    }
                }
            });
        }

        // Initialize map
        let map;
        async function fetchApprovedFields() {
            try {
                const { db } = await import('./firebase-config.js');
                const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                const snap = await getDocs(collection(db, 'fields'));
                return snap.docs.map(d => d.data());
            } catch(e) { return []; }
        }

        async function showApprovedFieldsOnMap(map) {
            const caneIcon = L.icon({
                iconUrl: '../img/PIN.png', iconSize: [40, 40], iconAnchor: [20, 38], popupAnchor: [0, -32]
            });
            const fields = await fetchApprovedFields();
            fields.forEach(f => {
                const m = L.marker([f.lat, f.lng], { icon: caneIcon }).addTo(map);
                const label = `<b>${f.barangay || 'Field'}</b><br/>${f.size || ''} ha · ${f.terrain || ''}`;
                m.bindPopup(label);
            });
        }

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
            { name: "Barangay 1", coords: [null, null] },
            { name: "Barangay 2", coords: [null, null] },
            { name: "Barangay 3", coords: [null, null] },
            { name: "Barangay 4", coords: [null, null] },
            { name: "Barangay 5", coords: [null, null] },
            { name: "Barangay 6", coords: [null, null] },
            { name: "Barangay 7", coords: [null, null] },
            { name: "Barangay 8", coords: [null, null] },
            { name: "Barangay 9", coords: [null, null] },
            { name: "Barangay 10", coords: [null, null] },
            { name: "Barangay 11", coords: [null, null] },
            { name: "Barangay 12", coords: [null, null] },
            { name: "Barangay 13", coords: [null, null] },
            { name: "Barangay 14", coords: [null, null] },
            { name: "Barangay 15", coords: [null, null] },
            { name: "Barangay 16", coords: [null, null] },
            { name: "Barangay 17", coords: [null, null] },
            { name: "Barangay 18", coords: [null, null] },
            { name: "Barangay 19", coords: [null, null] },
            { name: "Barangay 20", coords: [null, null] },
            { name: "Barangay 21", coords: [null, null] },
            { name: "Barangay 22", coords: [null, null] },
            { name: "Barangay 23", coords: [null, null] },
            { name: "Barangay 24", coords: [null, null] },
            { name: "Barangay 25", coords: [null, null] },
            { name: "Barangay 26", coords: [null, null] },
            { name: "Barangay 27", coords: [null, null] },
            { name: "Barangay 28", coords: [null, null] },
            { name: "Barangay 29", coords: [null, null] }
            ];
            function initMap() {
            try {
                console.info('initMap() start');
                if (map) return;
                const mapContainer = document.getElementById('map');
                if (!mapContainer) return;
                mapContainer.innerHTML = '';

                // 🗺️ Limit map inside Ormoc City bounds
                const ormocBounds = L.latLngBounds(
                [10.95, 124.50], // southwest
                [11.20, 124.80]  // northeast
                );

                map = L.map('map', {
                maxBounds: ormocBounds,
                maxBoundsViscosity: 1.0,
                minZoom: 11,
                maxZoom: 18
                }).setView([11.0064, 124.6075], 12);

                // 🧭 Base layer
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
                }).addTo(map);

                // 📍 Show approved fields from Firestore
                showApprovedFieldsOnMap(map);

                // 📍 Barangay search only
                const input = document.getElementById('mapSearchInput');
                const btn = document.getElementById('mapSearchBtn');
                if (btn && input) {
                btn.addEventListener('click', searchBarangay);
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                    e.preventDefault();
                    searchBarangay();
                    }
                });
                }

                function searchBarangay() {
                const query = input.value.trim().toLowerCase();
                if (!query) return;

                const match = barangays.find(b => b.name.toLowerCase() === query);
                if (!match) {
                    alert('Barangay not found or outside Ormoc City.');
                    return;
                }

                const caneIcon = L.icon({
                    iconUrl: '../img/PIN.png',
                    iconSize: [40, 40],
                    iconAnchor: [20, 38],
                    popupAnchor: [0, -32]
                });

                map.setView(match.coords, 14);
                L.marker(match.coords, { icon: caneIcon })
                    .addTo(map)
                    .bindPopup(`<b>${match.name}</b>`)
                    .openPopup();
                }

                // 📌 Prevent map from leaving Ormoc bounds
                map.on('drag', function() {
                map.panInsideBounds(ormocBounds, { animate: false });
                });

                window.map = map;
            } catch (error) {
                console.error('Error initializing map:', error);
                const el = document.getElementById('map');
                if (el) {
                el.innerHTML = `
                    <div class="flex items-center justify-center h-full bg-red-50 text-red-600">
                    <div class="text-center">
                        <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                        <p>Error loading map</p>
                        <p class="text-sm">${error.message}</p>
                    </div>
                    </div>
                `;
                }
            }
            }

        // Initialize everything when page loads
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(() => { initMap(); }, 100);
            getWeather();
            const fullName = localStorage.getItem('farmerName') || 'Farmer Name';
            const firstName = fullName.trim().split(/\s+/)[0] || fullName;
            const headerNameEl = document.getElementById('userName');
            const dropdownNameEl = document.getElementById('dropdownUserName');
            if (headerNameEl) headerNameEl.textContent = firstName;
            if (dropdownNameEl) dropdownNameEl.textContent = fullName;

            // Role gating for Dashboard
            const dashboardLink = document.getElementById('dashboardLink');
            const role = (localStorage.getItem('userRole') || '').toLowerCase();
            const approvedRoles = ['handler', 'worker', 'driver', 'sra'];
            const isApproved = approvedRoles.includes(role);
            const userId = localStorage.getItem('userId') || fullName;
            async function checkHandlerAccess() {
                // If user has approved field, grant handler dashboard access
                try {
                    const { db } = await import('./firebase-config.js');
                    const { collection, getDocs, where, query } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                    const q = query(collection(db, 'fields'), where('userId', '==', userId));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        localStorage.setItem('userRole', 'handler');
                        if (dashboardLink) {
                            dashboardLink.classList.remove('opacity-60', 'cursor-not-allowed');
                            dashboardLink.href = '../Handler/dashboard.html';
                        }
                    }
                } catch(_){}
            }
            // ==================== 🔄 LIVE ROLE LISTENER ====================
            (async () => {
            try {
                const { db } = await import('./firebase-config.js');
                const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                const userId = localStorage.getItem('userId');
                if (!userId) return;

                const userRef = doc(db, 'users', userId);
                onSnapshot(userRef, (snap) => {
                if (!snap.exists()) return;
                const data = snap.data();
                const role = (data.role || '').toLowerCase();
                const approvedRoles = ['handler', 'worker', 'driver', 'sra'];
                const isApproved = approvedRoles.includes(role);
                localStorage.setItem('userRole', role);
                console.log('🧭 Live role update detected:', role);

                // 🔁 Update dashboard button instantly
                const dashboardLink = document.getElementById('dashboardLink');
                if (!dashboardLink) return;

                if (!isApproved) {
                    // 🔒 Lock dashboard
                    dashboardLink.classList.add('opacity-60', 'cursor-not-allowed');
                    dashboardLink.href = 'javascript:void(0)';
                } else {
                    // ✅ Unlock dashboard according to role
                    dashboardLink.classList.remove('opacity-60', 'cursor-not-allowed');
                    switch (role) {
                    case 'handler': dashboardLink.href = '../Handler/dashboard.html'; break;
                    case 'worker':  dashboardLink.href = '../Worker/Workers.html'; break;
                    case 'driver':  dashboardLink.href = '../Driver/Driver_Dashboard.html'; break;
                    case 'sra':     dashboardLink.href = '../SRA/SRA_Dashboard.html'; break;
                    default:        dashboardLink.href = '../Worker/Workers.html';
                    }
                }

                // Optional toast message
                const toast = document.createElement('div');
                toast.className = 'fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-sm text-[var(--cane-900)] z-[9999]';
                toast.textContent = `Your role is now "${role.toUpperCase()}"`;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 4000);
                // Also hide/show Register Field button dynamically
                try {
                    const regBtn = document.getElementById('btnRegisterField');
                    if (regBtn) {
                        if (role === 'sra') regBtn.style.display = 'none';
                        else regBtn.style.display = '';
                    }
                } catch(_) {}
                });
            } catch (err) {
                console.error('🔥 Error setting up live role listener:', err);
            }
            })();

            checkHandlerAccess();
            if (dashboardLink) {
                // Get role & mark approved roles
                const role = (localStorage.getItem('userRole') || '').toLowerCase();
                const approvedRoles = ['handler', 'worker', 'driver', 'sra'];
                const isApproved = approvedRoles.includes(role);

                if (!isApproved) {
                    // 🔒 Not approved — lock dashboard and show tutorial modal
                    dashboardLink.classList.add('opacity-60', 'cursor-not-allowed');
                    dashboardLink.href = 'javascript:void(0)';
                    dashboardLink.addEventListener('click', function(e){
                        e.preventDefault();
                        // Open locked modal tutorial
                        try {
                            const modal = document.getElementById('lockedModal');
                            const dialog = document.getElementById('lockedDialog');
                            const slides = Array.from(document.querySelectorAll('#lockedSlides .slide'));
                            const prev = document.getElementById('lockedPrev');
                            const next = document.getElementById('lockedNext');
                            const gotIt = document.getElementById('lockedGotIt');
                            const counter = document.getElementById('lockedCounter');
                            let idx = 0;
                            function render(){
                                slides.forEach((el,i)=>{ 
                                    if (i===idx){ 
                                        el.classList.remove('hidden'); 
                                        el.classList.add('animate'); 
                                    } else { 
                                        el.classList.add('hidden'); 
                                        el.classList.remove('animate'); 
                                    } 
                                });
                                if (counter) counter.textContent = (idx+1) + ' / ' + slides.length;
                                if (prev) prev.disabled = (idx===0);
                                if (next) next.disabled = (idx===slides.length-1);
                            }
                            function open(){
                                if (!modal || !dialog) return;
                                idx = 0; render();
                                modal.classList.remove('opacity-0','invisible'); 
                                modal.classList.add('opacity-100','visible');
                                dialog.classList.remove('translate-y-2','scale-95','opacity-0','pointer-events-none');
                                dialog.classList.add('translate-y-0','scale-100','opacity-100');
                            }
                            function close(){
                                if (!modal || !dialog) return;
                                modal.classList.add('opacity-0','invisible'); 
                                modal.classList.remove('opacity-100','visible');
                                dialog.classList.add('translate-y-2','scale-95','opacity-0','pointer-events-none');
                                dialog.classList.remove('translate-y-0','scale-100','opacity-100');
                            }
                            if (prev) prev.onclick = function(){ if (idx>0){ idx--; render(); } };
                            if (next) next.onclick = function(){ if (idx<slides.length-1){ idx++; render(); } };
                            if (gotIt) gotIt.onclick = close;
                            if (modal) modal.addEventListener('click', function(ev){ if (ev.target === modal) close(); });
                            document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') close(); }, { once: true });
                            open();
                        } catch(_) {}
                    });
                } else {
                    // ✅ Approved roles — unlocked dashboard access
                    dashboardLink.classList.remove('opacity-60', 'cursor-not-allowed');
                    switch (role) {
                        case 'handler':
                            dashboardLink.href = '../Handler/dashboard.html';
                            break;
                        case 'worker':
                            dashboardLink.href = '../Worker/Workers.html';
                            break;
                        case 'driver':
                            dashboardLink.href = '../Driver/Driver_Dashboard.html';
                            break;
                        case 'sra':
                            dashboardLink.href = '../SRA/SRA_Dashboard.html';
                            break;
                        default:
                            dashboardLink.href = '../Worker/Workers.html';
                    }
                }
            }

            // Wire buttons to absolute paths within frontend
            const regBtn = document.getElementById('btnRegisterField');
            if (regBtn) {
                // Hide Register Field button for SRA officers
                try {
                    const role = (localStorage.getItem('userRole') || '').toLowerCase();
                    if (role === 'sra') {
                        regBtn.style.display = 'none';
                    } else {
                        regBtn.addEventListener('click', function(e){ e.preventDefault(); window.location.href = '../Handler/Register-field.html'; });
                    }
                } catch(_) {
                    regBtn.addEventListener('click', function(e){ e.preventDefault(); window.location.href = '../Handler/Register-field.html'; });
                }
            }
            const applyBtn = document.getElementById('btnApplyDriver');
            if (applyBtn) applyBtn.addEventListener('click', function(e){ e.preventDefault(); window.location.href = '../Driver/Driver_Badge.html'; });



            // Feedback FAB bindings (ensure after DOM is ready)
            try {
                const fab = document.getElementById('feedbackButton');
                const label = document.getElementById('feedbackLabel');
                const modal = document.getElementById('feedbackModal');
                const dialog = document.getElementById('feedbackDialog');
                const closeBtn = document.getElementById('feedbackClose');
                const form = document.getElementById('feedbackForm');
                const message = document.getElementById('feedbackMessage');
                if (fab && modal && dialog) {
                    fab.addEventListener('mouseenter', function(){
                        if (!label) return; label.classList.remove('opacity-0', 'invisible'); label.classList.add('opacity-100', 'visible');
                    });
                    fab.addEventListener('mouseleave', function(){
                        if (!label) return; label.classList.add('opacity-0', 'invisible'); label.classList.remove('opacity-100', 'visible');
                    });
                    const open = function(){
                        modal.classList.remove('opacity-0', 'invisible'); modal.classList.add('opacity-100', 'visible');
                        dialog.classList.remove('translate-y-2', 'scale-95', 'opacity-0', 'pointer-events-none');
                        dialog.classList.add('translate-y-0', 'scale-100', 'opacity-100');
                    };
                    const close = function(){
                        modal.classList.add('opacity-0', 'invisible'); modal.classList.remove('opacity-100', 'visible');
                        dialog.classList.add('translate-y-2', 'scale-95', 'opacity-0', 'pointer-events-none');
                        dialog.classList.remove('translate-y-0', 'scale-100', 'opacity-100');
                    };
                    fab.addEventListener('click', open);
                    closeBtn && closeBtn.addEventListener('click', close);
                    modal.addEventListener('click', function(e){ if (e.target === modal) close(); });
                    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); });
                    // Feedback form submission is handled in the fallback binding below (to centralize logic).
                    // Keep this block intentionally empty to avoid duplicate handlers when scripts re-run.
                }
            } catch(_) {}

            // Logout confirmation modal wiring
            try {
                const logoutTrigger = document.getElementById('logoutLink');
                const modal = document.getElementById('logoutModal');
                const dialog = document.getElementById('logoutDialog');
                const btnYes = document.getElementById('logoutConfirm');
                const btnNo = document.getElementById('logoutCancel');
                function openLogout(){
                    if (!modal || !dialog) return;
                    modal.classList.remove('opacity-0', 'invisible');
                    modal.classList.add('opacity-100', 'visible');
                    dialog.classList.remove('translate-y-2', 'scale-95', 'opacity-0', 'pointer-events-none');
                    dialog.classList.add('translate-y-0', 'scale-100', 'opacity-100');
                }
                function closeLogout(){
                    if (!modal || !dialog) return;
                    modal.classList.add('opacity-0', 'invisible');
                    modal.classList.remove('opacity-100', 'visible');
                    dialog.classList.add('translate-y-2', 'scale-95', 'opacity-0', 'pointer-events-none');
                    dialog.classList.remove('translate-y-0', 'scale-100', 'opacity-100');
                }
                if (logoutTrigger) {
                    logoutTrigger.addEventListener('click', function(e){ e.preventDefault(); openLogout(); });
                }
                if (modal) {
                    modal.addEventListener('click', function(e){ if (e.target === modal) closeLogout(); });
                }
                document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeLogout(); });
                if (btnNo) btnNo.addEventListener('click', function(){ closeLogout(); });
                  if (btnYes) btnYes.addEventListener('click', async function(){
                      console.info('Logout confirm clicked');
                      try {
                          if (window.signOut && window.auth) {
                              await window.signOut(window.auth);
                          }
                      } catch (err) {
                          console.error('Error during sign out:', err);
                      } finally {
                          // Clean up local data regardless, then redirect
                          try {
                              localStorage.removeItem('userId');
                              localStorage.removeItem('userRole');
                              localStorage.removeItem('farmerName');
                          } catch(_) {}
                          window.location.href = '../Common/farmers_login.html';
                      }
                  });
              } catch(_) {}
          });

        // Initialize Swiper with enhanced functionality
        let swiper;
        try {
            const featuresEl = document.querySelector('.featuresSwiper');
            if (featuresEl && window.Swiper) {
                swiper = new Swiper('.featuresSwiper', {
                    effect: 'slide',
                    grabCursor: true,
                    centeredSlides: false,
                    slidesPerView: 'auto',
                    spaceBetween: 20,
                    loop: false,
                    slidesPerGroup: 1,
                    allowTouchMove: true,
                    watchSlidesProgress: true,
                    slidesOffsetAfter: 560,
                    slideToClickedSlide: true,
                    navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
                    on: {
                        init: function() {
                            window.__caneCounter = 1;
                            window.__lastActiveIndex = this.activeIndex;
                            adjustNavLineWidth();
                            updateSlideInfo(this);
                            updateProgressLine(this);
                            updateFeaturePanel(this);
                        },
                        slideChange: function() {
                            const prev = window.__lastActiveIndex ?? this.activeIndex;
                            const delta = this.activeIndex - prev;
                            const total = this.slides.length;
                            if (delta !== 0) {
                                window.__caneCounter = Math.min(Math.max((window.__caneCounter ?? 1) + delta, 1), total);
                            }
                            window.__lastActiveIndex = this.activeIndex;
                            updateSlideInfo(this);
                            updateProgressLine(this);
                            updateBackground(this);
                            updateFeaturePanel(this);
                        }
                    }
                });
            }
        } catch (err) {
            console.error('Failed to initialize features swiper:', err);
        }

        // Update slide number and progress line
        function updateSlideInfo(swiperInstance) {
            const totalSlides = swiperInstance.slides.length;
            const currentSlide = Math.min(Math.max(window.__caneCounter ?? (swiperInstance.activeIndex + 1), 1), totalSlides);
            const slideNumber = document.getElementById('slideNumber');
            if (slideNumber) {
                slideNumber.textContent = currentSlide.toString().padStart(2, '0');
            }
        }

        // Make nav line span from start of first card to end of third card
        function adjustNavLineWidth() {
            const swiperEl = document.querySelector('.featuresSwiper');
            const navLine = document.querySelector('.nav-line');
            if (!swiperEl || !navLine) return;
            const slides = swiperEl.querySelectorAll('.swiper-slide');
            if (slides.length < 3) return;
            const firstRect = slides[0].getBoundingClientRect();
            const thirdRect = slides[2].getBoundingClientRect();
            const span = thirdRect.right - firstRect.left;
            const adjusted = Math.min(Math.max(span * 0.6, 200), 360);
            navLine.style.width = adjusted + 'px';
        }
        window.addEventListener('resize', adjustNavLineWidth);

        // Update progress line based on current slide
        function updateProgressLine(swiperInstance) {
            const progressLine = document.getElementById('progressLine');
            if (!progressLine) return;
            const track = progressLine.parentElement; // .nav-line
            if (!track) return;
            const currentSlide = swiperInstance.activeIndex + 1; // +1 because activeIndex is 0-based
            const totalSlides = swiperInstance.slides.length;
            const trackWidth = track.clientWidth; // px width of gray line
            const minPx = 16; // minimum visible yellow width
            const widthPx = Math.max((currentSlide / totalSlides) * trackWidth, minPx);
            progressLine.style.width = widthPx + 'px';
        }

        // Update description panel based on active slide
        function updateFeaturePanel(swiperInstance) {
            const active = swiperInstance.slides[swiperInstance.activeIndex];
            if (!active) return;
            const title = active.getAttribute('data-title') || 'CaneMap Features';
            const desc = active.getAttribute('data-desc') || '';
            const tags = (active.getAttribute('data-tags') || '').split(',').filter(Boolean);
            const titleElement = document.getElementById('featureTitle');
            if (titleElement) { titleElement.textContent = title; }
            const descElement = document.getElementById('featureDesc');
            if (descElement) { descElement.textContent = desc; }
            const tagsContainer = document.getElementById('featureTags');
            if (tagsContainer) {
                tagsContainer.innerHTML = '';
                tags.forEach(function(tag) {
                    const span = document.createElement('span');
                    span.className = 'px-3 py-1 bg-white/10 rounded-full text-white text-sm font-medium';
                    span.textContent = tag.trim();
                    tagsContainer.appendChild(span);
                });
            }
        }

        // Update background image with smooth transition
        function updateBackground(swiperInstance) {
            const active = swiperInstance.slides[swiperInstance.activeIndex];
            if (!active) return;
            const img = active.querySelector('img');
            if (!img) return;
            const bg = document.getElementById('featuresBg');
            const swap = document.getElementById('featuresBgSwap');
            if (!bg || !swap) return;
            swap.src = img.src;
            swap.classList.remove('opacity-0');
            swap.classList.add('opacity-30');
            setTimeout(function() {
                bg.src = swap.src;
                swap.classList.remove('opacity-30');
                swap.classList.add('opacity-0');
            }, 500);
        }

        // Smooth scroll for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        // Profile dropdown functionality
        const profileDropdownBtn = document.getElementById('profileDropdownBtn');
        const profileDropdown = document.getElementById('profileDropdown');
        const dropdownArrow = document.getElementById('dropdownArrow');

        if (profileDropdownBtn && profileDropdown) {
            profileDropdownBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const isVisible = profileDropdown.classList.contains('opacity-100');
                if (isVisible) {
                    profileDropdown.classList.remove('opacity-100', 'visible', 'scale-100');
                    profileDropdown.classList.add('opacity-0', 'invisible', 'scale-95');
                    if (dropdownArrow) dropdownArrow.style.transform = 'rotate(0deg)';
                } else {
                    profileDropdown.classList.remove('opacity-0', 'invisible', 'scale-95');
                    profileDropdown.classList.add('opacity-100', 'visible', 'scale-100');
                    if (dropdownArrow) dropdownArrow.style.transform = 'rotate(180deg)';
                }
            });
            document.addEventListener('click', function(e) {
                if (!profileDropdownBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                    profileDropdown.classList.remove('opacity-100', 'visible', 'scale-100');
                    profileDropdown.classList.add('opacity-0', 'invisible', 'scale-95');
                    if (dropdownArrow) dropdownArrow.style.transform = 'rotate(0deg)';
                }
            });
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    profileDropdown.classList.remove('opacity-100', 'visible', 'scale-100');
                    profileDropdown.classList.add('opacity-0', 'invisible', 'scale-95');
                    if (dropdownArrow) dropdownArrow.style.transform = 'rotate(0deg)';
                }
            });
        }

        // Scroll to top function (exported globally)
        function scrollToTop() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        window.scrollToTop = scrollToTop;
    
        // Feedback FAB interactions (fallback binding in case DOMContentLoaded missed)
        (function(){
            const fab = document.getElementById('feedbackButton');
            const label = document.getElementById('feedbackLabel');
            const modal = document.getElementById('feedbackModal');
            const dialog = document.getElementById('feedbackDialog');
            const closeBtn = document.getElementById('feedbackClose');
            const form = document.getElementById('feedbackForm');
            const message = document.getElementById('feedbackMessage');
            const emailInput = document.getElementById('feedbackEmail');
            let feedbackType = '';
            // Feedback type buttons
            const optLike = document.getElementById('optLike');
            const optDislike = document.getElementById('optDislike');
            const optIdea = document.getElementById('optIdea');
            if (!fab || !modal || !dialog) return;
            // hover label
            fab.addEventListener('mouseenter', function(){
                label.classList.remove('opacity-0', 'invisible');
                label.classList.add('opacity-100', 'visible');
            });
            fab.addEventListener('mouseleave', function(){
                label.classList.add('opacity-0', 'invisible');
                label.classList.remove('opacity-100', 'visible');
            });
            // open
            fab.addEventListener('click', function(){
                modal.classList.remove('opacity-0', 'invisible');
                modal.classList.add('opacity-100', 'visible');
                dialog.classList.remove('translate-y-2', 'scale-95', 'opacity-0', 'pointer-events-none');
                dialog.classList.add('translate-y-0', 'scale-100', 'opacity-100');
            });
            // close helpers
            function closeModal(){
                modal.classList.add('opacity-0', 'invisible');
                modal.classList.remove('opacity-100', 'visible');
                dialog.classList.add('translate-y-2', 'scale-95', 'opacity-0', 'pointer-events-none');
                dialog.classList.remove('translate-y-0', 'scale-100', 'opacity-100');
            }
            closeBtn && closeBtn.addEventListener('click', closeModal);
            modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
            document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModal(); });

            // Feedback type selection
            function setType(type) {
                feedbackType = type;
                [optLike, optDislike, optIdea].forEach(btn => btn.classList.remove('bg-[var(--cane-50)]'));
                if (type === 'like') optLike.classList.add('bg-[var(--cane-50)]');
                if (type === 'dislike') optDislike.classList.add('bg-[var(--cane-50)]');
                if (type === 'idea') optIdea.classList.add('bg-[var(--cane-50)]');
            }
            optLike && optLike.addEventListener('click', () => setType('like'));
            optDislike && optDislike.addEventListener('click', () => setType('dislike'));
            optIdea && optIdea.addEventListener('click', () => setType('idea'));

            // Auto-fill email from Firebase Auth (if available).
            // Be resilient to load-order: wait a short time for `window.auth` to appear.
            async function ensureAuthReady(timeout = 2000) {
                const start = Date.now();
                while (!window.auth && (Date.now() - start) < timeout) {
                    await new Promise(r => setTimeout(r, 100));
                }
                return !!window.auth;
            }

            (async function attachAuthListener(){
                if (!emailInput) return;
                const ready = await ensureAuthReady(2000);
                try {
                    if (ready && window.auth && typeof window.auth.onAuthStateChanged === 'function') {
                        window.auth.onAuthStateChanged(function(user) {
                            if (user && user.email) {
                                emailInput.value = user.email;
                                emailInput.readOnly = true;
                            } else {
                                emailInput.value = '';
                                emailInput.readOnly = false;
                            }
                        });
                    } else {
                        // fallback: leave input editable
                        emailInput.readOnly = false;
                    }
                } catch (_) {
                    emailInput.readOnly = false;
                }
            })();

            // submit
                    if (form) {
                form.addEventListener('submit', async function(e){
                    console.info('Feedback form submit attempted. type=', feedbackType);
                    e.preventDefault();
                    if (!feedbackType) {
                        showInlineError('Please select a feedback type.');
                        return;
                    }
                    const feedbackMsg = message ? message.value.trim() : '';
                    const feedbackEmail = emailInput ? emailInput.value.trim() : '';
                    if (!feedbackMsg) {
                        showInlineError('Please enter your feedback.');
                        return;
                    }
                    try {
                        const { db } = await import('./firebase-config.js');
                        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                        await addDoc(collection(db, 'feedbacks'), {
                            type: feedbackType,
                            email: feedbackEmail || null,
                            message: feedbackMsg,
                            createdAt: serverTimestamp()
                        });
                        // show styled confirmation popup
                        showConfirmationPopup();
                        form.reset();
                        setType('');
                    } catch (err) {
                        console.error('Feedback submit error', err);
                        showInlineError('Failed to send feedback. Try again later.');
                    }
                });
            }
        })();

        // small UI helpers for feedback modal
        function showInlineError(msg) {
            // temporary place the message in feedbackHint
            try {
                const hint = document.getElementById('feedbackHint');
                if (!hint) return alert(msg);
                hint.textContent = msg;
                hint.classList.add('text-red-600');
                setTimeout(() => { hint.textContent = "This pops up above the smile icon. Your input helps improve CaneMap."; hint.classList.remove('text-red-600'); }, 3500);
            } catch (_) { alert(msg); }
        }

        function showConfirmationPopup(){
            // Create a lightweight custom popup overlay
            try {
                const popup = document.createElement('div');
                popup.id = 'feedbackConfirmPopup';
                popup.className = 'fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg shadow-lg p-4 flex items-start gap-3 z-80';
                popup.innerHTML = '<div class="flex-shrink-0 text-2xl">✅</div><div class="text-sm text-[var(--cane-900)]">Your feedback has been successfully sent to the System Admin. Thank you for your response!</div>';
                document.body.appendChild(popup);
                // close modal and remove popup after 3s
                setTimeout(() => {
                    const modal = document.getElementById('feedbackModal');
                    const dialog = document.getElementById('feedbackDialog');
                    if (modal && dialog) {
                        modal.classList.add('opacity-0', 'invisible');
                        modal.classList.remove('opacity-100', 'visible');
                        dialog.classList.add('translate-y-2', 'scale-95', 'opacity-0', 'pointer-events-none');
                        dialog.classList.remove('translate-y-0', 'scale-100', 'opacity-100');
                    }
                    try { popup.remove(); } catch(_){}
                }, 3000);
            } catch (e) { console.error(e); }
        }

// ==================== LIVE NOTIFICATION SYSTEM ====================
setTimeout(() => {
  console.log("🔔 [Notifications] Real-time system starting...");

  const openNotifModal = document.getElementById("openNotifModal");
  const closeNotifModal = document.getElementById("closeNotifModal");
  const notifModal = document.getElementById("notifModal");
  const notifList = document.getElementById("notificationsList");
  const allNotifList = document.getElementById("allNotificationsList");
  const notifBadgeCount = document.getElementById("notifBadgeCount");
  const markAllBtn = document.getElementById("markAllReadBtn");

  if (!openNotifModal || !notifModal || !notifList) {
    console.warn("⚠️ Missing notification elements!");
    return;
  }

  let cachedData = [];

  // Wait for userId (since login is async)
  async function getUserIdReady() {
    let userId = localStorage.getItem("userId");
    let tries = 0;
    while (!userId && tries < 20) {
      await new Promise((r) => setTimeout(r, 100));
      userId = localStorage.getItem("userId");
      tries++;
    }
    return userId;
  }

  // --- Real-time Firestore listener ---
  async function listenNotifications(userId) {
    try {
      const { db } = await import("./firebase-config.js");
      const {
        collection,
        query,
        where,
        orderBy,
        onSnapshot,
        doc,
        updateDoc,
        deleteDoc,
      } = await import(
        "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"
      );

      const notifRef = collection(db, "notifications");
      const q = query(
        notifRef,
        where("userId", "==", userId),
        orderBy("timestamp", "desc")
      );

      onSnapshot(q, async (snap) => {
        cachedData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        updateUI();
        await autoDeleteOldNotifications(db, cachedData);
      });

      // --- Update UI for both modal + preview ---
      function updateUI() {
        const unread = cachedData.filter((n) => n.status === "unread").length;

        // 🔢 Badge update
        if (notifBadgeCount) {
          if (unread > 0) {
            notifBadgeCount.textContent = unread;
            notifBadgeCount.dataset.countLength = String(unread).length;
            notifBadgeCount.classList.remove("hidden");
          } else {
            notifBadgeCount.classList.add("hidden");
          }
        }

        // 🪶 Outside preview (top of lobby)
        notifList.innerHTML =
          cachedData.length === 0
            ? `<div class="p-3 text-center text-gray-500 border bg-[var(--cane-50)] rounded-lg">No notifications.</div>`
            : cachedData
                .slice(0, 3)
                .map(
                  (n) => `
                    <div class="preview-notif-card ${n.status}" data-id="${n.id}">
                      <div class="notif-icon">
                        <i class="fas ${
                          n.status === "unread"
                            ? "fa-envelope"
                            : "fa-envelope-open-text"
                        } text-white text-base"></i>
                      </div>
                      <div>
                        <h4 class="font-semibold">${n.title || "Notification"}</h4>
                        <p class="text-sm text-gray-700">${n.message || ""}</p>
                      </div>
                    </div>`
                )
                .join("");

        // 📬 Modal list
        allNotifList.innerHTML =
          cachedData.length === 0
            ? `<div class="p-6 text-center text-gray-500 border bg-[var(--cane-50)] rounded-lg">No notifications.</div>`
            : cachedData
                .map(
                  (n) => `
            <div class="notification-card ${n.status} flex items-start space-x-3 p-3 mb-2 border border-[var(--cane-200)] rounded-lg" data-id="${n.id}">
              <div class="notif-icon">
                <i class="fas ${
                  n.status === "unread" ? "fa-envelope" : "fa-envelope-open-text"
                } text-white text-base"></i>
              </div>
              <div class="flex-1">
                <h4 class="font-semibold">${n.title}</h4>
                <p class="text-sm text-[var(--cane-800)]">${n.message}</p>
                <p class="text-xs text-gray-400 mt-1">${
                  n.timestamp?.toDate?.()
                    ? new Date(n.timestamp.toDate()).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : ""
                }</p>
              </div>
            </div>`
                )
                .join("");

        attachClickHandlers();
      }

        // --- Click any notification (mark as read + handle embedded links) ---
        function attachClickHandlers() {
        document.querySelectorAll(".preview-notif-card, .notification-card").forEach((card) => {
            const notifId = card.dataset.id;
            const notif = cachedData.find((n) => n.id === notifId);
            if (!notif) return;

            // 1️⃣ Handle whole card click (normal redirect logic)
            card.onclick = async (e) => {
            // Prevent conflict if the user clicks an <a> inside
            if (e.target.tagName === "A") return;

            try {
                if (notif.status === "unread") {
                await updateDoc(doc(db, "notifications", notifId), { status: "read" });
                notif.status = "read";
                }

                const msg = (notif.message || "").toLowerCase();
                if (msg.includes("click here")) {
                window.location.href = "../../frontend/Driver/Driver_Badge.html";
                return;
                }
                if (msg.includes("successfully approved") || msg.includes("success")) {
                try {
                    const { db } = await import("./firebase-config.js");
                    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");

                    const userId = localStorage.getItem("userId");
                    const userRef = doc(db, "users", userId);
                    const userSnap = await getDoc(userRef);

                    if (userSnap.exists() && (userSnap.data().role || "").toLowerCase() === "driver") {
                    // ✅ Role verified — go to dashboard
                    window.location.href = "../../frontend/Driver/Driver_Dashboard.html";
                    } else {
                    // ❌ Not yet driver — show styled alert popup
                    const overlay = document.createElement("div");
                    overlay.className = "fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-[9999]";
                    overlay.innerHTML = `
                        <div class="bg-white rounded-2xl shadow-2xl p-6 text-center max-w-md w-[90%] animate-fadeIn">
                        <div class="text-5xl mb-3">⚠️</div>
                        <h2 class="text-lg font-bold text-[var(--cane-800)] mb-2">Access Restricted</h2>
                        <p class="text-gray-600 mb-4 text-sm">
                            You are not yet verified as a <strong>Driver</strong>.<br>
                            Please wait for your application to be approved before accessing your dashboard.
                        </p>
                        <button class="mt-2 px-5 py-2 rounded-lg bg-[var(--cane-700)] text-white font-medium shadow-md hover:bg-[var(--cane-800)]">
                            Got it
                        </button>
                        </div>
                    `;
                    document.body.appendChild(overlay);
                    overlay.querySelector("button").onclick = () => overlay.remove();
                    }
                } catch (err) {
                    console.error("⚠️ Role verification failed:", err);
                }
                return;
                }
            } catch (err) {
                console.error("⚠️ Failed to handle notification click:", err);
            }
            };

            // 2️⃣ Handle direct link clicks (like <a href="...">here</a>)
            const links = card.querySelectorAll("a");
            links.forEach((link) => {
            link.addEventListener("click", async (ev) => {
                ev.preventDefault();
                try {
                // Mark as read
                if (notif.status === "unread") {
                    await updateDoc(doc(db, "notifications", notifId), { status: "read" });
                    notif.status = "read";
                }
                } catch (err) {
                console.error("⚠️ Failed to mark notification link as read:", err);
                }

                // Then redirect
                window.location.href = link.href;
            });
            });
        });
        }

      // --- Auto-delete (older than 30 days) ---
      async function autoDeleteOldNotifications(db, notifications) {
        const now = Date.now();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        const oldOnes = notifications.filter((n) => {
          const t = n.timestamp?.toDate?.()?.getTime?.() || 0;
          return now - t > THIRTY_DAYS;
        });
        if (oldOnes.length > 0) {
          console.log(`🧹 Cleaning ${oldOnes.length} old notifications...`);
          await Promise.all(
            oldOnes.map((n) => deleteDoc(doc(db, "notifications", n.id)))
          );
        }
      }

      // --- Open Modal ---
      openNotifModal.addEventListener("click", () => {
        notifModal.classList.remove("hidden");
        notifModal.classList.add("flex");
        allNotifList.scrollTo({ top: 0, behavior: "auto" });
      });

      // --- Close Modal ---
      closeNotifModal.addEventListener("click", () => {
        notifModal.classList.add("hidden");
        notifModal.classList.remove("flex");
      });
      notifModal.addEventListener("click", (e) => {
        if (e.target === notifModal) closeNotifModal.click();
      });

      // --- Mark all as read ---
      if (markAllBtn) {
        markAllBtn.onclick = async () => {
          try {
            const unread = cachedData.filter((n) => n.status === "unread");
            if (unread.length === 0) {
              alert("All notifications are already read.");
              return;
            }

            await Promise.all(
              unread.map((n) =>
                updateDoc(doc(db, "notifications", n.id), { status: "read" })
              )
            );

            // Instantly refresh both UI sections
            cachedData = cachedData.map((n) => ({ ...n, status: "read" }));
            updateUI();

            console.log("✅ All notifications marked as read.");
          } catch (err) {
            console.error("⚠️ Error marking all read:", err);
          }
        };
      }
    } catch (err) {
      console.error("🔥 Error in notification system:", err);
    }
  }

  (async () => {
    const uid = await getUserIdReady();
    if (uid) listenNotifications(uid);
  })();
}, 1000);
