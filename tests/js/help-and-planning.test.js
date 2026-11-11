const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/help-and-planning.js'), 'utf8');

function setup(ready = Promise.resolve()) {
    const handlers = {};
    const recent = [];
    const shown = [];
    let request;
    let visible = false;
    const context = {
        window: { location: { href: 'https://example.test/' }, PlanMilT: {
            sharedLayersReady: ready,
            welcome: { record(name) { recent.push(name); return true; }, show(automatic) { shown.push(automatic); } },
            geoJsonSerialization: { toFeatureCollection: () => ({ type: 'FeatureCollection', features: [] }) }
        } },
        document: {
            addEventListener(name, callback) { handlers[name] = callback; },
            getElementById(id) { return { addEventListener(name, callback) { handlers[id] = callback; } }; }
        },
        Swal: {
            fire: () => Promise.resolve({ isConfirmed: true, value: { usuario: 'teste', senha: 'senha' } }),
            isVisible: () => visible
        },
        planejamentoLayer: {},
        $: { ajax(options) { request = options; } },
        console: { info() {}, error() {} }
    };
    vm.runInNewContext(source, context);
    return { handlers, recent, shown, getRequest: () => request, setVisible(value) { visible = value; } };
}

test('welcome waits for shared resources and does not replace an active dialog', async () => {
    let finish;
    const ready = new Promise(resolve => { finish = resolve; });
    const fixture = setup(ready);
    const pending = fixture.handlers.DOMContentLoaded();
    assert.deepEqual(fixture.shown, []);
    finish();
    await pending;
    assert.deepEqual(fixture.shown, [true]);
    fixture.setVisible(true);
    await fixture.handlers.DOMContentLoaded();
    assert.deepEqual(fixture.shown, [true]);
    fixture.handlers.helpButton();
    assert.deepEqual(fixture.shown, [true, undefined]);
});

test('successful planning suggestion saves enter recent list; failed ones do not', async () => {
    const fixture = setup();
    fixture.handlers.savePlanningButton();
    await new Promise(resolve => setImmediate(resolve));
    const request = fixture.getRequest();
    request.success('Senha incorreta');
    request.error({ status: 500 }, 'error', 'failure');
    assert.deepEqual(fixture.recent, []);
    request.success('Desenho salvo com sucesso!');
    assert.deepEqual(fixture.recent, ['teste']);
});
