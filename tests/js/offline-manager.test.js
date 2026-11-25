const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/features/offline-manager.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'js/features/offline-worker.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js/features/main.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const htaccess = fs.readFileSync(path.join(root, '.htaccess'), 'utf8');
const mapTools = fs.readFileSync(path.join(root, 'js/features/map-tools.js'), 'utf8');

function loadManager(options = {}) {
    const context = {
        window: {
            PlanMilT: { debugLogger: options.debugLogger },
            caches: options.caches,
            addEventListener: options.addEventListener
        },
        caches: options.caches || {},
        document: options.document,
        location: { pathname: '/planmilt/', href: 'https://example.test/planmilt/' },
        localStorage: options.localStorage || { getItem() { return null; }, setItem() {} },
        navigator: options.navigator || {},
        URL, Response, MessageChannel: options.MessageChannel,
        console: { error() {}, info() {}, warn() {}, log() {} }
    };
    vm.runInNewContext(source, context);
    return context.window.PlanMilT.offlineManager;
}

async function cachePackageWithWorker(fetchImplementation) {
    const listeners = new Map();
    const entries = [];
    const messages = [];
    const workerLogs = [];
    const cache = {
        async match(url) { return entries.find(entry => entry.url === url); },
        async put(url, response) { entries.push({ url, response }); },
        async keys() { return entries.map(entry => ({ url: entry.url })); }
    };
    const self = {
        location: { href: 'https://example.test/offline-worker.js', origin: 'https://example.test' },
        addEventListener(name, callback) { listeners.set(name, callback); },
        clients: { async claim() {} },
        async skipWaiting() {}
    };
    const caches = { async open() { return cache; }, async keys() { return []; } };
    class TestRequest {
        constructor(url, options) { this.url = String(url); Object.assign(this, options); }
    }
    vm.runInNewContext(worker, {
        self, caches, URL, Request: TestRequest, fetch: fetchImplementation,
        console: { warn() {}, error() {}, info(...args) { workerLogs.push(args); } }
    });
    let completion;
    listeners.get('message')({
        data: {
            type: 'CACHE_PACKAGE',
            cacheName: 'planmilt-offline-package-v1:1-test',
            urls: ['https://tiles.example.test/10/12/14.png']
        },
        ports: [{ postMessage(message) { messages.push(message); } }],
        waitUntil(promise) { completion = promise; }
    });
    await completion;
    return { entries, messages, workerLogs };
}

test('offline worker registration starts automatically and is reused', async () => {
    let registrations = 0;
    const worker = { state: 'activated', addEventListener() {}, removeEventListener() {} };
    const registration = { active: worker, waiting: null, installing: null };
    const manager = loadManager({
        caches: {},
        navigator: {
            serviceWorker: {
                async register() {
                    registrations++;
                    return registration;
                }
            }
        }
    });

    assert.equal(await manager.start(), registration);
    assert.equal(await manager.start(), registration);
    assert.equal(registrations, 1);
});

test('offline tile downloads prefer CORS-readable responses and retain opaque fallback', async () => {
    const corsModes = [];
    const readable = await cachePackageWithWorker(async request => {
        corsModes.push(request.mode);
        return { ok: true, type: 'cors' };
    });
    assert.deepEqual(corsModes, ['cors']);
    assert.equal(readable.entries[0].response.type, 'cors');
    assert.deepEqual(JSON.parse(JSON.stringify(readable.messages.at(-1))), {
        type: 'PACKAGE_COMPLETE',
        cached: 1,
        total: 1,
        opaqueTileCount: 0,
        failedTileCount: 0
    });

    const fallbackModes = [];
    const opaque = await cachePackageWithWorker(async request => {
        fallbackModes.push(request.mode);
        if (request.mode === 'cors') throw new Error('CORS indisponível');
        return { ok: false, type: 'opaque' };
    });
    assert.deepEqual(fallbackModes, ['cors', 'no-cors']);
    assert.equal(opaque.entries[0].response.type, 'opaque');
    assert.equal(opaque.messages.at(-1).opaqueTileCount, 1);
    assert.equal(opaque.messages.at(-1).failedTileCount, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(opaque.workerLogs[0][1])), {
        tileCount: 1,
        cachedTileCount: 1,
        opaqueTileCount: 1,
        failedTileCount: 0
    });
});

test('service worker does not intercept same-origin HGT downloads into the app shell', () => {
    const listeners = new Map();
    const self = {
        location: { href: 'https://example.test/planmilt/offline-worker.js', origin: 'https://example.test' },
        addEventListener(name, callback) { listeners.set(name, callback); }
    };
    vm.runInNewContext(worker, { self, URL, console });
    let intercepted = false;
    listeners.get('fetch')({
        request: { method: 'GET', url: 'https://example.test/planmilt/SRTM3/S22W052.HGT' },
        respondWith() { intercepted = true; }
    });
    assert.equal(intercepted, false);
});

test('worker installation falls back to the previous viewer document when fetch rejects', async () => {
    const listeners = new Map();
    const cachedEntries = new Map();
    const previousViewer = {
        ok: true,
        status: 200,
        clone() { return this; },
        async text() { return '<html><body>cached viewer</body></html>'; }
    };
    const previousCache = {
        async match(url) { return String(url).endsWith('/visualizador-3d.html') ? previousViewer : undefined; }
    };
    const currentCache = {
        async match(url) { return cachedEntries.get(String(url)); },
        async put(url, response) { cachedEntries.set(String(url), response); }
    };
    const caches = {
        async keys() { return ['planmilt-app-shell-v4']; },
        async open(name) { return name === 'planmilt-app-shell-v4' ? previousCache : currentCache; }
    };
    class TestRequest {
        constructor(url, options) { this.url = String(url); Object.assign(this, options); }
    }
    const self = {
        location: { href: 'https://example.test/offline-worker.js', origin: 'https://example.test' },
        addEventListener(name, callback) { listeners.set(name, callback); },
        clients: { async claim() {} },
        async skipWaiting() { this.didSkipWaiting = true; }
    };
    const response = content => ({
        ok: true, status: 200,
        clone() { return this; },
        async text() { return content; }
    });
    vm.runInNewContext(worker, {
        self, caches, URL, Request: TestRequest,
        async fetch(request) {
            if (request.url.endsWith('/visualizador-3d.html')) throw new Error('Failed to fetch');
            if (request.url.endsWith('/favicon.ico')) return { ok: false, status: 404 };
            return response('<html></html>');
        },
        console: { warn() {}, error() {} }
    });

    let installation;
    listeners.get('install')({ waitUntil(promise) { installation = promise; } });
    await installation;
    assert.equal(self.didSkipWaiting, true);
    assert.equal(cachedEntries.get('https://example.test/visualizador-3d.html'), previousViewer);
});

