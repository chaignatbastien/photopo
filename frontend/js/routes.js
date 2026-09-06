let routeMode = false;
let editingRouteId = null;
let currentWaypointIds = [];
let currentWaypointModes = {}; // pointId -> 'path' (routé via BRouter) ou 'free' (ligne droite)
let currentRouteGeometry = null;
let selectedRouteId = null;
const routesById = {};

function getRouteColor() {
    return document.getElementById('route-color').value;
}

document.getElementById('btn-start-route').addEventListener('click', function () {
    routeMode = true;
    editingRouteId = null;
    currentWaypointIds = [];
    currentWaypointModes = {};
    currentRouteGeometry = null;
    document.getElementById('btn-start-route').style.display = 'none';
    document.getElementById('btn-end-route').style.display = 'inline-block';
    map.getCanvas().style.cursor = 'crosshair';
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
// existants dont le segment est le plus proche géographiquement du clic
// (et pas juste "avant le dernier point", comme avant).
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

function addWaypoint(lat, lon, insertAsVia, isFree) {
    const name = currentWaypointIds.length === 0 ? 'Départ' : (isFree ? 'Point libre' : 'Point');
    const insertIndex = insertAsVia ? findInsertionIndex(lat, lon) : currentWaypointIds.length;

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
        const edgeIsFree = currentWaypointModes[prevId] === 'free' || currentWaypointModes[currId] === 'free';

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
}

function finishRoute() {
    if (currentWaypointIds.length < 2) {
        alert("Un itinéraire nécessite au moins 2 points.");
        return;
    }

    const routeName = pointsData[currentWaypointIds[0]].name;
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
                loadRoutes();
            }
        );
    } else {
        window.api.create_route(
            routeName, color,
            JSON.stringify(currentWaypointIds),
            JSON.stringify(isFreeFlags),
            JSON.stringify(currentRouteGeometry || []),
            function () { loadRoutes(); }
        );
    }

    if (map.getLayer('current-route-layer')) map.removeLayer('current-route-layer');
    if (map.getSource('current-route')) map.removeSource('current-route');

    routeMode = false;
    editingRouteId = null;
    currentWaypointIds = [];
    currentWaypointModes = {};
    currentRouteGeometry = null;
    document.getElementById('btn-start-route').style.display = 'inline-block';
    document.getElementById('btn-end-route').style.display = 'none';
    map.getCanvas().style.cursor = '';
}

function loadRoutes() {
    window.api.get_routes(function (result) {
        const routes = JSON.parse(result);
        routes.forEach(function (route) {
            routesById[route.id] = route;
            drawRoute(route);
        });
        refreshRoutesList(routes);
        if (selectedRouteId !== null && routesById[selectedRouteId]) {
            openRoutePanel(routesById[selectedRouteId]);
        }
    });
}

function drawRoute(route) {
    const sourceId = 'route-' + route.id;
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: route.geometry } };

    if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(geojson);
    } else {
        map.addSource(sourceId, { type: 'geojson', data: geojson });
        map.addLayer({
            id: sourceId + '-layer', type: 'line', source: sourceId,
            paint: { 'line-color': route.color, 'line-width': 4 }
        });
    }
}

function refreshRoutesList(routes) {
    const listEl = document.getElementById('routes-list');
    listEl.innerHTML = '';
    routes.forEach(function (route) {
        const li = document.createElement('li');
        li.textContent = route.name;
        li.style.color = route.color;
        li.addEventListener('click', function () { selectRoute(route); });
        listEl.appendChild(li);
    });
}

function selectRoute(route) {
    if (!route.geometry.length) return;

    const bounds = route.geometry.reduce(function (b, coord) {
        return b.extend([coord[0], coord[1]]);
    }, new maplibregl.LngLatBounds([route.geometry[0][0], route.geometry[0][1]], [route.geometry[0][0], route.geometry[0][1]]));
    map.fitBounds(bounds, { padding: 60 });

    openRoutePanel(route);
}

// ---- Calculs de distance / dénivelé / temps, indépendants de BRouter ----

