const POINTS_MIN_ZOOM = 9;
const pointMarkers = {};
const pointsData = {};

let activePopup = null;
let pendingPointId = null;

function createMarkerElement(point) {
    const el = document.createElement('div');
    el.className = 'point-marker' + (point.photo_filename ? ' has-photo' : '');
    el.dataset.pointId = point.id;
    return el;
}

function addPointToMap(point) {
    pointsData[point.id] = point;

    const el = createMarkerElement(point);
    const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([point.lon, point.lat])
        .addTo(map);

    marker.on('dragend', function () {
        const { lat, lng } = marker.getLngLat();
        window.api.update_point_position(point.id, lat, lng);
        pointsData[point.id].lat = lat;
        pointsData[point.id].lon = lng;
        if (activePopup && String(activePopup._pointId) === String(point.id)) {
            openPointPopup(pointsData[point.id]);
        }
    });

    el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (point.id !== pendingPointId) {
            pendingPointId = null;
        }
        openPointPopup(pointsData[point.id]);
    });

    pointMarkers[point.id] = marker;
    updateMarkerVisibility();
}

function loadPoints() {
    window.api.get_points(function (result) {
        JSON.parse(result).forEach(addPointToMap);
        refreshPointsList();
    });
}

function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function buildPopupContent(point) {
    const container = document.createElement('div');
    container.className = 'point-popup';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'point-popup-name';
    nameInput.value = point.name;
    nameInput.addEventListener('change', function () {
        const newName = nameInput.value.trim() || 'Point sans nom';
        window.api.rename_point(point.id, newName);
        pointsData[point.id].name = newName;
        refreshPointsList();
    });
    container.appendChild(nameInput);

    if (point.photo_url) {
        const img = document.createElement('img');
        img.src = point.photo_url;
        container.appendChild(img);
    } else {
        const placeholder = document.createElement('label');
        placeholder.className = 'photo-placeholder';
        placeholder.textContent = '+';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', async function (e) {
            const file = e.target.files[0];
            if (!file) return;
            const dataUrl = await readFileAsDataURL(file);
            window.api.add_photo_from_data(point.id, file.name, dataUrl, function (result) {
                const photoUrl = JSON.parse(result);
                pointsData[point.id].photo_url = photoUrl;
                pointMarkers[point.id].getElement().classList.add('has-photo');
                openPointPopup(pointsData[point.id]);
            });
        });

        placeholder.appendChild(fileInput);
        container.appendChild(placeholder);
    }

    const coords = document.createElement('p');
    coords.textContent = `Lat : ${point.lat.toFixed(5)} — Lon : ${point.lon.toFixed(5)}`;
    container.appendChild(coords);

    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Supprimer';
    btnDelete.addEventListener('click', function () {
        if (!confirm('Supprimer ce point ?')) return;
        window.api.delete_point(point.id);
        pointMarkers[point.id].remove();
        delete pointMarkers[point.id];
        delete pointsData[point.id];
        if (pendingPointId === point.id) pendingPointId = null;
        if (activePopup) { activePopup.remove(); activePopup = null; }
        refreshPointsList();
    });
    container.appendChild(btnDelete);

    return container;
}

function openPointPopup(point) {
    if (activePopup && String(activePopup._pointId) === String(point.id)) {
        // Même point : on actualise juste contenu/position, sans fermer la
        // popup (sinon ça déclenche 'close' et annule l'état "en attente").
        activePopup.setLngLat([point.lon, point.lat]).setDOMContent(buildPopupContent(point));
        updateMarkerVisibility();
        return;
    }

    if (activePopup) activePopup.remove();

    activePopup = new maplibregl.Popup({ closeOnClick: false })
        .setLngLat([point.lon, point.lat])
        .setDOMContent(buildPopupContent(point))
        .addTo(map);
    activePopup._pointId = point.id;
    activePopup.on('close', function () {
        if (String(pendingPointId) === String(activePopup._pointId)) {
            pendingPointId = null;
        }
        activePopup = null;
        updateMarkerVisibility();
    });

    updateMarkerVisibility();
}

function refreshPointsList() {
    const listEl = document.getElementById('points-list');
    listEl.innerHTML = '';
    Object.values(pointsData).forEach(function (point) {
        const li = document.createElement('li');
        li.textContent = point.name;
        li.addEventListener('click', function () {
            if (point.id !== pendingPointId) {
                pendingPointId = null;
            }
            map.flyTo({ center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), POINTS_MIN_ZOOM) });
            openPointPopup(point);
        });
        listEl.appendChild(li);
    });
}

document.getElementById('points-list-toggle').addEventListener('click', function () {
    const list = document.getElementById('points-list');
    const collapsed = list.style.display === 'none';
    list.style.display = collapsed ? 'block' : 'none';
    this.textContent = collapsed ? 'Points ▾' : 'Points ▸';
});

// Chaque clic sur la carte crée maintenant systématiquement un nouveau point
// (le déplacement se fait uniquement par glisser-déposer du marqueur)
map.on('click', function (e) {
    if (routeMode) return;
    const { lat, lng } = e.lngLat;
    
    if (pendingPointId !== null) {
        const marker = pointMarkers[pendingPointId];
        if (marker) {
            marker.setLngLat([lng, lat]);
            window.api.update_point_position(pendingPointId, lat, lng);
            pointsData[pendingPointId].lat = lat;
            pointsData[pendingPointId].lon = lng;
            openPointPopup(pointsData[pendingPointId]);
        }
    } else {
        window.api.add_point(lat, lng, 'Nouveau point', function (result) {
            const point = JSON.parse(result);
            pendingPointId = point.id;
            addPointToMap(point);
            openPointPopup(point);
            refreshPointsList();
        });
    }
});

function updateMarkerVisibility() {
    const manuallyVisible = document.getElementById('toggle-points').checked;
    const zoomOk = map.getZoom() >= POINTS_MIN_ZOOM;

    Object.entries(pointMarkers).forEach(function ([pointId, marker]) {
        const isActivePopup = activePopup && String(activePopup._pointId) === String(pointId);
        const shouldShow = isActivePopup || (manuallyVisible && zoomOk);
        marker.getElement().style.display = shouldShow ? 'block' : 'none';
    });
}
map.on('zoomend', updateMarkerVisibility);
document.getElementById('toggle-points').addEventListener('change', updateMarkerVisibility);

window.getPointIdAtPixel = function (x, y) {
    const el = document.elementFromPoint(x, y);
    if (el) {
        const markerEl = el.closest('.point-marker');
        if (markerEl) return markerEl.dataset.pointId;
    }
    return null;
};

window.markerHasPhoto = function (pointId, photoUrl) {
    const marker = pointMarkers[pointId];
    if (marker) marker.getElement().classList.add('has-photo');
    if (pointsData[pointId]) pointsData[pointId].photo_url = photoUrl;
    if (activePopup && String(activePopup._pointId) === String(pointId)) {
        openPointPopup(pointsData[pointId]);
    }
};

new QWebChannel(qt.webChannelTransport, function (channel) {
    window.api = channel.objects.api;
    loadPoints();
    loadRoutes();
});