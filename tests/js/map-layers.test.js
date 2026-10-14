const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};

function createLayer(name, title) {
    return {
        getElementsByTagName(tagName) {
            if (tagName === 'Name') return name ? [{ textContent: name }] : [];
            if (tagName === 'Title') return title ? [{ textContent: title }] : [];
            return [];
        }
    };
}

global.DOMParser = class {
    parseFromString(xmlText) {
        return {
            getElementsByTagName(tagName) {
                if (tagName === 'parsererror') return xmlText === 'invalid' ? [{}] : [];
                if (tagName === 'Layer') {
                    return [
                        createLayer('root', 'Root'),
                        createLayer('zulu', 'Zulu'),
                        createLayer('alpha', 'Alpha')
                    ];
                }
                return [];
            }
        };
    }
};

require('../../js/features/api-client.js');
require('../../js/features/map-layers.js');

const apiClient = window.PlanMilT.apiClient;
const mapLayers = window.PlanMilT.mapLayers;

test('getText returns a successful text response', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, status: 200, text: async () => '<Capabilities />' });

    try {
        assert.equal(await apiClient.getText('/proxy.php'), '<Capabilities />');
    } finally {
        global.fetch = originalFetch;
    }
});

test('getText rejects unsuccessful HTTP responses', async () => {
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    const logged = [];
    global.fetch = async () => ({ ok: false, status: 502, text: async () => 'upstream error' });
    console.error = (...args) => logged.push(args);

    try {
        await assert.rejects(apiClient.getText('/proxy.php'), /HTTP 502/);
        assert.equal(logged.length, 1);
        assert.equal(logged[0][1].status, 502);
        assert.equal(logged[0][1].endpoint, '/proxy.php');
    } finally {
        global.fetch = originalFetch;
        console.error = originalConsoleError;
    }
});

test('WMS parsing skips the root layer and sorts by title', () => {
    const layers = mapLayers.parseWMSCapabilities('valid');

    assert.deepEqual(layers.map(layer => layer.Name), ['alpha', 'zulu']);
});

test('WMS loading sends a capabilities request through the proxy', async () => {
    let requestedURL;
    const requestClient = {
        async getText(url) {
            requestedURL = url;
            return 'valid';
        }
    };

    const layers = await mapLayers.getWMSLayers('https://maps.example/wms', {
        apiClient: requestClient,
        onError: error => { throw error; }
    });

    assert.match(requestedURL, /^\/proxy\.php\?url=/);
    assert.match(decodeURIComponent(requestedURL.split('url=')[1]), /service=WMS&request=GetCapabilities/);
    assert.deepEqual(layers.map(layer => layer.Name), ['alpha', 'zulu']);
});

test('WMS loading reports transport failures', async () => {
    const errors = [];
    const requestClient = {
        async getText() {
            throw new Error('upstream unavailable');
        }
    };

    const layers = await mapLayers.getWMSLayers('https://maps.example/wms', {
        apiClient: requestClient,
        onError: error => errors.push(error)
    });

    assert.equal(layers, null);
    assert.match(errors[0].message, /upstream unavailable/);
});

test('WMS loading reports XML parsing failures', async () => {
    const errors = [];
    const requestClient = {
        async getText() {
            return 'invalid';
        }
    };

    const layers = await mapLayers.getWMSLayers('https://maps.example/wms', {
        apiClient: requestClient,
        onError: error => errors.push(error)
    });

    assert.equal(layers, null);
    assert.match(errors[0].message, /inválida/);
    assert.throws(() => mapLayers.parseWMSCapabilities('invalid'), /inválida/);
});