test('worker installation tolerates offline documents with no prior cached response', async () => {
    const listeners = new Map();
    const warnings = [];
    const cache = { async match() { return undefined; }, async put() {} };
    const caches = { async keys() { return []; }, async open() { return cache; } };
    const self = {
        location: { href: 'https://example.test/offline-worker.js', origin: 'https://example.test' },
        addEventListener(name, callback) { listeners.set(name, callback); },
        clients: { async claim() {} },
        async skipWaiting() { this.didSkipWaiting = true; }
    };
    vm.runInNewContext(worker, {
        self, caches, URL, Request: class { constructor(url) { this.url = String(url); } },
        async fetch() { throw new TypeError('Failed to fetch'); },
        console: { warn(...args) { warnings.push(args); }, error() {}, info() {} }
    });

    let installation;
    listeners.get('install')({ waitUntil(promise) { installation = promise; } });
    await installation;

    assert.equal(self.didSkipWaiting, true);
    assert.ok(warnings.some(([message]) => message.includes('sem resposta (offline)')));
    assert.ok(warnings.every(([message]) => !message.includes('(HTTP undefined)')));
});

test('offline packages calculate XYZ URLs without duplicate tiles', () => {
    const manager = loadManager();
    const bounds = manager.normalizeBounds({ south: -10.2, west: -52.2, north: -10.1, east: -52.1 });
    const urls = manager.buildOpenTopoUrls(bounds, 8, 9);
    assert.equal(urls.length, 2);
    assert.equal(new Set(urls).size, urls.length);
    assert.ok(urls.every(url => /^https:\/\/tile\.opentopomap\.org\/[89]\//.test(url)));
    assert.equal(manager.estimateTileCount(bounds, 8, 9, ['opentopo']), urls.length);
});

test('offline area rejects antimeridian crossing and invalid zooms', () => {
    const manager = loadManager();
    assert.throws(
        () => manager.normalizeBounds({ south: -10, west: 170, north: 10, east: -170 }),
        /antimeridiano/
    );
    assert.throws(
        () => manager.normalizeBounds({ south: -86, west: 0, north: -80, east: 10 }),
        /latitudes/
    );
    assert.throws(
        () => manager.estimateTileCount({ south: -10, west: 0, north: 10, east: 20 }, 8, 9, ['google']),
        /não suportada/
    );
});

test('offline SRTM names cover exact one-degree tile intersections', () => {
    const manager = loadManager();
    assert.deepEqual(
        Array.from(manager.getSrtmTileNames({ south: -22, west: -52, north: -20.5, east: -50.5 })),
        ['S22W052.HGT', 'S22W051.HGT', 'S21W052.HGT', 'S21W051.HGT']
    );
    assert.deepEqual(
        Array.from(manager.getSrtmTileNames({ south: 0, west: 0, north: 1, east: 1 })),
        ['N00E000.HGT']
    );
});

test('BDGEx URLs use the map CRS and Leaflet tile URL generator', () => {
    const manager = loadManager();
    const calls = [];
    const layer = {
        options: { tileSize: 96 },
        _map: { options: { crs: { latLngToPoint(latLng, zoom) { return {
            x: (latLng.lng + 180) * zoom,
            y: (90 - latLng.lat) * zoom
        }; } } } },
        getTileUrl(coords) {
            calls.push(coords);
            return `https://bdgex.eb.mil.br/tile/${coords.z}/${coords.x}/${coords.y}`;
        }
    };
    const leaflet = {
        latLng: (lat, lng) => ({ lat, lng }),
        point: (x, y) => ({ x, y, scaleBy(factor) { return this; } })
    };
    const urls = manager.buildWmsUrls(
        layer,
        { south: -1, west: 0, north: 1, east: 1 },
        2,
        2,
        leaflet
    );
    assert.ok(calls.length > 0);
    assert.ok(urls.every(url => url.includes('/2/')));
    assert.ok(calls.some(coords => coords.x === 3));
});

test('BDGEx tile URLs work when the WMS layer is not attached to the map', () => {
    const manager = loadManager();
    const tileCrs = { latLngToPoint(latLng, zoom) { return { x: 100 * zoom, y: 100 * zoom }; } };
    const wmsCrs = { code: 'EPSG:4326' };
    const map = { options: { crs: tileCrs }, unproject(point, zoom) { return `${point.x},${point.y},${zoom}`; } };
    const layer = {
        _map: null, options: { tileSize: 96, crs: wmsCrs },
        wmsParams: { version: '1.1.1' },
        getTileUrl(coords) {
            assert.equal(this._map, map);
            assert.equal(this._crs, wmsCrs);
            assert.equal(this.wmsParams.srs, 'EPSG:4326');
            assert.equal(this._tileZoom, coords.z);
            return `https://bdgex.example/${this._map.unproject(coords, coords.z)}`;
        }
    };
    const leaflet = { latLng: (lat, lng) => ({ lat, lng }), point: (x, y) => ({ x, y }) };
    const urls = manager.buildWmsUrls(layer, { south: -1, west: 0, north: 1, east: 1 }, 8, 10, leaflet, map);
    assert.ok(urls.some(url => url.endsWith(',8')));
    assert.ok(urls.some(url => url.endsWith(',10')));
    assert.equal(layer._map, null);
    assert.equal(layer.wmsParams.srs, undefined);
});

test('offline selector hides non-downloadable layers', () => {
    const manager = loadManager();
    const layers = manager.listTileLayers({
        'Google Satellite': { _url: 'https://mt0.google.com/vt/{z}/{x}/{y}', getTileUrl() {} },
        'Quadrículas - UTM': {},
        'Sugestão de Planejamento': {},
        'Camada WMS': { _url: 'https://example.test/wms', getTileUrl() {} }
    });

    assert.deepEqual(Array.from(layers, item => item.name), ['Camada WMS']);
    assert.equal(layers[0].supported, true);
});

test('cached package sources are limited to manifests with non-empty caches', async () => {
    const manager = loadManager();
    const packageA = {
        cacheName: 'planmilt-offline-package-v1:1-a',
        sources: ['OpenTopo'],
        tileCount: 3
    };
    const packageB = {
        cacheName: 'planmilt-offline-package-v1:2-b',
        sources: ['Sentinel-2 Cloudless 2024 (EOX)'],
        tileCount: 4
    };
    const cacheStorage = {
        async keys() { return [packageA.cacheName, packageB.cacheName]; },
        async open(name) {
            return { async keys() { return name === packageA.cacheName ? [{}] : []; } };
        }
    };

    const sources = await manager.getCachedPackageSources([packageA, packageB], cacheStorage);
    assert.deepEqual([...sources], ['OpenTopo']);
});

test('cached terrain rebuilds an offline elevation grid from package SRTM samples', async () => {
    const debugEvents = [];
    const packageItem = {
        id: '1-terrain',
        cacheName: 'planmilt-offline-package-v1:1-terrain',
        sources: ['OpenTopo'],
        tileCount: 1,
        bounds: { south: 0.1, west: 0.1, north: 0.9, east: 0.9 },
        minZoom: 8,
        maxZoom: 8,
        srtmTiles: ['N00E000.HGT'],
        terrainTiles: ['N00E000.HGT']
    };
    const terrainUrl = 'https://example.test/planmilt/__planmilt_offline_terrain__/N00E000.HGT.json';
    const terrainCache = {
        async match(url) {
            assert.equal(url, terrainUrl);
            return {
                ok: true,
                async json() { return { elevations: [[0, 10, 20], [30, 40, 50], [60, 70, 80]] }; }
            };
        }
    };
    const cacheStorage = {
        async keys() { return ['planmilt-offline-terrain-v1:1-terrain']; },
        async open() { return terrainCache; }
    };
    const manager = loadManager({
        caches: cacheStorage,
        debugLogger: { log(event, details) { debugEvents.push({ event, details }); } },
        localStorage: { getItem() { return JSON.stringify([packageItem]); }, setItem() {} }
    });

    const terrain = await manager.getCachedTerrain(packageItem.bounds, 3, 3);
    assert.equal(terrain.rows, 3);
    assert.equal(terrain.columns, 3);
    assert.equal(terrain.elevations[1][1], 40);
    assert.deepEqual(Array.from(terrain.missingTiles), []);
    assert.equal(debugEvents[0].event, 'offline.terrain-cache-scan');
    assert.equal(debugEvents[0].details.requiredTileCount, 1);
    assert.equal(debugEvents[0].details.availableTileCount, 1);
    assert.equal(debugEvents[0].details.missingTileCount, 0);
});

test('cached terrain rejects packages without SRTM grids', async () => {
    const debugEvents = [];
    const manager = loadManager({
        caches: { async keys() { return []; } },
        debugLogger: { log(event, details) { debugEvents.push({ event, details }); } }
    });
    await assert.rejects(
        manager.getCachedTerrain({ south: 0.1, west: 0.1, north: 0.9, east: 0.9 }),
        /Não há grades SRTM.*N00E000\.HGT.*área/
    );
    assert.equal(debugEvents[0].details.availableTileCount, 0);
    assert.equal(debugEvents[0].details.missingTileCount, 1);
});

test('samples full-resolution HGT files from offline packages without network', async () => {
    const item = {
        id: '1-radio', cacheName: 'planmilt-offline-package-v1:1-radio',
        sources: [], tileCount: 0, bounds: { south: -22, west: -52, north: -21, east: -51 },
        minZoom: 8, maxZoom: 8, hgtTiles: ['S22W052.HGT']
    };
    const buffer = new ArrayBuffer(1201 * 1201 * 2);
    const values = new DataView(buffer);
    values.setInt16((600 * 1201 + 600) * 2, -123, false);
    values.setInt16((900 * 1201 + 300) * 2, -32768, false);
    const cache = { async match(url) {
        assert.match(url, /__planmilt_offline_hgt__\/S22W052\.HGT$/);
        return new Response(buffer);
    } };
    const manager = loadManager({
        caches: { async keys() { return ['planmilt-offline-terrain-v1:1-radio']; }, async open() { return cache; } },
        navigator: { onLine: false },
        localStorage: { getItem() { return JSON.stringify([item]); }, setItem() {} }
    });
    const result = await manager.getCachedElevationProfile([{ latitude: -21.5, longitude: -51.5 }]);
    assert.equal(result[0].elevation, -123);
    await assert.rejects(manager.getCachedElevationProfile([{ latitude: -21.75, longitude: -51.75 }]), /sem elevação/);
    await assert.rejects(manager.getCachedElevationProfile([{ latitude: -20.5, longitude: -51.5 }]), /HGT indisponíveis/);
});

test('provided package bounds cover S22 tiles but not a radio point in S30W054', async () => {
    const bounds = { south: -21.7716, west: -51.5005, north: -21.3674, east: -50.9903 };
    const tiles = ['S22W052.HGT', 'S22W051.HGT'];
    const packageItem = {
        id: '1-region', cacheName: 'planmilt-offline-package-v1:1-region',
        sources: ['OpenTopo'], tileCount: 52, bounds, minZoom: 8, maxZoom: 12,
        srtmTiles: tiles, terrainTiles: tiles, hgtTiles: tiles
    };
    const hgt = new ArrayBuffer(1201 * 1201 * 2);
    const caches = {
        async keys() { return ['planmilt-offline-terrain-v1:1-region']; },
        async open() { return { async match(url) {
            if (url.includes('__planmilt_offline_terrain__')) {
                return new Response(JSON.stringify({ elevations: [[100, 100], [100, 100]] }));
            }
            if (url.includes('__planmilt_offline_hgt__')) return new Response(hgt);
        } }; }
    };
    const manager = loadManager({
        caches, navigator: { onLine: false },
        localStorage: { getItem() { return JSON.stringify([packageItem]); }, setItem() {} }
    });
    assert.deepEqual(Array.from(manager.getSrtmTileNames(bounds)), tiles);
    const terrain = await manager.getCachedTerrain(bounds, 3, 3);
    assert.equal(terrain.elevations[1][1], 100);
    assert.deepEqual(Array.from(terrain.missingTiles), []);
    const profile = await manager.getCachedElevationProfile([{ latitude: -21.5, longitude: -51.5 }]);
    assert.equal(profile[0].elevation, 0);
    await assert.rejects(manager.getCachedElevationProfile([{ latitude: -29.5, longitude: -53.5 }]),
        /S30W054\.HGT.*posição da antena e o raio/);
    await assert.rejects(manager.getCachedTerrain({ south: -29.6, west: -53.6, north: -29.4, east: -53.4 }),
        /S30W054\.HGT.*região do pacote/);
});

test('package area action centers the map at the package maximum zoom', async () => {
    const item = {
        id: '1-region', cacheName: 'planmilt-offline-package-v1:1-region',
        sources: ['OpenTopo'], tileCount: 52,
        bounds: { south: -21.7716, west: -51.5005, north: -21.3674, east: -50.9903 },
        minZoom: 8, maxZoom: 12, srtmTiles: ['S22W052.HGT', 'S22W051.HGT'],
        terrainTiles: ['S22W052.HGT', 'S22W051.HGT'], hgtTiles: ['S22W052.HGT', 'S22W051.HGT']
    };
    const listeners = {};
    const field = () => ({ addEventListener() {} });
    const fields = {
        offlineUseViewport: field(), offlineDrawArea: field(), offlineDownload: field(),
        offlineMinZoom: { value: '8' }, offlineMaxZoom: { value: '12' },
        offlineEstimate: {}, offlineElevation: { checked: false }
    };
    const focusButton = {
        dataset: { focusOffline: item.id },
        addEventListener(name, callback) { listeners.focus = callback; }
    };
    const document = {
        body: { classList: { toggle() {} } }, addEventListener() {},
        getElementById(id) { return fields[id] || null; },
        querySelectorAll(selector) { return selector === '[data-focus-offline]' ? [focusButton] : []; }
    };
    const caches = { async keys() { return []; } };
    const navigator = { onLine: false, serviceWorker: {
        async register() { return { active: { state: 'activated' } }; }
    } };
    let view;
    let closed = false;
    const map = {
        getBounds: () => item.bounds, getZoom: () => 10, hasLayer: () => false,
        setView(center, zoom) { view = { center: Array.from(center), zoom }; }
    };
    const manager = loadManager({
        caches, navigator, document, addEventListener() {},
        localStorage: { getItem() { return JSON.stringify([item]); }, setItem() {} }
    });
    const controller = manager.attach({
        map, leaflet: { tileLayer() { return {}; } }, layerRegistry: {}, layerControl: {},
        registerOverlayLayer() {}, removeOverlayLayer() {},
        button: { addEventListener() {}, classList: { add() {} } },
        sweetAlert: { close() { closed = true; }, fire(config) {
            assert.match(config.html, /data-focus-offline="1-region"/);
            assert.match(config.html, /SRTM 3D/);
            assert.match(config.html, /SRTM rádio/);
            config.didOpen();
            return Promise.resolve({});
        } },
        apiClient: {}
    });
    await controller.open();
    listeners.focus();
    assert.equal(closed, true);
    assert.equal(view.zoom, 12);
    assert.ok(Math.abs(view.center[0] - (-21.5695)) < 1e-10);
    assert.ok(Math.abs(view.center[1] - (-51.2454)) < 1e-10);
});

test('opening the package manager uses the current viewport for SRTM downloads', async () => {
    const saoPaulo = { south: -21.7716, west: -51.5005, north: -21.3674, east: -50.9903 };
    const rioGrandeDoSul = { south: -29.8, west: -53.8, north: -29.2, east: -53.2 };
    let bounds = saoPaulo;
    let stored = null;
    let resolveSaved;
    const saved = new Promise(resolve => { resolveSaved = resolve; });
    const cachesByName = new Map();
    const caches = {
        async keys() { return [...cachesByName.keys()]; },
        async open(name) {
            if (!cachesByName.has(name)) cachesByName.set(name, new Map());
            const entries = cachesByName.get(name);
            return {
                async put(url, response) { entries.set(url, response); },
                async match(url) { return entries.get(url)?.clone(); },
                async keys() { return [...entries.keys()].map(url => ({ url })); }
            };
        },
        async delete(name) { return cachesByName.delete(name); }
    };
    class FakeMessageChannel {
        constructor() {
            this.port1 = { close() {} };
            this.port2 = { send: data => this.port1.onmessage({ data }) };
        }
    }
    const worker = {
        state: 'activated',
        postMessage(message, ports) {
            queueMicrotask(() => ports[0].send({ type: 'PACKAGE_COMPLETE', cached: 0, total: message.urls.length }));
        }
    };
    const navigator = { onLine: true, serviceWorker: { async register() { return { active: worker }; } } };
    const listeners = {};
    const field = name => ({ addEventListener(event, callback) { listeners[name] = callback; } });
    const fields = {
        offlineUseViewport: field('viewport'), offlineDrawArea: field('draw'), offlineDownload: field('download'),
        offlineMinZoom: { value: '8' }, offlineMaxZoom: { value: '8' },
        offlineEstimate: {}, offlineElevation: { checked: true }, offlineProgress: {}
    };
    const document = {
        body: { classList: { toggle() {} } }, addEventListener() {},
        getElementById(id) { return fields[id] || null; },
        querySelectorAll() { return []; }
    };
    let displayedHtml = '';
    const sweetAlert = { close() {}, fire(config) {
        if (config.title === 'Pacotes offline') {
            displayedHtml = config.html;
            config.didOpen();
        }
        return Promise.resolve({});
    } };
    const calls = [];
    const apiClient = { async request(url, options) {
        const body = JSON.parse(options.body);
        calls.push({ url, body });
        if (url.endsWith('elevation-download.php')) {
            return { ok: true, async json() { return { success: true, tile: body.tile }; } };
        }
        if (url.endsWith('elevation-terrain.php')) {
            return { ok: true, async json() { return { elevations: [[5, 5], [5, 5]], missingTiles: [] }; } };
        }
        return { ok: true, async arrayBuffer() { return new ArrayBuffer(1201 * 1201 * 2); } };
    } };
    const manager = loadManager({
        caches, navigator, document, MessageChannel: FakeMessageChannel, addEventListener() {},
        localStorage: {
            getItem() { return stored; },
            setItem(key, value) { stored = value; resolveSaved(); }
        }
    });
    const mapListeners = {};
    const map = {
        getBounds: () => bounds, getZoom: () => 8, hasLayer: () => false,
        on(name, callback) { mapListeners[name] = callback; },
        off(name) { delete mapListeners[name]; }
    };
    const controller = manager.attach({
        map,
        leaflet: {
            tileLayer() { return {}; },
            Draw: { Event: { CREATED: 'draw:created' }, Rectangle: class {
                enable() {}
                disable() {}
            } }
        },
        layerRegistry: {}, layerControl: {},
        registerOverlayLayer() {}, removeOverlayLayer() {},
        button: { addEventListener() {}, classList: { add() {} } }, sweetAlert, apiClient
    });

    bounds = rioGrandeDoSul;
    await controller.open();
    assert.match(displayedHtml, /S -29\.8000 · O -53\.8000 · N -29\.2000 · L -53\.2000/);
    listeners.download();
    await saved;
    const item = JSON.parse(stored)[0];
    assert.deepEqual(item.bounds, rioGrandeDoSul);
    assert.deepEqual(item.srtmTiles, ['S30W054.HGT']);
    assert.deepEqual(item.hgtTiles, ['S30W054.HGT']);
    assert.deepEqual(calls.map(call => call.url), [
        'php/endpoints/elevation-download.php', 'php/endpoints/elevation-terrain.php',
        'php/endpoints/elevation-hgt.php'
    ]);
    assert.equal(calls[0].body.tile, 'S30W054.HGT');
    assert.equal(calls[2].body.tile, 'S30W054.HGT');

    navigator.onLine = false;
    const terrain = await manager.getCachedTerrain(rioGrandeDoSul, 3, 3);
    assert.equal(terrain.elevations[1][1], 5);
    const profile = await manager.getCachedElevationProfile([{ latitude: -29.5, longitude: -53.5 }]);
    assert.equal(profile[0].elevation, 0);
    assert.equal(calls.length, 3);

    await new Promise(resolve => setImmediate(resolve));
    listeners.draw();
    mapListeners['draw:created']({ layer: { getBounds: () => ({
        south: -29.7, west: -53.7, north: -29.4, east: -53.4
    }) } });
    assert.match(displayedHtml, /S -29\.7000 · O -53\.7000 · N -29\.4000 · L -53\.4000/);
    await controller.open();
    assert.match(displayedHtml, /S -29\.8000 · O -53\.8000 · N -29\.2000 · L -53\.2000/);
});

test('prepares an existing package from server HGT and reads the resulting grid offline', async () => {
    let stored = JSON.stringify([{
        id: '1-old', cacheName: 'planmilt-offline-package-v1:1-old',
        sources: ['OpenTopo'], tileCount: 1,
        bounds: { south: -21.8, west: -51.8, north: -21.2, east: -51.2 },
        minZoom: 8, maxZoom: 12, srtmTiles: ['S22W052.HGT']
    }]);
    const entries = new Map();
    const caches = {
        async keys() { return ['planmilt-offline-terrain-v1:1-old']; },
        async open(name) {
            assert.equal(name, 'planmilt-offline-terrain-v1:1-old');
            return {
                async put(url, response) { entries.set(url, response); },
                async match(url) { return entries.get(url)?.clone(); }
            };
        }
    };
    const browserNavigator = { onLine: true };
    const manager = loadManager({
        caches, navigator: browserNavigator,
        localStorage: { getItem() { return stored; }, setItem(key, value) { stored = value; } }
    });
    const calls = [];
    const client = { async request(url, options) {
        calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
        if (url === 'php/endpoints/elevation-download.php') {
            return { ok: true, async json() { return { success: true, tile: 'S22W052.HGT' }; } };
        }
        if (url === 'php/endpoints/elevation-hgt.php') {
            assert.equal(JSON.parse(options.body).tile, 'S22W052.HGT');
            const buffer = new ArrayBuffer(1201 * 1201 * 2);
            new DataView(buffer).setInt16((600 * 1201 + 600) * 2, 231, false);
            return { ok: true, async arrayBuffer() { return buffer; } };
        }
        return { ok: true, async json() {
            return { elevations: [[100, 100], [100, 100]], missingTiles: [] };
        } };
    } };
    const result = await manager.preparePackageTerrain('1-old', client);
    assert.deepEqual(Array.from(result.cachedTiles), ['S22W052.HGT']);
    assert.deepEqual(Array.from(result.failedTiles), []);
    assert.deepEqual(Array.from(result.hgtTiles), ['S22W052.HGT']);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].url, 'php/endpoints/elevation-download.php');
    assert.equal(calls[1].url, 'php/endpoints/elevation-terrain.php');
    assert.equal(calls[2].url, 'php/endpoints/elevation-hgt.php');
    assert.deepEqual(calls[1].body.bounds.slice(0, 2), [-22, -52]);
    assert.ok(calls[1].body.bounds[2] < -21);
    assert.deepEqual(JSON.parse(stored)[0].terrainTiles, ['S22W052.HGT']);
    assert.deepEqual(JSON.parse(stored)[0].hgtTiles, ['S22W052.HGT']);

    browserNavigator.onLine = false;
    const grid = await manager.getCachedTerrain({ south: -21.8, west: -51.8, north: -21.2, east: -51.2 }, 3, 3);
    assert.equal(grid.elevations[1][1], 100);
    const profile = await manager.getCachedElevationProfile([{ latitude: -21.5, longitude: -51.5 }]);
    assert.equal(profile[0].elevation, 231);
    assert.equal(calls.length, 3);
    await assert.rejects(manager.preparePackageTerrain('1-old', client), /Reconecte-se/);
    assert.equal(calls.length, 3);
});

