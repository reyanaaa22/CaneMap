
        // Scroll animations (define early and run immediately to avoid hidden content if later errors occur)
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
                const apiKey = '2d59a2816a02c3178386f3d51233b2ea';
                const lat = 11.0064; // Ormoc City latitude
                const lon = 124.6075; // Ormoc City longitude
                const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
                const response = await fetch(url);
                const data = await response.json();
                const weatherContainer = document.getElementById('weatherForecast');
                
                if (!data.list) {
                    let errorMsg = 'Weather data unavailable.';
                    if (data.message) {
                        errorMsg += `<br><span class='text-xs text-[var(--cane-600)]'>API: ${data.message}</span>`;
                    }
                    if (weatherContainer) {
                        weatherContainer.innerHTML = `<div class='text-[var(--cane-700)] bg-[var(--cane-50)] p-3 rounded-lg border border-[var(--cane-200)]'>${errorMsg}</div>`;
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
                const dayNames = ['Today', 'Tomorrow', new Date(dayKeys[2]).toLocaleDateString('en-US', { weekday: 'long' })];
                
                const html = dayKeys.map((key, idx) => {
                    // Use the forecast closest to noon for each day
                    const forecasts = days[key];
                    let forecast = forecasts.find(f => new Date(f.dt * 1000).getHours() === 12) || forecasts[Math.floor(forecasts.length / 2)];
                    const temp = `${Math.round(forecast.main.temp_min)}°C / ${Math.round(forecast.main.temp_max)}°C`;
                    const icon = forecast.weather[0].icon;
                    const desc = forecast.weather[0].description;
                    return `
                        <div class="flex items-center justify-between p-2 bg-gradient-to-r from-[var(--cane-50)] to-[var(--cane-100)] rounded-lg border border-[var(--cane-200)]">
                            <div class="flex items-center space-x-2">
                                <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${desc}" class="w-6 h-6" />
                                <span class="font-medium text-[var(--cane-800)] text-sm">${dayNames[idx]}</span>
                            </div>
                            <div class="text-right">
                                <div class="text-[var(--cane-700)] font-semibold text-sm">${temp}</div>
                                <div class="text-[var(--cane-600)] text-xs">${desc}</div>
                            </div>
                        </div>
                    `;
                }).join('');
                
                if (weatherContainer) weatherContainer.innerHTML = html;
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
        function initMap() {
            try {
                if (map) return;
                const mapContainer = document.getElementById('map');
                if (!mapContainer) return;
                mapContainer.innerHTML = '';
                map = L.map('map').setView([11.0064, 124.6075], 12);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
                // Custom cane pin relative to frontend/Common/lobby.html
                const caneIcon = L.icon({
                    iconUrl: '../img/PIN.png',
                    iconSize: [40, 40],
                    iconAnchor: [20, 38],
                    popupAnchor: [0, -32]
                });
                L.marker([11.0064, 124.6075], { icon: caneIcon }).addTo(map)
                  .bindPopup('<b>Ormoc City</b><br>Leyte, Philippines<br><small>SRA Ormoc Mill District</small>')
                  .openPopup();
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
            const userName = localStorage.getItem('farmerName') || 'Farmer Name';
            const userNameElements = document.querySelectorAll('#userName, #dropdownUserName');
            userNameElements.forEach(element => { if (element) element.textContent = userName; });
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
    
