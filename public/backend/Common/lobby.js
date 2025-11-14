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

        // Lightweight custom popup modal to replace native alert() calls
        function showPopupMessage(message, type = 'info') {
            try {
                // remove existing
                const existing = document.getElementById('customPopupMessage');
                if (existing) existing.remove();

                const colors = {
                    info: { bg: '#ffffff', border: '#c7f0c0', text: '#14532d' },
                    success: { bg: '#ecfdf5', border: '#bbf7d0', text: '#065f46' },
                    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
                    error: { bg: '#fff1f2', border: '#fecaca', text: '#7f1d1d' }
                };
                const cfg = colors[type] || colors.info;

                const modal = document.createElement('div');
                modal.id = 'customPopupMessage';
                Object.assign(modal.style, {
                    position: 'fixed', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.45)', zIndex: 999999
                });

                const box = document.createElement('div');
                Object.assign(box.style, {
                    background: cfg.bg, border: `1px solid ${cfg.border}`, padding: '18px', borderRadius: '12px',
                    minWidth: '280px', maxWidth: '92%', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', color: cfg.text, textAlign: 'center'
                });

                const txt = document.createElement('div');
                txt.innerHTML = message;
                txt.style.marginBottom = '12px';

                const btn = document.createElement('button');
                btn.textContent = 'OK';
                Object.assign(btn.style, {
                    padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700,
                    background: (type === 'error' ? '#7f1d1d' : type === 'warning' ? '#92400e' : '#14532d'), color: '#fff'
                });

                btn.addEventListener('click', () => modal.remove());
                modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
                document.addEventListener('keydown', function escListener(ev){ if (ev.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escListener); } });

                box.appendChild(txt);
                box.appendChild(btn);
                modal.appendChild(box);
                document.body.appendChild(modal);
            } catch (e) { try { console.error('showPopupMessage failed', e); } catch(_) {} }
        }

  // safe global wrapper to avoid ReferenceError: tryRebuild is not defined
  window.tryRebuild = function tryRebuild() {
    try {
      if (typeof rebuild === 'function') {
        rebuild();
      } else if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          if (typeof rebuild === 'function') rebuild();
        });
      }
    } catch (err) {
      console.warn('tryRebuild wrapper error (ignored):', err);
    }
  };
        // Weather API integration
        async function getWeather() {
            // Robust weather fetch: current + forecast (renders immediately and dispatches canemap:weather-updated)
            try {
                console.info('getWeather() start');
                const apiKey = '2d59a2816a02c3178386f3d51233b2ea';
                const lat = 11.0064; // Ormoc City latitude
                const lon = 124.6075; // Ormoc City longitude

                const urls = {
                    current: `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`,
                    forecast: `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`
                };

                const [curRes, fRes] = await Promise.all([fetch(urls.current), fetch(urls.forecast)]);
                if (curRes.status === 401 || fRes.status === 401) {
                console.warn('Weather API 401 Unauthorized');
                showPopupMessage('Weather data unavailable (unauthorized API key).', 'warning');
                const wxDaily = document.getElementById('wxDaily');
                if (wxDaily) wxDaily.innerHTML = '<div class="p-3 rounded-md">Weather unavailable (401).</div>';
                return;
                }
                if (!curRes.ok || !fRes.ok) {
                throw new Error(`Weather API error: current(${curRes.status}) forecast(${fRes.status})`);
                }

                const cur = await curRes.json();
                const fdata = await fRes.json();

                // Try to fetch OneCall for UV index and daily summaries (best-effort)
                let onecall = null;
                try {
                    const onecallUrl = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&units=metric&exclude=minutely,hourly,alerts&appid=${apiKey}`;
                    const ocRes = await fetch(onecallUrl);
                    if (ocRes.ok) onecall = await ocRes.json();
                } catch(_) { /* ignore onecall failures */ }

                // If OneCall failed (CORS/quota), try the older UV endpoint as a fallback for UV only
                if (!onecall) {
                    try {
                        const uviUrl = `https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${apiKey}`;
                        const uvRes = await fetch(uviUrl);
                        if (uvRes.ok) {
                            const uvjson = await uvRes.json();
                            onecall = { current: { uvi: typeof uvjson.value === 'number' ? uvjson.value : null }, daily: null };
                        }
                    } catch (_) { /* ignore */ }
                }

                const weatherContainer = document.getElementById('weatherForecast');
                const wxDaily = document.getElementById('wxDaily');

                // Update 'Today' metrics from current weather
                try {
                    const tEl = document.getElementById('wxTemp');
                    const wEl = document.getElementById('wxWind');
                    const uvEl = document.getElementById('wxUv');
                    const uvBar = document.getElementById('wxUvBar');

                    const tempNow = typeof cur.main?.temp === 'number' ? Math.round(cur.main.temp) : '--';
                    const windKmh = typeof cur.wind?.speed === 'number' ? (cur.wind.speed * 3.6) : null; // m/s → km/h
                    if (tEl) tEl.textContent = tempNow === '--' ? '--' : String(tempNow);
                    if (wEl) wEl.textContent = windKmh !== null ? windKmh.toFixed(1) + ' km/h' : '-- km/h';

                    // UV: prefer OneCall current.uvi if available
                    if (uvEl && uvBar) {
                        const uvi = onecall && typeof onecall.current?.uvi === 'number' ? onecall.current.uvi : null;
                        if (uvi !== null) {
                            const pct = Math.max(0, Math.min(100, (uvi / 11) * 100));
                            uvEl.textContent = uvi.toFixed(1);
                            uvBar.style.width = pct + '%';
                            // Colorize UV bar according to simple safety scale
                            // 0-2 Low (green), 3-5 Moderate (yellow), 6-7 High (orange), 8-10 Very High (red), 11+ Extreme (violet)
                            let color = '#34d399'; // green
                            if (uvi >= 11) color = '#8b5cf6';
                            else if (uvi >= 8) color = '#ef4444';
                            else if (uvi >= 6) color = '#fb923c';
                            else if (uvi >= 3) color = '#facc15';
                            uvBar.style.background = color;
                            uvEl.setAttribute('data-uv-level', String(uvi));
                            uvEl.title = `UV index ${uvi.toFixed(1)} — ${uvi>=11? 'Extreme': uvi>=8? 'Very High' : uvi>=6? 'High' : uvi>=3? 'Moderate' : 'Low'}`;
                        } else {
                            uvEl.textContent = '--';
                            uvBar.style.width = '0%';
                            uvBar.style.background = '';
                            uvEl.removeAttribute('data-uv-level');
                            uvEl.title = '';
                        }
                    }

                    // Dispatch update for background swapper and any listeners
                    const cond = (cur.weather && cur.weather[0] && cur.weather[0].description) || '';
                    window.dispatchEvent(new CustomEvent('canemap:weather-updated', {
                        detail: { condition: cond, temp: (typeof tempNow === 'number' ? tempNow : null), windKmh }
                    }));
                } catch (err) {
                    console.warn('Failed to update main weather metrics:', err);
                }

                    // Build compact multi-day forecast. Prefer OneCall.daily for clean daily summaries if available.
                try {
                    let rows = '';
                    if (onecall && Array.isArray(onecall.daily)) {
                        const days = onecall.daily.slice(0, 4); // today + next 3
                        rows = days.map((d, idx) => {
                            const dayName = idx === 0 ? 'Today' : (idx === 1 ? 'Tomorrow' : new Date(d.dt * 1000).toLocaleDateString('en-US', { weekday: 'short' }));
                            const tempLo = Math.round(d.temp.min);
                            const tempHi = Math.round(d.temp.max);
                            const icon = d.weather?.[0]?.icon || '';
                            const desc = d.weather?.[0]?.description || '';
                            const iconUrl = icon ? `https://openweathermap.org/img/wn/${icon}.png` : '';
                            return `
                                <div class="wx-day flex items-center justify-between p-3 rounded-lg bg-white/10 text-white border border-white/20">
                                    <div class="flex items-center gap-3">
                                        ${iconUrl ? `<img src="${iconUrl}" alt="${desc}" class="w-6 h-6"/>` : ''}
                                        <span class="font-semibold text-sm">${dayName}</span>
                                    </div>
                                    <div class="text-right leading-tight">
                                        <div class="font-bold text-sm">${tempLo}° / ${tempHi}°</div>
                                        <div class="text-xs opacity-90">${desc}</div>
                                    </div>
                                </div>`;
                        }).join('');
                    } else if (fdata && Array.isArray(fdata.list)) {
                        // Fallback to the forecast grouping by day
                        const grouped = {};
                        fdata.list.forEach(item => {
                            const date = new Date(item.dt * 1000);
                            const dayStr = date.toLocaleDateString();
                            if (!grouped[dayStr]) grouped[dayStr] = [];
                            grouped[dayStr].push(item);
                        });
                        const dayKeys = Object.keys(grouped).slice(0, 4);
                        rows = dayKeys.map((key, idx) => {
                            const block = grouped[key];
                            const midday = block.find(f => new Date(f.dt * 1000).getHours() === 12) || block[Math.floor(block.length / 2)] || block[0];
                            const tempLo = Math.round(Math.min(...block.map(b => b.main.temp_min)));
                            const tempHi = Math.round(Math.max(...block.map(b => b.main.temp_max)));
                            const icon = midday.weather?.[0]?.icon || '';
                            const desc = midday.weather?.[0]?.description || '';
                            const iconUrl = icon ? `https://openweathermap.org/img/wn/${icon}.png` : '';
                            const dayName = idx === 0 ? 'Today' : (idx === 1 ? 'Tomorrow' : new Date(key).toLocaleDateString('en-US', { weekday: 'short' }));
                            return `
                                <div class="wx-day flex items-center justify-between p-3 rounded-lg bg-white/10 text-white border border-white/20">
                                    <div class="flex items-center gap-3">
                                        ${iconUrl ? `<img src="${iconUrl}" alt="${desc}" class="w-6 h-6"/>` : ''}
                                        <span class="font-semibold text-sm">${dayName}</span>
                                    </div>
                                    <div class="text-right leading-tight">
                                        <div class="font-bold text-sm">${tempLo}° / ${tempHi}°</div>
                                        <div class="text-xs opacity-90">${desc}</div>
                                    </div>
                                </div>`;
                        }).join('');
                    } else {
                        rows = `<div class='p-3 rounded-lg border border-[var(--cane-200)] bg-white/10 text-white/90'>Forecast data unavailable.</div>`;
                    }

                    if (wxDaily) wxDaily.innerHTML = rows;
                } catch (err) {
                    console.warn('Failed to build forecast UI:', err);
                }

            } catch (error) {
                console.error('Error fetching weather:', error);
                const el = document.getElementById('weatherForecast');
                const wxDaily = document.getElementById('wxDaily');
                if (wxDaily) wxDaily.innerHTML = `<div class='p-3 rounded-lg border border-[var(--cane-200)] bg-white/10 text-white/90'>Weather data unavailable.</div>`;
                if (el && (!el.querySelector || !el.querySelector('.weather-error'))) {
                    // keep card layout; show small inline error
                    const errNote = document.createElement('div');
                    errNote.className = 'text-[var(--cane-700)] weather-error text-sm mt-2';
                    errNote.textContent = 'Unable to load weather at this time.';
                    el.appendChild(errNote);
                }
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
        // ---------- Utility: safely pick first existing key ----------
        function pickFirst(obj, keys = []) {
        for (const k of keys) {
            if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== '') {
            return obj[k];
            }
        }
        return null;
        }

        // ---------- Fetch reviewed/approved fields (same style as Review.js) ----------
        async function fetchApprovedFields() {
        try {
            const { db } = await import('./firebase-config.js');
            const {
            collectionGroup,
            getDocs,
            query,
            where
            } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

            // ✅ Fetch from nested field_applications/{uid}/fields
            const q = query(collectionGroup(db, 'fields'), where('status', '==', 'reviewed'));
            const snap = await getDocs(q);
            if (snap.empty) {
            console.warn('⚠️ No reviewed fields found.');
            return [];
            }

        let fields = snap.docs.map(d => {
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

        // 🟢 Enrich applicantName like in Review.js
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
                // prioritize common fullname variants used across your DB
                const displayName =
                    (u.fullname && String(u.fullname).trim()) ||
                    (u.full_name && String(u.full_name).trim()) ||
                    (u.fullName && String(u.fullName).trim()) ||
                    (u.name && String(u.name).trim()) ||
                    (u.displayName && String(u.displayName).trim()) ||
                    (u.email && String(u.email).trim()) ||
                    possibleUid; // fallback to uid if nothing else

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

    async function showApprovedFieldsOnMap(map) {
        try {
            const caneIcon = L.icon({
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

            // ✨ Tooltip content
const tooltipHtml = `
  <div style="font-size:12px; line-height:1.4; max-width:250px; width:max-content; color:#14532d;">
    <b style="font-size:14px; color:#166534;">${f.fieldName}</b>
    <br><span style="font-size:10px; color:#15803d;">🏠︎ <i>${f.street}, Brgy. ${f.barangay},<br>Ormoc City, Leyte 6541</i></span>
    <br><a href="#" class="seeFieldDetails" 
       style="font-size:10px; color:gray; font-weight:500; display:inline-block; margin-top:3px;">
       Click to see more details.
    </a>
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

                // Base layer
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
                }).addTo(map);

                // Show approved fields from Firestore
                showApprovedFieldsOnMap(map);

                // 🌾 Unified Search (Field + Barangay + Street + LatLng)
                const input = document.getElementById('mapSearchInput');
                const btn = document.getElementById('mapSearchBtn');

                if (btn && input) {
                const handleSearch = () => {
                    const val = input.value.trim().toLowerCase();
                    if (!val) {
                    map.setView([11.0064, 124.6075], 12);
                    showApprovedFieldsOnMap(map);
                    return;
                    }

                   // Reset map when searching "black"
                    if (val === "black") {
                    console.info("🔁 Resetting map view to default...");

                    // Clear dynamically added markers (if any)
                    if (window.__tempSearchMarkers) {
                        window.__tempSearchMarkers.forEach(m => map.removeLayer(m));
                        window.__tempSearchMarkers = [];
                    }

                    // Reset map view to default Ormoc position
                    map.setView([11.0064, 124.6075], 12);

                    // Refresh default approved field markers
                    if (typeof showApprovedFieldsOnMap === "function") {
                        showApprovedFieldsOnMap(map);
                    }

                    showToast("🗺️ Map reset to default view.", "green");
                    return;
                    }
 
                    // 🔹 1. Try to match partial fields
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

                    // 🔹 2. If at least one field matches
                    if (matchedFields.length > 0) {
                    const { marker, data } = matchedFields[0]; // focus on the first one
                    map.setView([data.lat, data.lng], 15);
                    marker.openTooltip();

                    // Optional — bounce animation to draw attention
                    marker._icon.classList.add('leaflet-marker-bounce');
                    setTimeout(() => marker._icon.classList.remove('leaflet-marker-bounce'), 1200);

                    showToast(`📍 Found: ${data.fieldName} (${data.barangay})`, 'green');
                    return;
                    }

                    // 🔹 3. Fallback: Try matching Barangay list
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

                    // 🔹 4. If no results found
                    showToast('❌ No matching field or barangay found.', 'gray');
                };

                btn.addEventListener('click', handleSearch);
                input.addEventListener('keydown', e => {
                    if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                    }
                });
                }

                function searchBarangay() {
                const query = input.value.trim().toLowerCase();
                if (!query) return;

                const match = barangays.find(b => b.name.toLowerCase() === query);
                if (!match) {
                    showPopupMessage('Barangay not found or outside Ormoc City.', 'error');
                    return;
                }

                // 🔍 Field name search
                async function searchFieldByName() {
                const input = document.getElementById('mapSearchInput');
                const query = input.value.trim().toLowerCase();
                if (!query || !window.__caneMarkers) return;

                const found = window.__caneMarkers.find(m =>
                    m.data.fieldName && m.data.fieldName.toLowerCase() === query
                );

                if (!found) {
                    showPopupMessage('Field not found. Please type the exact Field Name.', 'error');
                    return;
                }

                const { marker, data } = found;
                map.setView([data.lat, data.lng], 15);
                marker.openTooltip();
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

        // ---------- Check if user already joined this field ----------
        async function checkIfAlreadyJoined(fieldId, userId) {
        const { db } = await import('./firebase-config.js');
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
        try {
            const joinDocRef = doc(db, `field_joins/${userId}/join_fields/${fieldId}`);
            const snap = await getDoc(joinDocRef);
            if (!snap.exists()) return false; // never joined
            const data = snap.data();
            return data.status === 'pending' || data.status === 'approved';
        } catch (err) {
            console.error('Error checking join status:', err);
            return false;
        }
        }

        // ---------- Field Details Modal ----------
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
                🏠︎ ${field.street}, Brgy. ${field.barangay}, Ormoc City, Leyte 6541
            </div>

            <div class="text-[11px] text-[var(--cane-600)] italic text-center mb-4">
                ⟟ Lat: ${field.lat.toFixed(5)} | Lng: ${field.lng.toFixed(5)}
            </div>

            <button id="joinBtn" class="w-full py-2.5 rounded-md bg-[var(--cane-700)] text-white font-semibold hover:bg-[var(--cane-800)] transition">
                Join Field
            </button>
            </div>
        `;

        document.body.appendChild(modal);
        document.getElementById('closeFieldModal').onclick = () => modal.remove();

        const joinBtn = document.getElementById('joinBtn');
        const userId = localStorage.getItem('userId');
        const userRole = (localStorage.getItem('userRole') || '').toLowerCase();

        // 🟢 If SRA → hide button entirely
        if (userRole === 'sra') {
            joinBtn.style.display = 'none';
            return;
        }

        // 🟢 If Handler
        if (userRole === 'handler') {
            // If the field belongs to this handler
            if (field.raw?.userId === userId || field.applicantName === localStorage.getItem('farmerName')) {
                joinBtn.textContent = 'Check My Field';
                joinBtn.onclick = () => {
                    window.location.href = '../../frontend/Handler/dashboard.html';
                };
            } else {
                // If handler but not owner → hide
                joinBtn.style.display = 'none';
            }
            return;
        }

        // 🟢 For all other roles, check join status
        checkIfAlreadyJoined(field.id, userId).then((alreadyJoined) => {
            if (alreadyJoined) {
                joinBtn.disabled = true;
                joinBtn.textContent = 'Request Pending';
                joinBtn.classList.add('opacity-60', 'cursor-not-allowed');
                joinBtn.style.backgroundColor = '#9ca3af'; // gray tone
            } else {
                joinBtn.onclick = () => openJoinModal(field);
            }
        });
        }


        // ---------- Check for conflicting pending roles ----------
        async function checkPendingRoles(userId) {
        const { db } = await import('./firebase-config.js');
        const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

        let hasPendingWorker = false;
        let hasPendingDriver = false;

        try {
            // 🔹 Check field_joins for pending worker
            const joinsSnap = await getDocs(collection(db, `field_joins/${userId}/join_fields`));
            joinsSnap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'pending' && data.role === 'worker') hasPendingWorker = true;
            if (data.status === 'pending' && data.role === 'driver') hasPendingDriver = true;
            });

            // 🔹 Check Drivers_Badge for pending driver badge
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
            const badgeSnap = await getDoc(doc(db, 'Drivers_Badge', userId));
            if (badgeSnap.exists()) {
            const badge = badgeSnap.data();
            if (badge.status === 'pending') hasPendingDriver = true;
            }
        } catch (err) {
            console.warn('⚠️ Error checking pending roles:', err);
        }

        return { hasPendingWorker, hasPendingDriver };
        }

        // ---------- Join Modal ----------
        function openJoinModal(field) {
        const userRole = (localStorage.getItem('userRole') || '').toLowerCase();

        if (userRole === 'worker' || userRole === 'driver') {
            openConfirmJoinModal(field, userRole);
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] backdrop-blur-sm';
        modal.innerHTML = `
            <div class="bg-white rounded-xl p-6 w-[90%] max-w-xs relative text-center border border-[var(--cane-200)] shadow-md">
                <button id="closeJoinModal" class="absolute top-2 right-3 text-gray-500 hover:text-gray-700 text-lg font-bold">&times;</button>
                <h3 class="text-base font-semibold text-[var(--cane-900)] mb-5">Join as:</h3>
                <div class="flex justify-center gap-3 mb-4">
                    <button id="joinWorker" class="px-4 py-2 rounded-md bg-[var(--cane-700)] text-white text-sm font-medium hover:bg-[var(--cane-800)] transition">Worker</button>
                    <button id="joinDriver" class="px-4 py-2 rounded-md bg-[var(--cane-700)] text-white text-sm font-medium hover:bg-[var(--cane-800)] transition">Driver</button>
                </div>
                <p id="pendingNotice" class="text-xs text-[var(--cane-700)] italic hidden"></p>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#closeJoinModal').onclick = () => modal.remove();

        const userId = localStorage.getItem('userId');
        checkPendingRoles(userId).then(({ hasPendingWorker, hasPendingDriver }) => {
            const joinWorker = modal.querySelector('#joinWorker');
            const joinDriver = modal.querySelector('#joinDriver');
            const notice = modal.querySelector('#pendingNotice');

            // 🔹 CASE 1: Has pending DRIVER badge → both disabled
            if (hasPendingDriver && !hasPendingWorker) {
            joinWorker.disabled = true;
            joinDriver.disabled = true;
            joinWorker.classList.add('opacity-60', 'cursor-not-allowed');
            joinDriver.classList.add('opacity-60', 'cursor-not-allowed');
            notice.textContent = "You can’t join as a worker because you already have a pending driver's badge request. Please wait until it’s approved.";
            notice.classList.remove('hidden');
            return;
            }

            // 🔹 CASE 2: Has pending WORKER join → only disable Driver
            if (hasPendingWorker && !hasPendingDriver) {
            joinDriver.disabled = true;
            joinDriver.classList.add('opacity-60', 'cursor-not-allowed');
            notice.textContent = "You can’t join as a driver because you already have a pending join request. You can only join as a worker.";
            notice.classList.remove('hidden');
            joinWorker.onclick = () => {
                modal.remove();
                openConfirmJoinModal(field, 'worker');
            };
            return;
            }

            // 🔹 CASE 3: No conflicts → both open normally
            joinWorker.onclick = () => {
            modal.remove();
            openConfirmJoinModal(field, 'worker');
            };
            joinDriver.onclick = () => {
            modal.remove();
            openDriverBadgeModal();
            };
        });
        }

        // ---------- Transparent conflict message modal ----------
        function showConflictMessage(message) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[11000]';

        modal.innerHTML = `
            <div class="relative bg-transparent text-center max-w-xs w-[90%] text-white">
            <button id="closeConflict" class="absolute top-[-10px] right-[-10px] text-white text-2xl font-bold">&times;</button>
            <div class="backdrop-blur-sm bg-black/40 rounded-xl p-4 border border-white/20 text-sm leading-relaxed">
                ${message}
            </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeAll = () => {
            document.querySelectorAll('.fixed.inset-0').forEach(m => m.remove());
        };

        modal.querySelector('#closeConflict').onclick = closeAll;
        }


        // ---------- If Farmer chooses "Join as Driver" ----------
        function openDriverBadgeModal() {
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-white rounded-xl p-6 w-[90%] max-w-sm text-center border border-[var(--cane-200)] shadow-md">
                    <h3 class="text-lg font-semibold text-[var(--cane-900)] mb-3">Driver Badge Required</h3>
                    <p class="text-[var(--cane-700)] text-sm mb-5 leading-relaxed">
                        You need to apply for a <b>Driver’s Badge</b> before joining as a driver.
                    </p>
                    <div class="flex justify-center gap-3">
                        <button id="cancelBadge" class="px-4 py-2 rounded-md border border-[var(--cane-300)] text-[var(--cane-700)] text-sm hover:bg-[var(--cane-100)] transition">Cancel</button>
                        <button id="goBadge" class="px-4 py-2 rounded-md bg-[var(--cane-700)] text-white text-sm font-semibold hover:bg-[var(--cane-800)] transition">Apply Now</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('#cancelBadge').onclick = () => modal.remove();
            modal.querySelector('#goBadge').onclick = () => {
                modal.remove();
                window.location.href = "../../frontend/Driver/Driver_Badge.html";
            };
        }

        // ---------- Confirm Join Modal ----------
        function openConfirmJoinModal(field, role) {
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-white rounded-xl p-6 w-[90%] max-w-sm text-center border border-[var(--cane-200)] shadow-md animate-fadeIn">
                    <h3 class="text-lg font-semibold text-[var(--cane-900)] mb-3">Confirm Join</h3>
                    <p class="text-[var(--cane-700)] text-sm mb-5">
                        Are you sure you want to join <b>${field.fieldName}</b>?
                    </p>
                    <div class="flex justify-center gap-3">
                        <button id="cancelJoin" class="px-4 py-2 rounded-md border border-[var(--cane-300)] text-[var(--cane-700)] text-sm hover:bg-[var(--cane-100)] transition">Cancel</button>
                        <button id="confirmJoin" class="px-4 py-2 rounded-md bg-[var(--cane-700)] text-white text-sm font-semibold hover:bg-[var(--cane-800)] transition">Yes</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('#cancelJoin').onclick = () => modal.remove();
            modal.querySelector('#confirmJoin').onclick = () => {
                modal.remove();
                confirmJoin(field, role);
            };
        }

        // ---------- Confirm Join (save in Firestore) ----------
        async function confirmJoin(field, role) {
        try {
            const { db } = await import('./firebase-config.js');
            const { doc, setDoc, getDoc, serverTimestamp } =
            await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

            const userId = localStorage.getItem('userId');
            if (!userId) {
            showPopupMessage('Please log in first.', 'warning');
            return;
            }

            // 🔹 Directly target subcollection document (no parent data write)
            const joinRef = doc(db, `field_joins/${userId}/join_fields/${field.id}`);
            const joinSnap = await getDoc(joinRef);

            if (joinSnap.exists()) {
            const data = joinSnap.data();
            if (data.status === 'pending' || data.status === 'approved') {
                showToast('⚠️ You already have a pending or approved request for this field.', 'gray');
                return;
            }
            }

            // ✅ Save only inside join_fields/{fieldId}
            await setDoc(joinRef, {
            fieldId: field.id,
            fieldName: field.fieldName,
            street: field.street || '—',
            role: role,
            status: 'pending',
            userId: userId,
            requestedAt: serverTimestamp()
            });

            showToast(`✅ Join request sent as ${role.toUpperCase()} for "${field.fieldName}".`, 'green');

            const joinBtn = document.getElementById('joinBtn');
            if (joinBtn) {
            joinBtn.disabled = true;
            joinBtn.textContent = 'Request Pending';
            joinBtn.classList.add('opacity-60', 'cursor-not-allowed');
            joinBtn.style.backgroundColor = '#9ca3af';
            }
            } catch (err) {
            console.error('❌ Error confirming join:', err);
            showPopupMessage('Failed to send join request. Please try again.', 'error');
        }
        }

        function showToast(msg, color = 'green') {
        // Create container once
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
        // Fade in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 50);

        // Auto remove
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
        }

        // ---------- Watch Join Approvals & Auto-update Role ----------
        async function watchJoinApprovals(userId) {
        const { db } = await import('./firebase-config.js');
        const { collection, onSnapshot, doc, updateDoc } =
            await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

        const joinsRef = collection(db, `field_joins/${userId}/join_fields`);

        onSnapshot(joinsRef, async (snapshot) => {
            for (const change of snapshot.docChanges()) {
            if (change.type === 'modified') {
                const data = change.doc.data();
                if (data.status === 'approved') {
                const userRef = doc(db, 'users', userId);
                await updateDoc(userRef, { role: data.role });
                localStorage.setItem('userRole', data.role);

                console.log(`✅ Role updated to ${data.role}`);

                // Optional toast notification
                const toast = document.createElement('div');
                toast.textContent = `✅ Approved! Your role is now ${data.role.toUpperCase()}.`;
                Object.assign(toast.style, {
                    position: 'fixed',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#14532d',
                    color: 'white',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    zIndex: 99999,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    opacity: '0',
                    transition: 'opacity 0.3s ease'
                });
                document.body.appendChild(toast);
                setTimeout(() => toast.style.opacity = '1', 50);
                setTimeout(() => {
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), 300);
                }, 4000);

                // 🔁 Instantly unlock Dashboard without refresh
                const dashboardLink = document.getElementById('dashboardLink');
                if (dashboardLink) {
                    dashboardLink.classList.remove('opacity-60', 'cursor-not-allowed');
                    dashboardLink.href =
                    data.role === 'driver'
                        ? '../Driver/dashboard.html'
                        : '../Handler/dashboard.html';
                }
                }
            }
            }
        });
        }

        async function watchPendingConflicts(userId) {
        const { db } = await import('./firebase-config.js');
        const { collection, doc, onSnapshot } =
            await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

        // Worker/Driver join requests
        onSnapshot(collection(db, `field_joins/${userId}/join_fields`), snap => {
            let hasPendingWorker = false, hasPendingDriver = false;
            snap.forEach(d => {
            const data = d.data();
            if (data.status === 'pending' && data.role === 'worker') hasPendingWorker = true;
            if (data.status === 'pending' && data.role === 'driver') hasPendingDriver = true;
            });
            localStorage.setItem('pendingWorker', hasPendingWorker);
            localStorage.setItem('pendingDriver', hasPendingDriver);
        });

        // Driver badge
        onSnapshot(doc(db, 'Drivers_Badge', userId), d => {
            if (!d.exists()) return;
            const badge = d.data();
            const hasPendingBadge = badge.status === 'pending';
            localStorage.setItem('pendingDriver', hasPendingBadge);
        });
        }

        // Call this on load
        watchPendingConflicts(localStorage.getItem('userId'));

        function openDriverRentalModal() {
    const wrapper = document.getElementById('driverRentalModalWrapper');
    const frame = document.getElementById('driverRentalFrame');
    frame.src = "../Driver/Driver_Rental.html";
    wrapper.classList.remove("hidden");
    wrapper.classList.add("flex");
}

    function closeDriverRentalModal() {
        const wrapper = document.getElementById('driverRentalModalWrapper');
        const frame = document.getElementById('driverRentalFrame');
        wrapper.classList.add("hidden");
        wrapper.classList.remove("flex");
        frame.src = ""; // unload page
    }

    // Listen for messages from Driver_Rental.html
    window.addEventListener("message", (e) => {
    try {
        if (!e || !e.data) return;
        const t = e.data.type;

        // Close/cleanup rental modal events
        if (t === "driver_rental_cancel" || t === "driver_rental_published_close" || t === "driver_rental_published") {
        try { closeDriverRentalModal(); } catch(_) {}
        return;
        }

        // Open Driver Badge page when iframe asks for it
        if (t === "open_driver_badge") {
        try { closeDriverRentalModal(); } catch(_) {}
        // Use an absolute path that matches your served files.
        // Change to '/public/frontend/Driver/Driver_Badge.html' if your dev server serves the project root.
        window.location.href = '/public/frontend/Driver/Driver_Badge.html';
        return;
        }

    } catch (err) {
        console.warn('lobby.js message handler error', err);
    }
    });

        // Initialize everything when page loads
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(() => { initMap(); }, 100);
            getWeather();
            // Poll weather every 10 minutes (600000 ms)
            try { window.__canemap_weather_interval && clearInterval(window.__canemap_weather_interval); } catch(_) {}
            window.__canemap_weather_interval = setInterval(() => { try { getWeather(); } catch(_) {} }, 10 * 60 * 1000);
            const fullName = localStorage.getItem('farmerName') || 'Farmer Name';
            const firstName = fullName.trim().split(/\s+/)[0] || fullName;
            const headerNameEl = document.getElementById('userName');
            const dropdownNameEl = document.getElementById('dropdownUserName');
            if (headerNameEl) headerNameEl.textContent = firstName;
            if (dropdownNameEl) dropdownNameEl.textContent = fullName;
            // Set role in dropdown if present
            (function setInitialDropdownRole(){
                try {
                    const dropdownRoleEl = document.getElementById('dropdownUserRole');
                    if (!dropdownRoleEl) return;
                    const role = (localStorage.getItem('userRole') || '').toLowerCase();
                    const map = { handler: 'Handler', worker: 'Worker', driver: 'Driver', sra: 'SRA Officer', farmer: 'Farmer' };
                    dropdownRoleEl.textContent = map[role] || (role ? (role.charAt(0).toUpperCase() + role.slice(1)) : 'Farmer');
                } catch (_) {}
            })();

            // Initialize weather toggle state: collapsed by default (show Today only)
            try {
                const weatherCard = document.getElementById('weatherForecast');
                const wxTodayMain = document.getElementById('wxTodayMain');
                const toggle = document.getElementById('wxToggleBtn');
                const toggleIcon = document.getElementById('wxToggleIcon');
                const wxDaily = document.getElementById('wxDaily');
                const wxCompact = document.getElementById('wxCompact');
                // visible expand button (main CTA)
                const expandBtn = document.getElementById('wxExpandBtn');
                const expandChevron = document.getElementById('wxExpandChevron');
                const expandLabel = document.getElementById('wxExpandLabel');
                const wxCompactFooter = document.getElementById('wxCompactFooter');

                // cache references for simple show/hide
                const wxTodayContainer = document.getElementById('wxTodayContainer');
                const expandBtnContainer = expandBtn ? expandBtn.parentElement : null;

                function syncToggleState(isExpanded){
                    try {
                        if (!weatherCard) return;
                        if (isExpanded) weatherCard.classList.add('expanded'); else weatherCard.classList.remove('expanded');
                        if (wxDaily) wxDaily.setAttribute('aria-hidden', (!isExpanded).toString());
                        if (wxCompact) wxCompact.setAttribute('aria-hidden', (!isExpanded).toString());
                        if (toggle) toggle.setAttribute('aria-expanded', isExpanded.toString());
                        if (toggleIcon) {
                            toggleIcon.classList.toggle('fa-chevron-down', !isExpanded);
                            toggleIcon.classList.toggle('fa-chevron-up', isExpanded);
                        }
                        if (expandChevron) {
                            expandChevron.classList.toggle('fa-chevron-down', !isExpanded);
                            expandChevron.classList.toggle('fa-chevron-up', isExpanded);
                        }
                        if (expandLabel) {
                            // when expanded, show a control to return to current weather
                            expandLabel.textContent = isExpanded ? 'Show current weather' : 'Show next days';
                        }

                        // Show/hide only the today container; keep next days inside #wxCompact always
                        try {
                            if (wxTodayContainer) {
                                wxTodayContainer.style.display = isExpanded ? 'none' : '';
                            }
                            // Move the button below the next-days container when expanded, and back when collapsed
                            if (expandBtn) {
                                if (isExpanded && wxCompactFooter && expandBtn.parentElement !== wxCompactFooter) {
                                    wxCompactFooter.appendChild(expandBtn);
                                } else if (!isExpanded && expandBtnContainer && expandBtn.parentElement !== expandBtnContainer) {
                                    expandBtnContainer.appendChild(expandBtn);
                                }
                            }
                        } catch(_){}
                    } catch(_){}
                }

                if (weatherCard && wxDaily) {
                    // start collapsed
                    syncToggleState(false);
                }

                if (toggle) {
                    toggle.addEventListener('click', function(ev){
                        ev && ev.preventDefault && ev.preventDefault();
                        if (!weatherCard) return;
                        const isExpanded = !weatherCard.classList.contains('expanded');
                        syncToggleState(isExpanded);
                    });
                }

                if (expandBtn) {
                    expandBtn.addEventListener('click', function(ev){
                        ev && ev.preventDefault && ev.preventDefault();
                        if (!weatherCard) return;
                        const isExpanded = !weatherCard.classList.contains('expanded');
                        syncToggleState(isExpanded);
                    });
                }
            } catch(_) {}

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
                try {
                    const dropdownRoleEl = document.getElementById('dropdownUserRole');
                    if (dropdownRoleEl) {
                        const map = { handler: 'Handler', worker: 'Worker', driver: 'Driver', sra: 'SRA Officer', farmer: 'Farmer' };
                        dropdownRoleEl.textContent = map[role] || (role ? (role.charAt(0).toUpperCase() + role.slice(1)) : 'Farmer');
                    }
                } catch(_) {}
                // inside your onSnapshot(userRef, ...) after you set localStorage userRole:
                updatePendingFieldMenu();

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
                const driverBtn = document.getElementById('btnDriverRental');

                if (role === 'driver') {
                    // driver mode
                    if (regBtn) regBtn.style.display = 'none';
                    if (driverBtn) {
                        driverBtn.style.display = 'block';
                        driverBtn.onclick = () => openDriverRentalModal();
                    }
                } 
                else if (role === 'sra') {
                    if (regBtn) regBtn.style.display = 'none';
                    if (driverBtn) driverBtn.style.display = 'none';
                }
                else {
                    // handler / worker / others
                    if (regBtn) regBtn.style.display = '';
                    if (driverBtn) driverBtn.style.display = 'none';
                }

            } catch(_) {}
                });
            } catch (err) {
                console.error('🔥 Error setting up live role listener:', err);
            }
            })();

            checkHandlerAccess();
            
            // 🔁 Watch for join approvals + recheck badge eligibility
            watchJoinApprovals(localStorage.getItem('userId'));
            checkDriverBadgeEligibility();

            // 🟢 Start watching for join approvals in real-time
            if (userId) {
                watchJoinApprovals(userId);
            }

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

            window.addEventListener('message', (ev) => {
                if (!ev.data) return;

                // When Driver_Rental.html finishes publishing
                if (ev.data.type === 'driver_rental_published' || ev.data.type === 'driver_rental_published_close') {

                    // If you want to refresh UI after publish
                    try {
                        checkRegisterFieldButton && checkRegisterFieldButton();
                    } catch(_){}

                    // OPTIONAL toast UI (if you have your own)
                    try {
                        showToast && showToast('Your vehicle is now open for rental!', 'green');
                    } catch(_){}
                }

                // When user cancels the rental modal
                if (ev.data.type === 'driver_rental_cancel') {
                    console.log('Driver rental modal closed.');
                }
                });
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
            // --- DRIVER: Hide Register Field & Show Rental Button ---
            const driverRentalBtn = document.getElementById('btnDriverRental');
            const roleNow = (localStorage.getItem('userRole') || '').toLowerCase();

            driverRentalBtn.onclick = () => {
            // create overlay with iframe so the rental page is shown as a centered modal
            try {
                // prevent duplicates
                if (document.getElementById('driverRentalOverlay')) return;

                const overlay = document.createElement('div');
                overlay.id = 'driverRentalOverlay';
                overlay.style.position = 'fixed';
                overlay.style.inset = '0';
                overlay.style.zIndex = '12000';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.style.background = 'rgba(0,0,0,0.45)';

                const wrapper = document.createElement('div');
                wrapper.style.width = '95%';
                wrapper.style.maxWidth = '900px';
                wrapper.style.height = '85vh';
                wrapper.style.borderRadius = '12px';
                wrapper.style.overflow = 'hidden';
                wrapper.style.background = 'white';
                wrapper.style.boxShadow = '0 10px 40px rgba(2,6,5,0.2)';

                const iframe = document.createElement('iframe');
                iframe.src = './Driver/Driver_Rental.html'; // adjust if path differs
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.loading = 'eager';
                iframe.id = 'driverRentalIframe';

                // close helper
                function closeOverlay() {
                if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                // re-check register button state after close (in case role changed)
                try { /* re-run any UI-checks you already have */ checkRegisterFieldButton && checkRegisterFieldButton(); } catch(_) {}
                }

                // Listen for messages from iframe page (Driver_Rental.html)
                function onMessage(ev) {
                if (!ev.data) return;
                if (ev.data.type === 'driver_rental_published' || ev.data.type === 'driver_rental_published_close') {
                    // close overlay & refresh UI
                    closeOverlay();
                    window.removeEventListener('message', onMessage);
                    // optional toast
                    try { showToast && showToast('Your vehicle is now open for rental', 'green'); } catch(_) {}
                }
                if (ev.data.type === 'driver_rental_cancel') {
                    closeOverlay();
                    window.removeEventListener('message', onMessage);
                }
                }
                window.addEventListener('message', onMessage);

                wrapper.appendChild(iframe);
                overlay.appendChild(wrapper);
                document.body.appendChild(overlay);
            } catch (err) {
                console.error('Failed to open Driver Rental modal:', err);
                // fallback: navigate
                window.location.href = './Driver/Driver_Rental.html';
            }
            };

            // ---------------------- Real-time Pending Field menu control ----------------------
            let unsubscribeFieldWatcher = null;
            let unsubscribeUserWatcher = null;

            async function initPendingFieldWatcher() {
            try {
                const pendingLink = document.getElementById("pendingFieldLink");
                if (!pendingLink) return;

                const userId = localStorage.getItem("userId");
                if (!userId) return;

                // import Firestore tools
                const { db } = await import("./firebase-config.js");
                const {
                collection,
                doc,
                onSnapshot,
                query,
                where,
                getDocs,
                } = await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");

                // --- listen to user role changes in realtime ---
                const userRef = doc(db, "users", userId);
                if (unsubscribeUserWatcher) unsubscribeUserWatcher();
                unsubscribeUserWatcher = onSnapshot(userRef, (snap) => {
                const role = (snap.data()?.role || "").toLowerCase();
                localStorage.setItem("userRole", role);
                refreshPendingFieldMenu(pendingLink, db, userId, role);
                });

                // --- listen to field_applications changes in realtime ---
                const fieldsRef = collection(db, `field_applications/${userId}/fields`);
                const q = query(fieldsRef, where("status", "in", ["pending", "to edit"]));
                if (unsubscribeFieldWatcher) unsubscribeFieldWatcher();
                unsubscribeFieldWatcher = onSnapshot(q, (snap) => {
                const role = (localStorage.getItem("userRole") || "").toLowerCase();
                const hasPendingOrToEdit = !snap.empty;
                togglePendingFieldLink(pendingLink, role, hasPendingOrToEdit);
                });
            } catch (err) {
                console.error("initPendingFieldWatcher error:", err);
            }
            }

            // Helper: re-check pending fields when role changes
            function refreshPendingFieldMenu(pendingLink, db, userId, role) {
            (async () => {
                try {
                const { collection, getDocs, query, where } =
                    await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");
                const { db } = await import("./firebase-config.js");
                const q = query(
                    collection(db, `field_applications/${userId}/fields`),
                    where("status", "in", ["pending", "to edit"])
                );
                const snap = await getDocs(q);
                togglePendingFieldLink(pendingLink, role, !snap.empty);
                } catch (err) {
                console.warn("refreshPendingFieldMenu failed:", err);
                }
            })();
            }

            // Helper: show or hide link
            function togglePendingFieldLink(pendingLink, role, hasPendingOrToEdit) {
            if (!pendingLink) return;
            if (role === "handler" || hasPendingOrToEdit) {
                pendingLink.classList.remove("hidden");
                pendingLink.onclick = (e) => {
                e.preventDefault();
                window.location.href = "./Handler/Field Form.html";
                };
            } else {
                pendingLink.classList.add("hidden");
                pendingLink.onclick = null;
            }
            }

            // 🔄 Start watchers when DOM ready
            document.addEventListener("DOMContentLoaded", () => {
            setTimeout(() => {
                initPendingFieldWatcher();
            }, 400);
            });


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
                if (btnYes) {
                btnYes.addEventListener('click', async function () {
                    console.info('Logout confirm clicked');
                    try {
                    await signOut(auth);
                    console.log('✅ Firebase signOut success');
                    } catch (err) {
                    console.error('Error during Firebase sign out:', err);
                    } finally {
                    // 🧹 Clear local/session storage
                    try {
                        localStorage.clear();
                        sessionStorage.clear();
                    } catch (_) {}

                    // Optional fade effect before redirect
                    if (modal && dialog) {
                        dialog.classList.add('opacity-0', 'scale-95');
                        modal.classList.add('opacity-0');
                    }

                    setTimeout(() => {
                        window.location.href = '../Common/farmers_login.html';
                    }, 300);
                    }
                });
                }
              } catch(_) {}
          });

          // ✅ Logout confirmation modal wiring (must be inside DOMContentLoaded)
            try {
            const logoutTrigger = document.getElementById('logoutLink');
            const modal = document.getElementById('logoutModal');
            const dialog = document.getElementById('logoutDialog');
            const btnYes = document.getElementById('logoutConfirm');
            const btnNo = document.getElementById('logoutCancel');

            function openLogout() {
                if (!modal || !dialog) return;
                modal.classList.remove('opacity-0', 'invisible');
                modal.classList.add('opacity-100', 'visible');
                dialog.classList.remove('translate-y-2', 'scale-95', 'opacity-0', 'pointer-events-none');
                dialog.classList.add('translate-y-0', 'scale-100', 'opacity-100');
            }

            function closeLogout() {
                if (!modal || !dialog) return;
                modal.classList.add('opacity-0', 'invisible');
                modal.classList.remove('opacity-100', 'visible');
                dialog.classList.add('translate-y-2', 'scale-95', 'opacity-0', 'pointer-events-none');
                dialog.classList.remove('translate-y-0', 'scale-100', 'opacity-100');
            }

            if (logoutTrigger) {
                logoutTrigger.addEventListener('click', function (e) {
                e.preventDefault(); // Prevent anchor scroll
                openLogout();
                });
            }

            if (modal) {
                modal.addEventListener('click', function (e) {
                if (e.target === modal) closeLogout();
                });
            }

            if (btnNo) {
                btnNo.addEventListener('click', function () {
                closeLogout();
                });
            }

            if (btnYes) {
                btnYes.addEventListener('click', async function () {
                console.info('Logout confirm clicked');
                try {
                    // Attempt Firebase logout if available
                    if (window.auth && window.signOut) {
                    await window.signOut(window.auth);
                    }
                } catch (err) {
                    console.error('Error during Firebase sign out:', err);
                } finally {
                    try {
                    localStorage.clear();
                    sessionStorage.clear();
                    } catch (_) {}

                    // Small fade animation before redirect
                    modal.classList.add('opacity-0');
                    dialog.classList.add('opacity-0', 'scale-95');
                    setTimeout(() => {
                    window.location.href = '../Common/farmers_login.html';
                    }, 300);
                }
                });
            }

            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') closeLogout();
            });

            } catch (err) {
            console.error('Logout modal init failed:', err);
            }

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

        // Smooth scroll for navigation links (ignore href="#" to prevent errors)
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '' || href === null) return; // ✅ ignore empty anchors
            e.preventDefault();
            try {
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            } catch (err) {
            console.warn('Smooth scroll skipped invalid selector:', href);
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
                    // simple duplicate check by sourcePath
                    if (docRefToUpdate?.path) {
                        const { query, collection, where, getDocs } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
                        const existingQ = query(collection(db, 'fields'), where('sourcePath', '==', docRefToUpdate.path));
                        const existingSnap = await getDocs(existingQ);
                        if (!existingSnap.empty) {
                        console.info('Top-level fields doc already exists for', docRefToUpdate.path);
                        // skip addDoc - but still send notification
                        skipAddToFields = true;
                        }
                    }
                    } catch (err) {
                    console.warn('Dedupe check failed (continuing):', err);
                    }

                    try {
                    // Build clean numeric coordinates (if available)
                    const latNum = appData.latitude ?? appData.lat ?? null;
                    const lngNum = appData.longitude ?? appData.lng ?? null;

                    // Create a top-level 'fields' doc with explicit 'status' so lobby can filter
                    await addDoc(collection(db, 'fields'), {
                        userId: appData.requestedBy || appData.userId || appData.requester || null,
                        barangay: appData.barangay || appData.location || null,
                        size: appData.field_size || appData.size || appData.fieldSize || null,
                        terrain: appData.terrain_type || appData.terrain || null,
                        lat: typeof latNum === 'string' ? parseFloat(latNum) : latNum,
                        lng: typeof lngNum === 'string' ? parseFloat(lngNum) : lngNum,
                        registeredAt: serverTimestamp(),
                        applicantName: appData.applicantName || appData.requester || appData.requestedBy || null,

                        // NEW: status + dedupe info
                        status: 'reviewed',
                        sourcePath: docRefToUpdate?.path || null,   // e.g. field_applications/{uid}/fields/{fieldId}
                        sourceDocId: docRefToUpdate?.id || null
                    });
                    } catch (e) {
                    console.warn('Adding to top-level fields collection failed (best-effort):', e);
                    }
                });
            }
        })();

        // ---------------------- Pending Field menu control ----------------------
        // Shows "Pending Field Registration" only for:
        // - users with role 'handler'
        // - users with field application status 'pending' or 'to edit'
        async function updatePendingFieldMenu() {
        try {
            const pendingLink = document.getElementById('pendingFieldLink');
            if (!pendingLink) return;

            const userId = localStorage.getItem('userId');
            const role = (localStorage.getItem('userRole') || '').toLowerCase();

            let hasPendingOrToEdit = false;
            if (userId) {
            try {
                const { db } = await import('./firebase-config.js');
                const { collection, getDocs, query, where } =
                await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

                // 🟢 Match both 'pending' and 'to edit' statuses
                const q = query(
                collection(db, `field_applications/${userId}/fields`),
                where('status', 'in', ['pending', 'to edit'])
                );

                const snap = await getDocs(q);
                hasPendingOrToEdit = !snap.empty;
            } catch (err) {
                console.warn('⚠️ Failed to check pending/to edit fields:', err);
            }
            }

            // 🟢 Show if role = handler OR has pending/to edit field
            if (role === 'handler' || hasPendingOrToEdit) {
            pendingLink.classList.remove('hidden');
            pendingLink.onclick = (e) => {
                e.preventDefault();
                window.location.href = '../../frontend/Handler/field_form.html';
            };
            } else {
            pendingLink.classList.add('hidden');
            pendingLink.onclick = null;
            }
        } catch (err) {
            console.error('updatePendingFieldMenu error:', err);
        }
        }

        // 🧠 Call it when page loads
        document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            try { updatePendingFieldMenu(); } catch (_) {}
        }, 200);
        });

        // small UI helpers for feedback modal
        function showInlineError(msg) {
            // temporary place the message in feedbackHint
                try {
                    const hint = document.getElementById('feedbackHint');
                    if (!hint) return showPopupMessage(msg, 'info');
                    hint.textContent = msg;
                    hint.classList.add('text-red-600');
                    setTimeout(() => { hint.textContent = "This pops up above the smile icon. Your input helps improve CaneMap."; hint.classList.remove('text-red-600'); }, 3500);
                } catch (_) { showPopupMessage(msg, 'info'); }
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

        // =========================
        // Driver badge eligibility + UX improvements
        // =========================
        async function checkDriverBadgeEligibility() {
        try {
            const userId = localStorage.getItem('userId');
            const userRole = (localStorage.getItem('userRole') || '').toLowerCase();

            // try two selectors: the hero anchor and the explicit apply button (robust)
            const driverAnchor = document.querySelector('#driver-badge a[href*="Driver_Badge.html"]');
            const applyBtn = document.getElementById('btnApplyDriver');
            const candidates = [driverAnchor, applyBtn].filter(Boolean);
            if (!candidates.length || !userId) return;

            // Roles not allowed
            const blockedRoles = ['sra', 'handler', 'worker'];
            if (blockedRoles.includes(userRole)) {
            const message = `You cannot apply for a Driver’s Badge with your current role: “${userRole}”. Only Drivers or Farmers are eligible.`;
            candidates.forEach(btn => disableDriverBtn(btn, message));
            return;
            }

            // Check pending field joins / field applications
            const { db } = await import('./firebase-config.js');
            const { collection, getDocs, query, where } =
            await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

            let hasPendingJoin = false;
            let hasPendingField = false;

            // field_joins subcollection pending
            try {
            const joinsSnap = await getDocs(collection(db, `field_joins/${userId}/join_fields`));
            joinsSnap.forEach(d => {
                const data = d.data();
                if (data.status?.toLowerCase() === 'pending') hasPendingJoin = true;
            });
            } catch (_) { /* ignore individual query failures */ }

            // field_applications pending OR to edit
            try {
            const fieldSnap = await getDocs(
                query(
                collection(db, `field_applications/${userId}/fields`),
                where('status', 'in', ['pending', 'to edit'])
                )
            );
            if (!fieldSnap.empty) hasPendingField = true;
            } catch (_) {}

            if (hasPendingJoin || hasPendingField) {
            const reason = hasPendingJoin ? 'a pending field join request' : 'a pending field application';
            const message = `You can’t apply for a Driver’s Badge while you have ${reason}. Please wait for approval.`;
            candidates.forEach(btn => disableDriverBtn(btn, message));
            return;
            }

            // eligible -> enable all candidates
            candidates.forEach(btn => enableDriverBtn(btn));
        } catch (err) {
            console.error('checkDriverBadgeEligibility() failed:', err);
        }
        }

        function disableDriverBtn(btn, message) {
        try {
            // visually disable
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.style.backgroundColor = '#9ca3af';

            // add accessibility + hover tooltip
            btn.setAttribute('aria-disabled', 'true');
            btn.setAttribute('title', message);
            btn.setAttribute('data-disabled-reason', message);

            // ✅ Important: keep pointer events ON so hover tooltip works!
            // So remove this line if you had it before:
            // btn.style.pointerEvents = 'none';

            // Prevent clicks (but allow hover)
            const guardName = '__driver_btn_guard';
            if (!btn[guardName]) {
            const onAttempt = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // show user-friendly toast or alert when they click
                showToast(`⚠️ ${message}`, 'gray');
            };
            btn.addEventListener('click', onAttempt);
            btn[guardName] = onAttempt;
            }
        } catch (err) {
            console.warn('disableDriverBtn error', err);
        }
        }


        function enableDriverBtn(btn) {
        try {
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.style.pointerEvents = '';
            btn.style.backgroundColor = '';
            btn.removeAttribute('aria-disabled');
            btn.removeAttribute('title');
            btn.removeAttribute('data-disabled-reason');

            const guardName = '__driver_btn_guard';
            if (btn[guardName]) {
            btn.removeEventListener('click', btn[guardName]);
            delete btn[guardName];
            }
        } catch (err) { console.warn('enableDriverBtn error', err); }
        }

        // Ensure realtime watchers re-check eligibility (watchPendingConflicts already exists)
        (function ensureRealtimeBadgeRecheck() {
        // if you have watchPendingConflicts(), make it call this when it updates localStorage, but also attach a mutation observer
        try {
            // Re-run check on load
            document.addEventListener('DOMContentLoaded', () => checkDriverBadgeEligibility());

            // Listen for localStorage updates (some of your watchers write pending flags there)
            window.addEventListener('storage', (ev) => {
            if (ev.key === 'pendingWorker' || ev.key === 'pendingDriver' || ev.key === 'userRole') {
                checkDriverBadgeEligibility();
            }
            });

            // If your watchPendingConflicts() updates values in code (not via localStorage storage event), call checkDriverBadgeEligibility() at the end of that watcher.
            // In your watchPendingConflicts() implementation you already set localStorage; that triggers the storage event in other windows, but not same window.
            // Therefore, call it once more (somewhere inside watchPendingConflicts after the localStorage.setItem calls):
            //    checkDriverBadgeEligibility();
            //
            // I left that line commented to avoid duplication here — but below I call it once after a brief timeout so everything has initialized.
            setTimeout(() => checkDriverBadgeEligibility(), 400);
        } catch (_) {}
        })();


        // -----------------------------
        // Register Field button gating
        // -----------------------------
        function disableRegisterBtn(btn, message) {
            try {
                // Make button visibly disabled (gray background)
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                btn.style.backgroundColor = '#9ca3af';
                btn.style.pointerEvents = 'auto'; // allow hover for tooltip

                // Accessibility and tooltip
                btn.setAttribute('aria-disabled', 'true');
                btn.setAttribute('title', message);
                btn.setAttribute('data-disabled-reason', message);

                // Prevent onclick/redirect
                const guardName = '__register_btn_guard';
                if (!btn[guardName]) {
                    const onAttempt = (e) => {
                        e.preventDefault();
                        e.stopImmediatePropagation(); // stops inline onclick
                        e.stopPropagation();
                        btn.blur();

                        // Prefix message with ⚠️ and show same gray toast style
                        const toastMsg = `⚠️ ${message}`;
                            if (typeof showToast === 'function') {
                            // Same look as Driver Badge: gray bg, top position
                            showToast(toastMsg, 'gray'); 
                        } else {
                            showToast(toastMsg, 'gray');
                        }
                    };
                    // Capture phase ensures this runs before inline onclick
                    btn.addEventListener('click', onAttempt, true);
                    btn[guardName] = onAttempt;
                }
            } catch (err) {
                console.warn('disableRegisterBtn error', err);
            }
        }


        function enableRegisterBtn(btn) {
            try {
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                btn.style.pointerEvents = '';
                btn.style.backgroundColor = '';
                btn.removeAttribute('aria-disabled');
                btn.removeAttribute('title');
                btn.removeAttribute('data-disabled-reason');
                const guardName = '__register_btn_guard';
                if (btn[guardName]) {
                    btn.removeEventListener('click', btn[guardName]);
                    delete btn[guardName];
                }
            } catch (err) {
                console.warn('enableRegisterBtn error', err);
            }
        }

        // Main check function: run on load and when role/pending flags change.
        // Rules:
        // - driver/sra/worker => DISABLE (can't register field)
        // - farmer + pendingWorker/join => DISABLE
        // - farmer + pendingDriver badge => DISABLE
        // - farmer (no pending) => ENABLE
        // - handler => ENABLE
        async function checkRegisterFieldButton() {
            try {
                const btn = document.getElementById('btnRegisterField');
                if (!btn) return; // element not present

                // read role and pending flags (your watchers set these in localStorage / watchers exist)
                const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
                // the watchPendingConflicts() in your file writes these keys; they may be boolean string or boolean
                const pendingWorker = localStorage.getItem('pendingWorker') === 'true' || localStorage.getItem('pendingWorker') === true;
                const pendingDriver = localStorage.getItem('pendingDriver') === 'true' || localStorage.getItem('pendingDriver') === true;

                // Normalize role to expected values
                const normalizedRole = userRole || '';

                // 1) Roles that must be blocked (drivers, sra, worker)
                const blockedRoles = ['driver', 'sra', 'worker'];
                if (blockedRoles.includes(normalizedRole)) {
                    const message = `You cannot register a field with your current role: “${userRole}”. Only Handlers or Farmers are eligible.`;
                    disableRegisterBtn(btn, message);
                    return;
                }

                // 2) Handler -> allowed
                if (normalizedRole === 'handler') {
                    enableRegisterBtn(btn);
                    return;
                }

                // 3) Farmer cases (default to farmer if not other roles)
                // Farmer with pending join
                if (normalizedRole === 'farmer' && pendingWorker) {
                    const message = 'You have a pending field join request. Please wait for approval before registering a field.';
                    disableRegisterBtn(btn, message);
                    return;
                }

                // Farmer with pending driver badge (block if pendingDriver true)
                if (normalizedRole === 'farmer' && pendingDriver) {
                    const message = 'You have a pending Driver’s Badge application. Please wait for approval before registering a field.';
                    disableRegisterBtn(btn, message);
                    return;
                }

                // Default: allow (Farmer without pendings or any other allowed role)
                enableRegisterBtn(btn);
            } catch (err) {
                console.error('checkRegisterFieldButton() failed:', err);
            }
        }

        // Hook it into lifecycle: run on DOMContentLoaded and when pending flags/role change in localStorage
        document.addEventListener('DOMContentLoaded', () => {
            // run a bit after your other startup checks to allow watchers to populate localStorage
            setTimeout(() => checkRegisterFieldButton(), 250);
        });

        // Watch for storage changes from your Firestore watchers (they write pendingDriver/pendingWorker/userRole)
        window.addEventListener('storage', (ev) => {
            if (ev.key === 'pendingWorker' || ev.key === 'pendingDriver' || ev.key === 'userRole') {
                checkRegisterFieldButton();
            }
        });

        // Also call it at the end of watchPendingConflicts() or where you set localStorage so same-window updates recheck.
        // For example, where you currently call localStorage.setItem('pendingWorker', hasPendingWorker)
        // and localStorage.setItem('pendingDriver', hasPendingDriver') — after those lines ensure you call checkRegisterFieldButton()
        // If you cannot edit the watcher, this next call ensures re-check in same-window after a short timeout:
        setTimeout(() => checkRegisterFieldButton(), 600);

        // ------------------------------------------
        // AUTO-REFRESH BUTTON STATES WHEN ROLE CHANGES
        // ------------------------------------------
        function autoRefreshAllButtons() {
            const recheckAll = () => {
                checkDriverBadgeEligibility();
                checkRegisterFieldButton();
                checkJoinFieldButton();
            };

            // Run on page load
            document.addEventListener('DOMContentLoaded', () => setTimeout(recheckAll, 400));

            // Run when localStorage changes (cross-tab or watcher)
            window.addEventListener('storage', (ev) => {
                if (['userRole', 'pendingWorker', 'pendingDriver'].includes(ev.key)) {
                    recheckAll();
                }
            });

            // Same-tab live watcher
            setInterval(() => {
                const currentRole = (localStorage.getItem('userRole') || '').toLowerCase();
                if (autoRefreshAllButtons._lastRole !== currentRole) {
                    autoRefreshAllButtons._lastRole = currentRole;
                    recheckAll();
                }
            }, 1000);
        }
        autoRefreshAllButtons();


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
              showPopupMessage("All notifications are already read.", 'info');
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

// --- Fix undefined global references ---
try {
  if (typeof checkDriverBadgeEligibility === 'function') {
    window.checkDriverBadgeEligibility = checkDriverBadgeEligibility;
  } else {
    window.checkDriverBadgeEligibility = async function() {};
  }

  if (typeof checkJoinFieldButton === 'function') {
    window.checkJoinFieldButton = checkJoinFieldButton;
  } else {
    window.checkJoinFieldButton = function() {};
  }

  if (typeof recheckAll === 'function') {
    window.recheckAll = recheckAll;
  }
} catch (e) {
  console.warn('Global export fallback error:', e);
}

function checkJoinFieldButton() {
  try {
    const role = (localStorage.getItem('userRole') || '').toLowerCase();
    const buttons = document.querySelectorAll('.join-field-button, #joinBtn');
    buttons.forEach(btn => {
      if (role === 'sra' || role === 'handler') {
        btn.style.display = 'none';
      } else {
        btn.style.display = '';
      }
    });
  } catch (err) {
    console.warn('checkJoinFieldButton error:', err);
  }
}
