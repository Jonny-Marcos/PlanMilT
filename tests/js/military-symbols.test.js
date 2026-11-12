const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function setup() {
    const values = new Map();
    const elements = {};
    let active;
    let failStorage = false;
    class Element {
        constructor(id = '') { this.options = []; this.children = []; this.listeners = {}; this.id = id; this.value = ''; this.textContent = ''; }
        get value() { return this._value || ''; }
        set value(value) {
            this._value = this.id === 'symbolEntity' && !this.options.some(option => option.value === value)
                ? '' : value;
        }
        appendChild(option) { this.options.push(option); this.children.push(option); if (this.options.length === 1) this.value = option.value; }
        replaceChildren() { this.options = []; this.children = []; this.value = ''; this.textContent = ''; }
        addEventListener(name, callback) { this.listeners[name] = callback; }
        dispatch(name) { this.listeners[name]({ target: this }); }
        removeAttribute(name) { delete this[name]; }
        setAttribute(name, value) { this[name] = value; }
    }
    const document = {
        getElementById(id) { return elements[id] ||= new Element(id); },
        createElement() { return new Element(); }
    };
    const window = {
        location: { href: 'https://example.test/plan/' }, navigator: { userAgent: 'node' },
        addEventListener() {}, removeEventListener() {}
    };
    window.window = window;
    const Swal = {
        fire(options) {
            if (typeof options === 'string') { active.warning = options; return Promise.resolve(); }
            active = options; options.didOpen(); return new Promise(resolve => { active.finish = resolve; });
        },
        showValidationMessage(message) { active.validation = message; }
    };
    const localStorage = {
        getItem(key) { if (failStorage) throw new Error('bloqueado'); return values.get(key) || null; },
        setItem(key, value) { if (failStorage) throw new Error('bloqueado'); values.set(key, value); }
    };
    const context = vm.createContext({ window, document, Swal, localStorage, URL, setTimeout, clearTimeout,
        TextEncoder, TextDecoder, console: { error() {}, info() {}, warn() {} } });
    for (const file of ['js/library/simbologia/chunk-vendors.4e5d8119.js', 'js/library/simbologia/planmilt-generator.js',
        'js/features/brazilian-symbol-catalog.js', 'js/features/military-symbols.js']) {
        vm.runInContext(read(file), context);
    }
    return { symbols: window.PlanMilT.militarySymbols, generator: window.PlanMilTBrazilian,
        catalog: window.PlanMilT.brazilianSymbolCatalog, elements, values, active: () => active,
        failStorage() { failStorage = true; } };
}

test('generator adapter is derived from the exact supplied portal bundle', () => {
    const source = read('js/library/simbologia/app.820fcaaf.js');
    const marker = 'ha={COUNTRY_CODES:Oe,SYMBOL_SET_CODES:fe},ga=';
    assert.equal(source.split(marker).length, 2);
    const expected = '/* Adaptado de app.820fcaaf.js; consulte LICENCE.txt. */\n' +
        source.replace(marker, 'ha={COUNTRY_CODES:Oe,SYMBOL_SET_CODES:fe};window.PlanMilTBrazilian={ms:Ba,extensions:xa};return;var ga=');
    assert.equal(read('js/library/simbologia/planmilt-generator.js'), expected);
});

test('all Brazilian catalogue entries render offline with the supplied generator', () => {
    const { symbols, catalog } = setup();
    let count = 0;
    for (const category of Object.values(catalog)) {
        for (const entry of [...category.icons, ...category.examples]) {
            const result = symbols.render({ sidc: entry.sidc, options: entry.options || {} });
            assert.match(result.iconUrl, /^data:image\/svg\+xml/);
            assert.ok(result.iconSize[0] > 0 && result.iconSize[1] > 0, entry.name);
            assert.equal(result.config.sidc, entry.sidc);
            count++;
        }
    }
    assert.equal(count, 1332);
    assert.throws(() => symbols.render({ sidc: '123', options: {} }), /SIDC/);
    assert.throws(() => symbols.render({ sidc: '10031000999999999999', options: {} }), /não reconhecida/);
    assert.throws(() => symbols.render({ sidc: '100310000012110000000001111111', options: {} }), /extensão brasileira/);
    assert.throws(() => symbols.render({ sidc: '100310000012110000990760000031', options: {} }), /Modificador brasileiro/);
    assert.throws(() => symbols.render({ sidc: '100310000012110000000760524288', options: {} }), /Extensão brasileira/);
});

