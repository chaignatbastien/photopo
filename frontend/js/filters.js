// ---- Filtres photos (tags + date) et itinéraires (tags + distance/durée) ----
// Dépend de pointsData / routesById (points.js / routes.js) et des fonctions
// de rendu updateMarkerVisibility, refreshPointsList, updateRouteVisibility,
// refreshRoutesList, computeRouteStats (définies dans ces mêmes fichiers).

const activePhotoTagFilters = new Set();
const activeRouteTagFilters = new Set();
const activeDateFilter = { from: null, to: null, includeUnknown: true };
const activeRouteStatsFilter = { minKm: null, maxKm: null, minMin: null, maxMin: null };

function pointMatchesTagFilter(point) {
    if (activePhotoTagFilters.size === 0) return true;
    return (point.tags || []).some(t => activePhotoTagFilters.has(t));
}

function pointMatchesDateFilter(point) {
    if (!point.photo_url) return true;
    if (!point.photo_date) return activeDateFilter.includeUnknown;
    if (activeDateFilter.from && point.photo_date < activeDateFilter.from) return false;
    if (activeDateFilter.to && point.photo_date > activeDateFilter.to) return false;
    return true;
}

function pointVisible(point) {
    return pointMatchesTagFilter(point) && pointMatchesDateFilter(point);
}

function routeMatchesTagFilter(route) {
    if (activeRouteTagFilters.size === 0) return true;
    return (route.tags || []).some(t => activeRouteTagFilters.has(t));
}

function routeMatchesStatsFilter(route) {
    const stats = route.stats || computeRouteStats(route.geometry);
    const f = activeRouteStatsFilter;
    if (f.minKm !== null && stats.distanceKm < f.minKm) return false;
    if (f.maxKm !== null && stats.distanceKm > f.maxKm) return false;
    if (f.minMin !== null && stats.minutes < f.minMin) return false;
    if (f.maxMin !== null && stats.minutes > f.maxMin) return false;
    return true;
}

function routeVisible(route) {
    return routeMatchesTagFilter(route) && routeMatchesStatsFilter(route) && routeMatchesDoneFilter(route);
}

function parseFloatOrNull(v) {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
}

function renderTagFilterSection(containerId, tagsSet, activeSet, onChange) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    Array.from(tagsSet).sort().forEach(function (tag) {
        const chip = document.createElement('span');
        chip.className = 'tag-chip' + (activeSet.has(tag) ? ' active' : '');
        chip.textContent = tag;
        chip.addEventListener('click', function () {
            if (activeSet.has(tag)) activeSet.delete(tag); else activeSet.add(tag);
            chip.classList.toggle('active');
            onChange();
        });
        container.appendChild(chip);
    });
}

function refreshTagFilterLists() {
    const photoTags = new Set();
    Object.values(pointsData).forEach(function (p) {
        if (p.photo_url) (p.tags || []).forEach(t => photoTags.add(t));
    });
    renderTagFilterSection('photo-tag-filters', photoTags, activePhotoTagFilters, function () {
        updateMarkerVisibility();
        refreshPointsList();
    });

    const routeTags = new Set();
    Object.values(routesById).forEach(function (r) {
        (r.tags || []).forEach(t => routeTags.add(t));
    });
    renderTagFilterSection('route-tag-filters', routeTags, activeRouteTagFilters, function () {
        updateRouteVisibility();
        refreshRoutesList(Object.values(routesById));
    });
}

const activeRouteDoneFilter = { status: 'all', from: null, to: null, minReal: null, maxReal: null };

function routeMatchesDoneFilter(route) {
    const f = activeRouteDoneFilter;
    const isDone = !!route.done_date || (route.actual_minutes !== null && route.actual_minutes !== undefined);

    if (f.status === 'done' && !isDone) return false;
    if (f.status === 'todo' && isDone) return false;

    // Dès qu'une borne de date est posée, un itinéraire sans date est exclu
    if (f.from || f.to) {
        if (!route.done_date) return false;
        if (f.from && route.done_date < f.from) return false;
        if (f.to && route.done_date > f.to) return false;
    }

    // Idem pour le temps réel
    if (f.minReal !== null || f.maxReal !== null) {
        const t = route.actual_minutes;
        if (t === null || t === undefined) return false;
        if (f.minReal !== null && t < f.minReal) return false;
        if (f.maxReal !== null && t > f.maxReal) return false;
    }
    return true;
}

function readDurationMinutes(hId, mId) {
    const h = parseFloatOrNull(document.getElementById(hId).value);
    const m = parseFloatOrNull(document.getElementById(mId).value);
    if (h === null && m === null) return null;
    return (h || 0) * 60 + (m || 0);
}

['photo-date-from', 'photo-date-to', 'photo-date-include-unknown'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', function () {
        activeDateFilter.from = document.getElementById('photo-date-from').value || null;
        activeDateFilter.to = document.getElementById('photo-date-to').value || null;
        activeDateFilter.includeUnknown = document.getElementById('photo-date-include-unknown').checked;
        updateMarkerVisibility();
        refreshPointsList();
    });
});

['route-dist-min', 'route-dist-max',
 'route-time-min-h', 'route-time-min-m', 'route-time-max-h', 'route-time-max-m'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', function () {
        activeRouteStatsFilter.minKm = parseFloatOrNull(document.getElementById('route-dist-min').value);
        activeRouteStatsFilter.maxKm = parseFloatOrNull(document.getElementById('route-dist-max').value);
        activeRouteStatsFilter.minMin = readDurationMinutes('route-time-min-h', 'route-time-min-m');
        activeRouteStatsFilter.maxMin = readDurationMinutes('route-time-max-h', 'route-time-max-m');
        updateRouteVisibility();
        refreshRoutesList(Object.values(routesById));
    });
});

['route-done-status', 'route-done-from', 'route-done-to',
 'route-real-min-h', 'route-real-min-m', 'route-real-max-h', 'route-real-max-m'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', function () {
        activeRouteDoneFilter.status = document.getElementById('route-done-status').value;
        activeRouteDoneFilter.from = document.getElementById('route-done-from').value || null;
        activeRouteDoneFilter.to = document.getElementById('route-done-to').value || null;
        activeRouteDoneFilter.minReal = readDurationMinutes('route-real-min-h', 'route-real-min-m');
        activeRouteDoneFilter.maxReal = readDurationMinutes('route-real-max-h', 'route-real-max-m');
        updateRouteVisibility();
        refreshRoutesList(Object.values(routesById));
    });
});
