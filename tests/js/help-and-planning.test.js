const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/help-and-planning.js'), 'utf8');
const welcomeSource = fs.readFileSync(path.join(__dirname, '../../js/features/welcome.js'), 'utf8');

function setup(ready = Promise.resolve()) {
    const handlers = {};
    const recent = [];
    const shown = [];
    const alerts = [];
    const elements = {};
    let request;
    let visible = false;
    const context = {
        window: { location: { href: 'https://example.test/' }, PlanMilT: {
            sharedLayersReady: ready,
            welcome: {
                record(name) { recent.push(name); return true; },
                show(automatic) { shown.push(automatic); },
                bindPreference(checkbox, status) { checkbox.boundStatus = status; }
            },
            geoJsonSerialization: { toFeatureCollection: () => ({ type: 'FeatureCollection', features: [] }) }
        } },
        document: {
            addEventListener(name, callback) { handlers[name] = callback; },
            getElementById(id) {
                if (!elements[id]) elements[id] = { addEventListener(name, callback) { handlers[id] = callback; } };
                return elements[id];
            }
        },
        Swal: {
            fire(config) {
                alerts.push(config);
                if (config.didOpen) config.didOpen();
                return Promise.resolve({ isConfirmed: true, value: { usuario: 'teste', senha: 'senha' } });
            },
            close() {},
            isVisible: () => visible
        },
        planejamentoLayer: {},
        $: { ajax(options) { request = options; } },
        console: { info() {}, error() {} }
    };
    vm.runInNewContext(source, context);
    return { handlers, recent, shown, alerts, elements, getRequest: () => request, setVisible(value) { visible = value; } };
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
    assert.equal(fixture.alerts.at(-1).title, 'Ajuda do PlanMilT');
    assert.deepEqual(fixture.shown, [true]);
    assert.equal(fixture.elements.helpWelcomeShow.boundStatus, fixture.elements.helpStorageError);
    fixture.handlers.helpOpenWelcome();
    assert.deepEqual(fixture.shown, [true, undefined]);
});

test('help groups current tools in accessible expandable sections', () => {
    const fixture = setup();
    fixture.handlers.helpButton();
    const html = fixture.alerts.at(-1).html;
    for (const term of ['<details', '<summary>', 'Dados do ponto', 'Simbologia militar',
        'Recentes', 'KMZ', 'Criar tema', 'Predição de Enlace', '32, 72 ou 180',
        'Penetração/Difração', 'Planejamento automático', 'Aparecer mensagem de boas-vindas']) {
        assert.ok(html.includes(term), term);
    }
});

test('help and welcome share the existing preference and preserve recent entries', () => {
    const handlers = {};
    const elements = {};
    const values = new Map();
    const key = 'planmilt.welcome.v1:/plan/';
    values.set(key, JSON.stringify({ hidden: true, recent: [{ name: 'recente', date: '2026-01-01T00:00:00.000Z' }] }));
    const document = {
        addEventListener(name, callback) { handlers[name] = callback; },
        getElementById(id) {
            if (!elements[id]) elements[id] = {
                children: [], textContent: '',
                addEventListener(name, callback) { this[name] = callback; },
                appendChild(child) { this.children.push(child); }
            };
            return elements[id];
        },
        createElement() { return { addEventListener() {} }; }
    };
    const window = { location: { href: 'https://example.test/plan/' }, PlanMilT: {} };
    const Swal = {
        DismissReason: { cancel: 'cancel' },
        fire(config) { config.didOpen(); return Promise.resolve({}); },
        close() {}, isVisible: () => false
    };
    const context = {
        window, document, Swal, URL,
        localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
        console
    };
    vm.runInNewContext(welcomeSource, context);
    vm.runInNewContext(source, context);
    document.getElementById('helpButton').click();
    const helpCheckbox = document.getElementById('helpWelcomeShow');
    assert.equal(helpCheckbox.checked, false);
    helpCheckbox.checked = true;
    helpCheckbox.change();
    assert.equal(JSON.parse(values.get(key)).hidden, false);
    document.getElementById('helpOpenWelcome').click();
    const welcomeCheckbox = document.getElementById('welcomeShow');
    assert.equal(welcomeCheckbox.checked, true);
    welcomeCheckbox.checked = false;
    welcomeCheckbox.change();
    document.getElementById('helpButton').click();
    assert.equal(helpCheckbox.checked, false);
    assert.equal(JSON.parse(values.get(key)).recent[0].name, 'recente');
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
