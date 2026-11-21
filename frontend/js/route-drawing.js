// ---- Dessin / édition d'un itinéraire ----
// Les listeners des boutons "Commencer" / "Terminer" sont ICI, dans le même
// fichier que finishRoute, pour qu'ils ne soient jamais exécutés avant sa définition.

let routeMode = false;
let editingRouteId = null;
let currentWaypointIds = [];
let currentWaypointModes = {}; // pointId -> 'path' (routé via BRouter) ou 'free' (ligne droite)
let currentRouteGeometry = null;
let currentRouteName = 'Nouvel itinéraire';

function getRouteColor() {
    return document.getElementById('route-color').value;
}

document.getElementById('btn-start-route').addEventListener('click', function () {
    closeRoutePanel();
    routeMode = true;
    editingRouteId = null;
    currentWaypointIds = [];
    currentWaypointModes = {};
    currentRouteGeometry = null;
    currentRouteName = 'Nouvel itinéraire';
    document.getElementById('route-draw-free').checked = false;
    document.getElementById('btn-start-route').style.display = 'none';
    document.getElementById('btn-end-route').style.display = 'inline-block';
    map.getCanvas().style.cursor = 'crosshair';
    showDrawingPanel();
});

document.getElementById('btn-end-route').addEventListener('click', finishRoute);

// Projection plane approximative (suffisante à l'échelle d'un itinéraire de
// randonnée) pour pouvoir calculer une distance point-segment simplement.
function projectToPlane(lat, lon, refLat) {
    const R = 6371; // km
    return {
        x: R * (lon * Math.PI / 180) * Math.cos(refLat * Math.PI / 180),
        y: R * (lat * Math.PI / 180)
    };
}

function distancePointToSegmentKm(p, a, b) {
    const refLat = (a.lat + b.lat) / 2;
    const P = projectToPlane(p.lat, p.lon, refLat);
    const A = projectToPlane(a.lat, a.lon, refLat);
    const B = projectToPlane(b.lat, b.lon, refLat);

    const abx = B.x - A.x, aby = B.y - A.y;
    const apx = P.x - A.x, apy = P.y - A.y;
    const abLenSq = abx * abx + aby * aby;
    let t = abLenSq === 0 ? 0 : (apx * abx + apy * aby) / abLenSq;
    t = Math.max(0, Math.min(1, t));
    const dx = P.x - (A.x + t * abx);
    const dy = P.y - (A.y + t * aby);
    return Math.sqrt(dx * dx + dy * dy);
}

// Détermine où insérer un nouveau point "via" : entre les deux waypoints
// existants dont le segment est le plus proche géographiquement du clic.
function findInsertionIndex(lat, lon) {
    if (currentWaypointIds.length < 2) return currentWaypointIds.length;

    let bestIndex = currentWaypointIds.length;
    let bestDist = Infinity;
    for (let i = 0; i < currentWaypointIds.length - 1; i++) {
        const a = pointsData[currentWaypointIds[i]];
        const b = pointsData[currentWaypointIds[i + 1]];
        const dist = distancePointToSegmentKm({ lat, lon }, a, b);
        if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i + 1; // s'insère entre a et b
        }
    }
    return bestIndex;
}

