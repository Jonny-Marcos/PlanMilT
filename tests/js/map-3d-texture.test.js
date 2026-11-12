const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/map-3d-texture.js'), 'utf8');

function setup(fail = false) {
    const urls = [];
    const draws = [];
    const released = [];
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
    class Image {
        set src(value) { queueMicrotask(() => this.onload()); }
    }
    class TestURL extends URL {}
    TestURL.createObjectURL = () => 'blob:tile';
    TestURL.revokeObjectURL = url => released.push(url);
    const window = { location: { href: 'https://plan.test/', origin: 'https://plan.test' }, PlanMilT: { apiClient: { async request(endpoint, options) {
        assert.equal(options.method, 'GET');
        assert.equal(options.mode, 'cors');
        assert.equal(options.credentials, 'omit');
        urls.push(endpoint);
        return { ok: !fail, status: 502, async blob() { return {}; } };
    } } } };
    vm.runInNewContext(source, {
        window, document: { createElement: () => canvas }, Image, URLSearchParams,
        URL: TestURL, DOMMatrixReadOnly: class {
            constructor(value) {
                assert.equal(value, 'matrix(1, 0, 0, 1, -110, -80)');
                this.e = -110;
                this.f = -80;
            }
        },
        console: { error() {} }
    });
    return { texture: window.PlanMilT.map3dTexture, map, canvas, urls, draws, released, window };
}

test('builds only OpenTopo tiles within the texture bounds', async () => {
    const h = setup();
    const result = await h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'opentopo');
    assert.equal(result.image, 'data:image/png;base64,terrain');
    assert.equal(result.zoom, 10);
    assert.ok(h.urls.length > 0 && h.urls.length <= 64);
    assert.ok(h.urls.every(url => /^https:\/\/tile\.opentopomap\.org\/\d+\/\d+\/\d+\.png$/.test(url)));
    assert.equal(h.draws.length, h.urls.length);
    assert.equal(h.released.length, h.urls.length);
    assert.deepEqual([h.canvas.width, h.canvas.height], [800, 600]);
    const [, zoom, x, y] = h.urls[0].match(/\/(\d+)\/(\d+)\/(\d+)\.png$/).map(Number);
    const northwest = h.map.project([-21.4, -51.4], zoom);
    const southeast = h.map.project([-21.7, -51.1], zoom);
    assert.ok(Math.abs(h.draws[0][1] - (x * 256 - northwest.x) / (southeast.x - northwest.x) * 800) < 1e-8);
    assert.ok(Math.abs(h.draws[0][2] - (y * 256 - northwest.y) / (southeast.y - northwest.y) * 600) < 1e-8);
});

test('uses the requested zoom even beyond 64 tiles and preserves the texture size limit', async () => {
    const h = setup();
    const result = await h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'opentopo', [], 11);
    assert.equal(result.zoom, 11);
    assert.ok(h.urls.every(url => /\/11\/\d+\/\d+\.png$/.test(url)));
    assert.deepEqual([h.canvas.width, h.canvas.height], [1600, 1200]);
    await h.texture.create(h.map, [-21.60, -51.30, -21.59, -51.29], 'opentopo', [], 14);
    assert.deepEqual([h.canvas.width, h.canvas.height], [2048, 1536]);
    const many = setup();
    const detailed = await many.texture.create(many.map, [-21.7, -51.4, -21.4, -51.1], 'opentopo', [], 13);
    assert.equal(detailed.zoom, 13);
    assert.ok(many.urls.length > 64);
    assert.ok(many.urls.every(url => /\/13\/\d+\/\d+\.png$/.test(url)));
    assert.equal(many.draws.length, many.urls.length);
    await assert.rejects(h.texture.create(h.map, [-1, -1, 1, 1], 'opentopo', [], 19), /entre 0 e 18/);
    const automatic = await h.texture.create(h.map, [-2, -2, 2, 2], 'opentopo');
    assert.equal(automatic.zoom, h.map.getZoom());
});

test('asks before large downloads and does not request tiles if declined', async () => {
    const h = setup();
    let count = 0;
    await assert.rejects(h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'opentopo', [], 15, {
        confirmLargeRequest: async total => { count = total; return false; }
    }), /cancelado/);
    assert.ok(count > 256);
    assert.equal(h.urls.length, 0);
    const result = await h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'opentopo', [], 15, {
        confirmLargeRequest: async total => total === count
    });
    assert.equal(result.zoom, 15);
    assert.equal(h.urls.length, count);
});

