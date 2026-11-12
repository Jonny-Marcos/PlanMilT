const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/drawing-storage.js'), 'utf8');

function emitter() {
    const listeners = new Map();
    return {
        on(names, callback) {
            names.split(' ').forEach(name => listeners.set(name, [...(listeners.get(name) || []), callback]));
        },
        fire(name) { for (const callback of listeners.get(name) || []) callback(); }
    };
}

function setup() {
    const alerts = [];
    const requests = [];
    const responses = [];
    const recent = [];
    const timers = new Map();
    const storage = new Map();
    const documentEvents = new Map();
    const notices = [];
    const nodes = {
        'swal-input-usuario': { value: '' },
        'swal-input-senha': { value: '' },
        drawingAutoSaveChoice: { checked: false }
    };
    const drawnItems = Object.assign(emitter(), { getLayer: () => null });
    const coverageGroup = emitter();
    const map = emitter();
    let click;
    let nextTimer = 0;
    let enabled = false;
    let confirmEmpty = true;
    let visible = false;
    let cancelCredentials = false;
    let username = 'teste';
    let features = [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }];
    let coverage = [];
    let failSerialization = false;
    let failStorageRead = false;
    let failStorageWrite = false;
    const success = { ok: true, status: 200, text: async () => 'Desenho salvo com sucesso!' };
    const context = {
        URLSearchParams, drawnItems, map,
        document: {
            addEventListener(name, callback) { documentEvents.set(name, callback); },
            getElementById(id) {
                if (id === 'saveDrawings') return { addEventListener(name, callback) { click = callback; } };
                return nodes[id];
            },
            createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
            body: { appendChild(node) { notices.push(node); } }
        },
        sessionStorage: {
            getItem(key) {
                if (failStorageRead) throw new Error('storage unavailable');
                return storage.get(key) || '';
            },
            setItem(key, value) {
                if (failStorageWrite) throw new Error('storage unavailable');
                storage.set(key, value);
            }
        },
        window: { location: { href: 'https://example.test/' }, PlanMilT: {
            welcome: { record(name) { recent.push(name); return true; } },
            coverageImage: { getGroup: () => coverageGroup },
            geoJsonSerialization: { toFeatureCollection(group, precision) {
                if (failSerialization) throw new RangeError('Erro de serialização');
                if (group === drawnItems) assert.equal(precision, false);
                return { type: 'FeatureCollection', features: structuredClone(group === coverageGroup ? coverage : features) };
            } },
            apiClient: { request(url, options) {
                requests.push({ url, options });
                return responses.length ? responses.shift() : Promise.resolve(success);
            } }
        } },
        Swal: {
            async fire(...args) {
                alerts.push(args);
                const options = args[0];
                if (options?.title === 'Insira suas credenciais') {
                    if (cancelCredentials) return { isConfirmed: false };
                    options.didOpen();
                    nodes['swal-input-usuario'].value = username;
                    nodes['swal-input-senha'].value = 'senha';
                    nodes.drawingAutoSaveChoice.checked = enabled;
                    return { isConfirmed: true, value: options.preConfirm() };
                }
                if (options?.title === 'Nenhum desenho encontrado') {
                    return { isConfirmed: typeof confirmEmpty === 'function' ? await confirmEmpty() : confirmEmpty };
                }
                return { isConfirmed: true };
            },
            isVisible: () => visible,
            showValidationMessage(message) { throw new Error(message); }
        },
        setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
        clearInterval(id) { timers.delete(id); },
        console: { info() {}, error() {} }
    };
    vm.runInNewContext(source, context);
    documentEvents.get('DOMContentLoaded')();
    return {
        click: () => click(), alerts, requests, responses, recent, timers, storage, notices, map, drawnItems, coverageGroup, context,
        setEnabled(value) { enabled = value; },
        setFeatures(value) { features = value; },
        setCoverage(value) { coverage = value; },
        setConfirmEmpty(value) { confirmEmpty = value; },
        setVisible(value) { visible = value; },
        setUsername(value) { username = value; },
        cancelCredentials() { cancelCredentials = true; },
        failSerialization() { failSerialization = true; },
        failStorageRead() { failStorageRead = true; },
        failStorageWrite() { failStorageWrite = true; },
        async tick() { for (const timer of [...timers.values()]) await timer.callback(); },
        requestData(index) { return new URLSearchParams(requests[index].options.body); }
    };
}

