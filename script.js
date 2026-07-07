var asapReady = false;

window.ZohoDeskAsapReady(function() {
    asapReady = true;
});

document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panelview').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

        if (tab.dataset.tab === 'articles') {
            openArticles();
        } else if (window.ZohoDeskAsap && asapReady) {
            ZohoDeskAsap.invoke('close');
        }
    });
});

function openArticles() {
    if (window.ZohoDeskAsap && asapReady) {
        ZohoDeskAsap.invoke('open');
        try {
            ZohoDeskAsap.invoke('routeTo', { page: 'kb.category.list' });
        } catch (e) { /* older ASAP versions may not support routeTo */ }
        var el = document.getElementById('kbStatus');
        if (el) el.textContent = 'Articles opened above.';
    } else {
        setTimeout(openArticles, 300);
    }
}