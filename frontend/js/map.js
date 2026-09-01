// ---- 1. Pont avec Python (inchangé) ----
new QWebChannel(qt.webChannelTransport, function (channel) {
    window.api = channel.objects.api;
});

// ---- 2. Définition des styles ----
// Un "style" MapLibre décrit d'un coup : les sources de données ET comment
// les afficher. Pour la carte nationale, on définit nous-mêmes un style
// minimal avec une seule source raster (les tuiles Swisstopo classiques).
const carteNationaleStyle = {
    version: 8,
    sources: {
        'pixelkarte': {
            type: 'raster',
            tiles: [
                'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg'
            ],
            tileSize: 256,
            attribution: '© swisstopo'
        }
    },
    layers: [
        { id: 'pixelkarte-layer', type: 'raster', source: 'pixelkarte' }
    ]
};

// Pour la photocarte, on utilise directement le style officiel "Imagery
// Basemap" de Swisstopo (photo aérienne + noms de lieux déjà filtrés
// intelligemment). MapLibre va chercher et interpréter ce fichier tout seul.
const photocarteStyleUrl = 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json';

// ---- 3. Création de la carte ----
const map = new maplibregl.Map({
    container: 'map',           // id de la <div> qui accueille la carte
    style: carteNationaleStyle, // style affiché au démarrage
    center: [8.2, 46.8],        // ATTENTION : [longitude, latitude] ici, pas l'inverse
    zoom: 8,
});

// ---- 4. Gestion de la couche "chemins de randonnée" ----
// On l'isole dans une fonction car elle doit pouvoir être "réappliquée"
// après chaque changement de fond de carte (voir point 5).
function addWanderwegeLayer() {
    if (!map.getSource('wanderwege')) {  // évite de l'ajouter deux fois
        map.addSource('wanderwege', {
            type: 'raster',
            tiles: [
                'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/{z}/{x}/{y}.png'
            ],
            tileSize: 256
        });
        map.addLayer({ id: 'wanderwege-layer', type: 'raster', source: 'wanderwege' });
    }
}

function removeWanderwegeLayer() {
    if (map.getLayer('wanderwege-layer')) map.removeLayer('wanderwege-layer');
    if (map.getSource('wanderwege')) map.removeSource('wanderwege');
}

// ---- 5. Changement de fond de carte ----
document.querySelectorAll('input[name="base"]').forEach(function (radio) {
    radio.addEventListener('change', function (event) {
        if (event.target.value === 'carteNationale') {
            map.setStyle(carteNationaleStyle);
        } else {
            map.setStyle(photocarteStyleUrl);
        }
        // setStyle() efface TOUTES nos couches ajoutées manuellement
        // (dont wanderwege). L'événement 'style.load' se déclenche une
        // fois que le nouveau style est prêt : c'est là qu'on la
        // réajoute si elle était cochée.
    });
});

map.on('style.load', function () {
    if (document.getElementById('toggle-wanderwege').checked) {
        addWanderwegeLayer();
    }
});

// ---- 6. Case à cocher "chemins de randonnée" ----
document.getElementById('toggle-wanderwege').addEventListener('change', function (event) {
    if (event.target.checked) {
        addWanderwegeLayer();
    } else {
        removeWanderwegeLayer();
    }
});
