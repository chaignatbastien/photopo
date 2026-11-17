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

