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
        location: { pathname: '/planmilt/' },
        localStorage: { getItem() { return null; }, setItem() {} },
        navigator: options.navigator || {},
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

test('offline manager is wired through the rewritten root service worker', () => {
    assert.match(main, /id="offlineManagerButton"[^>]*title="Gerenciar pacotes offline"/);
    assert.match(main, /globalThis\.PlanMilT\?\.offlineManager\?\.isSelectingArea\(\)/);
    assert.match(mapTools, /offlineManager\?\.attach/);
    assert.match(index, /js\/features\/offline-manager\.js/);
    assert.match(htaccess, /offline-worker\\\.js\$\s+js\/features\/offline-worker\.js/);
    assert.match(worker, /tile\\\.opentopomap\\\.org/);
    assert.match(worker, /bdgex\\\.eb\\\.mil\\\.br/);
    assert.match(worker, /CACHE_PACKAGE/);
    assert.match(source, /offlineManager\.start\(\)\.catch/);
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
