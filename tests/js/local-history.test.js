const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/local-history.js'), 'utf8');

function createHistory(values = new Map(), pathname = '/app/') {
    const errors = [];
    const context = {
        window: { location: { href: `https://example.test${pathname}` } },
        URL,
        localStorage: {
            getItem: key => values.get(key) || null,
            setItem: (key, value) => values.set(key, value)
        },
        console: { error: (...args) => errors.push(args) }
    };
    vm.runInNewContext(source, context);
    return { history: context.window.PlanMilT.localHistory, errors };
}

test('graphic history ranks usage, breaks ties by recency and survives reloads', () => {
    const values = new Map();
    const { history } = createHistory(values);
    for (let index = 0; index < 12; index++) history.recordGraphic(`graphic-${index}`);
    history.recordGraphic('graphic-0');
    const actual = createHistory(values).history.graphics();
    assert.equal(actual.length, 12);
    assert.equal(actual[0], 'graphic-0');
    assert.equal(actual[1], 'graphic-11');
    assert.equal(createHistory(values, '/another/').history.graphics().length, 0);
});

test('recent layers are deduplicated and limited without persisting service URLs', () => {
    const values = new Map();
    const { history } = createHistory(values);
    const layers = Array.from({ length: 51 }, (_, index) => ({
        serviceId: 1, layerName: `layer-${index}`, title: `Layer ${index}`,
        serviceUrl: 'https://example.test/wms?secret=private'
    }));
    history.recordLayers(layers);
    history.recordLayers([layers[1]]);
    const saved = createHistory(values).history.layers();
    assert.equal(saved.length, 50);
    assert.equal(saved[0].layerName, 'layer-1');
    assert.equal(saved.filter(item => item.layerName === 'layer-1').length, 1);
    assert.ok(![...values.values()][0].includes('private'));
});

test('corrupt local history is reported and never overwritten', () => {
    const values = new Map([['planmilt.catalog-history.v1:/app/', '{invalid']]);
    const { history, errors } = createHistory(values);
    assert.equal(history.graphics().length, 0);
    history.recordGraphic('Boundary');
    assert.equal(values.get('planmilt.catalog-history.v1:/app/'), '{invalid');
    assert.equal(errors.length, 2);
});

test('invalid recent layer data is reported without corrupting existing history', () => {
    const values = new Map();
    const { history, errors } = createHistory(values);
    history.recordGraphic('Boundary');
    const before = [...values.values()][0];
    history.recordLayers([{ serviceId: 1, layerName: 'x', title: 'X', latestYear: Infinity }]);
    assert.equal([...values.values()][0], before);
    assert.equal(errors.length, 1);
});

test('storage write failures are logged without disrupting drawing', () => {
    const errors = [];
    const context = {
        window: { location: { href: 'https://example.test/app/' } }, URL,
        localStorage: { getItem: () => null, setItem() { throw new Error('storage unavailable'); } },
        console: { error: (...args) => errors.push(args) }
    };
    vm.runInNewContext(source, context);
    assert.doesNotThrow(() => context.window.PlanMilT.localHistory.recordGraphic('Boundary'));
    assert.equal(errors.length, 1);
});

test('drawings and the color picker start with black', () => {
    const main = fs.readFileSync(path.join(__dirname, '../../js/features/main.js'), 'utf8');
    assert.match(main, /var defaultColor = '#000000'/);
    assert.match(main, /spectrum\(\{\s*color: defaultColor/);
});