test('category and doctrine example selection load their complete SIDC and text', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const e = fixture.elements;
    e.symbolSet.value = '15';
    e.symbolSet.dispatch('change');
    assert.equal(fixture.active().preConfirm().config.sidc.slice(4, 6), '15');
    e.symbolSet.value = '10';
    e.symbolSet.dispatch('change');
    e.symbolCatalog.value = 'examples';
    e.symbolCatalog.dispatch('change');
    const index = fixture.catalog['10'].examples.findIndex(entry => entry.options.uniqueDesignation);
    const example = fixture.catalog['10'].examples[index];
    e.symbolEntity.value = String(index);
    e.symbolEntity.dispatch('change');
    assert.equal(e['symbol-uniqueDesignation'].value, example.options.uniqueDesignation);
    assert.equal(fixture.active().preConfirm().config.sidc, example.sidc);
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('Brazilian entity extensions preserve distinct SIDCs and generated graphics', () => {
    const { symbols, generator } = setup();
    const special = '100310000012189900000760000000';
    const pathfinder = '100310000012189900000760016384';
    const a = symbols.render({ sidc: special, options: {} });
    const b = symbols.render({ sidc: pathfinder, options: {} });
    assert.notEqual(a.iconUrl, b.iconUrl);
    assert.equal(a.iconUrl, new generator.ms.Symbol(special, { size: 35 }).toDataURL());
    assert.equal(b.config.sidc, pathfinder);
});

test('editor puts the preview above the controls and adapts its layout to the viewport', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const html = fixture.active().html;
    assert.equal(fixture.active().title, 'Criar ícone');
    assert.match(html, /Prévia do ícone/);
    assert.doesNotMatch(html, /calunga/i);
    assert.ok(html.indexOf('id="symbolPreview"') < html.indexOf('id="symbolSet"'));
    assert.ok(html.indexOf('id="symbolError"') < html.indexOf('id="symbolSet"'));
    assert.match(html, /width:calc\(100vw - 24px\)!important/);
    assert.match(html, /max-height:calc\(100dvh - 24px\);overflow-y:auto/);
    assert.match(html, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
    assert.match(html, /@media\(max-width:700px\).*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(html, /@media\(max-width:400px\).*grid-template-columns:1fr/);
    assert.match(fixture.elements.symbolPreview.src, /^data:image\/svg\+xml/);
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('text amplifiers use the portal positions and expand the icon bounds', () => {
    const { symbols } = setup();
    const sidc = '10031000001211000000';
    const options = {
        uniqueDesignation: 'DESIG', higherFormation: 'SUBOR', staffComments: 'INFOR',
        dtg: 'GDH42', hostile: 'CRED', location: 'LOCAL', altitudeDepth: 'ALTIT', speed: 'VELOC'
    };
    const plain = symbols.render({ sidc, options: {} });
    const rendered = symbols.render({ sidc, options });
    const svg = decodeURIComponent(rendered.iconUrl);
    for (const [text, x, y, alignment] of [
        ['GDH42', 5, 40, 'end'], ['ALTIT/LOCAL', 5, 80, 'end'], ['DESIG', 5, 160, 'end'],
        ['VELOC', 5, 200, 'end'], ['INFOR', 195, 80, 'start'], ['SUBOR', 195, 160, 'start'],
        ['CRED', 195, 200, 'start']
    ]) {
        assert.match(svg, new RegExp(`<text x="${x}" y="${y}" text-anchor="${alignment}"[^>]*>${text}</text>`));
    }
    assert.ok(rendered.iconSize[0] > plain.iconSize[0]);
    assert.ok(rendered.iconAnchor[0] > plain.iconAnchor[0]);
    assert.equal(rendered.config.options.hostile, 'CRED');
    assert.doesNotMatch(decodeURIComponent(plain.iconUrl), /DESIG|SUBOR|INFOR|CRED/);
});

test('amplifiers update the preview and survive saving, loading and editing', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const e = fixture.elements;
    const options = {
        uniqueDesignation: '1 Btl', higherFormation: 'Brigada', staffComments: 'Informações',
        dtg: '121200Z', hostile: 'A1', location: 'Ponte', altitudeDepth: '300 m', speed: '20 km/h'
    };
    assert.match(fixture.active().html, /<legend>Amplificadores textuais<\/legend>/);
    for (const [field, value] of Object.entries(options)) {
        assert.ok(fixture.active().html.includes(`id="symbol-${field}"`), field);
        e[`symbol-${field}`].value = value;
        e[`symbol-${field}`].dispatch('input');
    }
    let svg = decodeURIComponent(e.symbolPreview.src);
    for (const value of Object.values(options)) assert.ok(svg.includes(value), value);
    const result = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: result });
    const selected = await pending;
    const saved = JSON.parse(fixture.values.get('planmilt.military-symbols.recent.v1:/plan/'))[0];
    for (const [field, value] of Object.entries(options)) assert.equal(saved.config.options[field], value);
    const layer = { feature: { properties: { militarySymbol: selected, iconUrl: selected.iconUrl } }, setIcon(icon) { this.icon = icon; } };
    const editing = fixture.symbols.edit(layer, { icon: data => ({ options: data }) });
    for (const [field, value] of Object.entries(options)) assert.equal(e[`symbol-${field}`].value, value);
    e['symbol-hostile'].value = 'B2';
    e['symbol-hostile'].dispatch('input');
    const changed = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: changed });
    await editing;
    assert.equal(layer.feature.properties.militarySymbol.config.options.hostile, 'B2');
    svg = decodeURIComponent(layer.feature.properties.iconUrl);
    assert.ok(svg.includes('B2'));
    assert.ok(svg.includes('Informações'));
});

