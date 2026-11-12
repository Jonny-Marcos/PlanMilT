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
        assert.equal(endpoint, 'php/endpoints/map-image-proxy.php');
        urls.push(JSON.parse(options.body).url);
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
    assert.equal(await h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'opentopo'), 'data:image/png;base64,terrain');
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

test('composites only visible drawing paths and icons and restores original DOM attributes', async () => {
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
    const hidden = element('path', '.leaflet-overlay-pane svg');
    const pathLayer = { getElement: () => path };
    const iconLayer = { getElement: () => icon };
    const hiddenLayer = { getElement: () => hidden };
    const group = { eachLayer: callback => [pathLayer, iconLayer, hiddenLayer].forEach(callback) };
    h.map.hasLayer = layer => layer !== hiddenLayer;
    h.map.getContainer = () => ({ id: 'map' });
    let captured = false;
    h.window.html2canvas = async (container, options) => {
        captured = true;
        assert.equal(path.getAttribute('data-planmilt-3d'), 'visible');
        assert.equal(icon.getAttribute('data-planmilt-3d'), 'visible');
        assert.equal(hidden.getAttribute('data-planmilt-3d'), null);
        assert.equal(options.backgroundColor, null);
        const svg = { style: { transform: 'matrix(1, 0, 0, 1, -110, -80)' } };
        const selected = { getAttribute: () => 'visible', closest: () => null, remove() { this.removed = true; } };
        const unrelated = { getAttribute: () => null, closest: () => null, remove() { this.removed = true; } };
        const definition = { getAttribute: () => null, closest: () => true, remove() { this.removed = true; } };
        const marker = { getAttribute: () => null, remove() { this.removed = true; } };
        const clone = {
            style: { background: '#ddd' },
            querySelectorAll(selector) {
                if (selector === '.leaflet-overlay-pane svg path') return [selected, unrelated, definition];
                if (selector === '.leaflet-overlay-pane svg') return [svg];
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
        return { overlay: true };
    };
    await h.texture.create(h.map, [-21.7, -51.4, -21.4, -51.1], 'opentopo', [group]);
    assert.ok(captured);
    assert.equal(h.draws.at(-1)[0].overlay, true);
    assert.equal(path.getAttribute('data-planmilt-3d'), null);
    assert.equal(icon.getAttribute('data-planmilt-3d'), null);
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

test('rejects unsupported layers and reports tile download failures', async () => {
    const h = setup(true);
    await assert.rejects(h.texture.create(h.map, [-1, -1, 1, 1], 'google'), /inválida/);
    await assert.rejects(h.texture.create(h.map, [-1, -1, 1, 1], 'opentopo'), /Não foi possível carregar/);
    await assert.rejects(h.texture.create(h.map, [-10, -1, 1, 1], 'opentopo'), /cinco graus/);
});