test('preparing existing terrain reports missing HGT without overwriting cached map metadata', async () => {
    let stored = JSON.stringify([{
        id: '1-old', cacheName: 'planmilt-offline-package-v1:1-old',
        sources: ['OpenTopo'], tileCount: 42,
        bounds: { south: 0.1, west: 0.1, north: 0.9, east: 0.9 }, minZoom: 8, maxZoom: 12
    }]);
    const caches = {
        async open() { return { async match() { return undefined; }, async put() { throw new Error('unexpected'); } }; }
    };
    const manager = loadManager({
        caches, navigator: { onLine: true },
        localStorage: { getItem() { return stored; }, setItem(key, value) { stored = value; } }
    });
    const result = await manager.preparePackageTerrain('1-old', { async request() {
        return { ok: true, async json() { return { elevations: [], missingTiles: ['N00E000.HGT'] }; } };
    } });
    assert.deepEqual(Array.from(result.failedTiles), ['N00E000.HGT']);
    const item = JSON.parse(stored)[0];
    assert.equal(item.tileCount, 42);
    assert.deepEqual(item.sources, ['OpenTopo']);
    assert.deepEqual(item.terrainTiles, []);
});

test('automatically repairs SRTM packages once and reuses their cached HGT and grids', async () => {
    let stored = JSON.stringify([{
        id: '1-auto', cacheName: 'planmilt-offline-package-v1:1-auto',
        sources: ['OpenTopo'], tileCount: 2,
        bounds: { south: -21.8, west: -51.8, north: -21.2, east: -51.2 },
        minZoom: 8, maxZoom: 12, srtmTiles: ['S22W052.HGT'], failedHgt: ['S22W052.HGT']
    }, {
        id: '2-map', cacheName: 'planmilt-offline-package-v1:2-map',
        sources: ['OpenTopo'], tileCount: 2,
        bounds: { south: -21.8, west: -51.8, north: -21.2, east: -51.2 },
        minZoom: 8, maxZoom: 12, srtmTiles: []
    }]);
    const entries = new Map();
    const caches = {
        async keys() { return ['planmilt-offline-terrain-v1:1-auto']; },
        async open(name) {
            assert.equal(name, 'planmilt-offline-terrain-v1:1-auto');
            return {
                async put(url, response) { entries.set(url, response); },
                async match(url) { return entries.get(url)?.clone(); }
            };
        }
    };
    const browserNavigator = { onLine: true };
    const manager = loadManager({
        caches, navigator: browserNavigator,
        localStorage: { getItem() { return stored; }, setItem(key, value) { stored = value; } }
    });
    let serverHasHgt = false;
    const calls = [];
    const client = { async request(url, options) {
        calls.push(url);
        if (url === 'php/endpoints/elevation-download.php') {
            assert.equal(JSON.parse(options.body).tile, 'S22W052.HGT');
            serverHasHgt = true;
            return { ok: true, async json() { return { success: true, tile: 'S22W052.HGT' }; } };
        }
        assert.equal(serverHasHgt, true);
        if (url === 'php/endpoints/elevation-terrain.php') {
            return { ok: true, async json() { return { elevations: [[5, 5], [5, 5]], missingTiles: [] }; } };
        }
        assert.equal(url, 'php/endpoints/elevation-hgt.php');
        return { ok: true, async arrayBuffer() { return new ArrayBuffer(1201 * 1201 * 2); } };
    } };

    const [first, concurrent] = await Promise.all([
        manager.preparePendingTerrain(client), manager.preparePendingTerrain(client)
    ]);
    assert.equal(first.length, 1);
    assert.equal(concurrent.length, 1);
    assert.deepEqual(calls, ['php/endpoints/elevation-download.php', 'php/endpoints/elevation-terrain.php', 'php/endpoints/elevation-hgt.php']);
    assert.deepEqual(JSON.parse(stored)[0].hgtTiles, ['S22W052.HGT']);
    await manager.preparePendingTerrain(client);
    assert.equal(calls.length, 3);
    browserNavigator.onLine = false;
    await manager.preparePendingTerrain(client);
    assert.equal(calls.length, 3);
});