test('stops issuing tiles when a capture is cancelled', async () => {
    const h = setup();
    const controller = new AbortController();
    await assert.rejects(h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'opentopo', [], 13, {
        signal: controller.signal, onProgress() { controller.abort(); }
    }), /cancelado/);
    assert.ok(h.urls.length <= 4);
});

test('composites visible paths, icons and radio coverages without other image overlays', async () => {
    const h = setup();
    const element = (tagName, pane) => ({
        tagName, attributes: new Map(),
        closest(selector) { return selector === pane ? this : null; },
        querySelectorAll() { return []; },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        setAttribute(name, value) { this.attributes.set(name, value); },
        removeAttribute(name) { this.attributes.delete(name); }
    });
    const path = element('path', '.leaflet-overlay-pane svg');
    const icon = element('img', '.leaflet-marker-pane');
    icon.src = 'https://plan.test/symbols/example.svg';
    icon.complete = true;
    icon.naturalWidth = 30;
    const coverage = element('img', '.leaflet-overlay-pane');
    coverage.src = 'data:image/png;base64,coverage';
    coverage.complete = true;
    coverage.naturalWidth = 30;
    const hiddenCoverage = element('img', '.leaflet-overlay-pane');
    const unrelatedImage = element('img', '.leaflet-overlay-pane');
    const hidden = element('path', '.leaflet-overlay-pane svg');
    const pathLayer = { getElement: () => path };
    const iconLayer = { getElement: () => icon };
    const coverageLayer = { getElement: () => coverage, toGeoJSON: () => ({ properties: { coverageImage: {} } }) };
    const hiddenCoverageLayer = { getElement: () => hiddenCoverage, toGeoJSON: () => ({ properties: { coverageImage: {} } }) };
    const unrelatedImageLayer = { getElement: () => unrelatedImage, toGeoJSON: () => ({ properties: {} }) };
    const hiddenLayer = { getElement: () => hidden };
    const group = { eachLayer: callback => [pathLayer, iconLayer, coverageLayer, hiddenCoverageLayer, unrelatedImageLayer, hiddenLayer].forEach(callback) };
    h.map.hasLayer = layer => layer !== hiddenLayer && layer !== hiddenCoverageLayer;
    h.map.getContainer = () => ({ id: 'map' });
    let captured = false;
    h.window.html2canvas = async (container, options) => {
        captured = true;
        assert.equal(path.getAttribute('data-planmilt-3d'), 'visible');
        assert.equal(icon.getAttribute('data-planmilt-3d'), 'visible');
        assert.equal(coverage.getAttribute('data-planmilt-3d'), 'visible');
        assert.equal(hiddenCoverage.getAttribute('data-planmilt-3d'), null);
        assert.equal(unrelatedImage.getAttribute('data-planmilt-3d'), null);
        assert.equal(hidden.getAttribute('data-planmilt-3d'), null);
        assert.equal(options.backgroundColor, null);
        const svg = { style: { transform: 'matrix(1, 0, 0, 1, -110, -80)' } };
        const selected = { getAttribute: () => 'visible', closest: () => null, remove() { this.removed = true; } };
        const unrelated = { getAttribute: () => null, closest: () => null, remove() { this.removed = true; } };
        const definition = { getAttribute: () => null, closest: () => true, remove() { this.removed = true; } };
        const marker = { getAttribute: () => null, remove() { this.removed = true; } };
        const selectedImage = { getAttribute: () => 'visible', remove() { this.removed = true; } };
        const otherImage = { getAttribute: () => null, remove() { this.removed = true; } };
        const clone = {
            style: { background: '#ddd' },
            querySelectorAll(selector) {
                if (selector === '.leaflet-overlay-pane svg path') return [selected, unrelated, definition];
                if (selector === '.leaflet-overlay-pane svg') return [svg];
                if (selector === '.leaflet-overlay-pane img, .leaflet-overlay-pane canvas') return [selectedImage, otherImage];
                if (selector === '.leaflet-marker-pane > *') return [marker];
                return [];
            }
        };
        options.onclone({ getElementById: () => clone });
        assert.equal(clone.style.background, 'transparent');
        assert.deepEqual(svg.style, { transform: 'none', left: '-110px', top: '-80px' });
        assert.equal(selected.removed, undefined);
        assert.equal(unrelated.removed, true);
        assert.equal(definition.removed, undefined);
        assert.equal(marker.removed, true);
        assert.equal(selectedImage.removed, undefined);
        assert.equal(otherImage.removed, true);
        return { overlay: true };
    };
    await h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'opentopo', [group]);
    assert.ok(captured);
    assert.equal(h.draws.at(-1)[0].overlay, true);
    assert.equal(path.getAttribute('data-planmilt-3d'), null);
    assert.equal(icon.getAttribute('data-planmilt-3d'), null);
    assert.equal(coverage.getAttribute('data-planmilt-3d'), null);
});

