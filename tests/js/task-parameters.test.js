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

test('additional radio task forms collect coverage, route, repeater and preset settings', async () => {
    const icons = ['symbols/friend/alpha.svg', 'symbols/enemy/bravo.svg'];
    const { module } = createParametersModule({
        icons,
        radioPresets: [
            { id: 'optical', label: 'Ótico' },
            { id: 'radio', label: 'Rádio' }
        ],
        values: {
            '#coverageGapLayer': 'drawnItems',
            '#coverageGapStationIcon': icons[0],
            '#coverageGapPreset': 'optical',
            '#coverageGapCellSize': '1.5',
            '#coverageGapMaxDistance': '18',
            '#routeRadioLayer': 'planningSuggestions',
            '#routeStationIcon': icons[0],
            '#routeRadioPreset': 'radio',
            '#routeRadioMaxDistance': '12',
            '#routeRadioInterval': '0.5',
            '#repeaterLayer': 'drawnItems',
            '#repeaterCandidateIcon': icons[0],
            '#repeaterGroup1': icons[0],
            '#repeaterGroup2': icons[1],
            '#repeaterRadioPreset': 'radio',
            '#repeaterMaxDistance': '10',
            '#compareRadioLayer': 'planningSuggestions',
            '#compareRadioIcon1': icons[0],
            '#compareRadioIcon2': icons[1],
            '#compareRadioMaxDistance': '20'
        }
    });

    const coverageHtml = await module.getHtml('identifyCoverageGaps');
    const routeHtml = await module.getHtml('checkRouteCommunication');
    const repeaterHtml = await module.getHtml('suggestRepeaterPositions');
    const compareHtml = await module.getHtml('compareRadioPresets');
    assert.match(coverageHtml, /Resolução aproximada da grade/);
    assert.match(routeHtml, /Intervalo entre amostras/);
    assert.match(repeaterHtml, /posições candidatas/);
    assert.match(compareHtml, /todos os presets RF e óticos/);

    assert.deepEqual(await module.getValues('identifyCoverageGaps', {}), {
        iconLayer: 'drawnItems',
        stationIcon: icons[0],
        radioPreset: 'optical',
        cellSizeKm: 1.5,
        maxDistance: 18,
        area: null
    });
    assert.deepEqual(await module.getValues('checkRouteCommunication', {}), {
        iconLayer: 'planningSuggestions',
        stationIcon: icons[0],
        radioPreset: 'radio',
        maxDistance: 12,
        sampleInterval: 0.5,
        area: null
    });
    assert.deepEqual(await module.getValues('suggestRepeaterPositions', {}), {
        iconLayer: 'drawnItems',
        candidateIcon: icons[0],
        iconType1: icons[0],
        iconType2: icons[1],
        radioPreset: 'radio',
        maxDistance: 10,
        area: null
    });
    assert.deepEqual(await module.getValues('compareRadioPresets', {}), {
        iconLayer: 'planningSuggestions',
        iconType1: icons[0],
        iconType2: icons[1],
        maxDistance: 20,
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