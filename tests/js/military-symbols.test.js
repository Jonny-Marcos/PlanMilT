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
        constructor() { this.options = []; this.listeners = {}; this.value = ''; this.textContent = ''; }
        appendChild(option) { this.options.push(option); if (this.options.length === 1) this.value = option.value; }
        replaceChildren() { this.options = []; this.value = ''; }
        addEventListener(name, callback) { this.listeners[name] = callback; }
        dispatch(name) { this.listeners[name]({ target: this }); }
        removeAttribute(name) { delete this[name]; }
    }
    const document = {
        getElementById(id) { return elements[id] ||= new Element(); },
        createElement() { return new Element(); }
    };
    document.getElementById('symbolName');
    const window = {
        location: { href: 'https://example.test/plan/' }, navigator: { userAgent: 'node' },
        addEventListener() {}, removeEventListener() {}
    };
    window.window = window;
    const Swal = {
        fire(options) { active = options; options.didOpen(); return new Promise(resolve => { active.finish = resolve; }); },
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
    assert.equal(e.symbolSidc.value.slice(4, 6), '15');
    e.symbolSet.value = '10';
    e.symbolSet.dispatch('change');
    e.symbolCatalog.value = 'examples';
    e.symbolCatalog.dispatch('change');
    const index = fixture.catalog['10'].examples.findIndex(entry => entry.options.uniqueDesignation);
    const example = fixture.catalog['10'].examples[index];
    e.symbolEntity.value = String(index);
    e.symbolEntity.dispatch('change');
    assert.equal(e.symbolSidc.value, example.sidc);
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
    assert.equal(e.symbolSidc.value, '100310000012189900000760016384');
    e.symbolModifier2.value = 'ext:3';
    e.symbolModifier2.dispatch('change');
    assert.equal(e.symbolSidc.value, '100310000012189900990760016387');
    e.symbolTransversal.value = '1';
    e.symbolTransversal.dispatch('change');
    assert.equal(e.symbolSidc.value, '100310000012189900990760017411');
    assert.equal(fixture.active().preConfirm().config.sidc, e.symbolSidc.value);
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('editor saves, loads, and applies a reusable Brazilian template', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const e = fixture.elements;
    e['symbol-uniqueDesignation'].value = '2 Btl';
    e['symbol-uniqueDesignation'].dispatch('input');
    e.symbolName.value = 'Meu modelo';
    e.symbolSave.dispatch('click');
    const key = 'planmilt.military-symbols.br.v1:/plan/';
    const saved = JSON.parse(fixture.values.get(key));
    assert.equal(saved[0].config.options.uniqueDesignation, '2 Btl');
    e['symbol-uniqueDesignation'].value = 'Outro';
    e['symbol-uniqueDesignation'].dispatch('input');
    e.symbolLibrary.value = saved[0].id;
    e.symbolLoad.dispatch('click');
    assert.equal(e['symbol-uniqueDesignation'].value, '2 Btl');
    e.symbolSidc.value = '123';
    assert.equal(fixture.active().preConfirm(), false);
    assert.match(fixture.active().validation, /SIDC/);
    e.symbolLoad.dispatch('click');
    const result = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: result });
    assert.equal((await pending).config.sidc, '10031000001211000000');
    e.symbolLibrary.value = saved[0].id;
    e.symbolDelete.dispatch('click');
    assert.deepEqual(JSON.parse(fixture.values.get(key)), []);
});

test('storage errors remain visible', async () => {
    const fixture = setup();
    fixture.failStorage();
    const pending = fixture.symbols.open();
    assert.match(fixture.elements.symbolStorageError.textContent, /Não foi possível/);
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('editing changes the persisted icon while cancel leaves it untouched', async () => {
    const fixture = setup();
    const data = fixture.symbols.render({ sidc: '100310000012189900000760016384', options: {} });
    const layer = { feature: { properties: { militarySymbol: data, iconUrl: data.iconUrl } }, setIcon(icon) { this.icon = icon; } };
    const leaflet = { icon: options => ({ options }) };
    let pending = fixture.symbols.edit(layer, leaflet);
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
