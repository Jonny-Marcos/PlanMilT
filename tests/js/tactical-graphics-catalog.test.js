const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/tactical-graphics-catalog.js');

const library = require('@zaes/tactical-graphics');
const catalog = window.PlanMilT.tacticalGraphicsCatalog;

test('all library graphic names have Portuguese labels and appear once in their category', () => {
    const sections = catalog.buildSections(library);
    const graphics = sections.slice(1).flatMap(section => section.graphics);
    const names = graphics.map(graphic => graphic.name);

    assert.equal(names.length, library.listTacticalGraphicNames().length);
    assert.equal(new Set(names).size, names.length);
    assert.deepEqual(new Set(names), new Set(library.listTacticalGraphicNames()));
    assert.equal(sections[0].name, 'common');
    assert.equal(sections[0].label, '10 mais comuns');
    assert.equal(sections[0].graphics.length, 10);
    assert.equal(sections.length, Object.keys(library.TacticalGraphicCategory).length + 1);
    assert.ok(sections.slice(1).every(section => section.graphics.length > 0));
});

test('common graphics have a quick section and remain grouped in their categories', () => {
    const sections = catalog.buildSections(library);
    const common = sections[0].graphics.map(graphic => graphic.name);
    const categorized = sections.slice(1).flatMap(section => section.graphics.map(graphic => graphic.name));

    assert.deepEqual(common, [
        'MainAxisOfAdvance',
        'SupportingAxisOfAdvance',
        'PhaseLine',
        'Boundary',
        'LineOfDeparture',
        'LimitOfAdvance',
        'ObjectiveArea',
        'AssemblyArea',
        'AreaOfOperations',
        'NamedAreaOfInterest'
    ]);
    assert.ok(common.every(name => categorized.includes(name)));
    assert.ok(sections.some(section => section.label === 'Medidas de Coordenação do Apoio de Fogo'));
    assert.ok(sections[0].graphics.some(graphic => graphic.label === 'Eixo principal de progressão'));
});

test('translation rejects unknown library vocabulary instead of leaking English labels', () => {
    assert.throws(
        () => catalog.translateName('unknown tactical term'),
        /Tradução ausente/
    );
});
