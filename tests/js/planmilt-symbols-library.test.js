const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');

function loadLibrary() {
    const window = {
        PlanMilT: {},
        PlanMilTBrazilian: undefined,
        addEventListener() {},
        removeEventListener() {}
    };
    window.window = window;
    window.navigator = { userAgent: 'node' };
    const context = vm.createContext({
        window,
        navigator: window.navigator,
        document: {},
        console,
        URL,
        setTimeout,
        clearTimeout,
        TextEncoder,
        TextDecoder
    });
    const source = fs.readFileSync(path.join(root, 'js/library/planmilt-symbols/planmilt-symbols.js'), 'utf8');
    vm.runInContext(source, context);
    return { library: window.PlanMilTSymbols, source };
}

test('static bundle exposes Brazilian symbols and credits included dependencies', () => {
    const { library, source } = loadLibrary();

    assert.equal(library.version, '1.0.0');
    assert.equal(library.listSymbols().length, 1332);
    assert.equal(library.findSymbol('10031000001211000000').name, 'Infantaria');
    assert.equal(typeof library.getExtensions('10'), 'object');
    assert.equal(library.getExtensions('unknown'), null);
    assert.equal(typeof library.openSymbolCreator, 'function');
    assert.equal(typeof library.tacticalGraphics.renderTacticalGraphic, 'function');
    assert.equal(typeof library.tacticalGraphicsCatalog.buildSections, 'function');
    assert.match(source, /simbologia\.eb\.mil\.br/);
    assert.match(source, /Måns Beckman/);
    assert.match(source, /ZAES/);
    const readme = fs.readFileSync(path.join(root, 'js/library/planmilt-symbols/README.md'), 'utf8');
    assert.match(readme, /Instalação/);
    assert.match(readme, /Installation/);
    assert.match(readme, /simbologia\.eb\.mil\.br/);
    assert.match(readme, /MilSymbols/);
    assert.match(readme, /openSymbolCreator/);
});

test('standard SIDCs render with MilSymbols and Brazilian extensions with the portal adaptation', () => {
    const { library } = loadLibrary();
    const standard = library.renderSymbol('10031000001211000000');
    const brazilian = library.renderSymbol('100310000012189900000760016384');

    assert.equal(standard.engine, 'milsymbol');
    assert.match(standard.svg, /<svg/);
    assert.match(standard.dataUrl, /^data:image\/svg/);
    assert.equal(brazilian.engine, 'simbologia.eb.mil.br');
    assert.match(brazilian.svg, /<svg/);
    assert.equal(library.listSymbols({ category: '10', includeExamples: false }).length, 74);
    assert.throws(() => library.renderSymbol('100310000012189900000760524288'), /inválida/);
    for (const item of library.listSymbols()) {
        if (item.sidc.length === 20) {
            assert.doesNotThrow(() => library.renderSymbol(item.sidc), item.sidc);
        }
    }
});

test('tactical graphic catalog includes the generated coordination point', () => {
    const { library } = loadLibrary();
    const sections = library.listTacticalGraphics();
    const graphics = sections.flatMap(section => section.graphics);
    const tactical = library.renderTacticalGraphic({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-51.2, -21.5], [-51.1, -21.4]] },
        properties: { tacticalGraphic: { name: 'AirCorridor' } }
    });
    const point = library.renderTacticalGraphic({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-51.2, -21.5] },
        properties: { tacticalGraphic: { name: 'CoordinationPoint', diameter: 1000 } }
    });

    assert.ok(graphics.some(graphic => graphic.name === 'CoordinationPoint'));
    assert.ok(graphics.some(graphic => graphic.name === 'AirCorridor'));
    assert.ok(tactical.graphic.geometry);
    assert.equal(point.graphic.geometry.type, 'LineString');
    assert.equal(point.labels.geometry.type, 'MultiPoint');
});
