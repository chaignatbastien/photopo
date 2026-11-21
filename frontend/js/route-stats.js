// ---- Calculs de distance / dénivelé / temps, indépendants de BRouter ----
// Fichier "pur" : aucune dépendance à la carte ni au DOM.

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
    let elevationLoss = 0;
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
            if (i > 0 && typeof prevEle === 'number') {
                if (ele > prevEle) elevationGain += ele - prevEle;
                else if (ele < prevEle) elevationLoss += prevEle - ele;
            }
        }
        profile.push({ km: distanceKm, ele: typeof ele === 'number' ? ele : null });
    });

    // Estimation du temps de marche (règle de Naismith adaptée) :
    // ~12 minutes par km à plat + 10 minutes par 100 m de dénivelé positif.
    const minutes = distanceKm * 12 + (hasElevation ? (elevationGain / 100) * 10 : 0);

    return {
        distanceKm,
        elevationGain: hasElevation ? elevationGain : null,
        elevationLoss: hasElevation ? elevationLoss : null,
        minutes, profile, hasElevation
    };
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

// Estimation du temps en fonction des temps perso

const MIN_DONE_FOR_FACTOR = 3;
const MIN_DONE_FOR_REGRESSION = 8;
const PRIOR_MIN_PER_KM = 12;
const PRIOR_MIN_PER_100M = 10;
const RIDGE_LAMBDA = 3;   // poids de l'a priori Naismith (plus grand = plus prudent)

function getDoneRoutes(excludeRouteId) {
    return Object.values(routesById).filter(r =>
        r.id !== excludeRouteId && r.actual_minutes > 0 && r.geometry && r.geometry.length > 1);
}

// Médiane de (temps réel / temps estimé)
function computeMedianFactor(routes) {
    const ratios = routes
        .map(r => {
            const s = r.stats || computeRouteStats(r.geometry);
            return s.minutes > 0 ? r.actual_minutes / s.minutes : null;
        })
        .filter(x => x !== null)
        .sort((a, b) => a - b);
    if (!ratios.length) return null;
    const mid = Math.floor(ratios.length / 2);
    return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
}

// Moindres carrés régularisés : minutes ≈ a*km + b*(D+/100), a,b >= 0
function fitRegression(rows) {
    let sxx = 0, sxz = 0, szz = 0, sxy = 0, szy = 0;
    rows.forEach(function (r) {
        sxx += r.km * r.km;  sxz += r.km * r.d100;  szz += r.d100 * r.d100;
        sxy += r.km * r.min; szy += r.d100 * r.min;
    });
    const L = RIDGE_LAMBDA;
    const m11 = sxx + L, m12 = sxz, m22 = szz + L;
    const r1 = sxy + L * PRIOR_MIN_PER_KM, r2 = szy + L * PRIOR_MIN_PER_100M;
    const det = m11 * m22 - m12 * m12;
    let a = (r1 * m22 - r2 * m12) / det;
    let b = (m11 * r2 - m12 * r1) / det;

    if (a < 0) { a = 0; b = Math.max(0, r2 / m22); }
    else if (b < 0) { b = 0; a = Math.max(0, r1 / m11); }
    return { a, b };
}

// Retourne { minutes, method, count, detail } ou null
function getPersonalEstimate(stats, excludeRouteId = null) {
    const done = getDoneRoutes(excludeRouteId);
    if (done.length < MIN_DONE_FOR_FACTOR) return null;

    const withEle = done
        .map(r => ({ r, s: r.stats || computeRouteStats(r.geometry) }))
        .filter(x => x.s.hasElevation);

    if (stats.hasElevation && withEle.length >= MIN_DONE_FOR_REGRESSION) {
        const rows = withEle.map(x => ({
            km: x.s.distanceKm, d100: x.s.elevationGain / 100, min: x.r.actual_minutes
        }));
        const { a, b } = fitRegression(rows);
        return {
            minutes: a * stats.distanceKm + b * (stats.elevationGain / 100),
            method: 'regression', count: rows.length,
            detail: a.toFixed(1) + ' min/km + ' + b.toFixed(1) + ' min/100 m D+'
        };
    }

    const f = computeMedianFactor(done);
    return {
        minutes: stats.minutes * f, method: 'factor', count: done.length,
        detail: '×' + f.toFixed(2) + ' par rapport à la référence'
    };
}

function updatePersonalTime(stats, excludeRouteId = null) {
    const el = document.getElementById('route-panel-time-perso');
    const row = el.parentElement;
    const est = getPersonalEstimate(stats, excludeRouteId);
    if (!est) { row.style.display = 'none'; return; }
    row.style.display = '';
    el.textContent = formatDuration(est.minutes);
    row.title = (est.method === 'regression' ? 'Régression' : 'Facteur médian')
        + ' sur ' + est.count + ' itinéraires faits (' + est.detail + ')';
}
