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
        document: { getElementById() { return { addEventListener() {} }; } },
        console: { info() {}, error(...args) { errors.push(args); } },
        window: {
            navigator: { onLine: online },
            PlanMilT: {
                localSessionRestored: restored,
                mapSetup: { attach: () => ({ applyMapDefaults: value => calls.push(['defaults', value]) }) },
                coverageImage: { attach() {} },
                translation: { configure: value => calls.push(['translation', value]) },
                apiClient: { async getJson(endpoint) {
                    calls.push(['request', endpoint]);
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
    assert.deepEqual(calls, []);
});

test('map settings are still loaded online and do not replace a restored session', async () => {
    const online = await startMapSettings({ online: true });
    assert.deepEqual(online.calls, [
        ['request', 'php/endpoints/map-settings.php'],
        ['translation', online.settings.translation],
        ['defaults', online.settings]
    ]);
    const restored = await startMapSettings({ online: true, restored: true });
    assert.deepEqual(restored.calls.map(call => call[0]), ['request', 'translation']);
});

test('map settings request failures are reported while online', async () => {
    const { calls, errors } = await startMapSettings({ online: true, reject: true });
    assert.deepEqual(calls, [['request', 'php/endpoints/map-settings.php']]);
    assert.equal(errors.length, 1);
    assert.match(errors[0][0], /Não foi possível aplicar/);
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
