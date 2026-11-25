const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const workerSource = read('js/features/offline-worker.js');
const managerSource = read('js/features/offline-manager.js');
const textureSource = read('js/features/map-3d-texture.js');
const propagationSource = read('js/features/coverage-propagation.js');

const ORIGIN = 'https://plan.test';
const PACKAGE_PREFIX = 'planmilt-offline-package-v1:';
const TERRAIN_PREFIX = 'planmilt-offline-terrain-v1:';
const BOUNDS = { south: -21.8, west: -51.8, north: -21.2, east: -51.2 };

/** Cache Storage em memória, compartilhado entre worker, gerenciador e visualizador 3D. */
function createCacheStorage() {
    const stores = new Map();
    const keyOf = request => new URL(typeof request === 'string' ? request : request.url, `${ORIGIN}/`).href;
    return {
        stores,
        async keys() { return [...stores.keys()]; },
        async delete(name) { return stores.delete(name); },
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const entries = stores.get(name);
            return {
                async match(request) {
                    const response = entries.get(keyOf(request));
                    return response?.clone ? response.clone() : response;
                },
                async put(request, response) { entries.set(keyOf(request), response); },
                async keys() { return [...entries.keys()].map(url => ({ url })); },
                async delete(request) { return entries.delete(keyOf(request)); }
            };
        }
    };
}

/** Servidor simulado: devolve tiles, shell e recursos conforme a tabela e o estado de rede. */
function createNetwork(handlers = {}) {
    const state = { online: true, requests: [] };
    state.fetch = async request => {
        const url = typeof request === 'string' ? request : request.url;
        state.requests.push({ url, mode: request.mode });
        if (!state.online) throw new TypeError('Failed to fetch');
        for (const [pattern, handler] of Object.entries(handlers)) {
            if (url.includes(pattern)) return handler(request);
        }
        return new Response('não encontrado', { status: 404 });
    };
    return state;
}

function loadWorker(caches, network) {
    const listeners = new Map();
    class TestRequest {
        constructor(url, options) { this.url = String(url); this.method = 'GET'; Object.assign(this, options); }
    }
    const self = {
        location: { href: `${ORIGIN}/offline-worker.js`, origin: ORIGIN },
        addEventListener(name, callback) { listeners.set(name, callback); },
        clients: { async claim() {} },
        async skipWaiting() {}
    };
    vm.runInNewContext(workerSource, {
        self, caches, URL, Request: TestRequest, Response, fetch: network.fetch,
        console: { warn() {}, error() {}, info() {} }
    });
    return {
        async install() {
            let pending;
            listeners.get('install')({ waitUntil(promise) { pending = promise; } });
            await pending;
        },
        async downloadPackage(id, urls) {
            const messages = [];
            let pending;
            listeners.get('message')({
                data: { type: 'CACHE_PACKAGE', cacheName: `${PACKAGE_PREFIX}${id}`, urls },
                ports: [{ postMessage(message) { messages.push(message); } }],
                waitUntil(promise) { pending = promise; }
            });
            await pending;
            return messages;
        },
        /** Retorna a resposta do worker ou null quando ele não intercepta a requisição. */
        async fetchEvent(url, mode = 'cors') {
            let responder = null;
            listeners.get('fetch')({
                request: { method: 'GET', url, mode },
                respondWith(promise) { responder = promise; }
            });
            return responder;
        }
    };
}

function tileUrls(manager, minZoom = 10, maxZoom = 10) {
    return Array.from(manager.buildOpenTopoUrls(BOUNDS, minZoom, maxZoom));
}

function createManager({ caches, onLine = true, packages = [] }) {
    const browserNavigator = { onLine };
    let stored = JSON.stringify(packages);
    const context = {
        window: { PlanMilT: {}, caches, addEventListener() {} },
        caches, navigator: browserNavigator,
        location: { pathname: '/planmilt/', href: `${ORIGIN}/planmilt/` },
        localStorage: { getItem() { return stored; }, setItem(key, value) { stored = value; } },
        URL, Response, document: undefined,
        console: { error() {}, info() {}, warn() {}, log() {} }
    };
    vm.runInNewContext(managerSource, context);
    return {
        manager: context.window.PlanMilT.offlineManager,
        browserNavigator,
        getPackages: () => JSON.parse(stored)
    };
}