function haversineKm(lon1, lat1, lon2, lat2) {
    const R = 6371;
    const toRad = function (deg) { return deg * Math.PI / 180; };
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeRouteStats(geometry) {
    // geometry : liste de [lon, lat] ou [lon, lat, altitude] (BRouter fournit
    // l'altitude en 3e valeur pour les segments routés ; les segments en
    // ligne droite n'en ont pas).
    let distanceKm = 0;
    let elevationGain = 0;
    let hasElevation = false;
    const profile = [];

    geometry.forEach(function (coord, i) {
        if (i > 0) {
            distanceKm += haversineKm(geometry[i - 1][0], geometry[i - 1][1], coord[0], coord[1]);
        }
        const ele = coord[2];
        if (typeof ele === 'number') {
            hasElevation = true;
            const prevEle = geometry[i - 1] ? geometry[i - 1][2] : undefined;
            if (i > 0 && typeof prevEle === 'number' && ele > prevEle) {
                elevationGain += ele - prevEle;
            }
        }
        profile.push({ km: distanceKm, ele: typeof ele === 'number' ? ele : null });
    });

    // Estimation du temps de marche (règle de Naismith adaptée) :
    // ~12 minutes par km à plat + 10 minutes par 100 m de dénivelé positif.
    const minutes = distanceKm * 12 + (hasElevation ? (elevationGain / 100) * 10 : 0);

    return { distanceKm, elevationGain: hasElevation ? elevationGain : null, minutes, profile, hasElevation };
}

function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h === 0) return `${m} min`;
    return `${h} h ${m.toString().padStart(2, '0')}`;
}

function buildElevationChartSvg(profile, color) {
    const width = 600, height = 180, padding = 30;
    const validPoints = profile.filter(function (p) { return p.ele !== null; });
    if (validPoints.length < 2) {
        return '<div class="route-panel-chart-empty">Pas de données d\'altitude pour cet itinéraire.</div>';
    }

    const maxKm = profile[profile.length - 1].km || 1;
    const eles = validPoints.map(function (p) { return p.ele; });
    const minEle = Math.min.apply(null, eles);
    const maxEle = Math.max.apply(null, eles) || minEle + 1;

    const scaleX = function (km) { return padding + (km / maxKm) * (width - 2 * padding); };
    const scaleY = function (ele) { return height - padding - ((ele - minEle) / ((maxEle - minEle) || 1)) * (height - 2 * padding); };

    let lastEle = null;
    const linePoints = profile.map(function (p) {
        const ele = p.ele !== null ? p.ele : lastEle;
        if (ele !== null) lastEle = ele;
        return ele !== null ? scaleX(p.km) + ',' + scaleY(ele) : null;
    }).filter(Boolean).join(' ');

    const areaPoints = padding + ',' + (height - padding) + ' ' + linePoints + ' ' + (width - padding) + ',' + (height - padding);

    return '<svg viewBox="0 0 ' + width + ' ' + height + '" class="elevation-svg">' +
        '<polygon points="' + areaPoints + '" class="elevation-area" fill="' + color + '" fill-opacity="0.15" />' +
        '<polyline points="' + linePoints + '" class="elevation-line" stroke="' + color + '" />' +
        '<text x="' + padding + '" y="' + (height - 8) + '" class="elevation-axis-label">0 km</text>' +
        '<text x="' + (width - padding) + '" y="' + (height - 8) + '" class="elevation-axis-label" text-anchor="end">' + maxKm.toFixed(1) + ' km</text>' +
        '<text x="' + padding + '" y="14" class="elevation-axis-label">' + Math.round(maxEle) + ' m</text>' +
        '<text x="' + padding + '" y="' + (height - padding + 12) + '" class="elevation-axis-label">' + Math.round(minEle) + ' m</text>' +
        '</svg>';
}

// ---- Panneau du bas ----

