const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

global.window = {};
require('../../js/features/task-radio-links.js');

test('radio-link task is added without removing existing sequence task options', () => {
    const editorSource = fs.readFileSync(path.join(__dirname, '../../js/features/task-sequence-editor.js'), 'utf8');
    const executionSource = fs.readFileSync(path.join(__dirname, '../../js/features/task-execution.js'), 'utf8');
    const existingTasks = [
        'findHighestPoint',
        'placeIcons',
        'drawLinesBetweenIcons',
        'connectDifferentIcons',
        'drawCoverageArea'
    ];

    for (const taskName of existingTasks) {
        assert.match(editorSource, new RegExp(`'${taskName}':`));
        assert.match(executionSource, new RegExp(`case '${taskName}':`));
    }
    assert.match(editorSource, /'verifyRadioLinks':/);
    assert.match(executionSource, /case 'verifyRadioLinks':/);
});

test('radio-link task analyzes icon pairs and stores colored results in the planning layer', async () => {
    class Marker {
        constructor(iconUrl, position) {
            this.options = { icon: { options: { iconUrl } } };
            this.position = position;
        }

        getLatLng() {
            return this.position;
        }
    }
    class LatLngBounds {
        contains() {
            return true;
        }
    }

    const markers = [
        new Marker('symbols/friend/unit.svg', { lat: 0, lng: 0 }),
        new Marker('symbols/friend/unit.svg', { lat: 0, lng: 0.01 })
    ];
    const drawnItems = {
        eachLayer(callback) {
            markers.forEach(callback);
        }
    };
    const generatedLayers = [];
    const planningLayer = {
        addLayer(layer) {
            generatedLayers.push(layer);
        }
    };
    const alerts = [];
    const analyzedLinks = [];
    const task = window.PlanMilT.taskRadioLinks.attach({
        map: {
            getBounds: () => new LatLngBounds(),
            distance: (first, second) => Math.abs(first.lng - second.lng) * 1000
        },
        leaflet: {
            Marker,
            LatLngBounds,
            Polygon: class Polygon {},
            polyline() {
                return {
                    addTo(layer) {
                        layer.addLayer(this);
                        return this;
                    },
                    bindPopup(html) {
                        this.popup = html;
                    }
                };
            }
        },
        drawnItems,
        planningLayer,
        radioPlanning: {
            getPresets: () => [{ id: 'optical', label: 'Ótico' }],
            async analyzeLink(source, target, presetId) {
                analyzedLinks.push({ source, target, presetId });
                return {
                    isViable: true,
                    hasObstruction: false,
                    distTotalKm: 1.25,
                    rxPower: 0
                };
            }
        },
        log: message => alerts.push(message),
        sweetAlert: {
            async fire(options) {
                alerts.push(options);
            }
        }
    });

    const result = await task.verify({
        iconLayer: 'drawnItems',
        iconType1: 'symbols/friend/unit.svg',
        iconType2: 'symbols/friend/unit.svg',
        radioPreset: 'optical',
        maxDistance: 20,
        area: null
    });

    assert.deepEqual(result, { analyzedCount: 1, viableCount: 1, failedCount: 0 });
    assert.equal(analyzedLinks.length, 1);
    assert.equal(analyzedLinks[0].presetId, 'optical');
    assert.equal(generatedLayers.length, 1);
    assert.equal(generatedLayers[0].feature.properties.color, '#00a000');
    assert.match(generatedLayers[0].popup, /VIÁVEL/);
    assert.match(alerts[0], /1 enlaces analisados/);
});