test('automatic terrain preparation stops requesting data when connectivity is lost', async () => {
    let stored = JSON.stringify([{
        id: '1-auto', cacheName: 'planmilt-offline-package-v1:1-auto',
        sources: ['OpenTopo'], tileCount: 1,
        bounds: { south: -21.8, west: -51.8, north: -21.2, east: -51.2 },
        minZoom: 8, maxZoom: 12, srtmTiles: ['S22W052.HGT']
    }]);
    const navigator = { onLine: true };
    const manager = loadManager({
        navigator,
        caches: { async open() { return { async match() { return undefined; } }; } },
        localStorage: { getItem() { return stored; }, setItem(key, value) { stored = value; } }
    });
    const calls = [];
    const results = await manager.preparePendingTerrain({ async request(url) {
        calls.push(url);
        navigator.onLine = false;
        return { ok: true, async json() { return { success: true, tile: 'S22W052.HGT' }; } };
    } });
    assert.deepEqual(calls, ['php/endpoints/elevation-download.php']);
    assert.deepEqual(Array.from(results[0].failedHgt), ['S22W052.HGT']);
    assert.deepEqual(JSON.parse(stored)[0].failedHgt, ['S22W052.HGT']);
});

test('manager automatically prepares existing SRTM packages after reconnecting', async () => {
    let stored = JSON.stringify([{
        id: '1-auto', cacheName: 'planmilt-offline-package-v1:1-auto', sources: [], tileCount: 0,
        bounds: { south: -21.8, west: -51.8, north: -21.2, east: -51.2 },
        minZoom: 8, maxZoom: 12, srtmTiles: ['S22W052.HGT']
    }]);
    const entries = new Map();
    const caches = {
        async keys() { return []; },
        async open() { return {
            async put(url, response) { entries.set(url, response); },
            async match(url) { return entries.get(url)?.clone(); }
        }; }
    };
    const listeners = new Map();
    const browserNavigator = {
        onLine: false,
        serviceWorker: { async register() { return { active: { state: 'activated' } }; } }
    };
    const document = {
        body: { classList: { toggle() {} } },
        addEventListener() {},
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    const manager = loadManager({
        caches, navigator: browserNavigator, document,
        addEventListener(name, callback) {
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(callback);
        },
        localStorage: { getItem() { return stored; }, setItem(key, value) { stored = value; } }
    });
    const calls = [];
    const client = { async request(url) {
        calls.push(url);
        if (url === 'php/endpoints/elevation-download.php') {
            return { ok: true, async json() { return { success: true, tile: 'S22W052.HGT' }; } };
        }
        if (url === 'php/endpoints/elevation-terrain.php') {
            return { ok: true, async json() { return { elevations: [[5, 5], [5, 5]], missingTiles: [] }; } };
        }
        return { ok: true, async arrayBuffer() { return new ArrayBuffer(1201 * 1201 * 2); } };
    } };
    manager.attach({
        map: { getBounds: () => ({ south: -21.8, west: -51.8, north: -21.2, east: -51.2 }) },
        leaflet: { tileLayer() { return {}; } }, layerRegistry: {}, layerControl: {},
        registerOverlayLayer() {}, removeOverlayLayer() {},
        button: { addEventListener() {}, classList: { add() {} } },
        sweetAlert: {}, apiClient: client
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, []);
    browserNavigator.onLine = true;
    for (const listener of listeners.get('online')) listener();
    await manager.preparePendingTerrain(client);
    assert.deepEqual(calls, ['php/endpoints/elevation-download.php', 'php/endpoints/elevation-terrain.php', 'php/endpoints/elevation-hgt.php']);
    assert.deepEqual(JSON.parse(stored)[0].hgtTiles, ['S22W052.HGT']);
});

test('cached terrain reports missing HGT tiles while preserving available samples', async () => {
    const packageItem = {
        id: '2-partial',
        cacheName: 'planmilt-offline-package-v1:2-partial',
        sources: ['OpenTopo'],
        tileCount: 1,
        bounds: { south: 0.1, west: 0.1, north: 1.9, east: 0.9 },
        minZoom: 8,
        maxZoom: 8,
        srtmTiles: ['N00E000.HGT', 'N01E000.HGT'],
        terrainTiles: ['N00E000.HGT']
    };
    const terrainUrl = 'https://example.test/planmilt/__planmilt_offline_terrain__/N00E000.HGT.json';
    const caches = {
        async keys() { return ['planmilt-offline-terrain-v1:2-partial']; },
        async open() {
            return { async match() {
                return { ok: true, async json() { return { elevations: [[5, 5], [5, 5]] }; } };
            } };
        }
    };
    const manager = loadManager({
        caches,
        localStorage: { getItem() { return JSON.stringify([packageItem]); }, setItem() {} }
    });

    const terrain = await manager.getCachedTerrain(packageItem.bounds, 3, 3);
    assert.deepEqual(Array.from(terrain.missingTiles), ['N01E000.HGT']);
    assert.equal(terrain.elevations[0][1], null);
    assert.equal(terrain.elevations[2][1], 5);
});

test('offline synchronization restores layer controls without blocking selection', () => {
    const manager = loadManager();
    const input = {
        dataset: { offlineManaged: 'true', offlineAvailable: 'false' },
        disabled: true,
        title: 'Sem dados',
        attributes: { 'aria-disabled': 'true' },
        closest() { return { textContent: 'BDGEx - CTM50' }; },
        removeAttribute(key) { delete this.attributes[key]; }
    };
    const layerControl = {
        getContainer() { return { querySelectorAll() { return [input]; } }; }
    };

    manager.enableLayerControls(layerControl, { 'BDGEx - CTM50': {} });
    assert.equal(input.disabled, false);
    assert.equal(input.title, '');
    assert.equal(input.dataset.offlineManaged, undefined);
    assert.equal(input.dataset.offlineAvailable, undefined);
    assert.equal(input.attributes['aria-disabled'], undefined);
});

test('offline manager exposes five descriptive zoom levels', () => {
    const manager = loadManager();
    assert.deepEqual(Array.from(manager.offlineZoomLevels), [8, 10, 12, 14, 15]);
    assert.deepEqual(JSON.parse(JSON.stringify(manager.offlineZoomLabels)), {
        8: 'Visão ampla',
        10: 'Visão regional',
        12: 'Equilíbrio entre área e detalhes',
        14: 'Mais detalhes',
        15: 'Detalhes máximos'
    });
    assert.match(source, /OFFLINE_ZOOM_LEVELS\.map/);
    assert.match(source, /OFFLINE_ZOOM_LABELS\[level\]/);
    assert.doesNotMatch(source, /map\.on\('zoomend'/);
});

test('cached package discovery is not recalculated for the current zoom', async () => {
    const manager = loadManager();
    const layer = {
        _url: 'https://example.test/{z}/{x}/{y}.png',
        getTileUrl(coords) {
            return `https://example.test/${coords.z}/127/128.png`;
        }
    };
    const bounds = { south: -1, west: -1, north: 1, east: 1 };
    const cacheStorage = {
        async keys() { return ['planmilt-offline-package-v1:1-z']; },
        async open() {
            return { async keys() { return [{ url: 'https://example.test/8/127/128.png' }]; } };
        }
    };
    const leaflet = {
        CRS: {
            EPSG3857: {
                latLngToPoint(point, zoom) {
                    return { x: (point.lng + 2) * zoom * 10, y: (2 - point.lat) * zoom * 10 };
                }
            }
        },
        latLng: (lat, lng) => ({ lat, lng }),
        point: (x, y) => ({ x, y })
    };
    const packages = [{
        cacheName: 'planmilt-offline-package-v1:1-z',
        sources: ['Satellite'], tileCount: 1,
        bounds, minZoom: 8, maxZoom: 8
    }];

    assert.deepEqual(
        [...await manager.getCachedPackageSources(packages, cacheStorage, { Satellite: layer }, leaflet, 8)],
        ['Satellite']
    );
    assert.deepEqual(
        [...await manager.getCachedPackageSources(packages, cacheStorage, { Satellite: layer }, leaflet, 9)],
        ['Satellite']
    );
});

test('offline manager explains why Google Satellite cannot be downloaded', () => {
    assert.match(source, /Google Satellite não permite o download ou armazenamento local/);
    assert.match(fs.readFileSync(path.join(root, 'js/features/local-session.js'), 'utf8'), /offlinePackageOnly/);
    assert.match(index, /<div id="offlineStatus" class="offline-status"/);
    assert.doesNotMatch(main, /id="offlineStatus"/);
});

test('offline connectivity state marks the interface and disables network actions', () => {
    const manager = loadManager();
    const classes = values => new Set(values);
    const createClassList = () => {
        const values = classes([]);
        return {
            toggle(name, force) {
                if (force) values.add(name);
                else values.delete(name);
            },
            add: name => values.add(name),
            remove: name => values.delete(name),
            contains: name => values.has(name)
        };
    };
    const status = {
        hidden: true,
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; }
    };
    const saveButton = {
        disabled: false,
        title: 'Salvar planejamento',
        tabIndex: 0,
        dataset: {},
        attributes: {},
        classList: createClassList(),
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; }
    };
    const view3DButton = {
        disabled: false,
        title: 'Abrir visualizador 3D',
        dataset: {},
        attributes: {},
        classList: createClassList(),
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; }
    };
    const radioButton = {
        disabled: false, dataset: {}, attributes: {}, classList: createClassList(),
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; }
    };
    const body = { classList: createClassList() };
    const documentRoot = {
        body,
        getElementById(id) {
            if (id === 'offlineStatus') return status;
            if (id === 'saveDrawings') return saveButton;
            if (id === 'view3DButton') return view3DButton;
            if (id === 'linkPredictionBtn') return radioButton;
            return null;
        },
        querySelectorAll() { return []; }
    };

    manager.updateConnectionState(documentRoot, false);
    assert.equal(status.hidden, false);
    assert.equal(status.attributes['aria-hidden'], 'false');
    assert.equal(saveButton.disabled, true);
    assert.equal(saveButton.attributes['aria-disabled'], 'true');
    assert.equal(saveButton.classList.contains('is-offline-disabled'), true);
    assert.equal(view3DButton.disabled, false);
    assert.equal(view3DButton.classList.contains('is-offline-disabled'), false);
    assert.equal(radioButton.disabled, false);
    assert.equal(radioButton.classList.contains('is-offline-disabled'), false);

    manager.updateConnectionState(documentRoot, true);
    assert.equal(status.hidden, true);
    assert.equal(saveButton.disabled, false);
    assert.equal(saveButton.title, 'Salvar planejamento');
    assert.equal(saveButton.classList.contains('is-offline-disabled'), false);
});

