const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function forecast() {
    return {
        current: { time: '2026-11-26T14:30', temperature_2m: 27.5, weather_code: 3, wind_speed_10m: 12 },
        daily: {
            time: ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29',
                '2026-11-30', '2026-12-01', '2026-12-02'],
            weather_code: [0, 3, 61, 95, 45, 80, 2],
            temperature_2m_min: [18, 19, 20, 21, 22, 23, 24],
            temperature_2m_max: [28, 29, 30, 31, 32, 33, 34],
            precipitation_probability_max: [0, 10, 20, 30, 40, 50, null],
            wind_speed_10m_max: [10, 11, 12, 13, 14, 15, 16]
        }
    };
}

function setup({ online = true, response = forecast(), status = 200, cancel = false } = {}) {
    let click;
    const calls = [];
    const requests = [];
    const validations = [];
    const center = { lat: -21.5, lng: 308.7 };
    const navigator = { onLine: online };
    const sweetAlert = {
        isLoading: () => false,
        showValidationMessage(message) { validations.push(message); },
        async fire(options, ...args) {
            calls.push([options, ...args]);
            if (options?.preConfirm) {
                if (cancel) return { isConfirmed: false };
                const value = await options.preConfirm();
                return { isConfirmed: value !== false, value };
            }
            return {};
        }
    };
    const context = {
        window: {}, navigator, URLSearchParams, Intl,
        console: { error() {} }
    };
    vm.runInNewContext(read('js/features/weather-forecast.js'), context);
    context.window.PlanMilT.weatherForecast.attach({
        map: { getCenter: () => center },
        button: { addEventListener(event, listener) { assert.equal(event, 'click'); click = listener; } },
        sweetAlert,
        apiClient: {
            async request(url, options) {
                requests.push({ url, options });
                return { ok: status >= 200 && status < 300, status, async json() { return response; } };
            }
        }
    });
    return { click: () => click(), calls, requests, validations, center, navigator };
}

test('consulta somente após confirmação e mostra sete dias no centro do mapa', async () => {
    const fixture = setup();
    await fixture.click();

    assert.equal(fixture.requests.length, 1);
    const request = fixture.requests[0];
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://api.open-meteo.com');
    assert.equal(url.searchParams.get('latitude'), '-21.5');
    assert.ok(Math.abs(Number(url.searchParams.get('longitude')) - (-51.3)) < 1e-9);
    assert.equal(url.searchParams.get('forecast_days'), '7');
    assert.equal(url.searchParams.get('timezone'), 'auto');
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.cache, 'no-store');
    assert.equal(request.options.referrerPolicy, 'no-referrer');
    assert.match(fixture.calls[0][0].text, /coordenadas.*Open-Meteo/);
    const html = fixture.calls[1][0].html;
    assert.match(html, /Condições atuais estimadas/);
    assert.match(html, /27,5 °C/);
    assert.match(html, /chance de precipitação/);
    assert.match(html, /Indisponível/);
    assert.equal((html.match(/<li>/g) || []).length, 7);
    assert.match(html, /open-meteo\.com/);
});

test('cancelamento e modo offline não enviam coordenadas', async () => {
    const cancelled = setup({ cancel: true });
    await cancelled.click();
    assert.equal(cancelled.requests.length, 0);
    assert.equal(cancelled.calls.length, 1);

    const offline = setup({ online: false });
    await offline.click();
    assert.equal(offline.requests.length, 0);
    assert.match(offline.calls[0][1], /internet/);
});

test('falhas HTTP e respostas incompletas são exibidas sem mostrar previsão', async () => {
    for (const fixture of [setup({ status: 429 }), setup({ response: { current: {} } })]) {
        await fixture.click();
        assert.equal(fixture.calls.length, 1);
        assert.match(fixture.validations[0], /Não foi possível obter a previsão/);
    }
});

test('valores externos não são inseridos como HTML', async () => {
    const data = forecast();
    data.current.temperature_2m = '<img src=x onerror=alert(1)>';
    data.daily.weather_code[0] = '<script>alert(1)</script>';
    const fixture = setup({ response: data });
    await fixture.click();
    assert.doesNotMatch(fixture.calls[1][0].html, /<img|<script/);
    assert.match(fixture.calls[1][0].html, /Indisponível/);
});

test('botão e módulo são carregados junto às ferramentas do mapa', () => {
    const toolbar = read('js/features/main.js');
    assert.match(toolbar, /id="linkPredictionBtn"[^]*?id="weatherForecastButton"[^]*?id="helpButton"/);
    assert.match(read('js/features/map-tools.js'), /weatherForecast\.attach/);
    const index = read('index.html');
    assert.ok(index.indexOf('js/features/weather-forecast.js') < index.indexOf('js/features/map-tools.js'));
});