function addWaypoint(lat, lon, insertAsVia) {
    const insertIndex = insertAsVia ? findInsertionIndex(lat, lon) : currentWaypointIds.length;
    const nextId = currentWaypointIds[insertIndex];   // undefined si on ajoute à la fin
    let isFree = document.getElementById('route-draw-free').checked;

    if (currentWaypointIds.length === 0) {
        isFree = false;                               // le départ n'a pas de segment d'arrivée
    } else if (nextId !== undefined) {
        if (currentWaypointModes[nextId] === 'free') {
            isFree = true;                            // on coupe un segment droit : il le reste
        } else if (isFree) {
            // via libre : les deux segments voisins deviennent droits
            currentWaypointModes[nextId] = 'free';
            pointMarkers[nextId].getElement().classList.add('free-point');
        }
    }

    const name = currentWaypointIds.length === 0 ? 'Départ' : (isFree ? 'Point libre' : 'Point');

    window.api.add_route_point(lat, lon, name, function (result) {
        const point = JSON.parse(result);
        pointsData[point.id] = point;  // réutilise le registre partagé (points.js)

        const el = createMarkerElement(point);
        if (isFree) el.classList.add('free-point');
        const marker = new maplibregl.Marker({ element: el, draggable: true })
            .setLngLat([lon, lat]).addTo(map);

        marker.on('dragend', function () {
            const { lat: newLat, lng: newLng } = marker.getLngLat();
            window.api.update_point_position(point.id, newLat, newLng);
            pointsData[point.id].lat = newLat;
            pointsData[point.id].lon = newLng;
            recalcCurrentRoute();
        });
        el.addEventListener('click', function (e) {
            e.stopPropagation();
            openPointPopup(pointsData[point.id]);
        });
        pointMarkers[point.id] = marker;
        currentWaypointModes[point.id] = isFree ? 'free' : 'path';
        currentWaypointIds.splice(insertIndex, 0, point.id);

        recalcCurrentRoute();
    });
}

// Découpe la liste de points en segments : les segments "path" (points de
// cheminement consécutifs) seront routés via BRouter ; dès qu'un point
// "libre" touche un segment, celui-ci devient une simple ligne droite.
function buildSegments(waypointIds) {
    const segments = [];
    let currentPathRun = [waypointIds[0]];

    for (let i = 1; i < waypointIds.length; i++) {
        const prevId = waypointIds[i - 1];
        const currId = waypointIds[i];
        const edgeIsFree = currentWaypointModes[currId] === 'free';

        if (edgeIsFree) {
            if (currentPathRun.length >= 2) segments.push({ type: 'path', ids: currentPathRun });
            segments.push({ type: 'straight', ids: [prevId, currId] });
            currentPathRun = [currId];
        } else {
            currentPathRun.push(currId);
        }
    }
    if (currentPathRun.length >= 2) segments.push({ type: 'path', ids: currentPathRun });
    return segments;
}

function recalcCurrentRoute() {
    if (currentWaypointIds.length < 2) {
        currentRouteGeometry = null;
        if (map.getLayer('current-route-layer')) map.removeLayer('current-route-layer');
        if (map.getSource('current-route')) map.removeSource('current-route');
        showDrawingPanel();
        return;
    }

    const segments = buildSegments(currentWaypointIds);
    const combinedCoords = [];

    function appendCoords(coords) {
        coords.forEach(function (coord) {
            const last = combinedCoords[combinedCoords.length - 1];
            if (last && last[0] === coord[0] && last[1] === coord[1]) return; // évite le doublon à la jonction
            combinedCoords.push(coord);
        });
    }

    function processNext(index) {
        if (index >= segments.length) {
            currentRouteGeometry = combinedCoords;
            drawCurrentRouteLine();
            return;
        }
        const segment = segments[index];
        if (segment.type === 'straight') {
            appendCoords(segment.ids.map(function (id) {
                return [pointsData[id].lon, pointsData[id].lat];
            }));
            processNext(index + 1);
        } else {
            const waypoints = segment.ids.map(function (id) {
                return [pointsData[id].lat, pointsData[id].lon];
            });
            window.api.calculate_route(JSON.stringify(waypoints), function (result) {
                appendCoords(JSON.parse(result));
                processNext(index + 1);
            });
        }
    }

    processNext(0);
}

function drawCurrentRouteLine() {
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: currentRouteGeometry } };
    if (map.getSource('current-route')) {
        map.getSource('current-route').setData(geojson);
    } else {
        map.addSource('current-route', { type: 'geojson', data: geojson });
        map.addLayer({
            id: 'current-route-layer', type: 'line', source: 'current-route',
            paint: { 'line-color': getRouteColor(), 'line-width': 4 }
        });
    }
    showDrawingPanel();
}

