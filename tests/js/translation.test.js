const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/translation.js'), 'utf8');
const elevationToolsSource = fs.readFileSync(path.join(__dirname, '../../js/features/elevation-tools.js'), 'utf8');

async function startMapSettings({ online, restored = false, reject = false }) {
    const calls = [];
    const errors = [];
    const settings = { translation: { enabled: false, languages: [] } };
    const context = {
        map: {}, L: { DomEvent: { on() {} } }, drawnItems: { on() {} },
        document: { addEventListener() {}, getElementById() { return { addEventListener() {} }; } },
        console: { info() {}, error(...args) { errors.push(args); } },
        window: {
            navigator: { onLine: online },
            addEventListener() {},
            PlanMilT: {
                localSessionRestored: restored,
                mapSetup: { attach: () => ({ applyMapDefaults: value => calls.push(['defaults', value]) }) },
                coverageImage: { attach() {} },
                translation: { configure: value => calls.push(['translation', JSON.parse(JSON.stringify(value))]) },
                apiClient: { async getJson(endpoint, options) {
                    calls.push(['request', endpoint, options.cache]);
                    if (reject) throw new Error('Falha de rede');
                    return settings;
                } }
            }
        }
    };
    vm.runInNewContext(elevationToolsSource, context);
    await new Promise(resolve => setImmediate(resolve));
    return { calls, settings, errors };
}

test('map settings are not requested when starting offline', async () => {
    const { calls } = await startMapSettings({ online: false });
    assert.deepEqual(calls, [['translation', { enabled: false, languages: [] }]]);
});

test('map settings are still loaded online and do not replace a restored session', async () => {
    const online = await startMapSettings({ online: true });
    assert.deepEqual(online.calls, [
        ['translation', { enabled: false, languages: [] }],
        ['request', 'php/endpoints/map-settings.php', 'no-store'],
        ['translation', online.settings.translation],
        ['defaults', online.settings]
    ]);
    const restored = await startMapSettings({ online: true, restored: true });
    assert.deepEqual(restored.calls.map(call => call[0]), ['translation', 'request', 'translation']);
});

test('map settings request failures are reported while online', async () => {
    const { calls, errors } = await startMapSettings({ online: true, reject: true });
    assert.deepEqual(calls, [
        ['translation', { enabled: false, languages: [] }],
        ['request', 'php/endpoints/map-settings.php', 'no-store']
    ]);
    assert.equal(errors.length, 1);
    assert.match(errors[0][0], /Não foi possível aplicar/);
});

