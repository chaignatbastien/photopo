const POINTS_MIN_ZOOM = 13;
const pointMarkers = {};
const pointsData = {};   // { id: {id, name, lat, lon, photo_filename, photo_url} }

let pendingPointId = null;
let activePopup = null;

function createMarkerElement(point) {
    const el = document.createElement('div');
    el.className = 'point-marker' + (point.photo_filename ? ' has-photo' : '');
    el.dataset.pointId = point.id;
    return el;
}

function addPointToMap(point) {
    pointsData[point.id] = point;

    const el = createMarkerElement(point);
    const marker = new maplibregl.Marker({ element: el })
        .setLngLat([point.lon, point.lat])
        .addTo(map);

    el.addEventListener('click', function (e) {
        e.stopPropagation();
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

// ---- Popup ----
function buildPopupContent(point) {
    const container = document.createElement('div');
    container.className = 'point-popup';

    if (point.photo_url) {
        const img = document.createElement('img');
        img.src = point.photo_url;
        container.appendChild(img);
    }

    const coords = document.createElement('p');
    coords.textContent = `Lat : ${point.lat.toFixed(5)} — Lon : ${point.lon.toFixed(5)}`;
    container.appendChild(coords);

    const btnMove = document.createElement('button');
    btnMove.textContent = 'Modifier la position';
    btnMove.addEventListener('click', function () {
        pendingPointId = point.id;
        updateMarkerVisibility();
        if (activePopup) { activePopup.remove(); activePopup = null; }
    });
    container.appendChild(btnMove);

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
    if (activePopup) activePopup.remove();
    activePopup = new maplibregl.Popup({ closeOnClick: false })
        .setLngLat([point.lon, point.lat])
        .setDOMContent(buildPopupContent(point))
        .addTo(map);
    activePopup._pointId = point.id;
}

// ---- Liste latérale ----
function refreshPointsList() {
    const listEl = document.getElementById('points-list');
    listEl.innerHTML = '';
    Object.values(pointsData).forEach(function (point) {
        const li = document.createElement('li');
        li.textContent = point.name;
        li.addEventListener('click', function () {
            map.flyTo({ center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), POINTS_MIN_ZOOM) });
            openPointPopup(point);
        });
        listEl.appendChild(li);
    });
}

// ---- Clic sur la carte : crée ou déplace le point en attente ----
map.on('click', function (e) {
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
            pendingPointId = point.id;   // ← corrigé : avant addPointToMap
            addPointToMap(point);
            openPointPopup(point);
            refreshPointsList();
        });
    }
});

// ---- Affichage/masquage selon zoom + case à cocher ----
function updateMarkerVisibility() {
    const manuallyVisible = document.getElementById('toggle-points').checked;
    const zoomOk = map.getZoom() >= POINTS_MIN_ZOOM;

    Object.entries(pointMarkers).forEach(function ([pointId, marker]) {
        const isPending = String(pendingPointId) === String(pointId);
        const shouldShow = isPending || (manuallyVisible && zoomOk);
        marker.getElement().style.display = shouldShow ? 'block' : 'none';
    });
}
map.on('zoomend', updateMarkerVisibility);
document.getElementById('toggle-points').addEventListener('change', updateMarkerVisibility);

// ---- Appelées depuis Python ----
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

    if (String(pendingPointId) === String(pointId)) {
        pendingPointId = null;
        updateMarkerVisibility();
    }
    if (activePopup && String(activePopup._pointId) === String(pointId)) {
        openPointPopup(pointsData[pointId]);  // rafraîchit avec la photo affichée
    }
};

// ---- Pont Python <-> JS ----
new QWebChannel(qt.webChannelTransport, function (channel) {
    window.api = channel.objects.api;
    loadPoints();
});