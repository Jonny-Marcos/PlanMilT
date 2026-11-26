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

function setup({ online = true, response = forecast(), status = 200, requestHandler } = {}) {
    let click;
    const calls = [];
    const requests = [];
    const updates = [];
    const center = { lat: -21.5, lng: 308.7 };
    const navigator = { onLine: online };
    const popup = {};
    let activePopup;
    let close;
    const sweetAlert = {
        getPopup: () => activePopup,
        showLoading() {},
        hideLoading() {},
        update(options) { updates.push(options); close(); },
        async fire(options, ...args) {
            calls.push([options, ...args]);
            if (!options?.didOpen) return {};
            activePopup = popup;
            return new Promise(resolve => {
                close = () => resolve({});
                options.didOpen();
            });
        }
    };
    const context = {
        window: {}, navigator, URLSearchParams, Intl, AbortController,
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
                if (requestHandler) return requestHandler(url, options);
                return { ok: status >= 200 && status < 300, status, async json() { return response; } };
            }
        }
    });
    return {
        click: () => click(), calls, requests, updates, center, navigator,
        dismiss() { calls[0][0].willClose(); activePopup = null; close(); }
    };
}

test('consulta diretamente e mostra sete dias no centro do mapa', async () => {
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
    assert.equal(fixture.calls.length, 1);
    assert.match(fixture.calls[0][0].text, /Consultando/);
    assert.equal(fixture.calls[0][0].preConfirm, undefined);
    const html = fixture.updates[0].html;
    assert.match(html, /Condições atuais estimadas/);
    assert.match(html, /27,5 °C/);
    assert.match(html, /Chance de precipitação/);
    assert.match(html, /Indisponível/);
    assert.equal((html.match(/<li class="weather-day">/g) || []).length, 7);
    assert.match(html, /open-meteo\.com/);
    assert.match(html, /weather-current/);
    assert.match(html, /fa-cloud-rain/);
    assert.match(html, /@media\(max-width:540px\)/);
    assert.doesNotMatch(html, /dados formatados e códigos traduzidos pelo PlanMilT/);
});

test('modo offline não envia coordenadas', async () => {
    const offline = setup({ online: false });
    await offline.click();
    assert.equal(offline.requests.length, 0);
    assert.match(offline.calls[0][1], /internet/);
});

test('falhas HTTP e respostas incompletas são exibidas sem mostrar previsão', async () => {
    for (const fixture of [setup({ status: 429 }), setup({ response: { current: {} } })]) {
        await fixture.click();
        assert.equal(fixture.calls.length, 1);
        assert.match(fixture.updates[0].text, /Não foi possível obter a previsão/);
        assert.equal(fixture.updates[0].icon, 'error');
    }
});

test('valores externos não são inseridos como HTML', async () => {
    const data = forecast();
    data.current.temperature_2m = '<img src=x onerror=alert(1)>';
    data.daily.weather_code[0] = '<script>alert(1)</script>';
    const fixture = setup({ response: data });
    await fixture.click();
    assert.doesNotMatch(fixture.updates[0].html, /<img|<script/);
    assert.match(fixture.updates[0].html, /Indisponível/);
});

test('fechar durante a consulta cancela a requisição e impede atualização tardia', async () => {
    let finish;
    const fixture = setup({ requestHandler: () => new Promise(resolve => { finish = resolve; }) });
    const pending = fixture.click();
    assert.equal(fixture.requests.length, 1);
    fixture.dismiss();
    assert.equal(fixture.requests[0].options.signal.aborted, true);
    finish({ ok: true, json: async () => forecast() });
    await pending;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.updates.length, 0);
});

test('botão e módulo são carregados junto às ferramentas do mapa', () => {
    const toolbar = read('js/features/main.js');
    assert.match(toolbar, /id="linkPredictionBtn"[^]*?id="weatherForecastButton"[^]*?id="helpButton"/);
    assert.match(read('js/features/map-tools.js'), /weatherForecast\.attach/);
    const index = read('index.html');
    assert.ok(index.indexOf('js/features/weather-forecast.js') < index.indexOf('js/features/map-tools.js'));
});