/** HGT 1201 × 1201 com elevação base e uma crista opcional entre colunas. */
function createHgt(base, ridge) {
    const buffer = new ArrayBuffer(1201 * 1201 * 2);
    const view = new DataView(buffer);
    for (let row = 0; row < 1201; row++) {
        for (let column = 0; column < 1201; column++) {
            const onRidge = ridge && column >= ridge.from && column <= ridge.to;
            view.setInt16((row * 1201 + column) * 2, onRidge ? ridge.height : base, false);
        }
    }
    return buffer;
}

function createApiClient(hgtByTile, calls) {
    return {
        async request(url, options) {
            const body = options?.body ? JSON.parse(options.body) : {};
            calls.push({ url, body });
            if (url === 'php/endpoints/elevation-download.php') {
                return { ok: Boolean(hgtByTile[body.tile]), async json() { return { success: true, tile: body.tile }; } };
            }
            if (url === 'php/endpoints/elevation-hgt.php') {
                const buffer = hgtByTile[body.tile];
                return buffer
                    ? { ok: true, async arrayBuffer() { return buffer; } }
                    : { ok: false, status: 404, async arrayBuffer() { return new ArrayBuffer(0); } };
            }
            return { ok: true, async json() { return { elevations: [[100, 100], [100, 100]], missingTiles: [] }; } };
        }
    };
}

