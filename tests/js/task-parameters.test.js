const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/task-parameters.js');

function createParametersModule({ values = {}, selectedOptions = [], icons = [], radioPresets = [] } = {}) {
    const alerts = [];
    const popup = {
        querySelector(selector) {
            return {
                value: values[selector],
                selectedOptions: selector === '#iconTypesToCover'
                    ? selectedOptions.map(value => ({ value }))
                    : undefined
            };
        }
    };

    const module = window.PlanMilT.taskParameters.attach({
        apiClient: {
            async getJson(url) {
                assert.equal(url, 'symbols/icons.php');
                return icons;
            }
        },
        radioPresets,
        sweetAlert: {
            getPopup: () => popup,
            async fire(...args) {
                alerts.push(args);
                return {};
            }
        }
    });

    return { alerts, module };
}

test('form parameter values preserve the five task payload shapes', async () => {
    const existingArea = { id: 'area' };
    const { module } = createParametersModule({
        values: {
            '#iconLayerSelect': 'drawnItems',
            '#iconType': 'symbols/friend/a.svg',
            '#maxDistance': '10',
            '#iconToInsert': 'symbols/friend/b.svg',
            '#numberOfNewIcons': '3',
            '#maxDistanceBetweenNewIcons': '2',
            '#criteria': '100',
            '#maxNumberOfIcons': '8',
            '#minDistanceBetweenIcons': '50',
            '#maxConnectionsPerIcon': '4',
            '#minDistanceBetweenLines': '25',
            '#iconType1': 'symbols/friend/a.svg',
            '#iconType2': 'symbols/enemy/b.svg',
            '#maxConnectionsSource': '3',
            '#maxConnectionsTarget': '6',
            '#connectionCriterion': 'closest',
            '#radius': '5',
            '#coverageLayerSelect': 'planningSuggestions'
        },
        selectedOptions: ['symbols/enemy/b.svg']
    });

    assert.deepEqual(await module.getValues('findHighestPoint', { area: existingArea }), {
        iconLayer: 'drawnItems',
        iconType: 'symbols/friend/a.svg',
        maxDistance: 10,
        iconToInsert: 'symbols/friend/b.svg',
        numberOfNewIcons: 3,
        maxDistanceBetweenNewIcons: 2,
        area: existingArea
    });
    assert.deepEqual(await module.getValues('placeIcons', {}), {
        iconUrl: 'symbols/friend/b.svg',
        criteria: 100,
        maxNumberOfIcons: 8,
        minDistanceBetweenIcons: 50,
        area: null
    });
    assert.deepEqual(await module.getValues('drawLinesBetweenIcons', {}), {
        iconLayer: 'drawnItems',
        iconType: 'symbols/friend/a.svg',
        maxDistance: 10,
        maxConnectionsPerIcon: 4,
        minDistanceBetweenLines: 25,
        area: null
    });
    assert.deepEqual(await module.getValues('connectDifferentIcons', {}), {
        iconLayer: 'drawnItems',
        iconType1: 'symbols/friend/a.svg',
        iconType2: 'symbols/enemy/b.svg',
        maxDistance: 10,
        maxConnectionsSource: 3,
        maxConnectionsTarget: 6,
        connectionCriterion: 'closest',
        area: null
    });
    assert.deepEqual(await module.getValues('drawCoverageArea', {}), {
        iconUrl: 'symbols/friend/b.svg',
        radius: 5,
        iconTypesToCover: ['symbols/enemy/b.svg'],
        coverageLayer: 'planningSuggestions',
        area: null
    });
});

test('line task form uses icon paths returned by the shared API client', async () => {
    const { module } = createParametersModule({ icons: ['symbols/friend/alpha.svg'] });
    const html = await module.getHtml('drawLinesBetweenIcons', {});

    assert.match(html, /symbols\/friend\/alpha\.svg/);
    assert.match(html, /maxConnectionsPerIcon/);
    assert.match(html, /minDistanceBetweenLines/);
});

test('radio-link task renders reusable presets and preserves its selected values', async () => {
    const icons = ['symbols/friend/alpha.svg', 'symbols/enemy/bravo.svg'];
    const radioPresets = [
        { id: 'optical', label: 'Ótico (Linha de Visada)' },
        { id: 'harris_hh', label: 'Harris portátil' }
    ];
    const { module } = createParametersModule({
        icons,
        radioPresets,
        values: {
            '#linkLayerSelect': 'planningSuggestions',
            '#linkIconType1': icons[0],
            '#linkIconType2': icons[1],
            '#linkRadioPreset': 'harris_hh',
            '#linkMaxDistance': '12'
        }
    });

    const html = await module.getHtml('verifyRadioLinks', {
        iconType1: icons[0],
        iconType2: icons[1],
        radioPreset: 'harris_hh'
    });

    assert.match(html, /Harris portátil/);
    assert.match(html, /value="symbols\/friend\/alpha\.svg" selected/);
    assert.match(html, /value="symbols\/enemy\/bravo\.svg" selected/);
    assert.deepEqual(await module.getValues('verifyRadioLinks', {}), {
        iconLayer: 'planningSuggestions',
        iconType1: icons[0],
        iconType2: icons[1],
        radioPreset: 'harris_hh',
        maxDistance: 12,
        area: null
    });
});

test('unknown task form returns the existing user-facing message', async () => {
    const { module } = createParametersModule();

    assert.match(await module.getHtml('unknown-task'), /Tarefa desconhecida/);
});

test('invalid task values show the validation warning and return null', async () => {
    const { module, alerts } = createParametersModule();
    const result = await module.getValues('placeIcons', {});

    assert.equal(result, null);
    assert.equal(alerts[0][0], 'Aviso');
});