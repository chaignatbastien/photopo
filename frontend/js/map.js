// ---- 1. Pont avec Python ----
// QWebChannel connecte le JS à l'objet "api" enregistré dans main.py.
// La fonction passée en 2e argument est un "callback" : une fonction qui
// sera exécutée automatiquement UNE FOIS que la connexion est prête
// (pas tout de suite, ça prend un petit instant en coulisses).
new QWebChannel(qt.webChannelTransport, function (channel) {
    window.api = channel.objects.api;
    // Dès maintenant on pourra faire window.api.maFonction(...) plus tard
});

// ---- 2. Couches de fond ----
// tileLayer() ne charge pas une seule image, mais définit un GABARIT d'URL.
// {z}/{x}/{y} sont des espaces réservés que Leaflet remplace lui-même :
// {z} = niveau de zoom, {x}/{y} = position de la tuile sur la grille.
// C'est CE mécanisme qui fait qu'en zoomant, Leaflet redemande automatiquement
// des tuiles avec un {z} différent, donc plus ou moins précises — sans
// qu'on ait à coder cette logique nous-mêmes.
const photocarte = L.tileLayer(
    'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
    { maxZoom: 19, attribution: '© swisstopo' }
);

const carteNationale = L.tileLayer(
    'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    { maxZoom: 19, attribution: '© swisstopo' }
);

const cheminsRandonnee = L.tileLayer(
    'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© swisstopo' }
);

// ---- 3. Création de la carte ----
// L.map('map', ...) cherche l'élément HTML avec id="map" (notre <div id="map">)
// et y installe la carte. C'est le lien entre le JS et le HTML de la page.
const map = L.map('map', {
    center: [46.8, 8.2],   // [latitude, longitude] — ici centré sur la Suisse
    zoom: 8,
    layers: [carteNationale]  // couche visible par défaut au démarrage
});

// ---- 4. Sélecteur de couches ----
// Un objet JS { "Nom affiché": variable, ... } associe un texte visible
// par l'utilisateur à la couche Leaflet correspondante.
const baseLayers = {
    "Carte nationale": carteNationale,
    "Photocarte": photocarte
};

const overlayLayers = {
    "Chemins de randonnée": cheminsRandonnee
};

// L.control.layers crée le petit widget en haut à droite de la carte
// (boutons radio pour baseLayers, cases à cocher pour overlayLayers)
L.control.layers(baseLayers, overlayLayers).addTo(map);

// ---- 5. Zoom seulement avec Ctrl+molette ----
map.scrollWheelZoom.disable();  // on coupe le zoom "molette simple" par défaut

// addEventListener : on "écoute" un événement du navigateur (ici 'wheel' =
// molette) et on donne une fonction à exécuter à chaque fois qu'il se produit.
// C'est la base de la programmation JS dans un navigateur : au lieu de
// dérouler des instructions dans l'ordre comme en Python, on réagit à
// des événements déclenchés par l'utilisateur.
map.getContainer().addEventListener('wheel', function (event) {
    if (event.ctrlKey) {
        event.preventDefault();  // empêche le navigateur de zoomer la page entière
        if (event.deltaY < 0) {
            map.zoomIn();
        } else {
            map.zoomOut();
        }
    }
});