test('editor searches Brazilian names and preserves extension bits on changes', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const e = fixture.elements;
    e.symbolSearch.value = 'precursores paraquedistas';
    e.symbolSearch.dispatch('input');
    const choice = e.symbolEntity.options.find(option => /Precursores Paraquedistas/.test(option.textContent));
    assert.ok(choice);
    e.symbolEntity.value = choice.value;
    e.symbolEntity.dispatch('change');
    assert.equal(fixture.active().preConfirm().config.sidc, '100310000012189900000760016384');
    e.symbolModifier2.value = 'ext:3';
    e.symbolModifier2.dispatch('change');
    assert.equal(fixture.active().preConfirm().config.sidc, '100310000012189900990760016387');
    e.symbolTransversal.value = '1';
    e.symbolTransversal.dispatch('change');
    assert.equal(fixture.active().preConfirm().config.sidc, '100310000012189900990760017411');
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('type search displays sorted matches without changing the icon until a result is selected', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const e = fixture.elements;
    const before = fixture.active().preConfirm().config.sidc;
    e.symbolSearch.value = '  ARTILHARIA  ';
    e.symbolSearch.dispatch('input');
    assert.equal(e.symbolEntity.options[0].textContent, 'Selecione um tipo');
    assert.equal(e.symbolEntity.value, '');
    const results = e.symbolEntity.options.slice(1);
    assert.ok(results.length > 1);
    assert.ok(results.every(option => /artilharia/i.test(option.textContent)));
    assert.deepEqual(results.map(option => option.textContent), results.map(option => option.textContent)
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })));
    assert.equal(fixture.active().preConfirm(), false);
    assert.match(fixture.active().validation, /Selecione um tipo/);
    e.symbolEntity.value = results[0].value;
    e.symbolEntity.dispatch('change');
    const selected = fixture.active().preConfirm().config.sidc;
    assert.notEqual(selected, before);
    assert.equal(e.symbolEntity.value, results[0].value);
    e.symbolSearch.value = 'sem resultado 987654321';
    e.symbolSearch.dispatch('input');
    assert.equal(e.symbolEntity.options[0].textContent, 'Nenhum tipo encontrado');
    assert.equal(fixture.active().preConfirm(), false);
    e.symbolSearch.value = '';
    e.symbolSearch.dispatch('input');
    assert.equal(fixture.active().preConfirm().config.sidc, selected);
    assert.equal(e.symbolEntity.value, results[0].value);
    e.symbolSearch.value = 'aviacao';
    e.symbolSearch.dispatch('input');
    assert.ok(e.symbolEntity.options.some(option => /Aviação/.test(option.textContent)));
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('both catalog types are alphabetically sorted and retain their original selection values', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const e = fixture.elements;
    for (const kind of ['icons', 'examples']) {
        e.symbolCatalog.value = kind;
        e.symbolCatalog.dispatch('change');
        const options = e.symbolEntity.options.filter(option => option.value !== '');
        const names = options.map(option => option.textContent);
        assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })));
        for (const option of options) {
            assert.equal(fixture.catalog['10'][kind][Number(option.value)].name, option.textContent);
        }
    }
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('editor stores confirmed symbols, restores them from the tray, and supports deletion', async () => {
    const fixture = setup();
    let pending = fixture.symbols.open();
    const e = fixture.elements;
    e['symbol-uniqueDesignation'].value = '2 Btl';
    e['symbol-uniqueDesignation'].dispatch('input');
    let result = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: result });
    await pending;
    const key = 'planmilt.military-symbols.recent.v1:/plan/';
    const saved = JSON.parse(fixture.values.get(key));
    assert.equal(saved[0].config.options.uniqueDesignation, '2 Btl');
    pending = fixture.symbols.open();
    e['symbol-uniqueDesignation'].value = 'Outro';
    e['symbol-uniqueDesignation'].dispatch('input');
    e.symbolRecentTray.children[0].children[0].dispatch('click');
    assert.equal(e['symbol-uniqueDesignation'].value, '2 Btl');
    result = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: result });
    assert.equal((await pending).config.sidc, '10031000001211000000');
    assert.equal(JSON.parse(fixture.values.get(key)).length, 1);
    pending = fixture.symbols.open();
    e.symbolRecentTray.children[0].children[1].dispatch('click');
    assert.deepEqual(JSON.parse(fixture.values.get(key)), []);
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('storage errors remain visible without preventing confirmation', async () => {
    const fixture = setup();
    fixture.failStorage();
    const pending = fixture.symbols.open();
    assert.match(fixture.elements.symbolRecentTray.textContent, /Não foi possível/);
    const result = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: result });
    assert.equal((await pending).config.sidc, result.config.sidc);
    assert.equal(fixture.active().warning, 'Aviso');
});

