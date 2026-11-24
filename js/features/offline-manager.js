/**
 * @fileoverview Gerencia seleção, download e exclusão de pacotes de mapas para uso offline.
 * @exports window.PlanMilT.offlineManager
 * @requires Leaflet, Leaflet Draw, SweetAlert2, Cache Storage, Service Worker e API client
 */
(() => {
    window.PlanMilT = window.PlanMilT || {};

    const PACKAGE_PREFIX = 'planmilt-offline-package-v1:';
    const TERRAIN_CACHE_PREFIX = 'planmilt-offline-terrain-v1:';
    const TERRAIN_GRID_SIZE = 65;
    const STORAGE_KEY = `planmilt.offline-packages.v1:${location.pathname}`;
    const MAX_MAP_TILES = 10000;
    const CONFIRM_TILE_COUNT = 256;
    const OFFLINE_ZOOM_LEVELS = [8, 10, 12, 14, 15];
    const OFFLINE_ZOOM_LABELS = {
        8: 'Visão ampla',
        10: 'Visão regional',
        12: 'Equilíbrio entre área e detalhes',
        14: 'Mais detalhes',
        15: 'Detalhes máximos'
    };
    const SENTINEL_LAYER_NAME = 'Sentinel-2 Cloudless 2024 (EOX)';
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
    const MAX_TILE_URLS = 10000;
    const NETWORK_CONTROL_IDS = [
        'saveDrawings',
        'loadDrawings',
        'loadImages',
        'shareLink',
        'startPlanning',
        'suggestionsButton',
        'addLayerButton',
        'imageEditorLoadTheme'
    ];
    const NETWORK_ACTION_SELECTOR = '[data-image-editor-action="save"]';
    const HIDDEN_PACKAGE_LAYERS = new Set([
        'Quadrículas - UTM',
        'Sugestão de Planejamento',
        'Google Satellite'
    ]);
    let selectingArea = false;
    let workerRegistrationPromise;

    /**
     * Atualiza o indicador e os controles que precisam de conexão com a rede.
     * @param {Document} documentRoot - Documento que contém a interface.
     * @param {boolean} isOnline - Estado atual da conexão.
     */
    function updateConnectionState(documentRoot, isOnline) {
        const status = documentRoot.getElementById('offlineStatus');
        const controls = NETWORK_CONTROL_IDS
            .map(id => documentRoot.getElementById(id))
            .filter(Boolean);
        controls.push(...documentRoot.querySelectorAll(NETWORK_ACTION_SELECTOR));

        if (status) {
            status.hidden = isOnline;
            status.setAttribute('aria-hidden', String(isOnline));
        }
        documentRoot.body?.classList.toggle('is-offline', !isOnline);

        controls.forEach(control => {
            if (!isOnline) {
                if (!control.dataset.offlineManaged) {
                    control.dataset.offlineManaged = 'true';
                    control.dataset.offlineWasDisabled = control.disabled ? 'true' : 'false';
                    control.dataset.offlineTitle = control.title || '';
                }
                if ('disabled' in control) control.disabled = true;
                control.classList.add('is-offline-disabled');
                control.setAttribute('aria-disabled', 'true');
                control.tabIndex = -1;
                control.title = 'Indisponível no modo offline';
            } else if (control.dataset.offlineManaged) {
                if ('disabled' in control) control.disabled = control.dataset.offlineWasDisabled === 'true';
                control.classList.remove('is-offline-disabled');
                control.removeAttribute('aria-disabled');
                control.removeAttribute('tabindex');
                control.title = control.dataset.offlineTitle;
                delete control.dataset.offlineManaged;
                delete control.dataset.offlineWasDisabled;
                delete control.dataset.offlineTitle;
            }
        });
    }

    /**
     * Liga a interface aos eventos nativos de conectividade.
     * @param {Document} documentRoot - Documento da aplicação.
     * @param {Navigator} browserNavigator - Navegador observado.
     * @param {EventTarget} eventTarget - Alvo dos eventos online/offline.
     * @returns {Function} Atualizador de estado sem remover ouvintes.
     */
    function attachConnectionState(documentRoot, browserNavigator, eventTarget) {
        const update = () => updateConnectionState(documentRoot, browserNavigator.onLine !== false);
        const blockNetworkControl = event => {
            const target = event.target.closest?.(`#${NETWORK_CONTROL_IDS.join(', #')}${NETWORK_ACTION_SELECTOR ? `, ${NETWORK_ACTION_SELECTOR}` : ''}`);
            if (browserNavigator.onLine !== false || !target) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        documentRoot.addEventListener('click', blockNetworkControl, true);
        eventTarget.addEventListener('online', update);
        eventTarget.addEventListener('offline', update);
        update();
        return update;
    }

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
    function createTileUrlContext(layer, map) {
        const activeMap = map || layer._map;
        const tileLayer = Object.create(layer);
        if (activeMap) tileLayer._map = activeMap;
        if (layer.wmsParams) {
            tileLayer._crs = layer.options?.crs || activeMap?.options?.crs || layer._crs;
            tileLayer._wmsVersion = parseFloat(layer.wmsParams.version);
            tileLayer.wmsParams = { ...layer.wmsParams };
            tileLayer.wmsParams[tileLayer._wmsVersion >= 1.3 ? 'crs' : 'srs'] = tileLayer._crs.code;
        }
        return tileLayer;
    }

    /**
     * Calcula uma URL de tile sem ativar a camada no mapa.
     * @param {Object} layer - Camada Leaflet.
     * @param {Object} coords - Coordenadas XYZ do tile.
     * @param {Object} leaflet - Namespace Leaflet.
     * @param {Object} map - Mapa que define a projeção dos tiles.
     * @returns {string} URL de tile gerada pela camada.
     */
    function getTileUrl(layer, coords, leaflet, map) {
        const tileLayer = createTileUrlContext(layer, map);
        const crs = map?.options?.crs || layer._map?.options?.crs || layer.options?.crs || leaflet.CRS.EPSG3857;
        const tileSize = Number(layer.options?.tileSize) || 256;
        tileLayer._tileZoom = coords.z;
        const projectedBounds = crs.getProjectedBounds?.(coords.z);
        if (projectedBounds) {
            tileLayer._globalTileRange = { max: { y: Math.ceil(projectedBounds.max.y / tileSize) - 1 } };
        }
        const point = leaflet.point(coords.x, coords.y);
        point.z = coords.z;
        return tileLayer.getTileUrl(point);
    }

    /**
     * Monta URLs WMS usando o gerador de tiles da camada e a projeção do mapa.
     * @param {Object} layer - Camada Leaflet.
     * @param {Object} boundsInput - Limites geográficos.
     * @param {number} minZoom - Zoom mínimo.
     * @param {number} maxZoom - Zoom máximo.
     * @param {Object} leaflet - Namespace Leaflet.
     * @param {Object} map - Mapa que define a projeção dos tiles.
     * @returns {Array<string>} URLs de imagens WMS.
     */
    function buildWmsUrls(layer, boundsInput, minZoom, maxZoom, leaflet, map) {
        const bounds = normalizeBounds(boundsInput);
        const activeMap = map || layer._map;
        const crs = activeMap?.options?.crs || layer.options?.crs || layer._crs || leaflet.CRS.EPSG3857;
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
                    urls.push(getTileUrl(layer, { x, y, z: zoom }, leaflet, activeMap));
                    if (urls.length > MAX_TILE_URLS) return [...new Set(urls)];
                }
            }
        }
        return [...new Set(urls)];
    }

    /**
     * Lista as camadas de tiles oferecidas no controle do mapa e informa as que podem ser baixadas.
     * @param {Object} layerRegistry - Registro de camadas por nome.
     * @returns {Array<{name:string,layer:Object,supported:boolean,reason:string}>} Camadas identificadas.
     */
    function listTileLayers(layerRegistry) {
        return Object.entries(layerRegistry)
            .filter(([name]) => !HIDDEN_PACKAGE_LAYERS.has(name))
            .map(([name, layer]) => {
                const sampleUrl = layer?._url || '';
                let supported = Boolean(layer && typeof layer.getTileUrl === 'function');
                let reason = supported ? '' : 'camada local; restaurada com a sessão do mapa';
                if (supported && /(?:^|\.)(?:google|googleapis)\.com(?:\/|$)/i.test(sampleUrl)) {
                    supported = false;
                    reason = 'conteúdo Google sem autorização de cache ou download offline';
                } else if (supported && sampleUrl.startsWith('http://')) {
                    supported = false;
                    reason = 'serviço HTTP indisponível para pacote em HTTPS';
                } else if (supported && (!sampleUrl || !/^(?:https?:\/\/|\{s\})/i.test(sampleUrl))) {
                    try {
                        const parsed = new URL(sampleUrl, location.href);
                        supported = parsed.protocol === 'https:';
                    } catch (error) {
                        supported = false;
                    }
                    if (!supported) reason = 'formato de URL não compatível';
                }
                return { name, layer, supported, reason };
            });
    }

    /**
     * Gera as URLs necessárias para qualquer camada Leaflet de tiles registrada.
     * @param {Object} layer - Camada de tiles Leaflet.
     * @param {Object} bounds - Limites geográficos.
     * @param {number} minZoom - Zoom mínimo.
     * @param {number} maxZoom - Zoom máximo.
     * @param {Object} leaflet - Namespace Leaflet.
     * @returns {Array<string>} URLs únicas da camada.
     */
    function buildTileLayerUrls(layer, bounds, minZoom, maxZoom, leaflet, map) {
        return buildWmsUrls(layer, bounds, minZoom, maxZoom, leaflet, map);
    }

    /**
     * Calcula quantas URLs as camadas selecionadas ocuparão no pacote.
     * @param {Object} bounds - Limites geográficos.
     * @param {number} minZoom - Zoom mínimo.
     * @param {number} maxZoom - Zoom máximo.
     * @param {Array<string>} layerNames - Nomes das camadas selecionadas.
     * @param {Object} layerRegistry - Registro de camadas por nome.
     * @param {Object} leaflet - Namespace Leaflet.
     * @returns {number} Quantidade total de tiles únicos por camada.
     */
    function estimateRegisteredLayerTileCount(bounds, minZoom, maxZoom, layerNames, layerRegistry, leaflet, map) {
        return layerNames.reduce((total, name) => {
            const layer = layerRegistry[name];
            if (!layer || typeof layer.getTileUrl !== 'function') {
                throw new Error(`A camada “${name}” não está disponível para download offline.`);
            }
            return total + buildTileLayerUrls(layer, bounds, minZoom, maxZoom, leaflet, map).length;
        }, 0);
    }

    /**
     * Escapa texto antes de inseri-lo no modal HTML.
     * @param {*} value - Valor a tornar seguro.
     * @returns {string} Texto escapado.
     */
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

    function getSrtmTileName(latitude, longitude) {
        const latPrefix = latitude >= 0 ? 'N' : 'S';
        const lonPrefix = longitude >= 0 ? 'E' : 'W';
        return `${latPrefix}${String(Math.abs(latitude)).padStart(2, '0')}`
            + `${lonPrefix}${String(Math.abs(longitude)).padStart(3, '0')}.HGT`;
    }

    function getTerrainCacheUrl(tile) {
        return new URL(`__planmilt_offline_terrain__/${tile}.json`, location.href).href;
    }

    function getHgtCacheUrl(tile) {
        return new URL(`__planmilt_offline_hgt__/${tile}`, location.href).href;
    }

    /**
     * Consulta pontos em arquivos HGT integrais guardados nos pacotes do navegador.
     * @param {Array<Object>} points - Pontos com latitude e longitude.
     * @returns {Promise<Array<Object>>} Pontos com suas elevações em metros.
     */
    async function getCachedElevationProfile(points) {
        if (!Array.isArray(points) || points.some(point => !point
            || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
            || point.latitude < -90 || point.latitude >= 90
            || point.longitude < -180 || point.longitude >= 180)) {
            throw new Error('Os pontos de elevação são inválidos.');
        }
        const tiles = [...new Set(points.map(point => getSrtmTileName(
            Math.floor(point.latitude), Math.floor(point.longitude)
        )))];
        const names = new Set(await caches.keys());
        const files = new Map();
        for (const item of loadPackages()) {
            const name = `${TERRAIN_CACHE_PREFIX}${item.id}`;
            if (!names.has(name) || !Array.isArray(item.hgtTiles)) continue;
            const cache = await caches.open(name);
            for (const tile of tiles) {
                if (!item.hgtTiles.includes(tile) || files.has(tile)) continue;
                const response = await cache.match(getHgtCacheUrl(tile));
                if (!response?.ok) continue;
                const buffer = await response.arrayBuffer();
                const size = buffer.byteLength === 1201 * 1201 * 2 ? 1201
                    : buffer.byteLength === 3601 * 3601 * 2 ? 3601 : 0;
                if (size) files.set(tile, { view: new DataView(buffer), size });
            }
        }
        const missing = tiles.filter(tile => !files.has(tile));
        if (missing.length) {
            const error = new Error(`HGT indisponíveis neste navegador: ${missing.join(', ')}. Prepare a elevação do pacote enquanto estiver online.`);
            error.userMessage = error.message;
            throw error;
        }
        return points.map(point => {
            const tileLatitude = Math.floor(point.latitude);
            const tileLongitude = Math.floor(point.longitude);
            const { view, size } = files.get(getSrtmTileName(tileLatitude, tileLongitude));
            const row = Math.min(size - 1, Math.max(0, Math.floor((1 - (point.latitude - tileLatitude)) * (size - 1))));
            const column = Math.min(size - 1, Math.max(0, Math.floor((point.longitude - tileLongitude) * (size - 1))));
            const elevation = view.getInt16((row * size + column) * 2, false);
            if (elevation === -32768) {
                const error = new Error('O SRTM armazenado contém pontos sem elevação para esta análise.');
                error.userMessage = error.message;
                throw error;
            }
            return { latitude: point.latitude, longitude: point.longitude, elevation };
        });
    }

    /**
     * Prepara grades por HGT no cache de um pacote usando o servidor enquanto conectado.
     * @param {Array<string>} tiles - Nomes HGT da área.
     * @param {string} packageId - Identificador do pacote.
     * @param {Object} apiClient - Cliente HTTP da aplicação.
     * @param {Function} progress - Callback de progresso.
     * @returns {Promise<Object>} Nomes armazenados e nomes que falharam.
     */
    async function cacheTerrainGrids(tiles, packageId, apiClient, progress) {
        const cache = await caches.open(`${TERRAIN_CACHE_PREFIX}${packageId}`);
        const cachedTiles = [];
        const failedTiles = [];
        const cachedHgtTiles = [];
        const failedHgtTiles = [];
        for (const [index, tile] of tiles.entries()) {
            const match = tile.match(/^([NS])(\d{2})([EW])(\d{3})\.HGT$/);
            if (!match) {
                failedTiles.push(tile);
                continue;
            }
            const latitude = (match[1] === 'S' ? -1 : 1) * Number(match[2]);
            const longitude = (match[3] === 'W' ? -1 : 1) * Number(match[4]);
            progress(`Preparando elevação ${index + 1}/${tiles.length}: ${tile}`);
            try {
                const edgeInset = 1e-9;
                const response = await apiClient.request('php/endpoints/elevation-terrain.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        bounds: [latitude, longitude, latitude + 1 - edgeInset, longitude + 1 - edgeInset],
                        columns: TERRAIN_GRID_SIZE,
                        rows: TERRAIN_GRID_SIZE
                    })
                });
                const data = await response.json();
                if (!response.ok || !Array.isArray(data.elevations)
                    || data.missingTiles?.includes(tile)) {
                    failedTiles.push(tile);
                } else {
                    await cache.put(getTerrainCacheUrl(tile), new Response(JSON.stringify(data), {
                        headers: { 'Content-Type': 'application/json' }
                    }));
                    cachedTiles.push(tile);
                }
            } catch (error) {
                console.error('[PlanMilT][Offline] Falha ao armazenar a grade SRTM.', error);
                failedTiles.push(tile);
            }
            try {
                const response = await apiClient.request(`SRTM3/${tile}`, { method: 'GET', cache: 'no-store' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const buffer = await response.arrayBuffer();
                if (![1201 * 1201 * 2, 3601 * 3601 * 2].includes(buffer.byteLength)) {
                    throw new Error('Arquivo HGT com tamanho inválido.');
                }
                await cache.put(getHgtCacheUrl(tile), new Response(buffer, {
                    headers: { 'Content-Type': 'application/octet-stream' }
                }));
                cachedHgtTiles.push(tile);
            } catch (error) {
                console.error('[PlanMilT][Offline] Falha ao armazenar HGT para rádio.', error);
                failedHgtTiles.push(tile);
            }
        }
        return { cachedTiles, failedTiles, cachedHgtTiles, failedHgtTiles };
    }

    /**
     * Lê amostras SRTM salvas nos pacotes e remonta a grade do enquadramento atual.
     * @param {Object} boundsInput - Limites WGS84 da área solicitada.
     * @param {number} columns - Quantidade de colunas da grade.
     * @param {number} rows - Quantidade de linhas da grade.
     * @returns {Promise<Object>} Grade de elevação com tiles ausentes identificados.
     */
    async function getCachedTerrain(boundsInput, columns = TERRAIN_GRID_SIZE, rows = TERRAIN_GRID_SIZE) {
        const bounds = normalizeBounds(boundsInput);
        if (!Number.isInteger(columns) || columns < 2 || columns > TERRAIN_GRID_SIZE
            || !Number.isInteger(rows) || rows < 2 || rows > TERRAIN_GRID_SIZE
            || bounds.north - bounds.south > 5 || bounds.east - bounds.west > 5) {
            throw new Error('A área da elevação offline deve ter até 5° por eixo e uma grade de até 65 × 65.');
        }
        const requiredTiles = getSrtmTileNames(bounds);
        const cacheNames = new Set(await caches.keys());
        const availableTiles = new Map();
        for (const item of loadPackages()) {
            const terrainTiles = Array.isArray(item.terrainTiles) ? item.terrainTiles : [];
            const cacheName = `${TERRAIN_CACHE_PREFIX}${item.id}`;
            if (!terrainTiles.length || !cacheNames.has(cacheName)) continue;
            const cache = await caches.open(cacheName);
            for (const tile of requiredTiles) {
                if (!terrainTiles.includes(tile) || availableTiles.has(tile)) continue;
                try {
                    const response = await cache.match(getTerrainCacheUrl(tile));
                    if (!response?.ok) continue;
                    const grid = await response.json();
                    if (Array.isArray(grid.elevations) && grid.elevations.length >= 2
                        && grid.elevations.every(line => Array.isArray(line) && line.length >= 2)) {
                        availableTiles.set(tile, grid.elevations);
                    }
                } catch (error) {
                    console.warn('[PlanMilT][Offline] Não foi possível ler uma grade SRTM local.', error);
                }
            }
        }
        if (!availableTiles.size) {
            throw new Error('Não há grades SRTM no navegador para esta área. Conecte-se e use "Preparar SRTM 3D" no gerenciador de pacotes.');
        }

        const missingTiles = requiredTiles.filter(tile => !availableTiles.has(tile));
        const elevations = Array.from({ length: rows }, (_, row) => {
            const latitude = bounds.north - (bounds.north - bounds.south) * row / (rows - 1);
            const tileLatitude = Math.min(Math.floor(latitude), Math.ceil(bounds.north) - 1);
            return Array.from({ length: columns }, (_, column) => {
                const longitude = bounds.west + (bounds.east - bounds.west) * column / (columns - 1);
                const tileLongitude = Math.min(Math.floor(longitude), Math.ceil(bounds.east) - 1);
                const tile = getSrtmTileName(tileLatitude, tileLongitude);
                const grid = availableTiles.get(tile);
                if (!grid) return null;
                const gridColumns = grid[0].length;
                const gridRows = grid.length;
                const gridX = Math.max(0, Math.min(gridColumns - 1, (longitude - tileLongitude) * (gridColumns - 1)));
                const gridY = Math.max(0, Math.min(gridRows - 1, (tileLatitude + 1 - latitude) * (gridRows - 1)));
                const x0 = Math.floor(gridX);
                const y0 = Math.floor(gridY);
                const x1 = Math.min(gridColumns - 1, x0 + 1);
                const y1 = Math.min(gridRows - 1, y0 + 1);
                const xFraction = gridX - x0;
                const yFraction = gridY - y0;
                const samples = [
                    [grid[y0][x0], (1 - xFraction) * (1 - yFraction)],
                    [grid[y0][x1], xFraction * (1 - yFraction)],
                    [grid[y1][x0], (1 - xFraction) * yFraction],
                    [grid[y1][x1], xFraction * yFraction]
                ].filter(([value, weight]) => Number.isFinite(value) && weight > 0);
                const weight = samples.reduce((sum, sample) => sum + sample[1], 0);
                return weight ? samples.reduce((sum, sample) => sum + sample[0] * sample[1], 0) / weight : null;
            });
        });
        return { rows, columns, elevations, missingTiles };
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
                || item.sources.some(source => typeof source !== 'string' || !source)
                || !Number.isInteger(item.minZoom) || !Number.isInteger(item.maxZoom)
                || item.minZoom < 0 || item.maxZoom > 18 || item.minZoom > item.maxZoom
                || !Number.isFinite(item.tileCount) || item.tileCount < 0
                || (item.terrainTiles !== undefined && (!Array.isArray(item.terrainTiles)
                    || item.terrainTiles.some(tile => typeof tile !== 'string' || !/^[NS]\d{2}[EW]\d{3}\.HGT$/.test(tile))))
                || (item.hgtTiles !== undefined && (!Array.isArray(item.hgtTiles)
                    || item.hgtTiles.some(tile => typeof tile !== 'string' || !/^[NS]\d{2}[EW]\d{3}\.HGT$/.test(tile))))) {
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
     * Prepara a elevação de um pacote existente a partir dos HGT disponíveis no servidor.
     * @param {string} packageId - Identificador do pacote.
     * @param {Object} apiClient - Cliente HTTP da aplicação.
     * @param {Function} progress - Callback de progresso.
     * @returns {Promise<Object>} Resultado da preparação das grades.
     */
    async function preparePackageTerrain(packageId, apiClient, progress = () => {}) {
        if (navigator.onLine === false) {
            throw new Error('Reconecte-se para preparar a elevação deste pacote.');
        }
        const item = loadPackages().find(candidate => candidate.id === packageId);
        if (!item) throw new Error('Pacote offline não encontrado.');
        const tiles = getSrtmTileNames(item.bounds);
        if (tiles.length > 32) throw new Error('A área excede o limite de 32 tiles SRTM por pacote.');
        await cacheTerrainGrids(tiles, packageId, apiClient, progress);
        const packages = loadPackages();
        const current = packages.find(candidate => candidate.id === packageId);
        if (!current) throw new Error('O pacote foi removido durante a preparação da elevação.');
        const cache = await caches.open(`${TERRAIN_CACHE_PREFIX}${packageId}`);
        const available = [];
        const availableHgt = [];
        for (const tile of tiles) {
            const response = await cache.match(getTerrainCacheUrl(tile));
            if (response?.ok) available.push(tile);
            const hgtResponse = await cache.match(getHgtCacheUrl(tile));
            if (hgtResponse?.ok) availableHgt.push(tile);
        }
        current.srtmTiles = tiles;
        current.terrainTiles = available;
        current.failedSrtm = tiles.filter(tile => !available.includes(tile));
        current.hgtTiles = availableHgt;
        current.failedHgt = tiles.filter(tile => !availableHgt.includes(tile));
        savePackages(packages);
        return { cachedTiles: available, failedTiles: current.failedSrtm, hgtTiles: availableHgt, failedHgt: current.failedHgt };
    }

    /**
     * Lista as fontes de pacotes cujos caches ainda contêm tiles.
     * @param {Array<Object>} packages - Manifestos locais.
     * @param {CacheStorage} cacheStorage - Cache Storage do navegador.
     * @param {Object} [layerRegistry] - Camadas disponíveis para reconstruir URLs.
     * @param {Object} [leaflet] - Namespace Leaflet usado na reconstrução.
     * @returns {Promise<Set<string>>} Nomes das fontes efetivamente armazenadas.
     */
    async function getCachedPackageSources(packages, cacheStorage, layerRegistry, leaflet, map) {
        const available = new Set();
        const cacheNames = new Set(await cacheStorage.keys());
        for (const item of packages) {
            if (!item.sources.length || item.tileCount <= 0 || !cacheNames.has(item.cacheName)) continue;
            const cache = await cacheStorage.open(item.cacheName);
            const cachedRequests = await cache.keys();
            if (!cachedRequests.length) continue;
            if (!layerRegistry || !leaflet) {
                item.sources.forEach(source => available.add(source));
                continue;
            }
            const cachedUrls = new Set(cachedRequests.map(request => request.url || request));
            for (const source of item.sources) {
                const layer = layerRegistry[source];
                if (!layer) continue;
                const expectedUrls = buildTileLayerUrls(
                    layer, item.bounds, item.minZoom, item.maxZoom, leaflet, map
                );
                if (expectedUrls.some(url => cachedUrls.has(url))) available.add(source);
            }
        }
        return available;
    }

    /**
     * Localiza o checkbox Leaflet correspondente a uma camada pelo rótulo visível.
     * @param {Object} layerControl - Controle de camadas Leaflet.
     * @param {string} layerName - Nome da camada.
     * @returns {HTMLInputElement|undefined} Checkbox encontrado.
     */
    function findLayerControlInput(layerControl, layerName) {
        const container = layerControl?.getContainer?.();
        return [...(container?.querySelectorAll?.('input') || [])].find(input => {
            const label = input.closest?.('label');
            return label?.textContent?.trim() === layerName;
        });
    }

    /**
     * Restaura controles que versões anteriores tenham desabilitado no modo offline.
     * @param {Object} layerControl - Controle de camadas Leaflet.
     * @param {Object} layerRegistry - Registro de camadas do mapa.
     */
    function enableLayerControls(layerControl, layerRegistry) {
        for (const name of Object.keys(layerRegistry)) {
            const input = findLayerControlInput(layerControl, name);
            if (!input || input.dataset.offlineManaged !== 'true') continue;
            input.disabled = false;
            input.removeAttribute('aria-disabled');
            input.title = '';
            delete input.dataset.offlineManaged;
            delete input.dataset.offlineAvailable;
        }
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
        if (!workerRegistrationPromise) {
            workerRegistrationPromise = (async () => {
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
            })();
            workerRegistrationPromise.catch(() => {
                workerRegistrationPromise = undefined;
            });
        }
        return workerRegistrationPromise;
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
     * Formata a faixa de detalhes de um pacote em linguagem comum.
     * @param {number} minZoom - Primeiro nível armazenado.
     * @param {number} maxZoom - Último nível armazenado.
     * @returns {string} Descrição da faixa.
     */
    function formatZoomRange(minZoom, maxZoom) {
        const minimum = OFFLINE_ZOOM_LABELS[minZoom] || `Nível ${minZoom}`;
        const maximum = OFFLINE_ZOOM_LABELS[maxZoom] || `Nível ${maxZoom}`;
        return minimum === maximum ? minimum : `${minimum} → ${maximum}`;
    }

    /**
     * Inicializa o botão e o gerenciador offline no mapa principal.
     * @param {Object} dependencies - Dependências do mapa.
     * @returns {{open: Function}} Controlador público.
     */
    function attach({ map, leaflet, layerRegistry, layerControl, registerOverlayLayer,
        removeOverlayLayer, button, sweetAlert, apiClient }) {
        const Swal = sweetAlert;
        const packageLayerRegistry = {
            ...layerRegistry,
            [SENTINEL_LAYER_NAME]: leaflet.tileLayer(
                'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
                {
                    attribution: 'Sentinel-2 cloudless 2024 © EOX, Copernicus',
                    offlinePackageOnly: true,
                    minZoom: 1,
                    maxZoom: 28,
                    minNativeZoom: 0,
                    maxNativeZoom: 14
                }
            )
        };
        let selectedBounds = normalizeBounds(map.getBounds());
        let sentinelRegistered = false;

        /**
         * Sincroniza as opções do mapa com os pacotes ainda presentes no Cache Storage.
         * @returns {Promise<void>} Sincronização concluída.
         */
        async function syncOfflineLayers() {
            const isOnline = navigator.onLine !== false;
            let availableSources = new Set();
            if (!isOnline) {
                try {
                    availableSources = await getCachedPackageSources(
                        loadPackages(), caches, packageLayerRegistry, leaflet, map
                    );
                } catch (error) {
                    console.error('[PlanMilT][Offline] Não foi possível verificar os pacotes locais.', error);
                }
            }
            if (!isOnline && availableSources.has(SENTINEL_LAYER_NAME) && !sentinelRegistered) {
                registerOverlayLayer(SENTINEL_LAYER_NAME, packageLayerRegistry[SENTINEL_LAYER_NAME], false);
                sentinelRegistered = true;
            } else if ((isOnline || !availableSources.has(SENTINEL_LAYER_NAME)) && sentinelRegistered) {
                removeOverlayLayer(SENTINEL_LAYER_NAME);
                sentinelRegistered = false;
            }
            enableLayerControls(layerControl, layerRegistry);
        }

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
                if (!OFFLINE_ZOOM_LEVELS.includes(minZoom) || !OFFLINE_ZOOM_LEVELS.includes(maxZoom)
                    || minZoom > maxZoom) {
                    throw new Error('Escolha níveis de zoom entre 8 e 15 nas opções disponíveis, em ordem crescente.');
                }
                const sources = [...document.querySelectorAll('input[name="offlineSource"]:checked')]
                    .map(input => decodeURIComponent(input.value));
                const includeElevation = document.getElementById('offlineElevation')?.checked;
                if (navigator.onLine === false) {
                    throw new Error('Reconecte-se à internet para baixar um pacote offline.');
                }
                if (sources.length === 0 && !includeElevation) {
                    throw new Error('Selecione uma camada-base ou a elevação SRTM.');
                }
                const count = estimateRegisteredLayerTileCount(
                    selectedBounds, minZoom, maxZoom, sources, packageLayerRegistry, leaflet, map
                );
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
            if (navigator.onLine === false) {
                throw new Error('Reconecte-se à internet para baixar um pacote offline.');
            }
            const minZoom = Number(document.getElementById('offlineMinZoom').value);
            const maxZoom = Number(document.getElementById('offlineMaxZoom').value);
            if (!OFFLINE_ZOOM_LEVELS.includes(minZoom) || !OFFLINE_ZOOM_LEVELS.includes(maxZoom)
                || minZoom > maxZoom) {
                throw new Error('Selecione níveis de zoom válidos entre 8 e 15.');
            }
            const sources = [...document.querySelectorAll('input[name="offlineSource"]:checked')]
                .map(input => decodeURIComponent(input.value));
            const includeElevation = document.getElementById('offlineElevation').checked;
            if (sources.length === 0 && !includeElevation) {
                throw new Error('Selecione uma camada-base ou a elevação SRTM.');
            }
            const tileCount = estimateRegisteredLayerTileCount(
                selectedBounds, minZoom, maxZoom, sources, packageLayerRegistry, leaflet, map
            );
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
            for (const source of sources) {
                urls.push(...buildTileLayerUrls(
                    packageLayerRegistry[source], selectedBounds, minZoom, maxZoom, leaflet, map
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
            let terrainTiles = [];
            let hgtTiles = [];
            let failedHgt = [];
            if (srtmTiles.length > 0) {
                await downloadSrtm(srtmTiles, message => {
                    const progress = document.getElementById('offlineProgress');
                    if (progress) progress.textContent = message;
                });
                const terrain = await cacheTerrainGrids(srtmTiles, id, apiClient, message => {
                    const progress = document.getElementById('offlineProgress');
                    if (progress) progress.textContent = message;
                });
                terrainTiles = terrain.cachedTiles;
                failedSrtm = terrain.failedTiles;
                hgtTiles = terrain.cachedHgtTiles;
                failedHgt = terrain.failedHgtTiles;
            }
            if (result.cached === 0 && terrainTiles.length === 0 && hgtTiles.length === 0) {
                await caches.delete(cacheName);
                await caches.delete(`${TERRAIN_CACHE_PREFIX}${id}`);
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
                terrainTiles,
                hgtTiles,
                failedSrtm,
                failedHgt,
                createdAt: new Date().toISOString()
            });
            try {
                savePackages(packages);
            } catch (error) {
                await caches.delete(cacheName);
                await caches.delete(`${TERRAIN_CACHE_PREFIX}${id}`);
                throw error;
            }
            await Swal.fire({
                title: 'Pacote disponível offline',
                html: `${result.cached} tile(s) de mapa armazenado(s).`
                    + (result.cached < result.total ? `<br>${result.total - result.cached} tile(s) não puderam ser obtidos.` : '')
                    + (failedSrtm.length ? `<br>Elevação 3D pendente: ${failedSrtm.join(', ')}` : '')
                    + (failedHgt.length ? `<br>HGT para rádio pendente: ${failedHgt.join(', ')}` : ''),
                icon: failedSrtm.length || failedHgt.length || result.cached < result.total ? 'warning' : 'success'
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
                text: 'Os tiles de mapa e as grades SRTM deste pacote serão removidos. Os arquivos HGT permanecem no servidor local.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Excluir',
                cancelButtonText: 'Cancelar'
            });
            if (!confirmation.isConfirmed) return;
            await caches.delete(item.cacheName);
            await caches.delete(`${TERRAIN_CACHE_PREFIX}${item.id}`);
            savePackages(packages.filter(candidate => candidate.id !== id));
            await syncOfflineLayers();
            await openManager();
        }

        /**
         * Prepara no navegador as grades SRTM de um pacote já baixado.
         * @param {string} id - Identificador do pacote.
         * @returns {Promise<void>} Conclusão da preparação e atualização da lista.
         */
        async function prepareExistingTerrain(id) {
            if (navigator.onLine === false) throw new Error('Reconecte-se para preparar a elevação deste pacote.');
            Swal.fire({
                title: 'Preparando elevação para 3D e rádio',
                html: '<p id="offlineProgress">Consultando arquivos SRTM do servidor...</p>',
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false
            });
            const result = await preparePackageTerrain(id, apiClient, message => {
                const progress = document.getElementById('offlineProgress');
                if (progress) progress.textContent = message;
            });
            await Swal.fire({
                title: result.failedTiles.length || result.failedHgt.length
                    ? (result.cachedTiles.length || result.hgtTiles.length ? 'Elevação parcialmente disponível' : 'Elevação indisponível')
                    : 'Elevação preparada',
                text: `Grades 3D: ${result.cachedTiles.length}; HGT para rádio: ${result.hgtTiles.length}.`
                    + (result.failedTiles.length ? ` Grades indisponíveis: ${result.failedTiles.join(', ')}.` : '')
                    + (result.failedHgt.length ? ` HGT indisponíveis: ${result.failedHgt.join(', ')}.` : ''),
                icon: result.failedTiles.length || result.failedHgt.length ? 'warning' : 'success'
            });
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
            const currentZoom = Math.max(8, Math.min(15, Math.round(map.getZoom())));
            const closestZoom = OFFLINE_ZOOM_LEVELS.reduce((closest, level) =>
                Math.abs(level - currentZoom) < Math.abs(closest - currentZoom) ? level : closest,
            OFFLINE_ZOOM_LEVELS[0]);
            const tileLayers = listTileLayers(packageLayerRegistry);
            const tileSources = tileLayers.map(item => `
                <label title="${escapeHtml(item.reason)}">
                    <input type="checkbox" name="offlineSource" value="${encodeURIComponent(item.name)}"
                        ${item.supported && map.hasLayer(item.layer) ? 'checked' : ''}
                        ${item.supported ? '' : 'disabled'}>
                    ${escapeHtml(item.name)}
                    ${item.supported ? '' : ` <small>(${escapeHtml(item.reason)})</small>`}
                </label>
            `).join('');
            const list = packages.length
                ? packages.map(item => {
                    const labels = [
                        ...item.sources.map(source => PROVIDERS[source]?.label || source),
                        ...(Array.isArray(item.terrainTiles) && item.terrainTiles.length
                            ? ['SRTM 3D']
                            : (Array.isArray(item.srtmTiles) && item.srtmTiles.length ? ['SRTM sem grade 3D'] : []))
                    ].map(escapeHtml).join(', ') || 'Pacote';
                    return `<li><div><strong>${labels}</strong><span>${escapeHtml(formatBounds(item.bounds))}</span>`
                        + `<span>${escapeHtml(formatZoomRange(item.minZoom, item.maxZoom))} · ${item.tileCount} tiles`
                        + (item.failedTileCount ? ` · ${item.failedTileCount} pendentes` : '')
                        + `</span></div>`
                        + `<div class="offline-actions"><button type="button" data-prepare-terrain="${item.id}"`
                        + `${navigator.onLine === false ? ' disabled title="Reconecte-se para preparar a elevação"' : ''}>Preparar SRTM 3D e rádio</button>`
                        + `<button type="button" data-delete-offline="${item.id}">Excluir</button></div></li>`;
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
                        #offlineManager select{width:min(240px,70vw);max-width:100%;border:1px solid #c5cad2;border-radius:5px;padding:6px;background:#fff}
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
                                ${tileSources || '<span>Nenhuma camada de tiles está disponível.</span>'}
                                <label><input type="checkbox" id="offlineElevation"> Elevação SRTM para 3D e rádio</label>
                            </div>
                            <small>Os arquivos HGT integrais para rádio ocupam cerca de 2,8 a 25 MB por tile no navegador.</small>
                            <small>A camada Google Satellite não permite o download ou armazenamento local das imagens.</small>
                            <div class="offline-zoom">
                                <label>Cobrir desde
                                    <select id="offlineMinZoom">
                                        ${OFFLINE_ZOOM_LEVELS.map(level => `<option value="${level}" ${level === OFFLINE_ZOOM_LEVELS[0] ? 'selected' : ''}>${OFFLINE_ZOOM_LABELS[level]}</option>`).join('')}
                                    </select>
                                </label>
                                <label>Cobrir até
                                    <select id="offlineMaxZoom">
                                        ${OFFLINE_ZOOM_LEVELS.map(level => `<option value="${level}" ${level === closestZoom ? 'selected' : ''}>${OFFLINE_ZOOM_LABELS[level]}</option>`).join('')}
                                    </select>
                                </label>
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
                    document.querySelectorAll('[data-prepare-terrain]').forEach(item => {
                        item.addEventListener('click', () => prepareExistingTerrain(item.dataset.prepareTerrain).catch(showError));
                    });
                    updateEstimate();
                }
            });
            return result;
        }

        button.addEventListener('click', () => {
            openManager().catch(showError);
        });
        attachConnectionState(document, navigator, window);
        window.addEventListener('online', syncOfflineLayers);
        window.addEventListener('offline', syncOfflineLayers);
        syncOfflineLayers();
        registerWorker().catch(error => {
            console.warn('[PlanMilT][Offline] Serviço offline indisponível.', error);
            button.title = 'Pacotes offline indisponíveis neste contexto';
            button.classList.add('is-disabled');
            button.disabled = true;
        });
        return Object.freeze({ open: openManager });
    }

    window.PlanMilT.offlineManager = Object.freeze({
        start: registerWorker,
        attach,
        normalizeBounds,
        getTileRange,
        estimateTileCount,
        buildOpenTopoUrls,
        buildWmsUrls,
        getTileUrl,
        buildTileLayerUrls,
        listTileLayers,
        estimateRegisteredLayerTileCount,
        getSrtmTileNames,
        getCachedTerrain,
        getCachedElevationProfile,
        preparePackageTerrain,
        getCachedPackageSources,
        enableLayerControls,
        updateConnectionState,
        attachConnectionState,
        offlineZoomLevels: Object.freeze([...OFFLINE_ZOOM_LEVELS]),
        offlineZoomLabels: Object.freeze({ ...OFFLINE_ZOOM_LABELS }),
        isSelectingArea: () => selectingArea
    });

    window.PlanMilT.offlineManager.start().catch(error => {
        console.warn('[PlanMilT][Offline] Preparação automática indisponível.', error);
    });
})();
