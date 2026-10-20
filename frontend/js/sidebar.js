document.getElementById('sidebar-toggle').addEventListener('click', function () {
    document.getElementById('sidebar').classList.toggle('collapsed');
});

// ---- Accordéon : une seule section ouverte à la fois ----
function openPanel(name) {
    document.querySelectorAll('.panel-section').forEach(function (section) {
        const isTarget = section.dataset.panel === name;
        section.classList.toggle('open', isTarget);
        section.querySelector('.chevron').textContent = isTarget ? '▾' : '▸';
    });
}

document.querySelectorAll('.panel-header').forEach(function (header) {
    header.addEventListener('click', function () {
        const section = header.parentElement;
        // Clic sur la section déjà ouverte : on ne fait rien (il en faut toujours une d'ouverte)
        if (!section.classList.contains('open')) openPanel(section.dataset.panel);
    });
});