test('tray keeps 100 most recent symbols and preserves existing named models', async () => {
    const fixture = setup();
    const legacyKey = 'planmilt.military-symbols.br.v1:/plan/';
    const key = 'planmilt.military-symbols.recent.v1:/plan/';
    const sidc = '10031000001211000000';
    const legacy = JSON.stringify([{ id: 'legacy', name: 'Modelo antigo',
        config: { sidc, options: { quantity: '3', uniqueDesignation: 'Antigo' } } }]);
    fixture.values.set(legacyKey, legacy);
    let pending = fixture.symbols.open();
    assert.equal(fixture.elements.symbolRecentTray.children[0].children[0].title, 'Modelo antigo');
    fixture.elements.symbolRecentTray.children[0].children[0].dispatch('click');
    assert.equal(fixture.active().preConfirm().config.options.quantity, '3');
    fixture.active().finish({ isConfirmed: false });
    await pending;
    assert.equal(fixture.values.has(key), false);
    const entries = Array.from({ length: 50 }, (_, index) => ({
        id: String(index), name: `Ícone ${index}`, config: { sidc, options: { uniqueDesignation: String(index) } }
    }));
    fixture.values.set(key, JSON.stringify(entries));
    pending = fixture.symbols.open();
    fixture.elements['symbol-uniqueDesignation'].value = 'Nova';
    fixture.elements['symbol-uniqueDesignation'].dispatch('input');
    const result = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: result });
    await pending;
    let saved = JSON.parse(fixture.values.get(key));
    assert.equal(saved.length, 51);
    assert.equal(saved[0].config.options.uniqueDesignation, 'Nova');
    assert.equal(saved[50].id, '49');

    fixture.values.set(key, JSON.stringify(Array.from({ length: 100 }, (_, index) => ({
        id: String(index), name: `Ícone ${index}`, config: { sidc, options: { uniqueDesignation: String(index) } }
    }))));
    pending = fixture.symbols.open();
    fixture.elements['symbol-uniqueDesignation'].value = 'Nova';
    fixture.elements['symbol-uniqueDesignation'].dispatch('input');
    const nextResult = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: nextResult });
    await pending;
    saved = JSON.parse(fixture.values.get(key));
    assert.equal(saved.length, 100);
    assert.equal(saved[0].config.options.uniqueDesignation, 'Nova');
    assert.equal(saved[99].id, '98');
    assert.equal(fixture.values.get(legacyKey), legacy);
});