function finishRoute() {
    if (currentWaypointIds.length < 2) {
        alert("Un itinéraire nécessite au moins 2 points.");
        return;
    }

    const routeName = currentRouteName;
    const color = getRouteColor();
    const isFreeFlags = currentWaypointIds.map(function (id) { return currentWaypointModes[id] === 'free'; });

    if (editingRouteId !== null) {
        const routeId = editingRouteId;
        window.api.update_route(
            routeId, routeName, color,
            JSON.stringify(currentWaypointIds),
            JSON.stringify(isFreeFlags),
            JSON.stringify(currentRouteGeometry || []),
            function () {
                if (map.getLayer('route-' + routeId + '-layer')) {
                    map.setLayoutProperty('route-' + routeId + '-layer', 'visibility', 'visible');
                }
                selectedRouteId = routeId;
                loadRoutes();
            }
        );
    } else {
        window.api.create_route(
            routeName, color,
            JSON.stringify(currentWaypointIds),
            JSON.stringify(isFreeFlags),
            JSON.stringify(currentRouteGeometry || []),
            function (newId) {
                selectedRouteId = newId;
                loadRoutes(); 
            }
        );
    }

    if (map.getLayer('current-route-layer')) map.removeLayer('current-route-layer');
    if (map.getSource('current-route')) map.removeSource('current-route');
    hideDrawingPanel();

    routeMode = false;
    editingRouteId = null;
    currentWaypointIds = [];
    currentWaypointModes = {};
    currentRouteGeometry = null;
    currentRouteName = 'Nouvel itinéraire';
    document.getElementById('route-draw-free').checked = false;
    document.getElementById('btn-start-route').style.display = 'inline-block';
    document.getElementById('btn-end-route').style.display = 'none';
    map.getCanvas().style.cursor = '';
}

function startEditingRoute(routeId) {
    window.api.get_route_points(routeId, function (result) {
        const points = JSON.parse(result); // ordonnés, avec is_free

        closeRoutePanel();
        routeMode = true;
        editingRouteId = routeId;
        currentWaypointIds = [];
        currentWaypointModes = {};
        currentRouteGeometry = null;
        currentRouteName = routesById[routeId].name;

        points.forEach(function (point) {
            pointsData[point.id] = point;
            let marker = pointMarkers[point.id];
            if (!marker) {
                const el = createMarkerElement(point);
                marker = new maplibregl.Marker({ element: el, draggable: true })
                    .setLngLat([point.lon, point.lat]).addTo(map);

                marker.on('dragend', function () {
                    const { lat: newLat, lng: newLng } = marker.getLngLat();
                    window.api.update_point_position(point.id, newLat, newLng);
                    pointsData[point.id].lat = newLat;
                    pointsData[point.id].lon = newLng;
                    recalcCurrentRoute();
                });
                marker.getElement().addEventListener('click', function (e) {
                    e.stopPropagation();
                    openPointPopup(pointsData[point.id]);
                });
                pointMarkers[point.id] = marker;
            }
            if (point.is_free) marker.getElement().classList.add('free-point');
            currentWaypointModes[point.id] = point.is_free ? 'free' : 'path';
            currentWaypointIds.push(point.id);
        });

        document.getElementById('route-color').value = routesById[routeId].color;
        document.getElementById('btn-start-route').style.display = 'none';
        document.getElementById('btn-end-route').style.display = 'inline-block';
        map.getCanvas().style.cursor = 'crosshair';

        // Cache la ligne déjà enregistrée pendant l'édition ; elle sera
        // réaffichée (mise à jour) une fois "Terminer l'itinéraire" cliqué.
        if (map.getLayer('route-' + routeId + '-layer')) {
            map.setLayoutProperty('route-' + routeId + '-layer', 'visibility', 'none');
        }

        recalcCurrentRoute();
    });
}

map.on('click', function (e) {
    if (!routeMode) return;
    addWaypoint(e.lngLat.lat, e.lngLat.lng, false);
});

map.on('contextmenu', function (e) {
    if (!routeMode) return;
    e.originalEvent.preventDefault();
    addWaypoint(e.lngLat.lat, e.lngLat.lng, true);
});

// Raccourci clavier : L bascule routé / libre (sauf pendant une saisie de texte)
document.addEventListener('keydown', function (e) {
    if (!routeMode || e.key.toLowerCase() !== 'l') return;
    if (e.target.closest('input:not([type="checkbox"]), textarea')) return;
    const box = document.getElementById('route-draw-free');
    box.checked = !box.checked;
});
