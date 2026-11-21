// ---- Panneau du bas : détails de l'itinéraire sélectionné / en cours de dessin ----
// Dépend de route-stats.js (calculs) et routes.js (routesById, selectedRouteId).
// startEditingRoute (route-drawing.js) n'est appelée qu'au clic, donc l'ordre n'importe pas.

function formatElevation(stats) {
    if (!stats.hasElevation) return '—';
    return '<span class="elev-up">+ ' + Math.round(stats.elevationGain) + ' m</span>'
         + '<span class="elev-down">− ' + Math.round(stats.elevationLoss) + ' m</span>';
}

function showDrawingPanel() {
    const panel = document.getElementById('route-panel');
    panel.classList.add('drawing');
    panel.classList.remove('hidden');
    document.getElementById('route-panel-name').value = currentRouteName;

    if (!currentRouteGeometry || currentRouteGeometry.length < 2) {
        document.getElementById('route-panel-chart').innerHTML =
            '<div class="route-panel-chart-empty">Clique sur la carte pour placer le départ, puis les points suivants.</div>';
        ['route-panel-distance', 'route-panel-elevation', 'route-panel-time'].forEach(function (id) {
            document.getElementById(id).textContent = '—';
        });
        document.getElementById('route-panel-time-perso').parentElement.style.display = 'none';
        return;
    }

    const stats = computeRouteStats(currentRouteGeometry);
    document.getElementById('route-panel-chart').innerHTML =
        buildElevationChartSvg(stats.profile, getRouteColor());
    document.getElementById('route-panel-distance').textContent = stats.distanceKm.toFixed(1) + ' km';
    document.getElementById('route-panel-elevation').innerHTML = formatElevation(stats);
    document.getElementById('route-panel-time').textContent = formatDuration(stats.minutes);
    updatePersonalTime(stats);
}

function hideDrawingPanel() {
    const panel = document.getElementById('route-panel');
    if (!panel.classList.contains('drawing')) return; // ne touche pas au panneau d'un itinéraire sélectionné
    panel.classList.remove('drawing');
    panel.classList.add('hidden');
}

function openRoutePanel(route) {
    selectedRouteId = route.id;
    const stats = computeRouteStats(route.geometry);

    document.getElementById('route-panel').classList.remove('drawing');
    document.getElementById('route-panel-chart').innerHTML = buildElevationChartSvg(stats.profile, route.color);
    document.getElementById('route-panel-name').value = route.name;
    document.getElementById('route-panel-distance').textContent = stats.distanceKm.toFixed(1) + ' km';
    document.getElementById('route-panel-elevation').innerHTML = formatElevation(stats);
    document.getElementById('route-panel-time').textContent = formatDuration(stats.minutes);
    updatePersonalTime(stats, route.id);
    document.getElementById('route-panel-done-date').value = route.done_date || '';
    setRealTimeInputs(route.actual_minutes);
    document.getElementById('route-panel-color').value = route.color;

    renderRoutePanelTags(route);
    document.getElementById('route-panel').classList.remove('hidden');
}

function closeRoutePanel() {
    selectedRouteId = null;
    document.getElementById('route-panel').classList.add('hidden');
}

function setRealTimeInputs(minutes) {
    const h = document.getElementById('route-panel-real-h');
    const m = document.getElementById('route-panel-real-m');
    if (minutes == null) {
        h.value = '';
        m.value = '';
    } else {
        h.value = Math.floor(minutes / 60);
        m.value = minutes % 60;
    }
}

document.getElementById('route-panel-close').addEventListener('click', closeRoutePanel);

document.getElementById('route-panel-name').addEventListener('change', function () {
    if (routeMode) { // itinéraire en cours de dessin : pas encore enregistré
        currentRouteName = this.value.trim() || 'Nouvel itinéraire';
        this.value = currentRouteName;
        return;
    }
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
    const routeId = route.id;

    window.api.get_route_points(routeId, function (result) {
        const points = JSON.parse(result);
        const removableIds = points
            .filter(function (p) { return p.is_route_point && !p.photo_url; })
            .map(function (p) { return p.id; });

        window.api.delete_route(routeId);

        if (map.getLayer('route-' + routeId + '-layer')) map.removeLayer('route-' + routeId + '-layer');
        if (map.getSource('route-' + routeId)) map.removeSource('route-' + routeId);

        removableIds.forEach(function (pointId) {
            if (pointMarkers[pointId]) {
                pointMarkers[pointId].remove();
                delete pointMarkers[pointId];
            }
            delete pointsData[pointId];
        });

        delete routesById[routeId];
        closeRoutePanel();
        loadRoutes();
        refreshPointsList();
        refreshTagFilterLists();
    });
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
        updateRouteVisibility();
        refreshRoutesList(Object.values(routesById));
        refreshPointsList();
        refreshStatsFilterBounds();
        selectRoute(route);
    });
});

// ---- Tags ----

function renderRoutePanelTags(route) {
    const chipsEl = document.getElementById('route-panel-tags');
    chipsEl.innerHTML = '';
    (route.tags || []).forEach(function (tag) {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = tag + ' ✕';
        chip.addEventListener('click', function () {
            route.tags = route.tags.filter(t => t !== tag);
            window.api.update_route_tags(route.id, JSON.stringify(route.tags));
            renderRoutePanelTags(route);
            refreshTagFilterLists();
        });
        chipsEl.appendChild(chip);
    });
}

document.getElementById('route-panel-tag-input').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || selectedRouteId === null) return;
    const newTag = this.value.trim();
    if (!newTag) return;
    const route = routesById[selectedRouteId];
    route.tags = Array.from(new Set([...(route.tags || []), newTag]));
    window.api.update_route_tags(route.id, JSON.stringify(route.tags));
    renderRoutePanelTags(route);
    refreshTagFilterLists();
    this.value = '';
});

// ---- Date et temps réel ----

function saveDoneInfo() {
    if (selectedRouteId === null) return;
    const route = routesById[selectedRouteId];

    const hStr = document.getElementById('route-panel-real-h').value.trim();
    const mStr = document.getElementById('route-panel-real-m').value.trim();
    let minutes = null;  // champs vides (ou 0) = temps non renseigné
    if (hStr !== '' || mStr !== '') {
        const total = (parseInt(hStr, 10) || 0) * 60 + (parseInt(mStr, 10) || 0);
        if (total > 0) minutes = total;
    }

    route.done_date = document.getElementById('route-panel-done-date').value || null;
    route.actual_minutes = minutes;

    window.api.update_route_done_info(
        route.id,
        route.done_date || '',
        minutes === null ? -1 : minutes
    );

    setRealTimeInputs(minutes);      // normalise : 90 min saisies → 1 h 30
    refreshStatsFilterBounds();      // le curseur « Durée réelle » s'adapte
    refreshRoutesList(Object.values(routesById));
    updateRouteVisibility();
    updatePersonalTime(computeRouteStats(route.geometry), route.id);
}

['route-panel-done-date', 'route-panel-real-h', 'route-panel-real-m'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', saveDoneInfo);
});

document.getElementById('route-panel-finish').addEventListener('click', finishRoute);