test('returning to the page refreshes disabled settings and ignores stale responses', async () => {
    const pending = [];
    const handlers = {};
    const elements = new Map([
        ['google_translate_element', { dataset: {}, style: {}, hidden: true }],
        ['image_editor_google_translate_element', { dataset: {}, style: {}, hidden: true }]
    ]);
    const scripts = [];
    const translations = [];
    const defaults = [];
    const errors = [];
    const document = {
        visibilityState: 'visible',
        addEventListener(name, callback) { handlers[name] = callback; },
        getElementById(id) {
            return elements.get(id) || (id === 'close-btn' ? { addEventListener() {} } : null);
        },
        createElement() { return {}; },
        head: { appendChild(script) { scripts.push(script); } }
    };
    const window = {
        navigator: { onLine: true },
        addEventListener(name, callback) { handlers[name] = callback; },
        google: { translate: { TranslateElement: function (options, id) { translations.push(id); } } },
        PlanMilT: {
            mapSetup: { attach: () => ({ applyMapDefaults: value => defaults.push(value) }) },
            coverageImage: { attach() {} },
            apiClient: { getJson(url, options) {
                assert.equal(url, 'php/endpoints/map-settings.php');
                assert.equal(options.cache, 'no-store');
                return new Promise((resolve, reject) => pending.push({ resolve, reject }));
            } }
        }
    };
    const context = {
        window, document, map: {}, L: { DomEvent: { on() {} } }, drawnItems: { on() {} },
        console: { info() {}, error(...args) { errors.push(args); } }
    };
    vm.runInNewContext(source, context);
    vm.runInNewContext(elevationToolsSource, context);
    pending[0].resolve({ translation: { enabled: true, languages: [] } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements.get('google_translate_element').hidden, false);
    assert.deepEqual(translations, ['google_translate_element', 'image_editor_google_translate_element']);
    assert.equal(defaults.length, 1);
    document.visibilityState = 'hidden';
    handlers.visibilitychange();
    assert.equal(elements.get('google_translate_element').hidden, true);
    assert.equal(elements.get('image_editor_google_translate_element').hidden, true);
    document.visibilityState = 'visible';
    handlers.visibilitychange();
    handlers.pageshow({ persisted: true });
    pending[2].resolve({ translation: { enabled: false, languages: [] } });
    await new Promise(resolve => setImmediate(resolve));
    pending[1].resolve({ translation: { enabled: true, languages: [] } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements.get('google_translate_element').hidden, true);
    assert.equal(window.PlanMilT.translation.isReady(), false);
    assert.equal(defaults.length, 1);
    assert.equal(scripts.length, 0);

    handlers.online();
    pending[3].reject(new Error('rede indisponível'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements.get('google_translate_element').hidden, true);
    assert.equal(errors.length, 1);
    handlers.online();
    pending[4].resolve({ translation: { enabled: true, languages: [] } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements.get('google_translate_element').hidden, false);
    assert.equal(translations.length, 2);
    assert.equal(defaults.length, 1);
});

test('offline startup revalidates translation on reconnect without applying map defaults', async () => {
    const handlers = {};
    const configurations = [];
    const applied = [];
    const requests = [];
    const window = {
        navigator: { onLine: false },
        addEventListener(name, callback) { handlers[name] = callback; },
        PlanMilT: {
            mapSetup: { attach: () => ({ applyMapDefaults: settings => applied.push(settings) }) },
            coverageImage: { attach() {} },
            translation: { configure: settings => configurations.push(settings.enabled) },
            apiClient: { async getJson(endpoint, options) {
                requests.push([endpoint, options.cache]);
                return { translation: { enabled: false, languages: [] } };
            } }
        }
    };
    const context = {
        window, map: {}, L: { DomEvent: { on() {} } }, drawnItems: { on() {} },
        document: { addEventListener() {}, getElementById() { return { addEventListener() {} }; } },
        console: { info() {}, error() { throw new Error('unexpected error'); } }
    };
    vm.runInNewContext(elevationToolsSource, context);
    assert.deepEqual(requests, []);
    window.navigator.onLine = true;
    handlers.online();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests, [['php/endpoints/map-settings.php', 'no-store']]);
    assert.deepEqual(configurations, [false, false, false]);
    assert.deepEqual(applied, []);
});

test('settings gate the Google script in the page', () => {
    const root = path.join(__dirname, '../..');
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const setup = fs.readFileSync(path.join(root, 'js/features/elevation-tools.js'), 'utf8');
    assert.doesNotMatch(index, /src="(?:https?:)?\/\/translate\.google\.com/);
    assert.ok(index.indexOf('js/features/translation.js') < index.indexOf('js/features/main.js'));
    assert.match(setup, /translation\.configure\(settings\.translation\)/);
});

function harness() {
    const scripts = [];
    const elements = new Map();
    const calls = [];
    const errors = [];
    const window = {};
    const document = {
        head: { appendChild: element => scripts.push(element) },
        createElement: () => ({}),
        getElementById: id => elements.get(id) || null
    };
    vm.runInNewContext(source, { window, document, console: { error: message => errors.push(message) } });
    const service = window.PlanMilT.translation;
    return { window, service, scripts, elements, calls, errors };
}

test('disabled translation does not contact Google or expose controls', () => {
    const { window, service, scripts, elements } = harness();
    const control = { dataset: {}, style: { display: 'block' } };
    const editor = { dataset: {}, style: { display: 'block' } };
    elements.set('google_translate_element', control);
    elements.set('image_editor_google_translate_element', editor);
    service.configure({ enabled: false, languages: [] });
    window.googleTranslateElementInit();
    assert.equal(scripts.length, 0);
    assert.equal(control.hidden, true);
    assert.equal(editor.hidden, true);
    assert.equal(service.isReady(), false);
});

test('enabled translation applies configured languages and initializes late controls once', () => {
    const { window, service, scripts, elements, calls } = harness();
    const main = { dataset: {}, style: {} };
    elements.set('google_translate_element', main);
    elements.set('toggleControlsBtn', { getAttribute: () => 'true' });
    service.configure({ enabled: true, languages: ['en', 'es'] });
    assert.equal(scripts.length, 1);
    assert.match(scripts[0].src, /^https:\/\/translate\.google\.com\//);
    window.google = { translate: { TranslateElement: function (options, id) { calls.push({ options, id }); } } };
    window.googleTranslateElementInit();
    assert.equal(main.style.display, 'none');
    assert.equal(main.hidden, false);
    const editor = { dataset: {}, style: {} };
    elements.set('image_editor_google_translate_element', editor);
    window.googleTranslateElementInit();
    assert.deepEqual(calls.map(call => call.id), ['google_translate_element', 'image_editor_google_translate_element']);
    assert.equal(calls[0].options.pageLanguage, 'pt-br');
    assert.equal(calls[0].options.includedLanguages, 'en,es');
    assert.equal(editor.style.display, 'block');
    assert.equal(editor.hidden, false);
    assert.equal(service.isReady(), true);
});

test('translation controls remain hidden even when another feature sets inline display', () => {
    const root = path.join(__dirname, '../..');
    const css = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
    const main = fs.readFileSync(path.join(root, 'js/features/main.js'), 'utf8');
    const editor = fs.readFileSync(path.join(root, 'js/features/image-editor.js'), 'utf8');
    assert.match(css, /\.google-translate-control\[hidden\]\s*\{\s*display:\s*none\s*!important/);
    assert.match(main, /id = 'google_translate_element';[^\n]*\n\s*div\.hidden = true/);
    assert.match(editor, /id = 'image_editor_google_translate_element';\s*element\.hidden = true/);
});

test('all languages are available by default and load errors are reported', () => {
    const { window, service, scripts, elements, calls, errors } = harness();
    elements.set('google_translate_element', { dataset: {}, style: {} });
    service.configure({ enabled: true, languages: [] });
    scripts[0].onerror();
    assert.equal(errors.length, 1);
    window.google = { translate: { TranslateElement: function (options) { calls.push(options); } } };
    window.googleTranslateElementInit();
    assert.equal(calls[0].includedLanguages, undefined);
});

test('late Google callback cannot show disabled controls and reactivation avoids duplicate scripts', () => {
    const { window, service, scripts, elements, calls } = harness();
    const control = { dataset: {}, style: {}, hidden: true };
    elements.set('google_translate_element', control);
    service.configure({ enabled: true, languages: ['en'] });
    service.configure({ enabled: true, languages: ['en'] });
    assert.equal(scripts.length, 1);
    service.configure({ enabled: false, languages: [] });
    window.google = { translate: { TranslateElement: function (options, id) { calls.push(id); } } };
    window.googleTranslateElementInit();
    assert.equal(control.hidden, true);
    assert.deepEqual(calls, []);
    service.configure({ enabled: true, languages: ['en'] });
    assert.equal(control.hidden, false);
    assert.deepEqual(calls, ['google_translate_element']);
    assert.equal(scripts.length, 1);
});

test('revalidation updates allowed languages and retries a failed script load', () => {
    const { window, service, scripts, elements, calls } = harness();
    const control = { dataset: {}, style: {}, replaceChildren() { this.cleared = true; } };
    elements.set('google_translate_element', control);
    service.configure({ enabled: true, languages: ['en'] });
    scripts[0].onerror();
    service.configure({ enabled: true, languages: ['en'] });
    assert.equal(scripts.length, 2);
    window.google = { translate: { TranslateElement: function (options) { calls.push(options.includedLanguages); } } };
    window.googleTranslateElementInit();
    service.configure({ enabled: false, languages: [] });
    service.configure({ enabled: true, languages: ['es'] });
    assert.deepEqual(calls, ['en', 'es']);
    assert.equal(control.cleared, true);
    assert.equal(scripts.length, 2);
});
