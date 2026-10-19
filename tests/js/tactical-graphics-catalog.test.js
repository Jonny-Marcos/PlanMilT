const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/tactical-graphics-catalog.js');

const library = require('@zaes/tactical-graphics');
const catalog = window.PlanMilT.tacticalGraphicsCatalog;

function getSampleFeature(library, name) {
    const geometryType = library.baseGeometryFor(name);
    const geometries = {
        Point: {
            type: 'Point',
            coordinates: [-50, -20]
        },
        LineString: {
            type: 'LineString',
            coordinates: [[-50, -20], [-49.99, -20.01]]
        },
        Polygon: {
            type: 'Polygon',
            coordinates: [[[-50, -20], [-49.99, -20], [-49.99, -20.01], [-50, -20]]]
        }
    };

    return {
        type: 'Feature',
        geometry: geometries[geometryType],
        properties: {
            tacticalGraphic: {
                name,
                radius: 500
            }
        }
    };
}

function addsDistinctiveGeometry(library, name) {
    const feature = getSampleFeature(library, name);
    const baseGeometry = feature.geometry;
    const output = library.renderTacticalGraphic(feature).graphic.geometry;
    const sameGeometry = JSON.stringify(baseGeometry) === JSON.stringify(output);
    const reversedLine = baseGeometry.type === 'LineString'
        && output.type === 'LineString'
        && JSON.stringify(baseGeometry.coordinates.slice().reverse()) === JSON.stringify(output.coordinates);
    const nativeRectangle = baseGeometry.type === 'LineString' && output.type === 'Polygon';
    const nativeCircle = baseGeometry.type === 'Point'
        && output.type === 'MultiLineString'
        && output.coordinates.length === 1
        && output.coordinates[0].length === 101;
    const nativeRectangleFromPoint = baseGeometry.type === 'Point'
        && output.type === 'Polygon'
        && output.coordinates[0].length !== 73;

    return !sameGeometry && !reversedLine && !nativeRectangle && !nativeCircle && !nativeRectangleFromPoint;
}

test('the curated catalog contains only distinct tactical graphics, grouped once by category', () => {
    const sections = catalog.buildSections(library);
    const graphics = sections.slice(1).flatMap(section => section.graphics);
    const names = graphics.map(graphic => graphic.name);

    assert.equal(names.length, 85);
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.every(name => library.listTacticalGraphicNames().includes(name)));
    assert.ok(names.every(name => addsDistinctiveGeometry(library, name)));
    assert.equal(sections[0].name, 'common');
    assert.equal(sections[0].label, '10 mais comuns');
    assert.equal(sections[0].graphics.length, 10);
    assert.ok(sections.slice(1).every(section => section.graphics.length > 0));
    assert.ok(sections.length < Object.keys(library.TacticalGraphicCategory).length + 1);
});

test('redundant basic geometry is omitted and the ten common graphics remain categorized', () => {
    const sections = catalog.buildSections(library);
    const common = sections[0].graphics.map(graphic => graphic.name);
    const categorized = sections.slice(1).flatMap(section => section.graphics.map(graphic => graphic.name));

    assert.deepEqual(common, [
        'MainAxisOfAdvance',
        'SupportingAxisOfAdvance',
        'AttackHelicopterAxisOfAdvance',
        'DirectionOfMainAttack',
        'Breach',
        'Bypass',
        'Secure',
        'Ambush',
        'AirCorridor',
        'MineCluster'
    ]);
    assert.ok(common.every(name => categorized.includes(name)));
    assert.ok(!categorized.includes('Boundary'));
    assert.ok(!categorized.includes('PhaseLine'));
    assert.ok(!categorized.includes('LimitOfAdvance'));
    assert.ok(!categorized.includes('ObjectiveArea'));
    assert.ok(!categorized.includes('NoAttackZone'));
    assert.ok(!categorized.some(name => [
        'Abatis',
        'AntiTankDitchCompleted',
        'AntiTankDitchReinforcedWithMines',
        'AntiTankDitchUnderConstruction',
        'DefendedAreaEllipse',
        'Encirclement',
        'ExplosivesPlannedStateOfReadiness',
        'ExplosivesStateOfReadiness1Safe',
        'ExplosivesStateOfReadiness2ArmedButPassable',
        'FieldsOfFire',
        'LaunchAreaEllipse',
        'MinimumSafeDistanceMultipleStrike',
        'MinimumSafeDistanceZone',
        'ObstacleBypassDifficult',
        'ObstacleBypassEasy',
        'ObstacleBypassImpossible',
        'PassageLane',
        'SafeLane',
        'SafeLaneOrGap',
        'WeaponSensorRangeFanCircular'
    ].includes(name)));
    assert.ok(!categorized.some(name => name.startsWith('Wire')));
    assert.deepEqual(
        sections.find(section => section.name === 'AirspaceCoordinatingMeasures').graphics.map(graphic => graphic.name),
        ['AirCorridor']
    );
    assert.ok(!sections.some(section => section.label === 'Medidas de Coordenação do Apoio de Fogo'));
    assert.ok(sections[0].graphics.some(graphic => graphic.label === 'Eixo principal de progressão'));
});

test('all library names retain Portuguese translations, including omitted graphics', () => {
    library.listTacticalGraphicNames().forEach(name => {
        assert.doesNotThrow(() => catalog.translateName(library.getDisplayName(name), name), name);
    });
});

test('translation rejects unknown library vocabulary instead of leaking English labels', () => {
    assert.throws(
        () => catalog.translateName('unknown tactical term'),
        /Tradução ausente/
    );
});
