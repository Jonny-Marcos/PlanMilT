/**
 * @fileoverview Aplica uma camada-base sobre relevo SRTM no visualizador integrado somente leitura.
 * @requires Mapa Leaflet, cliente HTTP, elevationFiles e map3dTexture.
 */
(() => {
    const button = document.getElementById('view3DButton');
    const overlay = document.getElementById('map3DOverlay');
    const frame = document.getElementById('map3DFrame');
    let viewerReady = false;
    let selectedSource = 'opentopo';
    let sceneVersion = 0;
    let capturing = false;
    let recapture = false;

    /**
     * Envia uma mensagem segura para o visualizador aberto.
     * @param {Object} message - Tipo e dados do evento.
     */
    function post(message) {
        if (!overlay.hidden && frame.contentWindow) {
            frame.contentWindow.postMessage(message, window.location.origin);
        }
    }

    /**
     * Atualiza a textura da camada-base e a grade de elevação no visualizador 3D.
     */
    async function sendScene() {
        if (capturing) {
            recapture = true;
            return;
        }
        capturing = true;
        do {
            recapture = false;
            const version = sceneVersion;
            try {
                post({ type: 'planmilt-3d-status', message: 'Carregando camada-base e terreno…' });
                const mapBounds = map.getBounds();
                const bounds = [mapBounds.getSouth(), mapBounds.getWest(), mapBounds.getNorth(), mapBounds.getEast()];
                const source = selectedSource;
                const requestTerrain = async () => {
                    const response = await window.PlanMilT.apiClient.request('php/endpoints/elevation-terrain.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bounds, columns: 65, rows: 65 })
                    });
                    let data;
                    try {
                        data = await response.json();
                    } catch (error) {
                        throw new Error('Não foi possível ler a resposta dos tiles de elevação.');
                    }
                    if (!response.ok) {
                        throw new Error(data.error || 'Não foi possível obter o relevo SRTM local.');
                    }
                    return data;
                };
                const [image, initialTerrain] = await Promise.all([
                    window.PlanMilT.map3dTexture.create(map, bounds, source), requestTerrain()
                ]);
                let terrain = initialTerrain;
                if (!overlay.hidden && version === sceneVersion && terrain.missingTiles.length) {
                    post({ type: 'planmilt-3d-status', message: 'Obtendo arquivos de elevação ausentes…' });
                    await window.PlanMilT.elevationFiles.ensure(terrain.missingTiles);
                    if (!overlay.hidden && version === sceneVersion) terrain = await requestTerrain();
                }
                if (!overlay.hidden && version === sceneVersion) {
                    post({
                        type: 'planmilt-3d-data',
                        payload: {
                            image, bounds,
                            elevations: terrain.elevations,
                            missingTiles: terrain.missingTiles,
                            source
                        }
                    });
                }
            } catch (error) {
                if (version === sceneVersion) {
                    post({
                        type: 'planmilt-3d-error',
                        message: error.message || 'Não foi possível atualizar o visualizador 3D.'
                    });
                }
            }
        } while (recapture && !overlay.hidden);
        capturing = false;
    }

    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin || event.source !== frame.contentWindow || !event.data) return;
        if (event.data.type === 'planmilt-3d-close' && !overlay.hidden) {
            sceneVersion++;
            overlay.hidden = true;
            document.body.classList.remove('map-3d-open');
            button.focus();
            return;
        }
        if (event.data.type === 'planmilt-3d-ready') viewerReady = true;
        if (!overlay.hidden && (event.data.type === 'planmilt-3d-ready' || event.data.type === 'planmilt-3d-refresh')) {
            if (!['opentopo', 'bdgex'].includes(event.data.source)) return;
            if (selectedSource !== event.data.source) {
                selectedSource = event.data.source;
                sceneVersion++;
            }
            sendScene();
        }
    });

    button.addEventListener('click', () => {
        sceneVersion++;
        overlay.hidden = false;
        document.body.classList.add('map-3d-open');
        if (!frame.getAttribute('src')) frame.src = 'visualizador-3d.html?v=20261112-base-terrain';
        else if (viewerReady) sendScene();
        frame.focus();
    });
})();