test('offline manager is wired through the rewritten root service worker', () => {
    assert.match(main, /id="offlineManagerButton"[^>]*title="Gerenciar pacotes offline"/);
    assert.match(main, /globalThis\.PlanMilT\?\.offlineManager\?\.isSelectingArea\(\)/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/features/map-setup.js'), 'utf8'), /imagery\/sentinel-2/);
    assert.match(mapTools, /offlineManager\?\.attach/);
    assert.match(index, /js\/features\/offline-manager\.js/);
    assert.match(htaccess, /offline-worker\\\.js\$\s+js\/features\/offline-worker\.js/);
    assert.match(worker, /url\.protocol !== 'https:'/);
    assert.match(worker, /url\.username \|\| url\.password/);
    assert.match(worker, /CACHE_PACKAGE/);
    assert.match(worker, /isRestrictedMapHost\(url\)/);
    assert.match(worker, /Google Maps, cujo download em cache não é permitido/);
    assert.match(source, /offlineManager\.start\(\)\.catch/);
    assert.match(source, /SENTINEL_LAYER_NAME/);
    assert.doesNotMatch(source, /data-prepare-terrain/);
    assert.match(source, /preparePendingTerrain\(apiClient\)/);
    assert.doesNotMatch(source, /'linkPredictionBtn'/);
    assert.match(source, /packageLayerRegistry/);
    assert.match(source, /tiles\.maps\.eox\.at/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/features/map-setup.js'), 'utf8'), /tiles\.maps\.eox\.at/);
    assert.match(index, /rel="manifest" href="manifest\.webmanifest"/);
});

test('application shell includes the integrated viewer for offline navigation', () => {
    assert.match(worker, /visualizador-3d\.html/);
    assert.match(worker, /planmilt-app-shell-v15/);
    assert.match(worker, /criador-tema\.html/);
    assert.match(worker, /manifest\.webmanifest/);
    assert.match(worker, /APP_CACHE_PREFIX/);
    assert.match(worker, /self\.clients\.claim\(\)/);
    assert.match(worker, /getLocalAssetUrls\(css/);
});
