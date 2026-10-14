const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/api-client.js');

const apiClient = window.PlanMilT.apiClient;

test('postJson sends a JSON POST with the standard content type', async () => {
    const originalFetch = global.fetch;
    const originalConsoleInfo = console.info;
    const logged = [];
    let request;
    global.fetch = async (url, options) => {
        request = { url, options };
        return { ok: true, status: 200, json: async () => ({ points: [] }) };
    };
    console.info = (...args) => logged.push(args);

    try {
        const payload = { points: [{ latitude: 1, longitude: 2 }] };
        const result = await apiClient.postJson('elevation-profile.php', payload);

        assert.equal(request.url, 'elevation-profile.php');
        assert.equal(request.options.method, 'POST');
        assert.equal(request.options.headers['Content-Type'], 'application/json');
        assert.equal(request.options.body, JSON.stringify(payload));
        assert.deepEqual(result, { points: [] });
        assert.deepEqual(logged, [[
            '[PlanMilT][API] Resposta HTTP recebida.',
            { method: 'POST', endpoint: 'elevation-profile.php', status: 200, ok: true }
        ]]);
    } finally {
        global.fetch = originalFetch;
        console.info = originalConsoleInfo;
    }
});

test('request logs HTTP status without query values and returns the response', async () => {
    const originalFetch = global.fetch;
    const originalConsoleWarn = console.warn;
    const logged = [];
    const response = { ok: false, status: 400 };
    global.fetch = async () => response;
    console.warn = (...args) => logged.push(args);

    try {
        assert.equal(await apiClient.request('/data?token=private'), response);
        assert.deepEqual(logged, [[
            '[PlanMilT][API] Resposta HTTP recebida.',
            { method: 'GET', endpoint: '/data', status: 400, ok: false }
        ]]);
        assert.doesNotMatch(JSON.stringify(logged), /private/);
    } finally {
        global.fetch = originalFetch;
        console.warn = originalConsoleWarn;
    }
});

test('postJson propagates HTTP and API errors', async () => {
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    const logged = [];
    global.fetch = async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid payload' })
    });
    console.error = (...args) => logged.push(args);

    try {
        await assert.rejects(apiClient.postJson('/endpoint.php', {}), /Invalid payload/);
        assert.equal(logged.length, 1);
        assert.equal(logged[0][0], '[PlanMilT][API] Problema na requisição.');
        assert.deepEqual(logged[0][1], {
            method: 'POST',
            endpoint: '/endpoint.php',
            problem: 'Invalid payload',
            status: 400
        });
    } finally {
        global.fetch = originalFetch;
        console.error = originalConsoleError;
    }
});

test('getJson logs network failures without exposing query parameter values', async () => {
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    const logged = [];
    global.fetch = async () => {
        throw new TypeError('Failed to fetch https://example.test/data?token=secret');
    };
    console.error = (...args) => logged.push(args);

    try {
        await assert.rejects(apiClient.getJson('/data?token=secret'), /Failed to fetch/);
        assert.equal(logged.length, 1);
        assert.deepEqual(logged[0][1], {
            method: 'GET',
            endpoint: '/data',
            problem: 'Falha de rede.',
            errorName: 'TypeError',
            errorMessage: 'Failed to fetch https://example.test/data?token=[redigido]'
        });
        assert.doesNotMatch(JSON.stringify(logged), /secret/);
    } finally {
        global.fetch = originalFetch;
        console.error = originalConsoleError;
    }
});

test('getJson logs invalid JSON responses without logging their contents', async () => {
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    const logged = [];
    global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => {
            throw new SyntaxError('Invalid JSON containing private response data');
        }
    });
    console.error = (...args) => logged.push(args);

    try {
        await assert.rejects(apiClient.getJson('/endpoint.php'), /Resposta JSON inválida/);
        assert.equal(logged.length, 1);
        assert.deepEqual(logged[0][1], {
            method: 'GET',
            endpoint: '/endpoint.php',
            problem: 'Resposta JSON inválida (HTTP 200).',
            status: 200,
            parseErrorName: 'SyntaxError'
        });
        assert.doesNotMatch(JSON.stringify(logged), /private response data/);
    } finally {
        global.fetch = originalFetch;
        console.error = originalConsoleError;
    }
});

test('getText logs HTTP failures with status and endpoint', async () => {
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    const logged = [];
    global.fetch = async () => ({
        ok: false,
        status: 502,
        text: async () => 'upstream failure'
    });
    console.error = (...args) => logged.push(args);

    try {
        await assert.rejects(apiClient.getText('/proxy.php?url=private'), /HTTP 502/);
        assert.deepEqual(logged[0][1], {
            method: 'GET',
            endpoint: '/proxy.php',
            problem: 'Falha na requisição (HTTP 502).',
            status: 502
        });
        assert.doesNotMatch(JSON.stringify(logged), /private/);
    } finally {
        global.fetch = originalFetch;
        console.error = originalConsoleError;
    }
});