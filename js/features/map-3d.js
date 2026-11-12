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
    let selectedZoom = null;
    let sceneVersion = 0;
    let capturing = false;
    let recapture = false;
    let activeCapture;

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
            const controller = new AbortController();
            activeCapture = controller;
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
                const [texture, initialTerrain] = await Promise.all([
                    window.PlanMilT.map3dTexture.create(map, bounds, source, [
                        drawnItems,
                        ...Object.entries(layerRegistry)
                            .filter(([name]) => !['OpenTopo', 'Google Satellite', 'BDGEx - CTM50',
                                'Infraestruturas', 'Quadrículas - UTM'].includes(name))
                            .map(([, layer]) => layer)
                    ], selectedZoom, {
                        signal: controller.signal,
                        async confirmLargeRequest(total) {
                            const result = await Swal.fire({
                                icon: 'warning',
                                title: 'Carregar muitos tiles?',
                                text: `Serão solicitados ${total.toLocaleString('pt-BR')} tiles. O carregamento pode ser demorado e a imagem final continua limitada a 2048 pixels por lado.`,
                                showCancelButton: true,
                                confirmButtonText: 'Carregar',
                                cancelButtonText: 'Cancelar'
                            });
                            return result.isConfirmed;
                        },
                        onProgress(completed, total) {
                            if (version === sceneVersion) {
                                post({ type: 'planmilt-3d-status', message: `Carregando tiles: ${completed} de ${total}…` });
                            }
                        }
                    }),
                    requestTerrain()
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
                            image: texture.image, zoom: texture.zoom, zoomRequested: selectedZoom, bounds,
                            elevations: terrain.elevations,
                            missingTiles: terrain.missingTiles,
                            source
                        }
                    });
                }
            } catch (error) {
                controller.abort();
                if (version === sceneVersion) {
                    post({
                        type: 'planmilt-3d-error',
                        message: error.message || 'Não foi possível atualizar o visualizador 3D.'
                    });
                }
            } finally {
                if (activeCapture === controller) activeCapture = undefined;
            }
        } while (recapture && !overlay.hidden);
        capturing = false;
    }

    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin || event.source !== frame.contentWindow || !event.data) return;
        if (event.data.type === 'planmilt-3d-close' && !overlay.hidden) {
            sceneVersion++;
            if (activeCapture) activeCapture.abort();
            overlay.hidden = true;
            document.body.classList.remove('map-3d-open');
            button.focus();
            return;
        }
        if (event.data.type === 'planmilt-3d-ready') viewerReady = true;
        if (!overlay.hidden && (event.data.type === 'planmilt-3d-ready' || event.data.type === 'planmilt-3d-refresh')) {
            if (!['opentopo', 'bdgex'].includes(event.data.source)) return;
            if (event.data.zoom !== undefined && event.data.zoom !== null
                && (!Number.isInteger(event.data.zoom) || event.data.zoom < 0 || event.data.zoom > 18)) return;
            selectedSource = event.data.source;
            selectedZoom = event.data.zoom ?? null;
            sceneVersion++;
            if (activeCapture) activeCapture.abort();
            sendScene();
        }
    });

    button.addEventListener('click', () => {
        sceneVersion++;
        selectedZoom = null;
        overlay.hidden = false;
        document.body.classList.add('map-3d-open');
        if (!frame.getAttribute('src')) frame.src = 'visualizador-3d.html?v=20261112-tiles';
        else if (viewerReady) sendScene();
        frame.focus();
    });
})();
