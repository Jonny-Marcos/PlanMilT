/**
 * @fileoverview Consulta a previsão do tempo para o centro do mapa.
 * @exports window.PlanMilT.weatherForecast
 * @requires Cliente HTTP e SweetAlert2.
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.weatherForecast = (() => {
    const STYLES = `
        .swal2-popup.weather-forecast-popup{width:min(820px,calc(100vw - 28px))!important;padding:20px!important}
        .weather-forecast-popup .swal2-html-container{margin:12px 0 0;text-align:left}
        #weatherForecast{color:#243448;font-size:14px;line-height:1.45}
        #weatherForecast .weather-location{color:#66778a;font-size:12px;margin:0 0 12px}
        #weatherForecast .weather-current{display:flex;align-items:center;gap:18px;padding:18px 20px;border-radius:12px;background:#eaf3fb}
        #weatherForecast .weather-current-icon{font-size:38px;color:#527ba4;width:48px;text-align:center;flex-shrink:0}
        #weatherForecast .weather-current-info{min-width:0;flex:1}
        #weatherForecast .weather-eyebrow{font-size:12px;font-weight:600;color:#526c86}
        #weatherForecast .weather-temperature{font-size:30px;font-weight:700;line-height:1.2;color:#1c3e60}
        #weatherForecast .weather-current-detail{color:#425b72}
        #weatherForecast .weather-heading{margin:20px 0 10px;font-size:16px;font-weight:700}
        #weatherForecast .weather-heading span{font-size:12px;font-weight:400;color:#66778a}
        #weatherForecast .weather-days{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;list-style:none;padding:0;margin:0}
        #weatherForecast .weather-day{padding:12px;border:1px solid #dce5ed;border-radius:9px;background:#fff}
        #weatherForecast .weather-day-header{display:flex;justify-content:space-between;align-items:center;gap:8px}
        #weatherForecast .weather-day-header i{color:#527ba4;font-size:18px}
        #weatherForecast .weather-day-condition{margin:4px 0 8px;color:#52677b}
        #weatherForecast .weather-day-values{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px}
        #weatherForecast .weather-day-values span{min-width:0}
        #weatherForecast .weather-day-values i{color:#6284a3;margin-right:4px}
        #weatherForecast .weather-footer{margin:16px 0 0;color:#66778a;font-size:12px}
        @media(max-width:540px){#weatherForecast .weather-days{grid-template-columns:minmax(0,1fr)}#weatherForecast .weather-current{padding:14px;gap:12px}}
    `;

    /**
     * Traduz os códigos meteorológicos WMO usados pela Open-Meteo.
     * @param {number|null} code - Código meteorológico.
     * @returns {string} Descrição em português.
     */
    function describeWeather(code) {
        if (code === 0) return 'Céu limpo';
        if ([1, 2, 3].includes(code)) return 'Parcialmente nublado ou encoberto';
        if ([45, 48].includes(code)) return 'Nevoeiro';
        if ([51, 53, 55, 56, 57].includes(code)) return 'Garoa';
        if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Chuva';
        if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Neve';
        if ([95, 96, 99].includes(code)) return 'Tempestade';
        return 'Condição indisponível';
    }

    /**
     * Seleciona um ícone local para o código meteorológico.
     * @param {number|null} code - Código meteorológico.
     * @returns {string} Nome de classe Font Awesome.
     */
    function weatherIcon(code) {
        if (code === 0) return 'fa-sun';
        if ([1, 2, 3].includes(code)) return 'fa-cloud-sun';
        if ([45, 48].includes(code)) return 'fa-smog';
        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'fa-cloud-rain';
        if ([71, 73, 75, 77, 85, 86].includes(code)) return 'fa-snowflake';
        if ([95, 96, 99].includes(code)) return 'fa-bolt';
        return 'fa-cloud';
    }

    /**
     * Formata um valor numérico opcional sem inserir dados externos em HTML.
     * @param {number|null} value - Valor recebido.
     * @param {string} unit - Unidade de medida.
     * @returns {string} Valor formatado ou indicação de ausência.
     */
    function formatValue(value, unit) {
        return typeof value === 'number' && Number.isFinite(value)
            ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)} ${unit}`
            : 'Indisponível';
    }

    /**
     * Valida e formata uma data ISO local sem depender do fuso do navegador.
     * @param {string} value - Data ou data e hora do modelo.
     * @returns {string} Data formatada ou indicação de ausência.
     */
    function formatDate(value) {
        const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
        return match ? `${match[3]}/${match[2]}/${match[1]}${match[4] ? ` ${match[4]}:${match[5]}` : ''}` : 'Indisponível';
    }

    /**
     * Prepara o resultado da API para apresentação, exigindo sete dias.
     * @param {Object} data - Resposta da Open-Meteo.
     * @param {number} latitude - Latitude do centro consultado.
     * @param {number} longitude - Longitude do centro consultado.
     * @returns {string} HTML composto somente por valores validados.
     */
    function renderForecast(data, latitude, longitude) {
        const current = data?.current;
        const daily = data?.daily;
        const fields = ['time', 'weather_code', 'temperature_2m_min', 'temperature_2m_max',
            'precipitation_probability_max', 'wind_speed_10m_max'];
        if (!current || !daily || fields.some(field => !Array.isArray(daily[field]) || daily[field].length !== 7)
            || formatDate(current.time) === 'Indisponível'
            || daily.time.some(date => formatDate(date) === 'Indisponível')) {
            throw new Error('Resposta meteorológica incompleta.');
        }
        const days = daily.time.map((date, index) => `
            <li class="weather-day">
                <div class="weather-day-header"><strong>${formatDate(date)}</strong>
                    <i class="fas ${weatherIcon(daily.weather_code[index])}" aria-hidden="true"></i></div>
                <div class="weather-day-condition">${describeWeather(daily.weather_code[index])}</div>
                <div class="weather-day-values">
                    <span>Mín. ${formatValue(daily.temperature_2m_min[index], '°C')}</span>
                    <span>Máx. ${formatValue(daily.temperature_2m_max[index], '°C')}</span>
                    <span><i class="fas fa-tint" aria-hidden="true"></i>Chance de precipitação ${formatValue(daily.precipitation_probability_max[index], '%')}</span>
                    <span><i class="fas fa-wind" aria-hidden="true"></i>Vento máx. ${formatValue(daily.wind_speed_10m_max[index], 'km/h')}</span>
                </div>
            </li>`).join('');
        return `<style>${STYLES}</style><div id="weatherForecast">
            <p class="weather-location">Centro consultado: ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}° · Célula correspondente do modelo</p>
            <section class="weather-current" aria-label="Condições atuais estimadas">
                <i class="fas ${weatherIcon(current.weather_code)} weather-current-icon" aria-hidden="true"></i>
                <div class="weather-current-info">
                    <div class="weather-eyebrow">Condições atuais estimadas · ${formatDate(current.time)} (horário local)</div>
                    <div class="weather-temperature">${formatValue(current.temperature_2m, '°C')}</div>
                    <div class="weather-current-detail">${describeWeather(current.weather_code)} · Vento ${formatValue(current.wind_speed_10m, 'km/h')}</div>
                </div>
            </section>
            <h3 class="weather-heading">Previsão para 7 dias <span>inclui hoje · condições traduzidas</span></h3>
            <ul class="weather-days">${days}</ul>
            <p class="weather-footer">Dados de modelos meteorológicos, sujeitos a erros e alterações.
            Fonte: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>
            (<a href="https://open-meteo.com/en/licence" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>);</p>
        </div>`;
    }

    /**
     * Associa a consulta meteorológica ao botão da barra inferior.
     * @param {Object} options - Dependências do mapa e da interface.
     * @param {Object} options.map - Mapa Leaflet.
     * @param {HTMLElement} options.button - Botão de previsão.
     * @param {Object} options.sweetAlert - Serviço de diálogos.
     * @param {Object} options.apiClient - Cliente HTTP da aplicação.
     */
    function attach({ map, button, sweetAlert, apiClient }) {
        let busy = false;
        button.addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            try {
                if (navigator.onLine === false) {
                    await sweetAlert.fire('Meteorologia', 'A previsão do tempo requer conexão com a internet.', 'info');
                    return;
                }
                const center = map.getCenter();
                if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng) || Math.abs(center.lat) > 90) {
                    await sweetAlert.fire('Meteorologia', 'O centro do mapa não é uma coordenada válida.', 'error');
                    return;
                }
                const latitude = center.lat;
                const longitude = ((center.lng + 180) % 360 + 360) % 360 - 180;
                const controller = new AbortController();
                await sweetAlert.fire({
                    title: 'Previsão do tempo',
                    text: 'Consultando a previsão para o centro do mapa...',
                    showCloseButton: true,
                    showConfirmButton: false,
                    customClass: { popup: 'weather-forecast-popup' },
                    willClose: () => controller.abort(),
                    didOpen: async () => {
                        if (controller.signal.aborted) return;
                        const popup = sweetAlert.getPopup();
                        sweetAlert.showLoading();
                        try {
                            if (navigator.onLine === false) throw new Error('offline');
                            const params = new URLSearchParams({
                                latitude: String(latitude),
                                longitude: String(longitude),
                                current: 'temperature_2m,weather_code,wind_speed_10m',
                                daily: 'weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max',
                                timezone: 'auto',
                                forecast_days: '7'
                            });
                            const response = await apiClient.request(`https://api.open-meteo.com/v1/forecast?${params}`, {
                                credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
                                signal: controller.signal
                            });
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            const html = renderForecast(await response.json(), latitude, longitude);
                            if (controller.signal.aborted || sweetAlert.getPopup() !== popup) return;
                            sweetAlert.hideLoading();
                            sweetAlert.update({ html, showConfirmButton: true, confirmButtonText: 'Fechar' });
                        } catch (error) {
                            if (controller.signal.aborted || sweetAlert.getPopup() !== popup) return;
                            console.error('[PlanMilT][Meteorologia] Não foi possível consultar a previsão.');
                            sweetAlert.hideLoading();
                            sweetAlert.update({ icon: 'error', text: navigator.onLine === false
                                ? 'A previsão do tempo requer conexão com a internet.'
                                : 'Não foi possível obter a previsão. Verifique a conexão e tente novamente.',
                                showConfirmButton: true, confirmButtonText: 'Fechar' });
                        }
                    }
                });
            } finally {
                busy = false;
            }
        });
    }

    return Object.freeze({ attach });
})();
