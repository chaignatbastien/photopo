// ---- Itinéraires enregistrés : registre, chargement, affichage, liste ----
// Dépend de route-stats.js (computeRouteStats, formatDuration).
// Les fonctions openRoutePanel / refreshTagFilterLists / refreshPointsList
// sont définies ailleurs mais appelées seulement à l'exécution (pas au chargement).

const routesById = {};
const ROUTES_MIN_ZOOM = 8;
let selectedRouteId = null;

function loadRoutes() {
    window.api.get_routes(function (result) {
        const routes = JSON.parse(result);
        routes.forEach(function (route) {
            route.stats = computeRouteStats(route.geometry);
            routesById[route.id] = route;
            drawRoute(route);
        });
        updateRouteVisibility();
        refreshRoutesList(routes);
        refreshTagFilterLists();
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
        if (!routeVisible(route)) return;
        const li = document.createElement('li');
        li.textContent = route.name
            + (route.done_date ? ' · ' + route.done_date : '')
            + (route.actual_minutes != null ? ' · ' + formatDuration(route.actual_minutes) : '');
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

function updateRouteVisibility() {
    const manuallyVisibleRoute = document.getElementById('toggle-routes').checked;
    const zoomOkRoute = map.getZoom() >= ROUTES_MIN_ZOOM;

    Object.values(routesById).forEach(function (route) {
        const layerId = 'route-' + route.id + '-layer';
        if (map.getLayer(layerId)) {
            const tagOkRoute = routeVisible(route);
            const shouldShowRoute = manuallyVisibleRoute && zoomOkRoute && tagOkRoute;
            map.setLayoutProperty(layerId, 'visibility', shouldShowRoute ? 'visible' : 'none');
        }
    });
}

map.on('zoomend', updateRouteVisibility);
document.getElementById('toggle-routes').addEventListener('change', updateRouteVisibility);
