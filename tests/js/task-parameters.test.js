const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/task-parameters.js');

function createParametersModule({
    values = {},
    selectedOptions = [],
    icons = [],
    radioPresets = [],
    getLayerIconCounts = () => ({})
} = {}) {
    const alerts = [];
    const popup = {
        querySelector(selector) {
            return {
                value: values[selector],
                selectedOptions: ['#iconTypesToCover', '#repeaterTargetIcons'].includes(selector)
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
        getLayerIconCounts,
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
            '#linkMaxDistance': '12',
            '#linkAntennaHeight': '8'
        }
    });

    const html = await module.getHtml('verifyRadioLinks', {
        iconType1: icons[0],
        iconType2: icons[1],
        radioPreset: 'harris_hh'
    });

    assert.match(html, /class="task-parameter-form"/);
    assert.match(html, /class="task-parameter-field">\s*<label for="linkLayerSelect"/);
    assert.match(html, /Harris portátil/);
    assert.match(html, /Altura comum das antenas \(m\)/);
    assert.match(html, /substituirá a altura definida pelo preset/);
    assert.match(html, /value="symbols\/friend\/alpha\.svg" selected/);
    assert.match(html, /value="symbols\/enemy\/bravo\.svg" selected/);
    assert.deepEqual(await module.getValues('verifyRadioLinks', {}), {
        iconLayer: 'planningSuggestions',
        iconType1: icons[0],
        iconType2: icons[1],
        radioPreset: 'harris_hh',
        maxDistance: 12,
        antennaHeight: 8,
        area: null
    });
    assert.equal(module.getPresetLabel('harris_hh'), 'Harris portátil');
});

test('task icon selectors show only markers in the chosen layer and refresh when the layer changes', () => {
    const friend = 'symbols/friend/alpha.svg';
    const enemy = 'symbols/enemy/bravo.svg';
    const layerCounts = {
        drawnItems: { [friend]: 2, [enemy]: 1 },
        planningSuggestions: { [friend]: 3 },
        empty: {}
    };
    const { module } = createParametersModule({
        getLayerIconCounts: layerName => layerCounts[layerName]
    });
    const listeners = {};
    const makeSelect = (value, html) => ({
        value,
        html,
        selectedOptions: [],
        addEventListener(event, callback) {
            listeners[event] = callback;
        },
        set innerHTML(html) {
            this.html = html;
            const selected = html.match(/<option value="([^"]*)" selected>/);
            const first = html.match(/<option value="([^"]*)"/);
            this.value = selected?.[1] || first?.[1] || '';
        },
        get innerHTML() {
            return this.html;
        }
    });
    const layerSelect = makeSelect('drawnItems');
    const catalogOptions = `<option value="${friend}">friend/alpha</option><option value="${enemy}" selected>enemy/bravo</option>`;
    const group1 = makeSelect(enemy, catalogOptions);
    const group2 = makeSelect(friend, catalogOptions);
    const status = { textContent: '' };
    const elements = {
        '#iconLayerSelect': layerSelect,
        '#iconType1': group1,
        '#iconType2': group2,
        '#iconType1Image': { src: '' },
        '#iconType2Image': { src: '' },
        '#taskLayerStatus': status
    };
    const root = {
        querySelector(selector) {
            return selector.split(', ').map(item => elements[item]).find(Boolean) || null;
        }
    };

    module.bind('connectDifferentIcons', root);

    assert.equal(group1.value, enemy);
    assert.equal(group2.value, friend);
    assert.match(group1.innerHTML, /1 disponível/);
    assert.match(status.textContent, /2 tipos de ícone encontrados/);

    layerSelect.value = 'planningSuggestions';
    listeners.change();
    assert.equal(group1.value, enemy);
    assert.equal(group2.value, friend);
    assert.match(group1.innerHTML, /value="symbols\/friend\/alpha\.svg"/);
    assert.match(group1.innerHTML, /value="symbols\/enemy\/bravo\.svg"/);
    assert.equal(elements['#iconType1Image'].src, enemy);
    assert.match(status.textContent, /Todos os ícones do catálogo podem ser selecionados/);

    layerSelect.value = 'empty';
    listeners.change();
    assert.equal(group1.value, '');
    assert.match(group1.innerHTML, /Nenhum ícone encontrado/);
    assert.match(status.textContent, /Escolha outra camada ou adicione os ícones/);
});

