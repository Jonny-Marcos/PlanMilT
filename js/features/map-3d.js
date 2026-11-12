/**
 * @fileoverview Abre uma janela somente leitura com o mapa capturado sobre relevo SRTM local.
 * @requires Mapa Leaflet, cliente HTTP e html2canvas.
 */
(() => {
    const button = document.getElementById('view3DButton');
    let viewer;
    let capturing = false;
    let recapture = false;

    /**
     * Envia uma mensagem segura para o visualizador aberto.
     * @param {Object} message - Tipo e dados do evento.
     */
    function post(message) {
        if (viewer && !viewer.closed) {
            viewer.postMessage(message, window.location.origin);
        }
    }

    /**
     * Solicita uma textura de imagem local para cada recurso remoto permitido.
     * @param {string[]} urls - URLs distintas encontradas nas imagens visíveis do mapa.
     * @param {Set<string>} unavailable - Hosts que não puderam ser capturados.
     * @returns {Promise<Map<string, string>>} URLs blob de mesmo domínio.
     */
    async function proxyImages(urls, unavailable) {
        const proxies = new Map();
        let totalBytes = 0;
        let nextIndex = 0;
        const workers = Array.from({ length: Math.min(4, urls.length) }, async () => {
            while (nextIndex < urls.length) {
                const url = urls[nextIndex++];
                const parsed = new URL(url);
                if (/(^|\.)google\.(?:com|com\.br)$/i.test(parsed.hostname)) {
                    unavailable.add('Google Satellite');
                    continue;
                }
                try {
                    const response = await window.PlanMilT.apiClient.request('php/endpoints/map-image-proxy.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                    });
                    if (!response.ok) throw new Error('Imagem não autorizada pelo proxy.');
                    const blob = await response.blob();
                    totalBytes += blob.size;
                    if (blob.size > 3_000_000 || totalBytes > 40_000_000) {
                        unavailable.add(parsed.hostname);
                        continue;
                    }
                    proxies.set(url, URL.createObjectURL(blob));
                } catch (error) {
                    unavailable.add(parsed.hostname);
                }
            }
        });
        await Promise.all(workers);
        return proxies;
    }

    /**
     * Converte a área visível do mapa em uma imagem segura para usar como textura.
     * @param {Set<string>} unavailable - Hosts ou camadas não disponíveis no visualizador.
     * @returns {Promise<string>} Imagem PNG em data URL.
     */
    async function captureMap(unavailable) {
        const mapElement = document.getElementById('map');
        if (typeof window.html2canvas !== 'function') {
            throw new Error('A captura do mapa não está disponível neste navegador.');
        }
        const bounds = mapElement.getBoundingClientRect();
        const imageElements = [...mapElement.querySelectorAll('img')].filter(image => {
            const rect = image.getBoundingClientRect();
            return image.src && rect.width > 0 && rect.height > 0
                && rect.right > bounds.left && rect.left < bounds.right
                && rect.bottom > bounds.top && rect.top < bounds.bottom;
        });
        const remoteSource = url => {
            const parsed = new URL(url);
            if (parsed.origin !== window.location.origin || !parsed.pathname.endsWith('/proxy.php')) return url;
            return parsed.searchParams.get('url') || url;
        };
        const remoteSources = new Map(imageElements.map(image => [image.src, remoteSource(image.src)]));
        const externalUrls = [...new Set([...remoteSources.values()].filter(url => {
            if (!/^https?:/i.test(url)) return false;
            return new URL(url).origin !== window.location.origin;
        }))];
        const proxies = await proxyImages(externalUrls, unavailable);
        const scale = Math.min(1.25, 1400 / Math.max(mapElement.clientWidth, mapElement.clientHeight));

        try {
            const canvas = await window.html2canvas(mapElement, {
                scale: Math.max(0.5, scale),
                useCORS: true,
                backgroundColor: '#dce4e8',
                onclone: async clonedDocument => {
                    const clonedMap = clonedDocument.getElementById('map');
                    clonedMap.querySelectorAll('.leaflet-control-container, .map-toolbar').forEach(element => element.remove());
                    const clonedImages = [...clonedMap.querySelectorAll('img')];
                    for (const image of clonedImages) {
                        const sourceUrl = remoteSources.get(image.src) || remoteSource(image.src);
                        if (!/^https?:/i.test(sourceUrl)) continue;
                        if (/(^|\.)google\.(?:com|com\.br)$/i.test(new URL(sourceUrl).hostname)) {
                            unavailable.add('Google Satellite');
                            image.style.visibility = 'hidden';
                            continue;
                        }
                        if (new URL(image.src).origin === window.location.origin) continue;
                        const proxyUrl = proxies.get(sourceUrl);
                        if (proxyUrl) image.src = proxyUrl;
                        else image.style.visibility = 'hidden';
                    }
                    const sourceCanvases = mapElement.querySelectorAll('canvas');
                    const cloneCanvases = clonedMap.querySelectorAll('canvas');
                    sourceCanvases.forEach((source, index) => {
                        const target = cloneCanvases[index];
                        if (!target) return;
                        try {
                            target.getContext('2d')?.drawImage(source, 0, 0);
                        } catch (error) {
                            unavailable.add('camada vetorial');
                        }
                    });
                    await Promise.all(clonedImages.map(image => image.decode?.().catch(() => undefined)));
                }
            });
            return canvas.toDataURL('image/png');
        } finally {
            proxies.forEach(url => URL.revokeObjectURL(url));
        }
    }

    /**
     * Atualiza o snapshot visual e a grade de elevação na janela 3D.
     */
    async function sendScene() {
        if (capturing) {
            recapture = true;
            return;
        }
        capturing = true;
        do {
            recapture = false;
            try {
                post({ type: 'planmilt-3d-status', message: 'Capturando camadas e imagens visíveis…' });
                const mapBounds = map.getBounds();
                const bounds = [mapBounds.getSouth(), mapBounds.getWest(), mapBounds.getNorth(), mapBounds.getEast()];
                const unavailableLayers = new Set();
                const [image, terrainResponse] = await Promise.all([
                    captureMap(unavailableLayers),
                    window.PlanMilT.apiClient.request('php/endpoints/elevation-terrain.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bounds, columns: 65, rows: 65 })
                    })
                ]);
                let terrain;
                try {
                    terrain = await terrainResponse.json();
                } catch (error) {
                    throw new Error('Não foi possível ler a resposta dos tiles de elevação.');
                }
                if (!terrainResponse.ok) {
                    throw new Error(terrain.error || 'Não foi possível obter o relevo SRTM local.');
                }
                if (viewer && !viewer.closed) {
                    viewer.postMessage({
                        type: 'planmilt-3d-data',
                        payload: {
                            image, bounds,
                            elevations: terrain.elevations,
                            missingTiles: terrain.missingTiles,
                            unavailableLayers: [...unavailableLayers]
                        }
                    }, window.location.origin);
                }
            } catch (error) {
                post({
                    type: 'planmilt-3d-error',
                    message: error.message || 'Não foi possível atualizar o visualizador 3D.'
                });
            }
        } while (recapture && viewer && !viewer.closed);
        capturing = false;
    }

    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin || event.source !== viewer || !event.data) return;
        if (event.data.type === 'planmilt-3d-ready' || event.data.type === 'planmilt-3d-refresh') {
            sendScene();
        }
    });

    button.addEventListener('click', () => {
        if (viewer && !viewer.closed) {
            viewer.focus();
            sendScene();
            return;
        }
        viewer = window.open('visualizador-3d.html', 'planmilt-3d', 'popup,width=1280,height=820');
        if (!viewer) {
            Swal.fire('Visualizador bloqueado', 'Permita a abertura de janelas para exibir o mapa 3D.', 'warning');
        }
    });
})();
