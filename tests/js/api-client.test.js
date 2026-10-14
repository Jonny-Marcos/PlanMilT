const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/api-client.js');

const apiClient = window.PlanMilT.apiClient;

test('postJson sends a JSON POST with the standard content type', async () => {
    const originalFetch = global.fetch;
    let request;
    global.fetch = async (url, options) => {
        request = { url, options };
        return { ok: true, status: 200, json: async () => ({ points: [] }) };
    };

    try {
        const payload = { points: [{ latitude: 1, longitude: 2 }] };
        const result = await apiClient.postJson('elevation_profile.php', payload);

        assert.equal(request.url, 'elevation_profile.php');
        assert.equal(request.options.method, 'POST');
        assert.equal(request.options.headers['Content-Type'], 'application/json');
        assert.equal(request.options.body, JSON.stringify(payload));
        assert.deepEqual(result, { points: [] });
    } finally {
        global.fetch = originalFetch;
    }
});

test('postJson propagates HTTP and API errors', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid payload' })
    });

    try {
        await assert.rejects(apiClient.postJson('/endpoint.php', {}), /Invalid payload/);
    } finally {
        global.fetch = originalFetch;
    }
});