test('radio task allows catalog icons as inputs from the planning suggestion layer', () => {
    const existingIcon = 'symbols/friend/alpha.svg';
    const plannedIcon = 'symbols/enemy/future-unit.svg';
    const catalogHtml = `<option value="${existingIcon}">friend/alpha</option><option value="${plannedIcon}" selected>enemy/future-unit</option>`;
    const makeSelect = (value, html = '') => ({
        value,
        html,
        addEventListener() {},
        set innerHTML(content) {
            this.html = content;
            const selected = content.match(/<option value="([^"]*)" selected>/);
            const first = content.match(/<option value="([^"]*)"/);
            this.value = selected?.[1] || first?.[1] || '';
        },
        get innerHTML() {
            return this.html;
        }
    });
    const layer = makeSelect('planningSuggestions');
    const station = makeSelect(plannedIcon, catalogHtml);
    const status = { textContent: '' };
    const elements = {
        '#routeRadioLayer': layer,
        '#routeStationIcon': station,
        '#radioTaskLayerStatus, #taskLayerStatus': status
    };
    const { module } = createParametersModule({
        getLayerIconCounts: () => ({ [existingIcon]: 1 })
    });
    module.bind('checkRouteCommunication', {
        querySelector(selector) {
            return elements[selector] || null;
        }
    });

    assert.equal(station.value, plannedIcon);
    assert.match(station.innerHTML, /future-unit/);
    assert.match(status.textContent, /Todos os ícones do catálogo podem ser selecionados/);
});

test('coverage task filters its multi-select by the selected source layer', () => {
    const friend = 'symbols/friend/alpha.svg';
    const enemy = 'symbols/enemy/bravo.svg';
    const { module } = createParametersModule({
        getLayerIconCounts: () => ({ [friend]: 1, [enemy]: 2 })
    });
    const layerSelect = { value: 'drawnItems', addEventListener() {} };
    const selectedOptions = [{ value: enemy }];
    const iconTypes = {
        value: enemy,
        selectedOptions,
        set innerHTML(html) {
            this.html = html;
        },
        get innerHTML() {
            return this.html;
        }
    };
    const root = {
        querySelector(selector) {
            return {
                '#coverageLayerSelect': layerSelect,
                '#iconTypesToCover': iconTypes
            }[selector] || null;
        }
    };

    module.bind('drawCoverageArea', root);
    assert.match(iconTypes.innerHTML, /friend\/alpha/);
    assert.match(iconTypes.innerHTML, /enemy\/bravo/);
    assert.match(iconTypes.innerHTML, /selected/);
});

test('repeater target selector aggregates both map layers without filtering the insertion icon', () => {
    const friend = 'symbols/friend/alpha.svg';
    const enemy = 'symbols/enemy/bravo.svg';
    const { module } = createParametersModule({
        getLayerIconCounts: layerName => {
            assert.equal(layerName, 'all');
            return { [friend]: 2, [enemy]: 1 };
        }
    });
    const targetIcons = {
        value: enemy,
        selectedOptions: [{ value: enemy }],
        set innerHTML(html) { this.html = html; },
        get innerHTML() { return this.html; }
    };
    const repeaterIcon = {
        value: 'symbols/friend/repeater.svg',
        innerHTML: '<option value="symbols/friend/repeater.svg">friend/repeater</option>'
    };
    const status = { textContent: '' };
    const root = {
        querySelector(selector) {
            return {
                '#repeaterTargetIcons': targetIcons,
                '#repeaterIconUrl': repeaterIcon,
                '#radioTaskLayerStatus, #taskLayerStatus': status
            }[selector] || null;
        }
    };

    module.bind('suggestRepeaterPositions', root);

    assert.match(targetIcons.innerHTML, /alpha \(2 disponíveis\)/);
    assert.match(targetIcons.innerHTML, /bravo \(1 disponível\)/);
    assert.match(targetIcons.innerHTML, /selected/);
    assert.equal(repeaterIcon.innerHTML, '<option value="symbols/friend/repeater.svg">friend/repeater</option>');
    assert.match(status.textContent, /camadas de desenho e de sugestões/);
});

