/**
 * @fileoverview Consulta a previsão do tempo para o centro do mapa com autorização do usuário.
 * @exports window.PlanMilT.weatherForecast
 * @requires Cliente HTTP e SweetAlert2.
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.weatherForecast = (() => {
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
            <li><strong>${formatDate(date)}</strong> — ${describeWeather(daily.weather_code[index])};
                mín. ${formatValue(daily.temperature_2m_min[index], '°C')},
                máx. ${formatValue(daily.temperature_2m_max[index], '°C')};
                chance de precipitação ${formatValue(daily.precipitation_probability_max[index], '%')};
                vento máx. ${formatValue(daily.wind_speed_10m_max[index], 'km/h')}</li>`).join('');
        return `<div style="text-align:left">
            <p>Centro consultado: ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°.
            A previsão usa a célula do modelo correspondente.</p>
            <p><strong>Condições atuais estimadas</strong> (${formatDate(current.time)}, horário local):
            ${describeWeather(current.weather_code)}, ${formatValue(current.temperature_2m, '°C')};
            vento ${formatValue(current.wind_speed_10m, 'km/h')}.</p>
            <p><strong>Previsão para 7 dias</strong> (inclui hoje):</p>
            <ul>${days}</ul>
            <p>Dados de modelos meteorológicos, sujeitos a erros e alterações.
            Fonte: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>
            (<a href="https://open-meteo.com/en/licence" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>);
            dados formatados e códigos traduzidos pelo PlanMilT.</p>
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
                const result = await sweetAlert.fire({
                    title: 'Previsão do tempo',
                    text: 'Para consultar a previsão, as coordenadas do centro atual do mapa serão enviadas à Open-Meteo. Não prossiga se a localização for sensível.',
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: 'Consultar previsão',
                    cancelButtonText: 'Cancelar',
                    showLoaderOnConfirm: true,
                    allowOutsideClick: () => !sweetAlert.isLoading(),
                    preConfirm: async () => {
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
                                credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
                            });
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            return renderForecast(await response.json(), latitude, longitude);
                        } catch (error) {
                            console.error('[PlanMilT][Meteorologia] Não foi possível consultar a previsão.');
                            sweetAlert.showValidationMessage(navigator.onLine === false
                                ? 'A previsão do tempo requer conexão com a internet.'
                                : 'Não foi possível obter a previsão. Verifique a conexão e tente novamente.');
                            return false;
                        }
                    }
                });
                if (result.isConfirmed && typeof result.value === 'string') {
                    await sweetAlert.fire({ title: 'Previsão do tempo', html: result.value, confirmButtonText: 'Fechar' });
                }
            } finally {
                busy = false;
            }
        });
    }

    return Object.freeze({ attach });
})();
