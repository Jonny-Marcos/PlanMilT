/**
 * @fileoverview Gerencia seleção, download e exclusão de pacotes de mapas para uso offline.
 * @exports window.PlanMilT.offlineManager
 * @requires Leaflet, Leaflet Draw, SweetAlert2, Cache Storage, Service Worker e API client
 */
(() => {
    window.PlanMilT = window.PlanMilT || {};

    const PACKAGE_PREFIX = 'planmilt-offline-package-v1:';
    const STORAGE_KEY = `planmilt.offline-packages.v1:${location.pathname}`;
    const MAX_MAP_TILES = 10000;
    const CONFIRM_TILE_COUNT = 256;
    const PROVIDERS = {
        opentopo: {
            label: 'OpenTopoMap',
            layerName: 'OpenTopo',
            template: 'https://tile.opentopomap.org/{z}/{x}/{y}.png'
        },
        bdgex: {
            label: 'BDGEx - CTM50',
            layerName: 'BDGEx - CTM50'
        }
    };
    let selectingArea = false;

    /**
     * Normaliza limites geográficos e impede áreas que cruzam o antimeridiano.
     * @param {Object|Array<Array<number>>} input - Bounds Leaflet ou objeto cartesiano.
     * @returns {{south:number,west:number,north:number,east:number}} Limites normalizados.
     */
    function normalizeBounds(input) {
        let bounds;
        if (Array.isArray(input) && input.length === 2) {
            const [[south, west], [north, east]] = input;
            bounds = { south, west, north, east };
        } else if (input && typeof input.getSouth === 'function') {
            bounds = {
                south: input.getSouth(),
                west: input.getWest(),
                north: input.getNorth(),
                east: input.getEast()
            };
        } else {
            bounds = input || {};
        }
        for (const key of ['south', 'west', 'north', 'east']) {
            if (!Number.isFinite(bounds[key])) throw new Error('A área selecionada não possui limites válidos.');
        }
        bounds = { ...bounds };
        if (bounds.south > bounds.north) [bounds.south, bounds.north] = [bounds.north, bounds.south];
        if (bounds.west > bounds.east) {
            throw new Error('A área não pode cruzar o antimeridiano.');
        }
        if (bounds.north > 85 || bounds.south < -85) {
            throw new Error('A área offline deve permanecer entre as latitudes -85° e 85°.');
        }
        if (bounds.west < -180 || bounds.east > 180 || bounds.west === bounds.east
            || bounds.south === bounds.north) {
            throw new Error('Selecione uma área válida que não cruze o antimeridiano.');
        }
        return bounds;
    }

    /**
     * Calcula coordenadas XYZ de um ponto Web Mercator.
     * @param {number} latitude - Latitude WGS84.
     * @param {number} longitude - Longitude WGS84.
     * @param {number} zoom - Nível de zoom.
     * @returns {{x:number,y:number}} Índices de tile.
     */
    function projectWebMercatorTile(latitude, longitude, zoom) {
        const size = 2 ** zoom;
        const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
        const x = Math.floor(((longitude + 180) / 360) * size);
        const sin = Math.sin(lat * Math.PI / 180);
        const y = Math.floor((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size);
        return { x: Math.max(0, Math.min(size - 1, x)), y: Math.max(0, Math.min(size - 1, y)) };
    }

    /**
     * Obtém o intervalo XYZ de uma área para um nível de zoom.
     * @param {Object} boundsInput - Limites geográficos.
     * @param {number} zoom - Nível de zoom.
     * @returns {{minX:number,maxX:number,minY:number,maxY:number}} Intervalo inclusivo.
     */
    function getTileRange(boundsInput, zoom) {
        const bounds = normalizeBounds(boundsInput);
        const northwest = projectWebMercatorTile(bounds.north, bounds.west, zoom);
        const southeast = projectWebMercatorTile(bounds.south, bounds.east, zoom);
        return { minX: northwest.x, maxX: southeast.x, minY: northwest.y, maxY: southeast.y };
    }

    /**
     * Estima o número de URLs de tiles na área e no intervalo de zoom.
     * @param {Object} bounds - Limites geográficos.
     * @param {number} minZoom - Zoom mínimo.
     * @param {number} maxZoom - Zoom máximo.
     * @param {Array<string>} sources - Fontes selecionadas.
     * @returns {number} Quantidade estimada de tiles.
     */
    function estimateTileCount(bounds, minZoom, maxZoom, sources) {
        if (!Number.isInteger(minZoom) || !Number.isInteger(maxZoom)
            || minZoom < 0 || maxZoom > 18 || minZoom > maxZoom) {
            throw new Error('Os níveis de zoom devem ser inteiros e estar entre 0 e 18.');
        }
        let count = 0;
        for (const source of sources) {
            if (!PROVIDERS[source]) throw new Error('Camada-base offline não suportada.');
            for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
                const range = getTileRange(bounds, zoom);
                count += (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1)
                    * (source === 'bdgex' ? Math.ceil(256 / 96) ** 2 : 1);
            }
        }
        return count;
    }

    /**
     * Monta URLs XYZ para a camada OpenTopoMap.
     * @param {Object} bounds - Limites geográficos.
     * @param {number} minZoom - Zoom mínimo.
     * @param {number} maxZoom - Zoom máximo.
     * @returns {Array<string>} URLs de tiles.
     */
    function buildOpenTopoUrls(bounds, minZoom, maxZoom) {
        const urls = [];
        for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
            const range = getTileRange(bounds, zoom);
            for (let x = range.minX; x <= range.maxX; x++) {
                for (let y = range.minY; y <= range.maxY; y++) {
                    urls.push(PROVIDERS.opentopo.template
                        .replace('{z}', zoom).replace('{x}', x).replace('{y}', y));
                }
            }
        }
        return urls;
    }

    /**
     * Monta URLs WMS usando o próprio gerador de tiles da camada Leaflet.
     * @param {Object} layer - Camada WMS Leaflet.
     * @param {Object} boundsInput - Limites geográficos.
     * @param {number} minZoom - Zoom mínimo.
     * @param {number} maxZoom - Zoom máximo.
     * @param {Object} leaflet - Namespace Leaflet.
     * @returns {Array<string>} URLs de imagens WMS.
     */
    function buildWmsUrls(layer, boundsInput, minZoom, maxZoom, leaflet) {
        const bounds = normalizeBounds(boundsInput);
        const crs = layer._map?.options?.crs || leaflet.CRS.EPSG3857;
        const tileSize = Number(layer.options?.tileSize) || 256;
        const urls = [];
        for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
            const northwest = crs.latLngToPoint(leaflet.latLng(bounds.north, bounds.west), zoom);
            const southeast = crs.latLngToPoint(leaflet.latLng(bounds.south, bounds.east), zoom);
            const minX = Math.floor(northwest.x / tileSize);
            const maxX = Math.floor(southeast.x / tileSize);
            const minY = Math.floor(northwest.y / tileSize);
            const maxY = Math.floor(southeast.y / tileSize);
            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    const tilePoint = leaflet.point(x, y);
                    tilePoint.z = zoom;
                    urls.push(layer.getTileUrl(tilePoint));
                }
            }
        }
        return [...new Set(urls)];
    }

    /**
     * Determina os tiles HGT de 1° necessários para cobrir uma área.
     * @param {Object} boundsInput - Limites geográficos.
     * @returns {Array<string>} Nomes de tiles HGT.
     */
    function getSrtmTileNames(boundsInput) {
        const bounds = normalizeBounds(boundsInput);
        const minLat = Math.floor(bounds.south);
        const maxLat = Math.ceil(bounds.north) - 1;
        const minLon = Math.floor(bounds.west);
        const maxLon = Math.ceil(bounds.east) - 1;
        const tiles = [];
        for (let latitude = minLat; latitude <= maxLat; latitude++) {
            for (let longitude = minLon; longitude <= maxLon; longitude++) {
                const latPrefix = latitude >= 0 ? 'N' : 'S';
                const lonPrefix = longitude >= 0 ? 'E' : 'W';
                tiles.push(
                    `${latPrefix}${String(Math.abs(latitude)).padStart(2, '0')}`
                    + `${lonPrefix}${String(Math.abs(longitude)).padStart(3, '0')}.HGT`
                );
            }
        }
        return tiles;
    }

    /**
     * Lê os manifestos locais, ignorando formato inválido de forma explícita.
     * @returns {Array<Object>} Manifestos válidos.
     */
    function loadPackages() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const valid = Array.isArray(parsed) && parsed.every(item => {
            if (!item || !/^\d+-[a-z0-9]+$/i.test(item.id)
                || item.cacheName !== `${PACKAGE_PREFIX}${item.id}`
                || !Array.isArray(item.sources)
                || item.sources.some(source => !PROVIDERS[source])
                || !Number.isInteger(item.minZoom) || !Number.isInteger(item.maxZoom)
                || item.minZoom < 0 || item.maxZoom > 18 || item.minZoom > item.maxZoom
                || !Number.isFinite(item.tileCount) || item.tileCount < 0) {
                return false;
            }
            try {
                normalizeBounds(item.bounds);
                return true;
            } catch (error) {
                return false;
            }
        });
        if (!valid) {
            throw new Error('Os pacotes offline locais estão em formato inválido.');
        }
        return parsed;
    }

    /**
     * Grava o catálogo de pacotes locais.
     * @param {Array<Object>} packages - Manifestos a persistir.
     */
    function savePackages(packages) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(packages));
    }

    /**
     * Envia o download ao Service Worker e acompanha seu progresso.
     * @param {ServiceWorkerRegistration} registration - Registro ativo.
     * @param {string} cacheName - Nome do cache do pacote.
     * @param {Array<string>} urls - URLs a armazenar.
     * @param {Function} onProgress - Callback de progresso.
     * @returns {Promise<{cached:number,total:number}>} Resultado do armazenamento.
     */
    function cachePackage(registration, cacheName, urls, onProgress) {
        const worker = registration.installing || registration.waiting || registration.active;
        if (!worker) throw new Error('O serviço offline ainda não está pronto.');
        return new Promise((resolve, reject) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = event => {
                if (event.data.type === 'PACKAGE_PROGRESS') {
                    onProgress(event.data.completed, event.data.total);
                } else if (event.data.type === 'PACKAGE_COMPLETE') {
                    channel.port1.close();
                    resolve({ cached: event.data.cached, total: event.data.total });
                } else if (event.data.type === 'PACKAGE_ERROR') {
                    channel.port1.close();
                    reject(new Error(event.data.message));
                }
            };
            worker.postMessage({
                type: 'CACHE_PACKAGE',
                cacheName,
                urls
            }, [channel.port2]);
        });
    }

    /**
     * Registra e aguarda o Service Worker na URL reescrita da instalação.
     * @returns {Promise<ServiceWorkerRegistration>} Registro pronto.
     */
    async function registerWorker() {
        if (!('serviceWorker' in navigator) || !('caches' in window)) {
            throw new Error('Este navegador ou contexto não oferece suporte a pacotes offline.');
        }
        const registration = await navigator.serviceWorker.register('offline-worker.js', { scope: './' });
        const worker = registration.active || registration.waiting || registration.installing;
        if (worker && worker.state !== 'activated') {
            await new Promise((resolve, reject) => {
                const onStateChange = () => {
                    if (worker.state === 'activated') {
                        worker.removeEventListener('statechange', onStateChange);
                        resolve();
                    } else if (worker.state === 'redundant') {
                        worker.removeEventListener('statechange', onStateChange);
                        reject(new Error('O serviço offline não pôde ser instalado.'));
                    }
                };
                worker.addEventListener('statechange', onStateChange);
                onStateChange();
            });
        }
        if (!registration.active) throw new Error('O serviço offline não está ativo.');
        return registration;
    }

    /**
     * Formata limites como texto compacto.
     * @param {Object} bounds - Limites geográficos.
     * @returns {string} Resumo legível.
     */
    function formatBounds(bounds) {
        return `S ${bounds.south.toFixed(4)} · O ${bounds.west.toFixed(4)} · N ${bounds.north.toFixed(4)} · L ${bounds.east.toFixed(4)}`;
    }

    /**
     * Inicializa o botão e o gerenciador offline no mapa principal.
     * @param {Object} dependencies - Dependências do mapa.
     * @returns {{open: Function}} Controlador público.
     */
    function attach({ map, leaflet, layerRegistry, button, sweetAlert, apiClient }) {
        const Swal = sweetAlert;
        let selectedBounds = normalizeBounds(map.getBounds());

        /**
         * Apresenta um erro do fluxo sem ocultar detalhes técnicos do console.
         * @param {Error} error - Erro recebido.
         */
        async function showError(error) {
            console.error('[PlanMilT][Offline] Falha no gerenciador.', error);
            await Swal.fire('Pacotes offline', error instanceof Error ? error.message : 'Não foi possível concluir a operação.', 'error');
        }

        /**
         * Atualiza o resumo de conteúdo e custo estimado do formulário.
         */
        function updateEstimate() {
            const minInput = document.getElementById('offlineMinZoom');
            const maxInput = document.getElementById('offlineMaxZoom');
            const estimate = document.getElementById('offlineEstimate');
            const download = document.getElementById('offlineDownload');
            if (!minInput || !maxInput || !estimate || !download) return;
            try {
                const minZoom = Number(minInput.value);
                const maxZoom = Number(maxInput.value);
                if (!Number.isInteger(minZoom) || !Number.isInteger(maxZoom)
                    || minZoom < 0 || maxZoom > 18 || minZoom > maxZoom) {
                    throw new Error('Escolha níveis de zoom entre 0 e 18, em ordem crescente.');
                }
                const sources = [...document.querySelectorAll('input[name="offlineSource"]:checked')]
                    .map(input => input.value);
                const includeElevation = document.getElementById('offlineElevation')?.checked;
                if (sources.length === 0 && !includeElevation) {
                    throw new Error('Selecione uma camada-base ou a elevação SRTM.');
                }
                const count = estimateTileCount(selectedBounds, minZoom, maxZoom, sources);
                const srtm = includeElevation ? getSrtmTileNames(selectedBounds).length : 0;
                const estimateMiB = count > 0 ? Math.max(1, Math.ceil(count * 22 / 1024)) : 0;
                estimate.textContent = `${count.toLocaleString('pt-BR')} tiles (~${estimateMiB} MiB) e ${srtm} tile(s) SRTM.`;
                download.disabled = count > MAX_MAP_TILES || srtm > 32;
                if (count > MAX_MAP_TILES) {
                    estimate.textContent += ' Reduza a área ou o zoom (limite: 10.000 tiles).';
                } else if (srtm > 32) {
                    estimate.textContent += ' Reduza a área (limite: 32 tiles SRTM).';
                }
            } catch (error) {
                estimate.textContent = error.message;
                download.disabled = true;
            }
        }

        /**
         * Baixa os arquivos HGT necessários, registrando falhas sem cancelar os tiles já obtidos.
         * @param {Array<string>} tiles - Nomes HGT.
         * @param {Function} progress - Callback visual.
         * @returns {Promise<Array<string>>} Tiles que não puderam ser obtidos.
         */
        async function downloadSrtm(tiles, progress) {
            const failed = [];
            for (const [index, tile] of tiles.entries()) {
                progress(`Elevação ${index + 1}/${tiles.length}: ${tile}`);
                try {
                    const response = await apiClient.request('php/endpoints/elevation-download.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tile })
                    });
                    const result = await response.json();
                    if (!response.ok || !result.success || result.tile !== tile) failed.push(tile);
                } catch (error) {
                    console.error('[PlanMilT][Offline] Falha ao obter elevação.', error);
                    failed.push(tile);
                }
            }
            return failed;
        }

        /**
         * Cria o pacote escolhido no formulário.
         */
        async function createPackage() {
            const minZoom = Number(document.getElementById('offlineMinZoom').value);
            const maxZoom = Number(document.getElementById('offlineMaxZoom').value);
            const sources = [...document.querySelectorAll('input[name="offlineSource"]:checked')]
                .map(input => input.value);
            const includeElevation = document.getElementById('offlineElevation').checked;
            if (sources.length === 0 && !includeElevation) {
                throw new Error('Selecione uma camada-base ou a elevação SRTM.');
            }
            const tileCount = estimateTileCount(selectedBounds, minZoom, maxZoom, sources);
            const srtmTiles = includeElevation ? getSrtmTileNames(selectedBounds) : [];
            if (tileCount > MAX_MAP_TILES || srtmTiles.length > 32) {
                throw new Error('A seleção excede os limites de segurança do pacote offline.');
            }
            if (tileCount > CONFIRM_TILE_COUNT) {
                const confirmation = await Swal.fire({
                    title: 'Download extenso',
                    text: `O pacote contém ${tileCount.toLocaleString('pt-BR')} tiles. Deseja continuar?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Continuar',
                    cancelButtonText: 'Cancelar'
                });
                if (!confirmation.isConfirmed) return;
            }

            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const cacheName = `${PACKAGE_PREFIX}${id}`;
            const urls = [];
            if (sources.includes('opentopo')) {
                urls.push(...buildOpenTopoUrls(selectedBounds, minZoom, maxZoom));
            }
            if (sources.includes('bdgex')) {
                urls.push(...buildWmsUrls(
                    layerRegistry[PROVIDERS.bdgex.layerName],
                    selectedBounds,
                    minZoom,
                    maxZoom,
                    leaflet
                ));
            }

            Swal.fire({
                title: 'Preparando pacote offline',
                html: '<p id="offlineProgress">Registrando serviço offline…</p>',
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false
            });
            const registration = await registerWorker();
            let result;
            try {
                result = await cachePackage(registration, cacheName, [...new Set(urls)], (completed, total) => {
                    const progress = document.getElementById('offlineProgress');
                    if (progress) progress.textContent = `Armazenando tiles ${completed} de ${total}…`;
                });
            } catch (error) {
                await caches.delete(cacheName);
                throw error;
            }
            let failedSrtm = [];
            if (srtmTiles.length > 0) {
                failedSrtm = await downloadSrtm(srtmTiles, message => {
                    const progress = document.getElementById('offlineProgress');
                    if (progress) progress.textContent = message;
                });
            }
            if (result.cached === 0 && (srtmTiles.length === 0 || failedSrtm.length === srtmTiles.length)) {
                await caches.delete(cacheName);
                throw new Error('Nenhum dado do pacote pôde ser obtido.');
            }
            const packages = loadPackages();
            packages.push({
                id,
                cacheName,
                bounds: selectedBounds,
                sources,
                minZoom,
                maxZoom,
                tileCount: result.cached,
                failedTileCount: Math.max(0, result.total - result.cached),
                srtmTiles,
                failedSrtm,
                createdAt: new Date().toISOString()
            });
            try {
                savePackages(packages);
            } catch (error) {
                await caches.delete(cacheName);
                throw error;
            }
            await Swal.fire({
                title: 'Pacote disponível offline',
                html: `${result.cached} tile(s) de mapa armazenado(s).`
                    + (result.cached < result.total ? `<br>${result.total - result.cached} tile(s) não puderam ser obtidos.` : '')
                    + (failedSrtm.length ? `<br>Elevação pendente: ${failedSrtm.join(', ')}` : ''),
                icon: failedSrtm.length || result.cached < result.total ? 'warning' : 'success'
            });
            await openManager();
        }

        /**
         * Exclui um pacote do Cache Storage e seu manifesto.
         * @param {string} id - Identificador do pacote.
         */
        async function deletePackage(id) {
            const packages = loadPackages();
            const item = packages.find(candidate => candidate.id === id);
            if (!item) throw new Error('Pacote offline não encontrado.');
            const confirmation = await Swal.fire({
                title: 'Excluir pacote offline?',
                text: 'Os tiles de mapa deste pacote serão removidos. Os arquivos SRTM permanecem no servidor local.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Excluir',
                cancelButtonText: 'Cancelar'
            });
            if (!confirmation.isConfirmed) return;
            await caches.delete(item.cacheName);
            savePackages(packages.filter(candidate => candidate.id !== id));
            await openManager();
        }

        /**
         * Inicia a seleção de um retângulo diretamente no mapa.
         */
        async function selectArea() {
            Swal.close();
            selectingArea = true;
            const rectangle = new leaflet.Draw.Rectangle(map, {
                shapeOptions: { color: '#31547c', weight: 3, fillOpacity: 0.15 }
            });
            const finish = event => {
                selectingArea = false;
                map.off(leaflet.Draw.Event.CREATED, finish);
                rectangle.disable();
                selectedBounds = normalizeBounds(event.layer.getBounds());
                Swal.close();
                openManager();
            };
            map.on(leaflet.Draw.Event.CREATED, finish);
            rectangle.enable();
            const choice = await Swal.fire({
                title: 'Selecione a área offline',
                text: 'Desenhe um retângulo no mapa. Pressione “Cancelar seleção” para voltar.',
                toast: true,
                position: 'top',
                showConfirmButton: true,
                confirmButtonText: 'Cancelar seleção',
                allowOutsideClick: false,
                allowEscapeKey: false,
                backdrop: false
            });
            if (choice.isConfirmed && selectingArea) {
                selectingArea = false;
                map.off(leaflet.Draw.Event.CREATED, finish);
                rectangle.disable();
                await openManager();
            }
        }

        /**
         * Abre o formulário e a lista de pacotes disponíveis.
         */
        async function openManager() {
            const packages = loadPackages();
            const currentZoom = Math.max(0, Math.min(18, Math.round(map.getZoom())));
            const list = packages.length
                ? packages.map(item => {
                    const labels = [
                        ...item.sources.map(source => PROVIDERS[source].label),
                        ...(Array.isArray(item.srtmTiles) && item.srtmTiles.length ? ['SRTM'] : [])
                    ].join(', ') || 'Pacote';
                    return `<li><div><strong>${labels}</strong><span>${formatBounds(item.bounds)}</span>`
                        + `<span>Zoom ${item.minZoom}–${item.maxZoom} · ${item.tileCount} tiles`
                        + (item.failedTileCount ? ` · ${item.failedTileCount} pendentes` : '')
                        + `</span></div>`
                        + `<button type="button" data-delete-offline="${item.id}">Excluir</button></li>`;
                }).join('')
                : '<li class="offline-empty">Nenhum pacote disponível neste navegador.</li>';
            const result = await Swal.fire({
                title: 'Pacotes offline',
                html: `
                    <style>
                        .swal2-popup.offline-modal{width:min(760px,calc(100vw - 28px))!important;padding:20px!important}
                        #offlineManager{display:grid;gap:14px;text-align:left;color:#263443;font-size:14px}
                        #offlineManager h3{margin:0;font-size:14px}
                        #offlineManager .offline-box{border:1px solid #d3d8e0;border-radius:8px;padding:12px;background:#fff}
                        #offlineManager .offline-area{display:grid;gap:8px}
                        #offlineManager .offline-actions,#offlineManager .offline-sources,#offlineManager .offline-zoom{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
                        #offlineManager button{border:1px solid #9aa8b8;border-radius:6px;background:#f5f7fa;padding:8px 12px;cursor:pointer}
                        #offlineManager button.primary{background:#435f88;color:#fff;border-color:#435f88}
                        #offlineManager button:disabled{opacity:.55;cursor:not-allowed}
                        #offlineManager input[type=number]{width:70px;border:1px solid #c5cad2;border-radius:5px;padding:6px}
                        #offlineManager ul{list-style:none;margin:8px 0 0;padding:0;max-height:180px;overflow:auto}
                        #offlineManager li{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #e1e5eb}
                        #offlineManager li>div{display:grid;gap:2px}
                        #offlineManager li span{font-size:12px;color:#526171}
                        #offlineEstimate{font-size:12px;color:#435f88}
                    </style>
                    <div id="offlineManager">
                        <section class="offline-box">
                            <h3>Área de interesse</h3>
                            <div class="offline-area">
                                <span>${formatBounds(selectedBounds)}</span>
                                <div class="offline-actions">
                                    <button id="offlineUseViewport" type="button">Usar tela atual</button>
                                    <button id="offlineDrawArea" type="button">Desenhar retângulo</button>
                                </div>
                            </div>
                        </section>
                        <section class="offline-box">
                            <h3>Conteúdo do pacote</h3>
                            <div class="offline-sources">
                                <label><input type="checkbox" name="offlineSource" value="opentopo" checked> OpenTopoMap</label>
                                <label><input type="checkbox" name="offlineSource" value="bdgex"> BDGEx - CTM50</label>
                                <label><input type="checkbox" id="offlineElevation"> Elevação SRTM local</label>
                            </div>
                            <div class="offline-zoom">
                                <label>Zoom mínimo <input id="offlineMinZoom" type="number" min="0" max="18" value="${Math.max(0, currentZoom - 1)}"></label>
                                <label>Zoom máximo <input id="offlineMaxZoom" type="number" min="0" max="18" value="${currentZoom}"></label>
                            </div>
                            <div id="offlineEstimate"></div>
                            <button id="offlineDownload" class="primary" type="button">Baixar pacote</button>
                        </section>
                        <section class="offline-box">
                            <h3>Pacotes disponíveis</h3>
                            <ul>${list}</ul>
                            <small>A exclusão remove os tiles do navegador; SRTM continua em <code>SRTM3/</code>. Os dados do pacote ficam no perfil deste navegador e devem ser protegidos conforme a sensibilidade da área.</small>
                        </section>
                    </div>`,
                customClass: { popup: 'offline-modal' },
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: 'Fechar',
                didOpen: () => {
                    document.getElementById('offlineUseViewport').addEventListener('click', () => {
                        selectedBounds = normalizeBounds(map.getBounds());
                        openManager();
                    });
                    document.getElementById('offlineDrawArea').addEventListener('click', selectArea);
                    document.querySelectorAll('[name="offlineSource"], #offlineMinZoom, #offlineMaxZoom, #offlineElevation')
                        .forEach(input => input.addEventListener('change', updateEstimate));
                    document.getElementById('offlineDownload').addEventListener('click', () => {
                        createPackage().catch(showError);
                    });
                    document.querySelectorAll('[data-delete-offline]').forEach(item => {
                        item.addEventListener('click', () => deletePackage(item.dataset.deleteOffline).catch(showError));
                    });
                    updateEstimate();
                }
            });
            return result;
        }

        button.addEventListener('click', () => {
            openManager().catch(showError);
        });
        registerWorker().catch(error => {
            console.warn('[PlanMilT][Offline] Serviço offline indisponível.', error);
            button.title = 'Pacotes offline indisponíveis neste contexto';
            button.classList.add('is-disabled');
            button.disabled = true;
        });
        return Object.freeze({ open: openManager });
    }

    window.PlanMilT.offlineManager = Object.freeze({
        attach,
        normalizeBounds,
        getTileRange,
        estimateTileCount,
        buildOpenTopoUrls,
        buildWmsUrls,
        getSrtmTileNames,
        isSelectingArea: () => selectingArea
    });
})();