function createTextureHarness(caches, networkCalls) {
    const draws = [];
    const canvas = {
        getContext: () => ({ fillRect() {}, drawImage(...args) { draws.push(args); } }),
        toDataURL: () => 'data:image/png;base64,terrain'
    };
    const map = {
        getZoom: () => 10,
        getSize: () => ({ x: 800, y: 600 }),
        project([lat, lng], z) {
            const n = 256 * 2 ** z;
            return { x: (lng + 180) / 360 * n, y: (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * n };
        },
        unproject([x, y], z) {
            const n = 256 * 2 ** z;
            return { lng: x / n * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI };
        }
    };
    class Image { set src(value) { queueMicrotask(() => this.onload()); } }
    class TestURL extends URL {}
    TestURL.createObjectURL = () => 'blob:tile';
    TestURL.revokeObjectURL = () => {};
    const window = {
        caches,
        location: { href: `${ORIGIN}/`, origin: ORIGIN },
        PlanMilT: { apiClient: { async request(url) { networkCalls.push(url); throw new Error('sem rede'); } } }
    };
    vm.runInNewContext(textureSource, {
        window, document: { createElement: () => canvas }, Image, URLSearchParams, URL: TestURL,
        console: { error() {} }
    });
    return { texture: window.PlanMilT.map3dTexture, map, draws };
}

const tileResponse = () => new Response('png', { headers: { 'Content-Type': 'image/png' } });

test('worker caches the application shell, then serves it and its assets without network', async () => {
    const caches = createCacheStorage();
    const network = createNetwork({
        '/index.html': () => new Response('<link href="css/app.css"><script src="js/features/main.js"></script>'),
        '/css/app.css': () => new Response('body{background:url("../img/bg.png")}'),
        '/js/features/main.js': () => new Response('//main'),
        '/img/bg.png': () => new Response('png'),
        '/visualizador-3d.html': () => new Response('<script src="js/features/map-3d-viewer.js"></script>'),
        '/js/features/map-3d-viewer.js': () => new Response('//viewer')
    });
    const worker = loadWorker(caches, network);
    await worker.install();

    const shell = await caches.open('planmilt-app-shell-v13');
    for (const asset of ['index.html', 'css/app.css', 'js/features/main.js', 'img/bg.png', 'js/features/map-3d-viewer.js']) {
        assert.ok(await shell.match(`${ORIGIN}/${asset}`), `${asset} deve estar no cache do shell`);
    }

    network.online = false;
    const navigation = await worker.fetchEvent(`${ORIGIN}/`, 'navigate');
    assert.match(await navigation.text(), /main\.js/);
    const script = await worker.fetchEvent(`${ORIGIN}/js/features/main.js`, 'no-cors');
    assert.equal(await script.text(), '//main');

    const unknownPage = await worker.fetchEvent(`${ORIGIN}/outra-pagina`, 'navigate');
    assert.match(await unknownPage.text(), /main\.js/);
    const missing = await worker.fetchEvent(`${ORIGIN}/symbols/c2/ont.svg`, 'no-cors');
    assert.equal(missing.status, 503);
});

test('worker leaves PHP endpoints and HGT downloads to the page', async () => {
    const worker = loadWorker(createCacheStorage(), createNetwork());
    for (const url of [
        `${ORIGIN}/php/endpoints/map-settings.php`,
        `${ORIGIN}/php/endpoints/elevation-terrain.php`,
        `${ORIGIN}/SRTM3/S22W052.HGT`
    ]) {
        assert.equal(await worker.fetchEvent(url), null, url);
    }
});

test('package download stores every tile, reports progress and deduplicates URLs', async () => {
    const caches = createCacheStorage();
    const network = createNetwork({ 'tile.opentopomap.org': tileResponse });
    const worker = loadWorker(caches, network);
    const { manager } = createManager({ caches });
    const urls = tileUrls(manager, 10, 11);
    assert.ok(urls.length > 4);

    const messages = await worker.downloadPackage('1-area', [...urls, ...urls]);
    const progress = messages.filter(message => message.type === 'PACKAGE_PROGRESS');
    const complete = messages.at(-1);
    assert.equal(progress.length, urls.length);
    assert.deepEqual(progress.map(message => message.completed), progress.map((_, index) => index + 1));
    assert.equal(complete.type, 'PACKAGE_COMPLETE');
    assert.equal(complete.cached, urls.length);
    assert.equal(complete.failedTileCount, 0);
    assert.equal(network.requests.length, urls.length);
    assert.ok(network.requests.every(request => request.mode === 'cors'));

    await worker.downloadPackage('1-area', urls);
    assert.equal(network.requests.length, urls.length, 'tiles já armazenados não são baixados novamente');
});

test('package download counts failures and keeps opaque fallback for providers without CORS', async () => {
    const caches = createCacheStorage();
    const network = createNetwork({
        '/ok/': tileResponse,
        '/missing/': () => new Response('x', { status: 404 }),
        '/nocors/': request => {
            if (request.mode === 'cors') throw new TypeError('CORS');
            return { ok: false, type: 'opaque', status: 0, clone() { return this; } };
        },
        '/broken/': () => { throw new TypeError('rede'); }
    });
    network.fetch = (original => async request => {
        if (request.url.includes('/broken/') && request.mode === 'no-cors') throw new TypeError('rede');
        return original(request);
    })(network.fetch);
    const worker = loadWorker(caches, network);
    const messages = await worker.downloadPackage('2-mixed', [
        'https://tiles.test/ok/1.png', 'https://tiles.test/missing/2.png',
        'https://tiles.test/nocors/3.png', 'https://tiles.test/broken/4.png'
    ]);
    const complete = messages.at(-1);
    assert.equal(complete.type, 'PACKAGE_COMPLETE');
    assert.equal(complete.total, 4);
    assert.equal(complete.cached, 2);
    assert.equal(complete.opaqueTileCount, 1);
    assert.equal(complete.failedTileCount, 2);
});

test('package download rejects unsafe manifests before touching the network', async () => {
    const network = createNetwork({ '': tileResponse });
    const worker = loadWorker(createCacheStorage(), network);
    const cases = [
        [['http://tiles.test/1.png'], /insegura/],
        [['https://user:pass@tiles.test/1.png'], /insegura/],
        [['https://mt1.google.com/vt/lyrs=s&x=1&y=1&z=1'], /Google/],
        [['https://maps.googleapis.com/maps/api/staticmap'], /Google/],
        [Array.from({ length: 10001 }, (_, index) => `https://tiles.test/${index}.png`), /10\.000/]
    ];
    for (const [urls, message] of cases) {
        const result = await worker.downloadPackage('bad', urls).catch(error => [{ type: 'PACKAGE_ERROR', message: error.message }]);
        assert.equal(result.at(-1).type, 'PACKAGE_ERROR');
        assert.match(result.at(-1).message, message);
    }
    assert.equal(network.requests.length, 0);
});

test('downloaded package tiles are served offline, except Google hosts', async () => {
    const caches = createCacheStorage();
    const network = createNetwork({ 'tile.opentopomap.org': tileResponse });
    const worker = loadWorker(caches, network);
    const { manager } = createManager({ caches });
    const [first] = tileUrls(manager);
    await worker.downloadPackage('3-offline', [first]);

    network.online = false;
    const response = await worker.fetchEvent(first, 'cors');
    assert.equal(await response.text(), 'png');

    await (await caches.open(`${PACKAGE_PREFIX}3-offline`))
        .put('https://mt1.google.com/vt/x=1', tileResponse());
    await assert.rejects(worker.fetchEvent('https://mt1.google.com/vt/x=1', 'cors'), /Failed to fetch/);
    await assert.rejects(worker.fetchEvent('https://tile.opentopomap.org/10/0/0.png', 'cors'), /Failed to fetch/);
});

test('SRTM preparation stores HGT and grids, then answers terrain queries offline', async () => {
    const caches = createCacheStorage();
    const { manager, browserNavigator, getPackages } = createManager({
        caches,
        packages: [{
            id: '4-srtm', cacheName: `${PACKAGE_PREFIX}4-srtm`, sources: ['OpenTopo'], tileCount: 1,
            bounds: BOUNDS, minZoom: 8, maxZoom: 10
        }]
    });
    const calls = [];
    const api = createApiClient({ 'S22W052.HGT': createHgt(100) }, calls);
    const result = await manager.preparePackageTerrain('4-srtm', api);
    assert.deepEqual(Array.from(result.hgtTiles), ['S22W052.HGT']);
    assert.deepEqual(Array.from(result.failedHgt), []);
    assert.deepEqual(getPackages()[0].terrainTiles, ['S22W052.HGT']);
    assert.ok(caches.stores.has(`${TERRAIN_PREFIX}4-srtm`));

    const requestsAfterDownload = calls.length;
    browserNavigator.onLine = false;
    const grid = await manager.getCachedTerrain(BOUNDS, 5, 5);
    assert.equal(grid.rows, 5);
    assert.equal(grid.columns, 5);
    assert.deepEqual(Array.from(grid.missingTiles), []);
    assert.ok(grid.elevations.flat().every(value => Math.abs(value - 100) < 1e-9));
    const profile = await manager.getCachedElevationProfile([{ latitude: -21.5, longitude: -51.5 }]);
    assert.equal(profile[0].elevation, 100);
    assert.equal(calls.length, requestsAfterDownload, 'consultas offline não usam a API');

    await assert.rejects(manager.getCachedTerrain({ south: -23.8, west: -51.8, north: -23.2, east: -51.2 }), /S24W052/);
});

test('SRTM preparation reports tiles the server cannot provide and never marks them available', async () => {
    const caches = createCacheStorage();
    const { manager, getPackages } = createManager({
        caches,
        packages: [{
            id: '5-gap', cacheName: `${PACKAGE_PREFIX}5-gap`, sources: [], tileCount: 0,
            bounds: { south: -22.5, west: -51.5, north: -21.5, east: -50.5 }, minZoom: 8, maxZoom: 8
        }]
    });
    const calls = [];
    const api = createApiClient({ 'S22W051.HGT': createHgt(50) }, calls);
    const result = await manager.preparePackageTerrain('5-gap', api);
    assert.deepEqual(Array.from(result.hgtTiles), ['S22W051.HGT']);
    assert.ok(Array.from(result.failedHgt).includes('S22W052.HGT'));
    assert.ok(!getPackages()[0].hgtTiles.includes('S22W052.HGT'));
});

test('radio prediction over downloaded HGT detects a ridge and refuses uncovered areas offline', async () => {
    const caches = createCacheStorage();
    const ridgeBuffer = createHgt(100, { from: 580, to: 620, height: 400 });
    const { manager, browserNavigator } = createManager({
        caches,
        packages: [{
            id: '6-radio', cacheName: `${PACKAGE_PREFIX}6-radio`, sources: [], tileCount: 0,
            bounds: BOUNDS, minZoom: 8, maxZoom: 8
        }]
    });
    const calls = [];
    await manager.preparePackageTerrain('6-radio', createApiClient({ 'S22W052.HGT': ridgeBuffer }, calls));
    browserNavigator.onLine = false;
    const callsBefore = calls.length;

    const context = { window: { PlanMilT: {} } };
    vm.runInNewContext(propagationSource, context);
    const model = context.window.PlanMilT.coveragePropagation;
    const parameters = { freq: 450, txPower: 37, txGain: 2, rxGain: 2, rxSens: -105, txHeight: 10, rxHeight: 10 };

    const samples = Array.from({ length: 41 }, (_, index) => ({
        latitude: -21.5, longitude: -51.9 + index * 0.02
    })).filter(point => point.longitude >= -51.8);
    const elevations = await manager.getCachedElevationProfile(samples);
    const profile = elevations.map((point, index) => ({
        distKm: index * 0.02 * 111.32 * Math.cos(21.5 * Math.PI / 180), elevation: point.elevation
    }));
    assert.ok(profile.some(point => point.elevation === 400), 'a crista deve ser amostrada');
    const blocked = model.evaluate(profile, parameters);
    assert.equal(blocked.hasObstruction, true);

    const flat = model.evaluate(profile.map(point => ({ ...point, elevation: 100 })), parameters);
    assert.ok(blocked.rxPower < flat.rxPower);
    assert.equal(calls.length, callsBefore);

    await assert.rejects(
        manager.getCachedElevationProfile([{ latitude: -21.5, longitude: -50.5 }]),
        /HGT indisponíveis.*S22W051/
    );
    await assert.rejects(manager.getCachedElevationProfile([{ latitude: NaN, longitude: -51.5 }]), /inválidos/);
});

test('radio prediction rejects HGT samples without data instead of guessing', async () => {
    const caches = createCacheStorage();
    const buffer = createHgt(100);
    new DataView(buffer).setInt16((600 * 1201 + 600) * 2, -32768, false);
    const { manager, browserNavigator } = createManager({
        caches,
        packages: [{
            id: '7-void', cacheName: `${PACKAGE_PREFIX}7-void`, sources: [], tileCount: 0,
            bounds: BOUNDS, minZoom: 8, maxZoom: 8
        }]
    });
    await manager.preparePackageTerrain('7-void', createApiClient({ 'S22W052.HGT': buffer }, []));
    browserNavigator.onLine = false;
    await assert.rejects(manager.getCachedElevationProfile([{ latitude: -21.5, longitude: -51.5 }]), /sem elevação/);
});

test('3D view composes terrain and texture entirely from a downloaded package', async () => {
    const caches = createCacheStorage();
    const network = createNetwork({ 'tile.opentopomap.org': tileResponse });
    const worker = loadWorker(caches, network);
    const { manager, browserNavigator } = createManager({
        caches,
        packages: [{
            id: '8-3d', cacheName: `${PACKAGE_PREFIX}8-3d`, sources: ['OpenTopo'], tileCount: 0,
            bounds: BOUNDS, minZoom: 10, maxZoom: 10
        }]
    });
    const urls = tileUrls(manager);
    await worker.downloadPackage('8-3d', urls);
    const calls = [];
    await manager.preparePackageTerrain('8-3d', createApiClient({ 'S22W052.HGT': createHgt(100) }, calls));

    network.online = false;
    browserNavigator.onLine = false;
    const networkCalls = [];
    const harness = createTextureHarness(caches, networkCalls);
    const bounds = [BOUNDS.south, BOUNDS.west, BOUNDS.north, BOUNDS.east];
    const requestsBefore = network.requests.length;
    const [texture, terrain] = await Promise.all([
        harness.texture.create(harness.map, bounds, 'opentopo', [], 10, { offlineOnly: true }),
        manager.getCachedTerrain(BOUNDS, 65, 65)
    ]);

    assert.equal(texture.zoom, 10);
    assert.match(texture.image, /^data:image\/png/);
    assert.equal(harness.draws.length, urls.length);
    assert.equal(terrain.rows, 65);
    assert.equal(terrain.columns, 65);
    assert.ok(terrain.elevations.flat().every(Number.isFinite));
    assert.deepEqual(networkCalls, []);
    assert.equal(network.requests.length, requestsBefore);
});

test('3D texture fails clearly when package tiles are absent or no package exists', async () => {
    const caches = createCacheStorage();
    const networkCalls = [];
    const harness = createTextureHarness(caches, networkCalls);
    const bounds = [BOUNDS.south, BOUNDS.west, BOUNDS.north, BOUNDS.east];
    await assert.rejects(
        harness.texture.create(harness.map, bounds, 'opentopo', [], 10, { offlineOnly: true }),
        /Nenhum pacote offline/
    );

    await caches.open(`${PACKAGE_PREFIX}empty`);
    await assert.rejects(
        harness.texture.create(harness.map, bounds, 'opentopo', [], 10, { offlineOnly: true }),
        /Tile da camada-base ausente/
    );
    assert.deepEqual(networkCalls, []);
    assert.equal(harness.draws.length, 0);
});

test('3D zoom 8 requires the whole viewport to be covered by the downloaded tiles', async () => {
    const caches = createCacheStorage();
    const network = createNetwork({ 'tile.opentopomap.org': tileResponse });
    const worker = loadWorker(caches, network);
    const { manager } = createManager({ caches });
    const urls = Array.from(manager.buildOpenTopoUrls(BOUNDS, 8, 8));
    await worker.downloadPackage('9-viewport', urls);
    network.online = false;
    const networkCalls = [];
    const { texture, map } = createTextureHarness(caches, networkCalls);

    await texture.create(map, [BOUNDS.south, BOUNDS.west, BOUNDS.north, BOUNDS.east],
        'opentopo', [], 8, { offlineOnly: true });
    await assert.rejects(texture.create(map, [-23, -53, -20, -50],
        'opentopo', [], 8, { offlineOnly: true }), /Tile da camada-base ausente/);
    assert.deepEqual(networkCalls, []);
});
