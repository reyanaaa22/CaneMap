
        // Import Firebase services from centralized config
        import { collection, query, where, orderBy, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
        
        // Firebase services are available from firebase-config.js
        // Listen for notifications for the logged-in user
        function listenNotifications() {
            const userName = localStorage.getItem('farmerName') || 'Farmer Name';
            const notificationsQuery = query(
                collection(db, 'notifications'),
                where('recipient', '==', userName),
                orderBy('timestamp', 'desc')
            );
            onSnapshot(notificationsQuery, snapshot => {
                    const container = document.querySelector('.space-y-4');
                    if (!container) return;
                    container.innerHTML = '';
                    snapshot.forEach(doc => {
                        const notif = doc.data();
                        container.innerHTML += `
                            <div class=\"flex items-start space-x-3\">
                                <div class=\"w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1\">
                                    <i class=\"fas fa-bell text-green-600 text-xs\"></i>
                                </div>
                                <div>
                                    <h4 class=\"font-medium text-gray-800\">${notif.title}</h4>
                                    <p class=\"text-sm text-gray-600\">${notif.body}</p>
                                    <span class=\"text-xs text-gray-400\">${new Date(notif.timestamp.seconds * 1000).toLocaleString()}</span>
                                </div>
                            </div>
                        `;
                    });
                });
        }
        // Initialize map
        let map;
        function initMap() {
            map = L.map('map').setView([12.8797, 121.7740], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);
            // Only show fields registered to the current user
            const userName = localStorage.getItem('farmerName') || 'Farmer Name';
            // Example: fetch registered fields from Firestore
            const fieldsQuery = query(collection(db, 'fields'), where('owner', '==', userName));
            getDocs(fieldsQuery).then(snapshot => {
                snapshot.forEach(doc => {
                    const field = doc.data();
                    const marker = L.marker([field.lat, field.lng])
                        .addTo(map)
                        .bindPopup(`<b>${field.name}</b><br>Sugarcane Field`);
                    const bounds = [
                        [field.lat - 0.01, field.lng - 0.01],
                        [field.lat + 0.01, field.lng + 0.01]
                    ];
                    L.rectangle(bounds, { color: '#666', weight: 1, fillOpacity: 0.1 }).addTo(map);
                });
            });
        }
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
                        errorMsg += `<br><span class='text-xs text-gray-500'>API: ${data.message}</span>`;
                    }
                    weatherContainer.innerHTML = `<div class='text-red-500'>${errorMsg}</div>`;
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
                        <div class=\"flex items-center justify-between\">
                            <div class=\"flex items-center space-x-3\">
                                <img src=\"https://openweathermap.org/img/wn/${icon}@2x.png\" alt=\"${desc}\" class=\"w-8 h-8\" />
                                <span class=\"font-medium text-gray-700\">${dayNames[idx]}</span>
                            </div>
                            <span class=\"text-gray-600\">${temp} - ${desc}</span>
                        </div>
                    `;
                }).join('');
                weatherContainer.innerHTML = html;
            } catch (error) {
                console.error('Error fetching weather:', error);
                document.getElementById('weatherForecast').innerHTML = `<div class='text-red-500'>Weather data unavailable.<br><span class='text-xs text-gray-500'>${error}</span></div>`;
            }
        }
        // Features carousel functionality
        function scrollFeatures(direction) {
            const carousel = document.getElementById('featuresCarousel');
            const scrollAmount = 320;
            if (direction === 'left') {
                carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
            } else {
                carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
            }
        }
        // Smooth scrolling for navigation links
        function smoothScroll(targetId) {
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }
        // Scroll to top functionality
        function scrollToTop() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        // Update user name from localStorage or session
        function updateUserName() {
            const userName = localStorage.getItem('farmerName') || 'Farmer Name';
            document.getElementById('userName').textContent = userName;
        }
        // Initialize everything when page loads
        document.addEventListener('DOMContentLoaded', function() {
            initMap();
            getWeather();
            updateUserName();
            listenNotifications();
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    e.preventDefault();
                    const targetId = this.getAttribute('href').substring(1);
                    smoothScroll(targetId);
                });
            });
        });
        window.addEventListener('scroll', function() {
            const header = document.querySelector('header');
            if (window.scrollY > 0) {
                header.classList.add('shadow-lg');
            } else {
                header.classList.remove('shadow-lg');
            }
        });

        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'cane-green': '#28a745',
                        'cane-dark': '#1e7e34',
                        'cane-light': '#d4edda'
                    }
                }
            }
        }
    
