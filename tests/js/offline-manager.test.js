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
        window: { PlanMilT: {}, caches: options.caches },
        location: { pathname: '/planmilt/', href: 'https://example.test/planmilt/' },
        localStorage: { getItem() { return null; }, setItem() {} },
        navigator: options.navigator || {},
        URL,
        console: { error() {}, info() {}, warn() {}, log() {} }
    };
    vm.runInNewContext(source, context);
    return context.window.PlanMilT.offlineManager;
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
        title: 'Salvar desenhos',
        tabIndex: 0,
        dataset: {},
        attributes: {},
        classList: createClassList(),
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; }
    };
    const body = { classList: createClassList() };
    const documentRoot = {
        body,
        getElementById(id) {
            if (id === 'offlineStatus') return status;
            if (id === 'saveDrawings') return saveButton;
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

    manager.updateConnectionState(documentRoot, true);
    assert.equal(status.hidden, true);
    assert.equal(saveButton.disabled, false);
    assert.equal(saveButton.title, 'Salvar desenhos');
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
    assert.match(source, /packageLayerRegistry/);
    assert.match(source, /tiles\.maps\.eox\.at/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/features/map-setup.js'), 'utf8'), /tiles\.maps\.eox\.at/);
    assert.match(index, /rel="manifest" href="manifest\.webmanifest"/);
});

test('application shell includes the integrated viewer for offline navigation', () => {
    assert.match(worker, /visualizador-3d\.html/);
    assert.match(worker, /criador-tema\.html/);
    assert.match(worker, /manifest\.webmanifest/);
    assert.match(worker, /APP_CACHE_PREFIX/);
    assert.match(worker, /self\.clients\.claim\(\)/);
    assert.match(worker, /getLocalAssetUrls\(css/);
});
