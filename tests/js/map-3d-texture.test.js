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
    const window = { PlanMilT: { apiClient: { async request(endpoint, options) {
        assert.equal(endpoint, 'php/endpoints/map-image-proxy.php');
        urls.push(JSON.parse(options.body).url);
        return { ok: !fail, status: 502, async blob() { return {}; } };
    } } } };
    vm.runInNewContext(source, {
        window, document: { createElement: () => canvas }, Image, URLSearchParams,
        URL: { createObjectURL: () => 'blob:tile', revokeObjectURL: url => released.push(url) },
        console: { error() {} }
    });
    return { texture: window.PlanMilT.map3dTexture, map, canvas, urls, draws, released };
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