test('radio task forms collect route, repeater and preset settings', async () => {
    const icons = ['symbols/friend/alpha.svg', 'symbols/enemy/bravo.svg'];
    const { module } = createParametersModule({
        icons,
        radioPresets: [
            { id: 'optical', label: 'Ótico' },
            { id: 'radio', label: 'Rádio' }
        ],
        values: {
            '#routeRadioLayer': 'planningSuggestions',
            '#routeStationIcon': icons[0],
            '#routeRadioPreset': 'radio',
            '#routeRadioMaxDistance': '12',
            '#routeRadioInterval': '0.5',
            '#routeAntennaHeight': '8',
            '#repeaterIconUrl': icons[0],
            '#repeaterRadioPreset': 'radio',
            '#repeaterMaxDistance': '10',
            '#repeaterAntennaHeight': '4',
            '#repeaterMaxCount': '4',
            '#repeaterMinDistance': '1.5',
            '#compareRadioLayer': 'planningSuggestions',
            '#compareRadioIcon1': icons[0],
            '#compareRadioIcon2': icons[1],
            '#compareRadioMaxDistance': '20',
            '#compareRadioAntennaHeight': '25'
        },
        selectedOptions: [icons[0], icons[1]]
    });

    const routeHtml = await module.getHtml('checkRouteCommunication');
    const repeaterHtml = await module.getHtml('suggestRepeaterPositions');
    const compareHtml = await module.getHtml('compareRadioPresets');
    assert.match(routeHtml, /Intervalo entre amostras/);
    for (const html of [routeHtml, repeaterHtml, compareHtml]) {
        assert.match(html, /Altura comum das antenas \(m\)/);
    }
    assert.match(repeaterHtml, /Ícones que precisam de cobertura/);
    assert.match(repeaterHtml, /Ícone a colocar/);
    assert.match(repeaterHtml, /Alcance máximo de cada enlace/);
    assert.match(repeaterHtml, /Máximo de repetidoras sugeridas \(1–40\)/);
    assert.match(repeaterHtml, /Distância mínima entre repetidoras/);
    assert.match(repeaterHtml, /pontos de interseção/);
    assert.match(repeaterHtml, /camadas de desenho e de sugestões/);
    assert.doesNotMatch(repeaterHtml, /Espaçamento entre posições|Camada com os ícones|Grupo 1|Grupo 2/);
    assert.match(repeaterHtml, /fas fa-map-marker-alt/);
    assert.match(repeaterHtml, /multiple size="5"/);
    assert.match(compareHtml, /todos os presets RF e óticos/);
    for (const html of [routeHtml, repeaterHtml, compareHtml]) {
        assert.match(html, /class="task-parameter-form"/);
        assert.match(html, /class="task-parameter-field">\s*<label/);
        assert.match(html, /class="task-parameter-description"/);
    }

    assert.deepEqual(await module.getValues('checkRouteCommunication', {}), {
        iconLayer: 'planningSuggestions',
        stationIcon: icons[0],
        radioPreset: 'radio',
        maxDistance: 12,
        sampleInterval: 0.5,
        antennaHeight: 8,
        area: null
    });
    assert.deepEqual(await module.getValues('suggestRepeaterPositions', {}), {
        iconTypesToCover: icons,
        repeaterIcon: icons[0],
        radioPreset: 'radio',
        maxDistance: 10,
        antennaHeight: 4,
        maxRepeaters: 4,
        minimumRepeaterDistanceKm: 1.5,
        area: null
    });
    assert.deepEqual(await module.getValues('compareRadioPresets', {}), {
        iconLayer: 'planningSuggestions',
        iconType1: icons[0],
        iconType2: icons[1],
        maxDistance: 20,
        antennaHeight: 25,
        area: null
    });
});

test('repeater task requires at least one target icon type', async () => {
    const { module, alerts } = createParametersModule({
        radioPresets: [{ id: 'radio', label: 'Rádio' }],
        values: {
            '#repeaterIconUrl': 'symbols/friend/repeater.svg',
            '#repeaterRadioPreset': 'radio',
            '#repeaterMaxDistance': '10'
        }
    });

    assert.equal(await module.getValues('suggestRepeaterPositions', {}), null);
    assert.match(alerts[0][1], /Selecione os ícones que precisam de cobertura/);
});

test('repeater task validates the configured count and non-negative spacing', async () => {
    const { module, alerts } = createParametersModule({
        radioPresets: [{ id: 'radio', label: 'Rádio' }],
        values: {
            '#repeaterIconUrl': 'symbols/friend/repeater.svg',
            '#repeaterRadioPreset': 'radio',
            '#repeaterMaxDistance': '10',
            '#repeaterAntennaHeight': '1.5',
            '#repeaterMaxCount': '41',
            '#repeaterMinDistance': '0'
        },
        selectedOptions: ['symbols/enemy/target.svg']
    });

    assert.equal(await module.getValues('suggestRepeaterPositions', {}), null);
    assert.match(alerts.at(-1)[1], /quantidade máxima e distância mínima válidos/);
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