test('manual save offers automatic saving once per page and preserves the HTTP contract', async () => {
    const h = setup();
    await h.click();
    assert.match(h.alerts[0][0].html, /id="drawingAutoSaveChoice"/);
    assert.equal(h.requests[0].url, '/salvar.php');
    assert.equal(h.requestData(0).get('usuario'), 'teste');
    assert.equal(h.requestData(0).get('senha'), 'senha');
    assert.equal(JSON.parse(h.requestData(0).get('leaflet')).features.length, 1);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.recent, ['teste']);
    await h.click();
    assert.doesNotMatch(h.alerts.filter(args => args[0]?.title === 'Insira suas credenciais')[1][0].html, /drawingAutoSaveChoice/);
    assert.equal(h.timers.size, 0);
});

test('cancelled credentials do not consume the first choice', async () => {
    const h = setup();
    h.cancelCredentials();
    await h.click();
    assert.equal(h.requests.length, 0);
    assert.equal(h.timers.size, 0);
});

test('automatic save checks every 15 seconds and only sends changed drawings or coverages', async () => {
    const h = setup();
    h.setEnabled(true);
    await h.click();
    assert.equal([...h.timers.values()][0].delay, 15000);
    await h.tick();
    assert.equal(h.requests.length, 1);
    h.drawnItems.fire('layeradd');
    await h.tick();
    assert.equal(h.requests.length, 1);
    const feature = { type: 'Feature', properties: { text: 'alterado' }, geometry: { type: 'Point', coordinates: [1, 2] } };
    h.setFeatures([feature]);
    h.map.fire('planmilt:changed');
    await h.tick();
    assert.deepEqual(JSON.parse(h.requestData(1).get('leaflet')).features, [feature]);
    await h.tick();
    assert.equal(h.requests.length, 2);
    h.setCoverage([{ type: 'Feature', geometry: null, properties: { coverageImage: {} } }]);
    h.coverageGroup.fire('layeradd');
    await h.tick();
    assert.equal(JSON.parse(h.requestData(2).get('leaflet')).features.length, 2);
});

test('automatic saving waits for completed editing and never interrupts a dialog', async () => {
    const h = setup();
    h.setEnabled(true);
    await h.click();
    h.setFeatures([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 1] } }]);
    h.map.fire('draw:editstart');
    h.map.fire('draw:edited');
    await h.tick();
    assert.equal(h.requests.length, 1);
    h.map.fire('draw:editstop');
    h.setVisible(true);
    await h.tick();
    assert.equal(h.requests.length, 1);
    h.setVisible(false);
    await h.tick();
    assert.equal(h.requests.length, 2);
});

test('in-flight automatic requests do not overlap and subsequent changes remain pending', async () => {
    const h = setup();
    h.setEnabled(true);
    await h.click();
    let finish;
    h.responses.push(new Promise(resolve => { finish = resolve; }));
    h.setFeatures([{ type: 'Feature', properties: { name: 'primeiro' }, geometry: null }]);
    h.drawnItems.fire('layeradd');
    const sending = h.tick();
    await Promise.resolve();
    h.setFeatures([{ type: 'Feature', properties: { name: 'segundo' }, geometry: null }]);
    h.map.fire('planmilt:changed');
    await h.tick();
    assert.equal(h.requests.length, 2);
    finish({ ok: true, text: async () => 'Desenho atualizado com sucesso!' });
    await sending;
    await h.tick();
    assert.equal(JSON.parse(h.requestData(2).get('leaflet')).features[0].properties.name, 'segundo');
});

test('a manual save waits for an in-flight automatic save before switching targets', async () => {
    const h = setup();
    h.setEnabled(true);
    await h.click();
    let finish;
    h.responses.push(new Promise(resolve => { finish = resolve; }));
    h.setFeatures([{ type: 'Feature', properties: { name: 'primeiro' }, geometry: null }]);
    h.drawnItems.fire('layeradd');
    const automatic = h.tick();
    await Promise.resolve();
    h.setUsername('outro');
    h.setFeatures([{ type: 'Feature', properties: { name: 'novo' }, geometry: null }]);
    h.map.fire('planmilt:changed');
    const manual = h.click();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(h.requests.length, 2);
    finish({ ok: true, text: async () => 'Desenho atualizado com sucesso!' });
    await automatic;
    await manual;
    assert.equal(h.requestData(1).get('usuario'), 'teste');
    assert.equal(h.requestData(2).get('usuario'), 'outro');
    assert.equal(JSON.parse(h.requestData(2).get('leaflet')).features[0].properties.name, 'novo');
});

