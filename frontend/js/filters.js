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
    return routeMatchesTagFilter(route) && routeMatchesStatsFilter(route);
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

['photo-date-from', 'photo-date-to', 'photo-date-include-unknown'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', function () {
        activeDateFilter.from = document.getElementById('photo-date-from').value || null;
        activeDateFilter.to = document.getElementById('photo-date-to').value || null;
        activeDateFilter.includeUnknown = document.getElementById('photo-date-include-unknown').checked;
        updateMarkerVisibility();
        refreshPointsList();
    });
});

['route-dist-min', 'route-dist-max', 'route-time-min', 'route-time-max'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', function () {
        activeRouteStatsFilter.minKm = parseFloatOrNull(document.getElementById('route-dist-min').value);
        activeRouteStatsFilter.maxKm = parseFloatOrNull(document.getElementById('route-dist-max').value);
        activeRouteStatsFilter.minMin = parseFloatOrNull(document.getElementById('route-time-min').value);
        activeRouteStatsFilter.maxMin = parseFloatOrNull(document.getElementById('route-time-max').value);
        updateRouteVisibility();
        refreshRoutesList(Object.values(routesById));
    });
});
