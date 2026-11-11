const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/drawing-storage.js'), 'utf8');

function setup(serializer) {
    let click;
    let request;
    const alerts = [];
    const drawnItems = { getLayer: () => null };
    const context = {
        drawnItems,
        document: { getElementById: () => ({ addEventListener(name, callback) { click = callback; } }) },
        sessionStorage: { getItem: () => '', setItem() {} },
        window: { location: { href: 'https://example.test/' }, PlanMilT: { geoJsonSerialization: { toFeatureCollection: serializer } } },
        Swal: {
            fire(...args) {
                alerts.push(args);
                return Promise.resolve({ isConfirmed: true, value: { usuario: 'teste', senha: 'senha' } });
            }
        },
        $: { ajax(options) { request = options; } },
        console: { info() {}, error() {} }
    };
    vm.runInNewContext(source, context);
    return { click, alerts, getRequest: () => request, drawnItems };
}

test('save sends the serialized collection and displays actionable server-size errors', async () => {
    const feature = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } };
    const fixture = setup(() => ({ type: 'FeatureCollection', features: [feature] }));
    fixture.click();
    await new Promise(resolve => setImmediate(resolve));
    const request = fixture.getRequest();
    assert.deepEqual(JSON.parse(request.data.leaflet).features, [feature]);
    request.error({ status: 413 }, 'error', 'too large');
    assert.match(fixture.alerts.at(-1)[1], /post_max_size/);
});

test('serialization failures are reported without sending a request', async () => {
    const fixture = setup(() => { throw new RangeError('Erro de serialização'); });
    fixture.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.getRequest(), undefined);
    assert.match(fixture.alerts.at(-1)[1], /Não foi possível preparar/);
});