for (const confirmed of [false, true]) {
    test(`empty automatic save ${confirmed ? 'requires and honors confirmation' : 'pauses when confirmation is declined'}`, async () => {
        const h = setup();
        h.setEnabled(true);
        await h.click();
        h.setFeatures([]);
        h.setConfirmEmpty(confirmed);
        h.drawnItems.fire('layerremove');
        await h.tick();
        assert.ok(h.alerts.some(args => args[0]?.title === 'Nenhum desenho encontrado'));
        assert.equal(h.requests.length, confirmed ? 2 : 1);
        assert.equal(h.timers.size, confirmed ? 1 : 0);
        if (confirmed) assert.equal(JSON.parse(h.requestData(1).get('leaflet')).features.length, 0);
    });
}

test('a pending empty confirmation cannot save after loading another planning', async () => {
    const h = setup();
    h.setEnabled(true);
    await h.click();
    let answer;
    h.setConfirmEmpty(() => new Promise(resolve => { answer = resolve; }));
    h.setFeatures([]);
    h.drawnItems.fire('layerremove');
    const pending = h.tick();
    await Promise.resolve();
    h.context.window.PlanMilT.drawingAutoSave.pauseForLoad();
    answer(true);
    await pending;
    assert.equal(h.requests.length, 1);
    assert.equal(h.timers.size, 0);
});

test('loading a different planning pauses until the next successful manual save', async () => {
    const h = setup();
    h.setEnabled(true);
    await h.click();
    h.context.window.PlanMilT.drawingAutoSave.pauseForLoad();
    h.setFeatures([{ type: 'Feature', properties: { name: 'outro' }, geometry: null }]);
    h.drawnItems.fire('layeradd');
    await h.tick();
    assert.equal(h.requests.length, 1);
    assert.match(h.notices[0].textContent, /pausado/);
    await h.click();
    assert.equal(h.timers.size, 1);
    assert.doesNotMatch(h.alerts.filter(args => args[0]?.title === 'Insira suas credenciais')[1][0].html, /drawingAutoSaveChoice/);
});

test('manual and automatic errors are surfaced and do not leave automatic saving active', async () => {
    const h = setup();
    h.setEnabled(true);
    h.responses.push(Promise.resolve({ ok: false, status: 413 }));
    await h.click();
    assert.match(h.alerts.at(-1)[1], /post_max_size/);
    assert.deepEqual(h.recent, []);
    assert.equal(h.timers.size, 0);
    await h.click();
    h.setFeatures([{ type: 'Feature', properties: { text: 'novo' }, geometry: null }]);
    h.map.fire('planmilt:changed');
    h.responses.push(Promise.resolve({ ok: true, text: async () => 'Senha incorreta.' }));
    await h.tick();
    assert.match(h.notices[0].textContent, /Senha incorreta/);
    assert.equal(h.timers.size, 0);
});

test('serialization errors do not send a request', async () => {
    const h = setup();
    h.failSerialization();
    await h.click();
    assert.equal(h.requests.length, 0);
    assert.match(h.alerts.at(-1)[1], /Não foi possível preparar/);
});

test('session storage failures are reported without sending a drawing', async () => {
    for (const fail of ['failStorageRead', 'failStorageWrite']) {
        const h = setup();
        h[fail]();
        await h.click();
        assert.equal(h.requests.length, 0);
        assert.match(h.alerts.at(-1)[1], /armazenamento da sessão/);
    }
});

test('network and response read failures pause automatic saving with a safe message', async () => {
    for (const response of [
        () => Promise.reject(new Error('private network detail')),
        () => Promise.resolve({ ok: true, text: () => Promise.reject(new Error('private response detail')) })
    ]) {
        const h = setup();
        h.setEnabled(true);
        await h.click();
        h.setFeatures([{ type: 'Feature', properties: { text: 'novo' }, geometry: null }]);
        h.map.fire('planmilt:changed');
        h.responses.push(response());
        await h.tick();
        assert.equal(h.timers.size, 0);
        assert.match(h.notices[0].textContent, /Salvamento automático pausado/);
        assert.doesNotMatch(h.notices[0].textContent, /private/);
    }
});
