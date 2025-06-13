// Register service worker for caching
if ('serviceWorker' in navigator) {
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
    const map = L.map('map', { zoomControl: false }).setView([20, 0], 3);
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Add this after map initialization
    map.whenReady(() => {
        if (document.body.contains(mapLoading)) {
            document.body.removeChild(mapLoading);
        }
        
        // Clean attribution text of any unwanted symbols
        const attribution = document.querySelector('.leaflet-control-attribution');
        if (attribution) {
            // Remove any emoji or flag characters
            attribution.innerHTML = attribution.innerHTML.replace(/[\u{1F1E6}-\u{1F1FF}][\u{1F1E6}-\u{1F1FF}]/gu, '');
            attribution.innerHTML = attribution.innerHTML.replace(/🇺🇦/g, '');
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
    let activeLocationId = null;

    const MARKER_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);

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


    const addMarkerToMap = (location) => {
        const charCodeSum = location.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const color = `color-${MARKER_COLORS[charCodeSum % MARKER_COLORS.length]}`;
        const icon = L.divIcon({ className: `mapchan-marker ${color}`, iconSize: [18, 18], iconAnchor: [9, 9] });
        const marker = L.marker([location.latitude, location.longitude], { icon }).addTo(map);
        marker.on('click', () => openViewModal(location));
    };

    const openViewModal = async (location) => {
        activeLocationId = location.id;
        document.getElementById('modal-image').style.backgroundImage = `url(${location.imageUrl})`;
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
            commentsList.innerHTML = '';
            if (comments.length === 0) { commentsList.innerHTML = '<em>No comments yet.</em>'; }
            else { comments.forEach(comment => { const div = document.createElement('div'); div.className = 'comment'; div.innerHTML = `<span class="comment-handle">${comment.handle}:</span> <p>${comment.comment}</p>`; commentsList.appendChild(div); }); }
        } catch (e) { commentsList.innerHTML = '<em>Could not load comments.</em>'; 
         viewModal.style.display = 'flex';
 		 viewModal.setAttribute('aria-hidden', 'false');
 		 document.getElementById('modal-title').focus();
}

    };

    const openAddModal = (latlng) => {
        if (tempMarker) map.removeLayer(tempMarker);
        tempMarker = L.marker(latlng).addTo(map);
        document.getElementById('latitude').value = latlng.lat;
        document.getElementById('longitude').value = latlng.lng;
        addModal.style.display = 'flex';
        addModal.setAttribute('aria-hidden', 'false');
        document.getElementById('name').focus();
    };

    const closeModal = () => {
        addModal.style.display = 'none';
        viewModal.style.display = 'none';
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
        map.flyTo([20, 0], 3);
    });

    locateUserBtn.addEventListener('click', () => {
        triggerHaptic();
        if (!navigator.geolocation) return showToast('Geolocation is not supported by your browser.');
        locateUserBtn.textContent = '..';
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                map.flyTo([latitude, longitude], 15);
                const userIcon = L.divIcon({ className: 'mapchan-marker color-white', iconSize: [18, 18], iconAnchor: [9, 9] });
                L.marker([latitude, longitude], { icon: userIcon }).addTo(map).bindPopup('<b>You are here.</b>').openPopup();
                locateUserBtn.textContent = '◎';
            },
            () => { showToast('Unable to retrieve your location.'); locateUserBtn.textContent = '◎'; }
        );
    });

    fetch('/api/locations').then(res => res.json()).then(locations => locations.forEach(addMarkerToMap));
});