test('restores marked elements and reports capture errors', async () => {
    const h = setup();
    const attributes = new Map([['data-planmilt-3d', 'previous']]);
    const path = {
        tagName: 'path', closest: selector => selector === '.leaflet-overlay-pane svg',
        querySelectorAll: () => [],
        getAttribute: name => attributes.get(name) ?? null,
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: name => attributes.delete(name)
    };
    const layer = { getElement: () => path };
    h.map.hasLayer = () => true;
    h.map.getContainer = () => ({ id: 'map' });
    h.window.html2canvas = async () => { throw new Error('Falha na captura'); };
    await assert.rejects(h.texture.create(h.map, [-1, -1, 1, 1], 'opentopo', [layer]), /Falha na captura/);
    assert.equal(attributes.get('data-planmilt-3d'), 'previous');
});

test('does not capture children of a hidden coverage or suggestion group', async () => {
    const h = setup();
    const hiddenGroup = { eachLayer() { throw new Error('Grupo oculto não deve ser percorrido.'); } };
    h.map.hasLayer = () => false;
    await h.texture.create(h.map, [-1, -1, 1, 1], 'opentopo', [hiddenGroup]);
});

test('rejects external icons rather than silently omitting them', async () => {
    const h = setup();
    const image = {
        tagName: 'img', src: 'https://other.example/icon.png', complete: true, naturalWidth: 48,
        closest: selector => selector === '.leaflet-marker-pane'
    };
    h.map.hasLayer = () => true;
    h.window.html2canvas = async () => ({});
    await assert.rejects(h.texture.create(h.map, [-1, -1, 1, 1], 'opentopo', [{ getElement: () => image }]), /ícone externo/);
});

test('builds BDGEx CTM50 tiles and reprojects geographic rows to Mercator', async () => {
    const h = setup();
    await h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'bdgex');
    assert.ok(h.urls.length > 0 && h.urls.length <= 64);
    for (const url of h.urls) {
        const parsed = new URL(url);
        assert.equal(parsed.origin + parsed.pathname, 'https://bdgex.eb.mil.br/mapcache');
        assert.equal(parsed.searchParams.get('layers'), 'ctm50');
        assert.equal(parsed.searchParams.get('srs'), 'EPSG:4326');
        assert.equal(parsed.searchParams.get('width'), '96');
    }
    assert.equal(h.draws.length, h.urls.length * 96);
    assert.equal(h.draws[0].length, 9);
    assert.notEqual(h.draws[0][8], h.draws[95][8]);
});

test('allows more than 64 BDGEx tiles at the selected zoom', async () => {
    const h = setup();
    const result = await h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'bdgex', [], 12);
    assert.equal(result.zoom, 12);
    assert.ok(h.urls.length > 64);
    assert.ok(h.urls.every(url => url.startsWith('https://bdgex.eb.mil.br/mapcache?')));
    assert.equal(h.draws.length, h.urls.length * 96);
});

test('rejects unsupported layers and reports tile download failures', async () => {
    const h = setup(true);
    await assert.rejects(h.texture.create(h.map, [-1, -1, 1, 1], 'google'), /inválida/);
    await assert.rejects(h.texture.create(h.map, [-1, -1, 1, 1], 'opentopo'), /permissão CORS/);
    await assert.rejects(h.texture.create(h.map, [-10, -1, 1, 1], 'opentopo'), /cinco graus/);
});

test('reports direct CORS or network failures without falling back to a proxy', async () => {
    const h = setup();
    const requests = [];
    h.window.PlanMilT.apiClient.request = async url => {
        requests.push(url);
        throw new TypeError('Failed to fetch');
    };
    await assert.rejects(h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'bdgex'), /permissão CORS/);
    assert.ok(requests.length > 0);
    assert.ok(requests.length <= 4);
    assert.ok(requests.every(url => url.startsWith('https://bdgex.eb.mil.br/mapcache?')));
});
