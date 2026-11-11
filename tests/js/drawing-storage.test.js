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
    const recent = [];
    const drawnItems = { getLayer: () => null };
    const coverageGroup = {};
    const context = {
        drawnItems,
        document: { getElementById: () => ({ addEventListener(name, callback) { click = callback; } }) },
        sessionStorage: { getItem: () => '', setItem() {} },
        window: { location: { href: 'https://example.test/' }, PlanMilT: {
            welcome: { record(name) { recent.push(name); return true; } },
            coverageImage: { getGroup: () => coverageGroup },
            geoJsonSerialization: { toFeatureCollection: group => serializer(group, coverageGroup) }
        } },
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
    return { click, alerts, recent, getRequest: () => request, drawnItems };
}

test('save sends the serialized collection and displays actionable server-size errors', async () => {
    const feature = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } };
    const fixture = setup((group, coverageGroup) => ({ type: 'FeatureCollection', features: group === coverageGroup ? [] : [feature] }));
    fixture.click();
    await new Promise(resolve => setImmediate(resolve));
    const request = fixture.getRequest();
    assert.deepEqual(JSON.parse(request.data.leaflet).features, [feature]);
    request.error({ status: 413 }, 'error', 'too large');
    assert.match(fixture.alerts.at(-1)[1], /post_max_size/);
});

test('only successful saves are registered as recent', async () => {
    const fixture = setup(() => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: null }] }));
    fixture.click();
    await new Promise(resolve => setImmediate(resolve));
    const request = fixture.getRequest();
    request.success('Senha incorreta');
    request.error({ status: 500 }, 'error', 'failure');
    assert.deepEqual(fixture.recent, []);
    request.success('Desenho salvo com sucesso!');
    request.success('Desenho atualizado com sucesso!');
    assert.deepEqual(fixture.recent, ['teste', 'teste']);
});

test('save includes raster coverage even when there are no vector drawings', async () => {
    const feature = { type: 'Feature', geometry: null, properties: { coverageImage: {
        image: 'data:image/png;base64,AQ==', mapImage: 'data:image/png;base64,Ag==',
        bounds: [[-22, -52], [-21, -51]], mode: 'radio', resolutionKm: 0.5
    } } };
    const fixture = setup((group, coverageGroup) => ({ type: 'FeatureCollection', features: group === coverageGroup ? [feature] : [] }));
    fixture.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(JSON.parse(fixture.getRequest().data.leaflet).features, [feature]);
    assert.equal(fixture.alerts.length, 1);
});

test('serialization failures are reported without sending a request', async () => {
    const fixture = setup(() => { throw new RangeError('Erro de serialização'); });
    fixture.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.getRequest(), undefined);
    assert.match(fixture.alerts.at(-1)[1], /Não foi possível preparar/);
});