test('legacy default names display as icons without changing saved data or user designations', async () => {
    const fixture = setup();
    const key = 'planmilt.military-symbols.recent.v1:/plan/';
    const sidc = '10031000001211000000';
    const stored = JSON.stringify([
        { id: 'legacy', name: 'Calunga gerada', config: { sidc, options: {} } },
        { id: 'custom', name: 'Calunga gerada', config: { sidc, options: { uniqueDesignation: 'Calunga gerada' } } }
    ]);
    fixture.values.set(key, stored);
    const pending = fixture.symbols.open();
    assert.equal(fixture.elements.symbolRecentTray.children[0].children[0].title, 'Ícone gerado');
    assert.equal(fixture.elements.symbolRecentTray.children[1].children[0].title, 'Calunga gerada');
    assert.equal(fixture.values.get(key), stored);
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('legacy library exposes up to 100 models without modifying its storage', async () => {
    const fixture = setup();
    const legacyKey = 'planmilt.military-symbols.br.v1:/plan/';
    const key = 'planmilt.military-symbols.recent.v1:/plan/';
    const sidc = '10031000001211000000';
    const legacy = JSON.stringify(Array.from({ length: 101 }, (_, index) => ({
        id: String(index), name: `Modelo ${index}`, config: { sidc, options: {} }
    })));
    fixture.values.set(legacyKey, legacy);
    const pending = fixture.symbols.open();
    const tray = fixture.elements.symbolRecentTray;
    assert.equal(tray.children.length, 101);
    assert.equal(tray.children[99].children[0].title, 'Modelo 99');
    assert.equal(fixture.values.get(legacyKey), legacy);
    assert.equal(fixture.values.has(key), false);
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('new unnamed icons use the standardized default name', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const result = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: result });
    await pending;
    const saved = JSON.parse(fixture.values.get('planmilt.military-symbols.recent.v1:/plan/'));
    assert.equal(saved[0].name, 'Ícone gerado');
});

test('category and icon labels omit numeric codes but retain meaningful parentheses', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const e = fixture.elements;
    assert.equal(e.symbolSet.options.find(option => option.value === '10').textContent, 'Unidades');
    assert.ok(e.symbolEntity.options.some(option => /Comando Nomeado \(sigla/.test(option.textContent)));
    assert.ok(e.symbolEntity.options.every(option => !/\(\d{20,30}\)$/.test(option.textContent)));
    assert.doesNotMatch(fixture.active().html, /SIDC e outros campos|Biblioteca neste navegador/);
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('editing changes the persisted icon while cancel leaves it untouched', async () => {
    const fixture = setup();
    const data = fixture.symbols.render({ sidc: '100310000012189900000760016384', options: {} });
    const layer = { feature: { properties: { militarySymbol: data, iconUrl: data.iconUrl } }, setIcon(icon) { this.icon = icon; } };
    const leaflet = { icon: options => ({ options }) };
    let pending = fixture.symbols.edit(layer, leaflet);
    assert.equal(fixture.active().title, 'Editar ícone');
    fixture.active().finish({ isConfirmed: false });
    await pending;
    assert.equal(layer.icon, undefined);
    pending = fixture.symbols.edit(layer, leaflet);
    fixture.elements['symbol-uniqueDesignation'].value = 'Bravo';
    fixture.elements['symbol-uniqueDesignation'].dispatch('input');
    const changed = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: changed });
    await pending;
    assert.equal(layer.feature.properties.militarySymbol.config.sidc, data.config.sidc);
    assert.equal(layer.feature.properties.militarySymbol.config.options.uniqueDesignation, 'Bravo');
    assert.equal(layer.icon.options.iconUrl, layer.feature.properties.iconUrl);
});