function openRoutePanel(route) {
    selectedRouteId = route.id;
    const stats = computeRouteStats(route.geometry);

    document.getElementById('route-panel-chart').innerHTML = buildElevationChartSvg(stats.profile, route.color);
    document.getElementById('route-panel-name').value = route.name;
    document.getElementById('route-panel-distance').textContent = stats.distanceKm.toFixed(1) + ' km';
    document.getElementById('route-panel-gain').textContent = stats.hasElevation ? Math.round(stats.elevationGain) + ' m' : '—';
    document.getElementById('route-panel-time').textContent = formatDuration(stats.minutes);
    document.getElementById('route-panel-color').value = route.color;

    document.getElementById('route-panel').classList.remove('hidden');
}

function closeRoutePanel() {
    selectedRouteId = null;
    document.getElementById('route-panel').classList.add('hidden');
}

document.getElementById('route-panel-close').addEventListener('click', closeRoutePanel);

document.getElementById('route-panel-name').addEventListener('change', function () {
    if (selectedRouteId === null) return;
    const newName = this.value.trim() || 'Itinéraire sans nom';
    this.value = newName;
    const route = routesById[selectedRouteId];
    route.name = newName;
    window.api.update_route_style(selectedRouteId, newName, route.color);
    refreshRoutesList(Object.values(routesById));
});

document.getElementById('route-panel-color').addEventListener('change', function () {
    if (selectedRouteId === null) return;
    const route = routesById[selectedRouteId];
    route.color = this.value;
    window.api.update_route_style(selectedRouteId, route.name, route.color);
    if (map.getLayer('route-' + route.id + '-layer')) {
        map.setPaintProperty('route-' + route.id + '-layer', 'line-color', route.color);
    }
    document.getElementById('route-panel-chart').innerHTML = buildElevationChartSvg(computeRouteStats(route.geometry).profile, route.color);
    refreshRoutesList(Object.values(routesById));
});

document.getElementById('route-panel-delete').addEventListener('click', function () {
    if (selectedRouteId === null) return;
    const route = routesById[selectedRouteId];
    if (!confirm('Supprimer l\'itinéraire "' + route.name + '" ?')) return;
    window.api.delete_route(route.id);
    if (map.getLayer('route-' + route.id + '-layer')) map.removeLayer('route-' + route.id + '-layer');
    if (map.getSource('route-' + route.id)) map.removeSource('route-' + route.id);
    delete routesById[route.id];
    closeRoutePanel();
    loadRoutes();
});

document.getElementById('route-panel-edit').addEventListener('click', function () {
    if (selectedRouteId === null) return;
    startEditingRoute(selectedRouteId);
});

document.getElementById('route-panel-export').addEventListener('click', function () {
    if (selectedRouteId === null) return;
    window.api.export_route_gpx(selectedRouteId);
});

document.getElementById('btn-import-gpx').addEventListener('click', function () {
    window.api.import_gpx_route(function (result) {
        const data = JSON.parse(result);
        if (!data) return; // l'utilisateur a annulé la boîte de dialogue
        if (data.error) {
            alert(data.error);
            return;
        }

        [data.start_point, data.end_point].forEach(function (point) {
            if (!pointMarkers[point.id]) addPointToMap(point);
        });

        const route = { id: data.id, name: data.name, color: data.color, geometry: data.geometry };
        routesById[route.id] = route;
        drawRoute(route);
        refreshRoutesList(Object.values(routesById));
        refreshPointsList();
        selectRoute(route);
    });
});

function startEditingRoute(routeId) {
    window.api.get_route_points(routeId, function (result) {
        const points = JSON.parse(result); // ordonnés, avec is_free

        closeRoutePanel();
        routeMode = true;
        editingRouteId = routeId;
        currentWaypointIds = [];
        currentWaypointModes = {};
        currentRouteGeometry = null;

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
    addWaypoint(e.lngLat.lat, e.lngLat.lng, false, e.originalEvent.shiftKey);
});

map.on('contextmenu', function (e) {
    if (!routeMode) return;
    e.originalEvent.preventDefault();
    addWaypoint(e.lngLat.lat, e.lngLat.lng, true, e.originalEvent.shiftKey);
});
