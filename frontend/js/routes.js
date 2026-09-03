let routeMode = false;
let currentRoutePointIds = [];

function getRouteColor() {
    return document.getElementById('route-color').value;
}

document.getElementById('btn-start-route').addEventListener('click', function () {
    routeMode = true;
    currentRoutePointIds = [];
    document.getElementById('btn-start-route').style.display = 'none';
    document.getElementById('btn-end-route').style.display = 'inline-block';
    map.getCanvas().style.cursor = 'crosshair';
});

document.getElementById('btn-end-route').addEventListener('click', finishRoute);

function handleRouteClick(lngLat, isVia) {
    const { lat, lng } = lngLat;
    const defaultName = currentRoutePointIds.length === 0 ? 'Départ' : (isVia ? 'Via' : 'Point');

    window.api.add_point(lat, lng, defaultName, function (result) {
        const point = JSON.parse(result);
        addPointToMap(point);   // fonction de points.js — réutilisée telle quelle
        currentRoutePointIds.push(point.id);
        updateCurrentRouteLine();
    });
}

function updateCurrentRouteLine() {
    const coordinates = currentRoutePointIds.map(function (id) {
        return [pointsData[id].lon, pointsData[id].lat];
    });
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: coordinates } };

    if (map.getSource('current-route')) {
        map.getSource('current-route').setData(geojson);
    } else {
        map.addSource('current-route', { type: 'geojson', data: geojson });
        map.addLayer({
            id: 'current-route-layer',
            type: 'line',
            source: 'current-route',
            paint: { 'line-color': getRouteColor(), 'line-width': 4 }
        });
    }
}

function finishRoute() {
    if (currentRoutePointIds.length < 2) {
        alert("Un itinéraire nécessite au moins 2 points.");
        return;
    }

    const routeName = pointsData[currentRoutePointIds[0]].name;  // nom du 1er point, au moment de la validation
    const color = getRouteColor();

    window.api.create_route(routeName, color, JSON.stringify(currentRoutePointIds), function () {
        loadRoutes();
    });

    if (map.getLayer('current-route-layer')) map.removeLayer('current-route-layer');
    if (map.getSource('current-route')) map.removeSource('current-route');

    routeMode = false;
    currentRoutePointIds = [];
    document.getElementById('btn-start-route').style.display = 'inline-block';
    document.getElementById('btn-end-route').style.display = 'none';
    map.getCanvas().style.cursor = '';
}

function loadRoutes() {
    window.api.get_routes(function (result) {
        const routes = JSON.parse(result);

        routes.forEach(function (route) {
            const sourceId = 'route-' + route.id;
            const coordinates = route.points.map(function (p) { return [p.lon, p.lat]; });
            const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: coordinates } };

            if (map.getSource(sourceId)) {
                map.getSource(sourceId).setData(geojson);
            } else {
                map.addSource(sourceId, { type: 'geojson', data: geojson });
                map.addLayer({
                    id: sourceId + '-layer', type: 'line', source: sourceId,
                    paint: { 'line-color': route.color, 'line-width': 4 }
                });
            }
        });

        refreshRoutesList(routes);
    });
}

function refreshRoutesList(routes) {
    const listEl = document.getElementById('routes-list');
    listEl.innerHTML = '';
    routes.forEach(function (route) {
        const li = document.createElement('li');
        li.textContent = route.name;
        li.style.color = route.color;
        listEl.appendChild(li);
    });
}

// ---- Clics carte en mode itinéraire ----
map.on('click', function (e) {
    if (routeMode) handleRouteClick(e.lngLat, false);
});

map.on('contextmenu', function (e) {
    if (routeMode) {
        e.originalEvent.preventDefault();
        handleRouteClick(e.lngLat, true);
    }
});