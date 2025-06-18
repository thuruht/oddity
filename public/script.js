// Register service worker for caching (only in production)
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('SW registered:', registration))
            .catch(registrationError => console.log('SW registration failed:', registrationError));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Add loading state for initial map load
    const mapLoading = document.createElement('div');
    mapLoading.id = 'map-loading';
    mapLoading.innerHTML = '<div class="spinner"></div>LOADING O.D.D. MAP';
    document.body.appendChild(mapLoading);

    const L = window.L;
    // Initialize map with mobile-responsive default view
    const isMobile = window.innerWidth <= 768;
    const defaultZoom = isMobile ? 1 : 3;
    const defaultCenter = isMobile ? [20, 0] : [20, 0];
    
    const map = L.map('map', { zoomControl: false }).setView(defaultCenter, defaultZoom);
    L.control.zoom({ position: 'topright' }).addTo(map);

    map.whenReady(() => {
        if (document.body.contains(mapLoading)) {
            document.body.removeChild(mapLoading);
        }
    });

    const addModal = document.getElementById('add-modal');
    const viewModal = document.getElementById('view-modal');
    const locationForm = document.getElementById('location-form');
    const commentForm = document.getElementById('comment-form');
    const searchForm = document.getElementById('search-form');
    const searchResultsContainer = document.getElementById('search-results');
    const resetZoomBtn = document.getElementById('reset-zoom-btn');
    const locateUserBtn = document.getElementById('locate-user-btn');
    let tempMarker = null;
    let userLocationMarker = null;
    let activeLocationId = null;

    const MARKER_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'magenta', 'lime', 'teal', 'navy'];
    
    // Helper function to get actual color values
    const getColorValue = (colorName) => {
        const colors = {
            'red': '#ff4141',
            'orange': '#ff9a00', 
            'yellow': '#f1c40f',
            'green': '#00ff41',
            'cyan': '#00bcd4',
            'blue': '#3498db',
            'purple': '#9b59b6',
            'pink': '#e91e63',
            'magenta': '#ff00ff',
            'lime': '#32cd32',
            'teal': '#008080',
            'navy': '#000080'
        };
        return colors[colorName] || '#ff0000';
    };

    // Define tile layers
    const tileLayers = {
        // New default map
        'Default': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> Dark Gray Canvas',
        }),
        // Previous default, now an option
        'Carto Dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }),
        'ESRI Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN'
        }),
        'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }),
        'OSM Germany': L.tileLayer('https://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://www.openstreetmap.de/">OpenStreetMap Deutschland</a>',
            subdomains: ['a', 'b', 'c']
        }),
        'OSM France': L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://www.openstreetmap.fr/">OpenStreetMap France</a>',
            subdomains: ['a', 'b', 'c']
        }),
        'OSM Netherlands': L.tileLayer('https://tile.openstreetmap.nl/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://openstreetmap.nl/">OpenStreetMap Nederland</a>'
        }),
        'OSM Switzerland': L.tileLayer('https://tile.osm.ch/switzerland/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://sosm.ch/">Swiss OpenStreetMap</a>'
        }),
        'Positron (Light)': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }),
        'ESRI Streets': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }),
        'OpenTopo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
        }),
        'ESRI Topo': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }),
        'USGS Topo': L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.usgs.gov/">USGS</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 16
        }),
        'ESRI Ocean': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | &copy; GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ'
        }),
        'Humanitarian': L.tileLayer('https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://www.hotosm.org/">HOT</a>'
        }),
        'CyclOSM': L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases">CyclOSM</a>'
        }),
        'Wikimedia': L.tileLayer('https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://foundation.wikimedia.org/wiki/Maps_Terms_of_Use">Wikimedia</a>',
            maxZoom: 18
        }),
        'CartoDB Voyager': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }),
        'ESRI National Geographic': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | National Geographic, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC',
            maxZoom: 16
        }),
        'OSM Bright (Mapbox Style)': L.tileLayer('https://tile.openstreetmap.bzh/br/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://tile.openstreetmap.bzh/">OSM Bzh</a>',
            maxZoom: 19
        }),
        'Spinal Map': L.tileLayer('https://tile.openstreetmap.jp/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://osm.jp/">OpenStreetMap Japan</a>',
            maxZoom: 18
        }),
        'ESRI Physical': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }),
        'ESRI Shaded Relief': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>'
        }),
        'ESRI Terrain': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }),
        'ESRI Gray Canvas': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>'
        }),
        'CartoDB Positron (No Labels)': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd'
        }),
        'CartoDB Dark (No Labels)': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd'
        }),
        'ESRI DeLorme': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Specialty/DeLorme_World_Base_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | &copy; DeLorme'
        })
    };
    
    // Define overlay layers
    // FIX: Added pane: 'overlayPane' to ensure correct transparent stacking.
    const overlayLayers = {
        'Railway Lines': L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>',
            maxZoom: 19, transparent: true, opacity: 0.7, pane: 'overlayPane'
        }),
        'Public Transport': L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://memomaps.de/">MeMoMaps</a>',
            maxZoom: 18, transparent: true, opacity: 0.8, pane: 'overlayPane'
        }),
        'Cycling Routes': L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://waymarkedtrails.org/">Waymarked Trails</a>',
            maxZoom: 18, transparent: true, opacity: 0.8, pane: 'overlayPane'
        }),
        'Hiking Trails': L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://waymarkedtrails.org/">Waymarked Trails</a>',
            maxZoom: 18, transparent: true, opacity: 0.8, pane: 'overlayPane'
        })
    };
    
    // Add default layer (now 'Night Earth', keyed as 'Default')
    tileLayers['Default'].addTo(map);
    
    // Create custom layer dropdown instead of default Leaflet control
    createCustomLayerControl(tileLayers, overlayLayers, map);

    function showToast(message, type = 'info') {
        const container = document.querySelector('.toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, 3000);
        
        if (type === 'error') {
            toast.style.backgroundColor = 'var(--danger-accent)';
            playAudio('error');
        } else if (type === 'success') {
            playAudio('success');
        }
    };
    function triggerHaptic() {
        if ('vibrate' in navigator) navigator.vibrate(20);
    }

    function playAudio(type) {
        try {
            const audio = new Audio();
            if (type === 'success') {
                generateBeep(800, 100);
            } else if (type === 'error') {
                generateBeep(300, 200);
            }
        } catch (error) {
            console.log('Audio not supported');
        }
    }

    function generateBeep(frequency, duration) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration / 1000);
        } catch (error) {
            console.log('Web Audio API not supported');
        }
    }

    const addMarkerToMap = (location) => {
        const lat = parseFloat(location.latitude);
        const lng = parseFloat(location.longitude);
        if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
            console.error('Invalid coordinates for marker:', location);
            return;
        }
        
        const getColorFromTime = (createdAt) => {
            const date = new Date(createdAt);
            const seconds = date.getSeconds();
            const colorIndex = seconds % MARKER_COLORS.length;
            return colorIndex;
        };
        
        const colorIndex = getColorFromTime(location.createdAt);
        const color = `color-${MARKER_COLORS[colorIndex]}`;
        const icon = L.divIcon({ className: `mapchan-marker ${color}`, iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12], html: `<div class="marker-inner"></div>` });
        const marker = L.marker([lat, lng], { icon });
        
        marker.addTo(map);
        marker.on('click', () => openViewModal(location));
    };

    const openViewModal = async (location) => {
        activeLocationId = location.id;
        const modalImage = document.getElementById('modal-image');
        modalImage.innerHTML = '';
        modalImage.style.backgroundImage = '';
        const fileUrl = location.imageUrl;
        const fileExtension = fileUrl.split('.').pop().toLowerCase();
        
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(fileExtension)) {
            modalImage.style.backgroundImage = `url(${fileUrl})`;
        } else if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(fileExtension)) {
            modalImage.innerHTML = `<video controls style="width: 100%; height: 100%; object-fit: cover;"><source src="${fileUrl}" type="video/${fileExtension === 'mov' ? 'quicktime' : fileExtension}"></video>`;
        } else if (['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'].includes(fileExtension)) {
            modalImage.innerHTML = `<div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; background: #1a1a1a;"><div style="font-size: 3rem; margin-bottom: 1rem;">🎵</div><audio controls style="width: 90%;"><source src="${fileUrl}" type="audio/${fileExtension}"></audio></div>`;
        } else {
            modalImage.style.backgroundImage = `url(${fileUrl})`;
        }
        
        document.getElementById('modal-title').textContent = location.name;
        document.getElementById('modal-description').textContent = location.description;
        document.getElementById('modal-handle').textContent = `Posted by ${location.handle}`;
        
        const reportBtn = document.getElementById('report-btn');
        reportBtn.disabled = !!sessionStorage.getItem(`reported_${location.id}`);
        reportBtn.textContent = reportBtn.disabled ? 'Reported' : 'Report Post';
        
        viewModal.style.display = 'flex';
        
        const commentsList = document.getElementById('comments-list');
        commentsList.innerHTML = '<em>Loading...</em>';
        try {
            const response = await fetch(`/api/locations/${location.id}/comments`);
            const comments = await response.json();
            commentsList.innerHTML = comments.length === 0 ? '<em>No comments yet.</em>' : '';
            comments.forEach(comment => { 
                const div = document.createElement('div');
                div.className = 'comment'; 
                div.innerHTML = `<span class="comment-handle">${comment.handle}:</span> <p>${comment.comment}</p>`; 
                commentsList.appendChild(div); 
            });
        } catch (e) { 
            commentsList.innerHTML = '<em>Could not load comments.</em>'; 
        }
    };

    const openAddModal = (latlng) => {
        if (tempMarker) map.removeLayer(tempMarker);
        const tempIcon = L.divIcon({ className: 'mapchan-marker color-white', iconSize: [18, 18], iconAnchor: [9, 9] });
        tempMarker = L.marker(latlng, { icon: tempIcon }).addTo(map);
        document.getElementById('latitude').value = latlng.lat;
        document.getElementById('longitude').value = latlng.lng;
        addModal.style.display = 'flex';
        document.getElementById('name').focus();
    };

    const closeModal = () => {
        addModal.style.display = 'none';
        viewModal.style.display = 'none';
        locationForm.reset();
        commentForm.reset();
        if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
    };

    map.on('click', (e) => { if (e.originalEvent.target.classList.contains('leaflet-container')) openAddModal(e.latlng); });
    document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', closeModal));

    locationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = locationForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Uploading...';
        try {
            const formData = new FormData(locationForm);
            const response = await fetch('/api/locations', { method: 'POST', body: formData });
            if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Post failed.'); }
            const newLocation = await response.json();
            addMarkerToMap(newLocation);
            closeModal();
            showToast('Pin posted.', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Post Anonymously';
        }
    });

    commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const commentInput = document.getElementById('comment-input');
        const comment = commentInput.value;
        if (!comment || !activeLocationId) return;
        const submitButton = commentForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        try {
            const response = await fetch(`/api/locations/${activeLocationId}/comments`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment })
            });
            if (!response.ok) throw new Error('Reply failed.');
            const newComment = await response.json();
            const commentsList = document.getElementById('comments-list');
            if(commentsList.querySelector('em')) commentsList.innerHTML = '';
            const div = document.createElement('div');
            div.className = 'comment';
            div.innerHTML = `<span class="comment-handle">${newComment.handle}:</span> <p>${newComment.comment}</p>`;
            commentsList.prepend(div);
            commentForm.reset();
            showToast('Reply posted.', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
    
    document.getElementById('report-btn').addEventListener('click', async () => {
        if (!activeLocationId || document.getElementById('report-btn').disabled) return;
        if (confirm('Are you sure you want to report this post? This cannot be undone.')) {
            try {
                await fetch(`/api/locations/${activeLocationId}/report`, { method: 'POST' });
                sessionStorage.setItem(`reported_${activeLocationId}`, 'true');
                document.getElementById('report-btn').disabled = true;
                document.getElementById('report-btn').textContent = 'Reported';
                showToast('Post reported.', 'success');
            } catch(e) { showToast('Failed to report post.', 'error'); }
        }
    });

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const searchInput = document.getElementById('search-input');
        const query = searchInput.value;
        if (!query) return;
        const searchButton = searchForm.querySelector('button');
        searchButton.disabled = true;
        searchButton.textContent = '...';
        searchResultsContainer.innerHTML = '';
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
            const data = await response.json();
            if (data && data.length > 0) {
                if (data.length === 1) { const { lat, lon, display_name } = data[0]; map.flyTo([lat, lon], 14); showToast(`Found: ${display_name}`); }
                else {
                    showToast(`Found ${data.length} results. Please choose one.`);
                    data.forEach(result => { const item = document.createElement('div'); item.className = 'search-result-item'; item.textContent = result.display_name; item.addEventListener('click', () => { const { lat, lon } = result; map.flyTo([lat, lon], 14); searchResultsContainer.innerHTML = ''; }); searchResultsContainer.appendChild(item); });
                }
            } else { showToast('Location not found.'); }
        } catch (error) { showToast('Error searching for location.');
        } finally {
            searchButton.disabled = false;
            searchButton.textContent = 'GO';
        }
    });

    resetZoomBtn.addEventListener('click', () => {
        triggerHaptic();
        if (userLocationMarker) { map.removeLayer(userLocationMarker); userLocationMarker = null; }
        map.flyTo([20, 0], 3);
    });

    locateUserBtn.addEventListener('click', () => {
        triggerHaptic();
        if (!navigator.geolocation) return showToast('Geolocation is not supported by your browser.');
        locateUserBtn.textContent = '..';
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                if (userLocationMarker) map.removeLayer(userLocationMarker);
                map.flyTo([latitude, longitude], 15);
                const userIcon = L.divIcon({ className: 'mapchan-marker color-white', iconSize: [18, 18], iconAnchor: [9, 9] });
                userLocationMarker = L.marker([latitude, longitude], { icon: userIcon }).addTo(map).bindPopup('<b>You are here.</b>').openPopup();
                locateUserBtn.textContent = '◎';
            },
            (error) => { 
                showToast('Unable to retrieve your location.', 'error'); 
                locateUserBtn.textContent = '◎'; 
            }
        );
    });

    fetch('/api/locations')
        .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
        .then(locations => {
            if (!Array.isArray(locations)) throw new Error('API response is not an array.');
            locations.forEach(addMarkerToMap);
        })
        .catch(error => {
            console.error('Error loading locations:', error);
            showToast('Failed to load map locations', 'error');
        });
    
    function createCustomLayerControl(baseLayers, overlays, map) {
        const dropdownBtn = document.getElementById('layer-dropdown-btn');
        const dropdownMenu = document.getElementById('layer-dropdown-menu');
        const overlayControls = document.getElementById('overlay-controls');
        const baseLayerControls = document.getElementById('base-layer-controls');
        const currentLayerName = document.getElementById('current-layer-name');
        let currentBaseLayer = 'Default';

        Object.entries(overlays).forEach(([name, layer]) => {
            const option = document.createElement('div');
            option.className = 'layer-option';
            option.innerHTML = `<input type="checkbox" id="overlay-${name.replace(/\s+/g, '-')}" /><label for="overlay-${name.replace(/\s+/g, '-')}">${name}</label>`;
            const checkbox = option.querySelector('input');
            checkbox.addEventListener('change', () => checkbox.checked ? layer.addTo(map) : map.removeLayer(layer));
            overlayControls.appendChild(option);
        });
        
        Object.entries(baseLayers).forEach(([name, layer]) => {
            const option = document.createElement('div');
            option.className = 'layer-option';
            option.innerHTML = `<input type="radio" name="base-layer" id="base-${name.replace(/\s+/g, '-')}" ${name === currentBaseLayer ? 'checked' : ''} /><label for="base-${name.replace(/\s+/g, '-')}">${name}</label>`;
            const radio = option.querySelector('input');
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    map.removeLayer(baseLayers[currentBaseLayer]);
                    layer.addTo(map);
                    currentBaseLayer = name;
                    currentLayerName.textContent = name;
                }
            });
            baseLayerControls.appendChild(option);
        });
        
        dropdownBtn.addEventListener('click', () => dropdownMenu.classList.toggle('active'));
        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('active');
            }
        });
    }
    
    function initializeHomeView() {
        const resetZoomBtn = document.getElementById('reset-zoom-btn');
        let longPressTimer;
        let isLongPress = false;
        
        const getHomeView = () => {
            const saved = localStorage.getItem('oddmapchan-home-view');
            if (saved) return JSON.parse(saved);
            const isMobile = window.innerWidth <= 768;
            return { lat: 20, lng: 0, zoom: isMobile ? 1 : 3 };
        };
        
        const saveHomeView = () => {
            const homeView = { lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() };
            localStorage.setItem('oddmapchan-home-view', JSON.stringify(homeView));
            showToast('Home view saved! 🏠', 'success');
        };
        
        const resetToHome = () => {
            const homeView = getHomeView();
            map.setView([homeView.lat, homeView.lng], homeView.zoom);
        };
        
        const startPress = (e) => {
            e.preventDefault();
            isLongPress = false;
            longPressTimer = setTimeout(() => { isLongPress = true; saveHomeView(); triggerHaptic(); }, 800);
        };

        const endPress = (e) => {
            e.preventDefault();
            clearTimeout(longPressTimer);
            if (!isLongPress) resetToHome();
        };

        resetZoomBtn.addEventListener('mousedown', startPress);
        resetZoomBtn.addEventListener('mouseup', endPress);
        resetZoomBtn.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
        resetZoomBtn.addEventListener('touchstart', startPress, { passive: false });
        resetZoomBtn.addEventListener('touchend', endPress);
    }
    
    initializeHomeView();
    
    const initializeHelpModal = () => {
        const helpModal = document.getElementById('help-modal');
        const appTitle = document.getElementById('app-title');
        
        const showHelpModal = () => { helpModal.style.display = 'flex'; };
        const closeHelpModal = () => { helpModal.style.display = 'none'; };

        const tabButtons = helpModal.querySelectorAll('.help-tab-button');
        const tabContents = helpModal.querySelectorAll('.help-tab-content');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.getAttribute('data-tab');
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                helpModal.querySelector(`#${tabId}-tab`).classList.add('active');
            });
        });
        
        appTitle.addEventListener('click', showHelpModal);
        helpModal.addEventListener('click', (e) => { if (e.target === helpModal || e.target.classList.contains('modal-close')) closeHelpModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && helpModal.style.display === 'flex') closeHelpModal(); });
    };

    initializeHelpModal();
});