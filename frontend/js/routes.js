let routeMode = false;
let currentWaypointIds = [];
let currentWaypointModes = {}; // pointId -> 'path' (routé via BRouter) ou 'free' (ligne droite)
let currentRouteGeometry = null;
let routePopup = null;
const routesById = {};

function getRouteColor() {
    return document.getElementById('route-color').value;
}

document.getElementById('btn-start-route').addEventListener('click', function () {
    routeMode = true;
    currentWaypointIds = [];
    currentWaypointModes = {};
    currentRouteGeometry = null;
    document.getElementById('btn-start-route').style.display = 'none';
    document.getElementById('btn-end-route').style.display = 'inline-block';
    map.getCanvas().style.cursor = 'crosshair';
});

document.getElementById('btn-end-route').addEventListener('click', finishRoute);

function addWaypoint(lat, lon, insertBeforeLast, isFree) {
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

        if (insertBeforeLast && currentWaypointIds.length >= 2) {
            currentWaypointIds.splice(currentWaypointIds.length - 1, 0, point.id);
        } else {
            currentWaypointIds.push(point.id);
        }

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
    if (currentWaypointIds.length < 2) return;

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

    window.api.create_route(
        routeName, color,
        JSON.stringify(currentWaypointIds),
        JSON.stringify(currentRouteGeometry || []),
        function () { loadRoutes(); }
    );

    if (map.getLayer('current-route-layer')) map.removeLayer('current-route-layer');
    if (map.getSource('current-route')) map.removeSource('current-route');

    routeMode = false;
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
        return b.extend(coord);
    }, new maplibregl.LngLatBounds(route.geometry[0], route.geometry[0]));
    map.fitBounds(bounds, { padding: 60 });

    if (routePopup) routePopup.remove();

    const mid = route.geometry[Math.floor(route.geometry.length / 2)];
    const container = document.createElement('div');
    container.className = 'route-popup';

    const title = document.createElement('strong');
    title.textContent = route.name;
    title.style.color = route.color;
    container.appendChild(title);

    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Supprimer';
    btnDelete.addEventListener('click', function () {
        if (!confirm(`Supprimer l'itinéraire "${route.name}" ?`)) return;
        window.api.delete_route(route.id);
        if (map.getLayer('route-' + route.id + '-layer')) map.removeLayer('route-' + route.id + '-layer');
        if (map.getSource('route-' + route.id)) map.removeSource('route-' + route.id);
        if (routePopup) { routePopup.remove(); routePopup = null; }
        loadRoutes();
    });
    container.appendChild(btnDelete);

    routePopup = new maplibregl.Popup({ closeOnClick: false })
        .setLngLat(mid)
        .setDOMContent(container)
        .addTo(map);
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
