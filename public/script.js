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
    const defaultZoom = isMobile ? 1 : 3; // Zoom out even more on mobile (was 2, now 1)
    const defaultCenter = isMobile ? [20, 0] : [20, 0]; // Consistent center for better mobile view
    
    const map = L.map('map', { zoomControl: false }).setView(defaultCenter, defaultZoom);
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Add this after map initialization
    map.whenReady(() => {
        if (document.body.contains(mapLoading)) {
            document.body.removeChild(mapLoading);
        }
        
        // Clean attribution text of any unwanted symbols
        const cleanAttribution = () => {
            const attribution = document.querySelector('.leaflet-control-attribution');
            if (attribution) {
                // Remove any emoji or flag characters (including Ukraine flag)
                let cleanText = attribution.innerHTML;
                // Remove Unicode flag emojis (comprehensive)
                cleanText = cleanText.replace(/[\u{1F1E6}-\u{1F1FF}][\u{1F1E6}-\u{1F1FF}]/gu, '');
                // Remove specific flag emojis by Unicode
                cleanText = cleanText.replace(/🇺🇦/g, '');
                cleanText = cleanText.replace(/\uD83C\uDDFA\uD83C\uDDE6/g, ''); // Ukraine flag
                cleanText = cleanText.replace(/\uD83C\uDDFA\uD83C\uDDFA/g, ''); // Alternative Ukraine flag
                // Remove any other emoji characters
                cleanText = cleanText.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
                // Remove any remaining flag-like patterns
                cleanText = cleanText.replace(/🏴‍☠️|🏳️‍🌈|🏳️‍⚧️/g, '');
                // Clean up extra spaces
                cleanText = cleanText.replace(/\s+/g, ' ').trim();
                // Update the attribution text
                attribution.innerHTML = cleanText;
            }
        };
        
        // Clean attribution immediately and also watch for changes
        cleanAttribution();
        
        // Use MutationObserver to clean attribution when it changes
        const observer = new MutationObserver(() => {
            setTimeout(cleanAttribution, 10); // Small delay to ensure content is loaded
        });
        const attribution = document.querySelector('.leaflet-control-attribution');
        if (attribution) {
            observer.observe(attribution, { 
                childList: true, 
                subtree: true, 
                characterData: true,
                attributes: true 
            });
        }
        
        // Also clean after a delay to catch late-loading content
        setTimeout(cleanAttribution, 500);
        setTimeout(cleanAttribution, 1000);
        setTimeout(cleanAttribution, 2000);
        
        // Debug markers after initial load (only in development)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            setTimeout(() => {
                console.log('=== DEBUGGING MAP MARKERS ===');
                debugMapMarkers();
            }, 2000); // Increased delay to not slow initial load
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

    // Define tile layers - organized by category for better UX
    const tileLayers = {
        // === DARK & SATELLITE ===
        'Default': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }),
        'ESRI Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN'
        }),
        'Night Earth': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> Dark Gray Canvas'
        }),
        
        // === STANDARD MAPS ===
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
        
        // === TOPOGRAPHIC & TERRAIN ===
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
        
        // === SPECIALIZED & MARITIME ===
        'ESRI Ocean': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | &copy; GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ'
        }),
        'Humanitarian': L.tileLayer('https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://www.hotosm.org/">HOT</a>'
        }),
        'CyclOSM': L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases">CyclOSM</a>'
        }),
        
        // === UNIQUE & ARTISTIC ===
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
        
        // === TERRAIN & ELEVATION ===
        'ESRI Terrain': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }),
        'ESRI Gray Canvas': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>'
        }),
        
        // === MINIMAL & CLEAN ===
        'CartoDB Positron (No Labels)': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd'
        }),
        'CartoDB Dark (No Labels)': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd'
        }),
        
        // === SPECIALTY LAYERS ===
        'ESRI DeLorme': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Specialty/DeLorme_World_Base_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | &copy; DeLorme'
        })
    };
    
    // Define overlay layers (these go on top of base layers)
    const overlayLayers = {
        'Railway Lines': L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>',
            subdomains: ['a', 'b', 'c'],
            maxZoom: 19,
            transparent: true,
            opacity: 0.7
        }),
        'Public Transport': L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://memomaps.de/">MeMoMaps</a>',
            maxZoom: 18,
            transparent: true,
            opacity: 0.8
        }),
        'Cycling Routes': L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://waymarkedtrails.org/">Waymarked Trails</a>',
            maxZoom: 18,
            transparent: true,
            opacity: 0.8
        }),
        'Hiking Trails': L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://waymarkedtrails.org/">Waymarked Trails</a>',
            maxZoom: 18,
            transparent: true,
            opacity: 0.8
        })
    };
    
    // Add default layer (Dark)
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

    // Audio feedback system
    function playAudio(type) {
        try {
            const audio = new Audio();
            if (type === 'success') {
                // Generate a short success beep using Web Audio API as fallback
                generateBeep(800, 100); // Higher pitch, short duration
            } else if (type === 'error') {
                // Generate a lower error beep
                generateBeep(300, 200); // Lower pitch, longer duration
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

    // Force map to recalculate positions
    const forceMapUpdate = () => {
        console.log('Forcing map update...');
        map.invalidateSize();
        setTimeout(() => {
            map.eachLayer((layer) => {
                if (layer instanceof L.Marker) {
                    console.log('Found marker at:', layer.getLatLng());
                    const element = layer._icon;
                    if (element) {
                        console.log('Marker element transform:', element.style.transform);
                    }
                }
            });
        }, 100);
    };

    // Global debug function
    window.debugAllMarkers = () => {
        console.log('=== DEBUGGING ALL MARKERS ===');
        if (window.debugMarkers) {
            console.log(`Total stored markers: ${window.debugMarkers.length}`);
            window.debugMarkers.forEach((markerInfo, index) => {
                console.log(`\n--- Marker ${index + 1}: ${markerInfo.name} ---`);
                console.log('ID:', markerInfo.id);
                console.log('Coordinates:', markerInfo.coordinates);
                console.log('Leaflet position:', markerInfo.marker.getLatLng());
                console.log('On map:', map.hasLayer(markerInfo.marker));
                
                const element = markerInfo.marker._icon;
                if (element) {
                    console.log('DOM element exists:', !!element);
                    console.log('DOM transform:', element.style.transform);
                    console.log('DOM classes:', element.className);
                    console.log('DOM visibility:', window.getComputedStyle(element).visibility);
                    console.log('DOM display:', window.getComputedStyle(element).display);
                    console.log('DOM position:', window.getComputedStyle(element).position);
                } else {
                    console.log('No DOM element found');
                }
            });
        }
        
        console.log('\n=== MAP LAYER COUNT ===');
        let markerCount = 0;
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                markerCount++;
            }
        });
        console.log(`Total markers on map: ${markerCount}`);
        console.log('Map bounds:', map.getBounds());
        console.log('Map center:', map.getCenter());
        console.log('Map zoom:', map.getZoom());
    };

    const addMarkerToMap = (location, index = null) => {
        // Only log in development
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isDev) {
            console.log('Adding marker:', location.name);
        }
        
        // Validate coordinates
        const lat = parseFloat(location.latitude);
        const lng = parseFloat(location.longitude);
        
        if (isNaN(lat) || isNaN(lng)) {
            console.error('Invalid coordinates - NaN:', location);
            return;
        }
        
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.error('Invalid coordinate range:', { lat, lng });
            return;
        }
        
        // Check for 0,0 coordinates which would appear top-left
        if (lat === 0 && lng === 0) {
            console.error('Coordinates are 0,0 - this will appear top-left!');
            return;
        }
        
        // Use creation time seconds for color - natural distribution!
        const getColorFromTime = (createdAt) => {
            const date = new Date(createdAt);
            const seconds = date.getSeconds(); // 0-59
            const colorIndex = seconds % MARKER_COLORS.length; // Map to 0-11
            return colorIndex;
        };
        
        const colorIndex = getColorFromTime(location.createdAt);
        const color = `color-${MARKER_COLORS[colorIndex]}`;
        
        const icon = L.divIcon({ 
            className: `mapchan-marker ${color}`, 
            iconSize: [24, 24], 
            iconAnchor: [12, 12],
            popupAnchor: [0, -12],
            html: `<div class="marker-inner"></div>`
        });
        
        // Also create a standard marker as backup for debugging
        // const standardMarker = L.marker([lat, lng]);
        const marker = L.marker([lat, lng], { icon });
        
        // Check if coordinates are within reasonable bounds for development
        if (isDev) {
            const bounds = map.getBounds();
            const point = L.latLng(lat, lng);
            console.log('Marker in view?', bounds.contains(point));
        }
        
        marker.addTo(map);
        
        // Store marker reference for debugging
        if (!window.debugMarkers) window.debugMarkers = [];
        window.debugMarkers.push({
            id: location.id,
            name: location.name,
            marker: marker,
            coordinates: [lat, lng]
        });
        
        // Get the actual DOM element position after adding to map (dev only)
        if (isDev) {
            setTimeout(() => {
                const markerElement = marker._icon;
                if (markerElement) {
                    console.log(`Marker ${location.name} added at:`, markerElement.style.transform);
                } else {
                    console.error(`Marker ${location.name} DOM element not found!`);
                }
            }, 100);
        }
        
        marker.on('click', () => {
            openViewModal(location);
        });
    };

    const openViewModal = async (location) => {
        activeLocationId = location.id;
        
        // Clear previous content
        const modalImage = document.getElementById('modal-image');
        modalImage.innerHTML = '';
        modalImage.style.backgroundImage = '';
        
        // Detect file type and display appropriate media
        const fileUrl = location.imageUrl;
        const fileExtension = fileUrl.split('.').pop().toLowerCase();
        
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(fileExtension)) {
            // Display as image
            modalImage.style.backgroundImage = `url(${fileUrl})`;
            modalImage.style.backgroundSize = 'cover';
            modalImage.style.backgroundPosition = 'center';
        } else if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(fileExtension)) {
            // Display as video
            modalImage.innerHTML = `
                <video controls style="width: 100%; height: 100%; object-fit: cover;">
                    <source src="${fileUrl}" type="video/${fileExtension === 'mov' ? 'quicktime' : fileExtension}">
                    Your browser does not support the video tag.
                </video>
            `;
        } else if (['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'].includes(fileExtension)) {
            // Display as audio with waveform background
            modalImage.innerHTML = `
                <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; background: linear-gradient(45deg, #111 25%, transparent 25%), linear-gradient(-45deg, #111 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #111 75%), linear-gradient(-45deg, transparent 75%, #111 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🎵</div>
                    <audio controls style="width: 90%;">
                        <source src="${fileUrl}" type="audio/${fileExtension}">
                        Your browser does not support the audio tag.
                    </audio>
                </div>
            `;
        } else {
            // Fallback for unknown types
            modalImage.style.backgroundImage = `url(${fileUrl})`;
            modalImage.style.backgroundSize = 'cover';
            modalImage.style.backgroundPosition = 'center';
        }
        
        document.getElementById('modal-title').textContent = location.name;
        document.getElementById('modal-description').textContent = location.description;
        document.getElementById('modal-handle').textContent = `Posted by ${location.handle}`;
        
        const reportBtn = document.getElementById('report-btn');
        reportBtn.disabled = !!sessionStorage.getItem(`reported_${location.id}`);
        reportBtn.textContent = reportBtn.disabled ? 'Reported' : 'Report Post';
        
        // Show the modal
        viewModal.style.display = 'flex';
        viewModal.setAttribute('aria-hidden', 'false');
        // Force the modal to be visible by overriding any CSS conflicts
        viewModal.style.opacity = '1';
        viewModal.style.pointerEvents = 'all';
        document.getElementById('modal-title').focus();
        
        console.log('Modal should now be visible');
        
        // Load comments
        const commentsList = document.getElementById('comments-list');
        commentsList.innerHTML = '<em>Loading...</em>';
        
        try {
            const response = await fetch(`/api/locations/${location.id}/comments`);
            const comments = await response.json();
            commentsList.innerHTML = '';
            
            if (comments.length === 0) { 
                commentsList.innerHTML = '<em>No comments yet.</em>'; 
            } else { 
                comments.forEach(comment => { 
                    const div = document.createElement('div'); 
                    div.className = 'comment'; 
                    div.innerHTML = `<span class="comment-handle">${comment.handle}:</span> <p>${comment.comment}</p>`; 
                    commentsList.appendChild(div); 
                }); 
            }
        } catch (e) { 
            console.error('Error loading comments:', e);
            commentsList.innerHTML = '<em>Could not load comments.</em>'; 
        }
    };

    const openAddModal = (latlng) => {
        if (tempMarker) map.removeLayer(tempMarker);
        // Create a temporary marker with custom styling
        const tempIcon = L.divIcon({ 
            className: 'mapchan-marker color-white', 
            iconSize: [18, 18], 
            iconAnchor: [9, 9] 
        });
        tempMarker = L.marker(latlng, { icon: tempIcon }).addTo(map);
        document.getElementById('latitude').value = latlng.lat;
        document.getElementById('longitude').value = latlng.lng;
        addModal.style.display = 'flex';
        addModal.setAttribute('aria-hidden', 'false');
        document.getElementById('name').focus();
    };

    const closeModal = () => {
        addModal.style.display = 'none';
        viewModal.style.display = 'none';
        // Reset inline styles that might override CSS
        addModal.style.opacity = '';
        viewModal.style.opacity = '';
        addModal.style.pointerEvents = '';
        viewModal.style.pointerEvents = '';
        locationForm.reset();
        commentForm.reset();
        if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
        viewModal.setAttribute('aria-hidden', 'true');
        addModal.setAttribute('aria-hidden', 'true');
        document.querySelector('#locate-user-btn').focus();
    };

    map.on('click', (e) => { if (e.originalEvent.target.classList.contains('leaflet-container')) openAddModal(e.latlng); });
    document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', closeModal));

    locationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Validate file upload
        const fileInput = document.getElementById('image-upload');
        const file = fileInput.files[0];
        
        if (!file) {
            showToast('Please select a file to upload.', 'error');
            return;
        }
        
        // Check file size (limit to 25MB for videos, 10MB for audio, 5MB for images)
        const maxSize = {
            image: 5 * 1024 * 1024,  // 5MB
            video: 25 * 1024 * 1024, // 25MB
            audio: 10 * 1024 * 1024  // 10MB
        };
        
        const fileType = file.type.split('/')[0];
        const fileSizeLimit = maxSize[fileType] || maxSize.image;
        
        if (file.size > fileSizeLimit) {
            const sizeMB = Math.round(fileSizeLimit / (1024 * 1024));
            showToast(`File too large. Max size: ${sizeMB}MB for ${fileType} files.`, 'error');
            return;
        }
        
        // Check file type by MIME type and extension (more permissive)
        const allowedTypes = [
            'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg+xml',
            'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
            'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/flac'
        ];
        
        const allowedExtensions = [
            'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg',
            'mp4', 'webm', 'ogg', 'mov', 'avi',
            'mp3', 'wav', 'aac', 'm4a', 'flac'
        ];
        
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const isValidMimeType = allowedTypes.includes(file.type);
        const isValidExtension = allowedExtensions.includes(fileExtension);
        
        console.log('File validation - Name:', file.name, 'Type:', file.type, 'Extension:', fileExtension);
        console.log('Valid MIME:', isValidMimeType, 'Valid Extension:', isValidExtension);
        
        // Accept if either MIME type OR extension is valid
        if (!isValidMimeType && !isValidExtension) {
            showToast(`Unsupported file: ${file.name} (${file.type})`, 'error');
            return;
        }
        
        triggerHaptic();
        const formData = new FormData(locationForm);
        formData.append('handle', `Anonymous#${Math.random().toString(36).substr(2, 6)}`);
        const submitButton = locationForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Uploading...';
        try {
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
        triggerHaptic();
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
                playAudio('success');
            } catch(e) { showToast('Failed to report post.', 'error'); playAudio('error'); }
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
        // Remove user location marker when resetting view
        if (userLocationMarker) {
            map.removeLayer(userLocationMarker);
            userLocationMarker = null;
        }
        map.flyTo([20, 0], 3);
    });

    locateUserBtn.addEventListener('click', () => {
        triggerHaptic();
        if (!navigator.geolocation) return showToast('Geolocation is not supported by your browser.');
        locateUserBtn.textContent = '..';
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                
                // Remove previous user location marker if it exists
                if (userLocationMarker) {
                    map.removeLayer(userLocationMarker);
                }
                
                map.flyTo([latitude, longitude], 15);
                const userIcon = L.divIcon({ 
                    className: 'mapchan-marker color-white', 
                    iconSize: [18, 18], 
                    iconAnchor: [9, 9] 
                });
                userLocationMarker = L.marker([latitude, longitude], { icon: userIcon })
                    .addTo(map)
                    .bindPopup('<b>You are here.</b>')
                    .openPopup();
                locateUserBtn.textContent = '◎';
            },
            (error) => { 
                console.log('Geolocation error:', error);
                showToast('Unable to retrieve your location.', 'error'); 
                locateUserBtn.textContent = '◎'; 
            }
        );
    });

    fetch('/api/locations')
        .then(res => {
            console.log('API Response status:', res.status);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            return res.json();
        })
        .then(locations => {
            console.log('Raw API response:', locations);
            console.log('Number of locations received:', locations.length);
            
            if (!Array.isArray(locations)) {
                console.error('Locations is not an array:', typeof locations);
                return;
            }
            
            locations.forEach((location, index) => {
                console.log(`Processing location ${index + 1}:`, {
                    id: location.id,
                    name: location.name,
                    lat: location.latitude,
                    lng: location.longitude,
                    coords: [location.latitude, location.longitude]
                });
                
                // Check for invalid coordinates
                if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
                    console.error('Invalid coordinates for location:', location);
                    return;
                }
                
                if (location.latitude === 0 && location.longitude === 0) {
                    console.warn('Location has 0,0 coordinates:', location);
                }
                
                addMarkerToMap(location, index);
            });
            
            // Force comprehensive map update after all markers are added
            setTimeout(() => {
                console.log('=== FORCING COMPREHENSIVE MAP UPDATE ===');
                forceMapUpdate();
            }, 200);
            
            // Force map to recalculate after all markers are added
            setTimeout(() => {
                console.log('Invalidating map size and refreshing...');
                map.invalidateSize();
                
                // Debug: Check marker positions after invalidation
                let markerCount = 0;
                map.eachLayer((layer) => {
                    if (layer instanceof L.Marker) {
                        markerCount++;
                        const pos = layer.getLatLng();
                        console.log(`Final marker ${markerCount} position:`, pos.lat, pos.lng);
                    }
                });
            }, 100);
            
            if (locations.length === 0) {
                console.log('No locations found in database');
            }
        })
        .catch(error => {
            console.error('Error loading locations:', error);
            showToast('Failed to load map locations', 'error');
        });
    
    // Debug function to check all markers on map
    const debugMapMarkers = () => {
        let markerCount = 0;
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                markerCount++;
                const pos = layer.getLatLng();
                console.log(`Marker ${markerCount} at:`, pos.lat, pos.lng);
                
                // Check if marker element exists and is visible
                const element = layer.getElement();
                if (element) {
                    const style = window.getComputedStyle(element);
                    console.log(`  Element visible: ${style.display !== 'none' && style.visibility !== 'hidden'}`);
                    console.log(`  Element size: ${element.offsetWidth}x${element.offsetHeight}`);
                    console.log(`  Element classes: ${element.className}`);
                } else {
                    console.log('  No DOM element found for marker!');
                }
                
                if (layer.getPopup()) {
                    console.log('  Popup:', layer.getPopup().getContent());
                }
                if (layer.options.icon && layer.options.icon.options) {
                    console.log('  Icon class:', layer.options.icon.options.className);
                }
            }
        });
        console.log(`Total markers on map: ${markerCount}`);
        return markerCount;
    };
    
    // Custom Layer Control Function
    function createCustomLayerControl(baseLayers, overlays, map) {
        const dropdownBtn = document.getElementById('layer-dropdown-btn');
        const dropdownMenu = document.getElementById('layer-dropdown-menu');
        const overlayControls = document.getElementById('overlay-controls');
        const baseLayerControls = document.getElementById('base-layer-controls');
        const currentLayerName = document.getElementById('current-layer-name');
        
        if (!dropdownBtn || !dropdownMenu) return;
        
        let currentBaseLayer = 'Default';
        let activeOverlays = new Set();
        
        // Create overlay controls
        Object.entries(overlays).forEach(([name, layer]) => {
            const option = document.createElement('div');
            option.className = 'layer-option';
            option.innerHTML = `
                <input type="checkbox" id="overlay-${name.replace(/\s+/g, '-')}" />
                <label for="overlay-${name.replace(/\s+/g, '-')}">${name}</label>
            `;
            
            const checkbox = option.querySelector('input');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    layer.addTo(map);
                    activeOverlays.add(name);
                } else {
                    map.removeLayer(layer);
                    activeOverlays.delete(name);
                }
            });
            
            overlayControls.appendChild(option);
        });
        
        // Create base layer controls
        Object.entries(baseLayers).forEach(([name, layer]) => {
            const option = document.createElement('div');
            option.className = 'layer-option';
            option.innerHTML = `
                <input type="radio" name="base-layer" id="base-${name.replace(/\s+/g, '-')}" ${name === currentBaseLayer ? 'checked' : ''} />
                <label for="base-${name.replace(/\s+/g, '-')}">${name}</label>
            `;
            
            const radio = option.querySelector('input');
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    // Remove current base layer
                    if (baseLayers[currentBaseLayer]) {
                        map.removeLayer(baseLayers[currentBaseLayer]);
                    }
                    // Add new base layer
                    layer.addTo(map);
                    currentBaseLayer = name;
                    currentLayerName.textContent = name;
                }
            });
            
            baseLayerControls.appendChild(option);
        });
        
        // Dropdown toggle functionality
        dropdownBtn.addEventListener('click', () => {
            const isActive = dropdownBtn.classList.contains('active');
            if (isActive) {
                dropdownBtn.classList.remove('active');
                dropdownMenu.classList.remove('active');
            } else {
                dropdownBtn.classList.add('active');
                dropdownMenu.classList.add('active');
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownBtn.classList.remove('active');
                dropdownMenu.classList.remove('active');
            }
        });
    }
    
    // Home View Functionality
    function initializeHomeView() {
        const resetZoomBtn = document.getElementById('reset-zoom-btn');
        
        if (!resetZoomBtn) return;
        
        let longPressTimer;
        let isLongPress = false;
        
        // Load saved home view or use defaults
        const getHomeView = () => {
            const saved = localStorage.getItem('oddmapchan-home-view');
            if (saved) {
                return JSON.parse(saved);
            }
            // Default home view
            const isMobile = window.innerWidth <= 768;
            return {
                lat: 20,
                lng: 0,
                zoom: isMobile ? 1 : 3
            };
        };
        
        // Save current view as home
        const saveHomeView = () => {
            const center = map.getCenter();
            const zoom = map.getZoom();
            const homeView = {
                lat: center.lat,
                lng: center.lng,
                zoom: zoom
            };
            localStorage.setItem('oddmapchan-home-view', JSON.stringify(homeView));
            showToast('Home view saved! 🏠', 'success');
            resetZoomBtn.style.boxShadow = '0 0 15px rgba(0, 255, 65, 0.8)';
            setTimeout(() => {
                resetZoomBtn.style.boxShadow = '';
            }, 1000);
        };
        
        // Reset to home view
        const resetToHome = () => {
            const homeView = getHomeView();
            map.setView([homeView.lat, homeView.lng], homeView.zoom);
            showToast('Returned to home view 🏠');
        };
        
        // Mouse events for long press detection
        resetZoomBtn.addEventListener('mousedown', () => {
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                saveHomeView();
                if (navigator.vibrate) navigator.vibrate(100);
            }, 800); // 800ms for long press
        });
        
        resetZoomBtn.addEventListener('mouseup', () => {
            clearTimeout(longPressTimer);
            if (!isLongPress) {
                resetToHome();
            }
        });
        
        resetZoomBtn.addEventListener('mouseleave', () => {
            clearTimeout(longPressTimer);
        });
        
        // Touch events for mobile
        resetZoomBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                saveHomeView();
                if (navigator.vibrate) navigator.vibrate(100);
            }, 800);
        });
        
        resetZoomBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            clearTimeout(longPressTimer);
            if (!isLongPress) {
                resetToHome();
            }
        });
        
        // Update tooltip
        resetZoomBtn.title = 'Click: Go Home | Long-press: Set Home';
    }
    
    // Initialize home view functionality
    initializeHomeView();
    
    // Help modal functionality
    const initializeHelpModal = () => {
        const helpModal = document.getElementById('help-modal');
        const appTitle = document.getElementById('app-title');
        
        if (!helpModal || !appTitle) {
            console.log('Help modal elements not found');
            return;
        }
        
        // Initialize tab functionality
        const initializeTabs = () => {
            const tabButtons = helpModal.querySelectorAll('.help-tab-button');
            const tabContents = helpModal.querySelectorAll('.help-tab-content');
            
            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const tabId = button.getAttribute('data-tab');
                    
                    // Remove active class from all tabs and contents
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    tabContents.forEach(content => content.classList.remove('active'));
                    
                    // Add active class to clicked tab and corresponding content
                    button.classList.add('active');
                    const targetContent = helpModal.querySelector(`#${tabId}-tab`);
                    if (targetContent) {
                        targetContent.classList.add('active');
                    }
                });
            });
        };
        
        const showHelpModal = () => {
            console.log('Opening help modal');
            helpModal.style.display = 'flex';
            helpModal.setAttribute('aria-hidden', 'false');
            playSound('success');
            if (navigator.vibrate) navigator.vibrate(50);
        };
        
        const closeHelpModal = () => {
            console.log('Closing help modal');
            helpModal.style.display = 'none';
            helpModal.setAttribute('aria-hidden', 'true');
        };
        
        // Initialize tabs
        initializeTabs();
        
        // Event listeners for help modal
        appTitle.addEventListener('click', (e) => {
            e.preventDefault();
            showHelpModal();
        });
        
        // Close help modal when clicking close button or outside
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal || e.target.classList.contains('modal-close')) {
                closeHelpModal();
            }
        });
        
        // Close help modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && helpModal.style.display === 'flex') {
                closeHelpModal();
            }
        });
        
        console.log('Help modal initialized');
    };
    
    // Initialize help modal after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeHelpModal();
            initializeHomeView();
        });
    } else {
        initializeHelpModal();
        initializeHomeView();
    }
});
