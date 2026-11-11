/**
 * @fileoverview Apresenta coordenadas, elevação local e acesso externo ao Street View para um ponto do mapa.
 * @exports window.PlanMilT.mapPointInfo
 * @requires Leaflet, proj4 e cliente HTTP injetados
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.mapPointInfo = Object.freeze({
    /**
     * Registra a consulta por botão direito ou toque prolongado.
     * @param {Object} dependencies - Mapa, Leaflet, projeção e cliente HTTP.
     */
    attach({ map, leaflet, projection, apiClient }) {
        const container = map.getContainer();
        let drawing = false;
        let touchTimer = null;
        let touchResetTimer = null;
        let touchStart = null;
        let touchOpened = false;

        /**
         * Formata uma coordenada em graus, minutos e segundos.
         * @param {number} value - Coordenada em graus decimais.
         * @param {boolean} latitude - Indica se a coordenada é latitude.
         * @returns {string} Coordenada formatada com hemisfério.
         */
        function formatDms(value, latitude) {
            const seconds = Math.round(Math.abs(value) * 360000) / 100;
            const degrees = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds - degrees * 3600) / 60);
            const remainder = seconds - degrees * 3600 - minutes * 60;
            const hemisphere = latitude ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'O' : 'L');
            return `${degrees}° ${minutes}′ ${remainder.toFixed(2)}″ ${hemisphere}`;
        }

        /**
         * Converte um ponto WGS84 para UTM, considerando zonas especiais.
         * @param {number} latitude - Latitude em graus.
         * @param {number} longitude - Longitude normalizada em graus.
         * @returns {string} Coordenada UTM ou aviso de indisponibilidade.
         */
        function formatUtm(latitude, longitude) {
            if (latitude < -80 || latitude >= 84) return 'Indisponível fora da faixa UTM (80° S a 84° N)';
            let zone = Math.min(60, Math.floor((longitude + 180) / 6) + 1);
            if (latitude >= 56 && latitude < 64 && longitude >= 3 && longitude < 12) zone = 32;
            if (latitude >= 72 && latitude < 84 && longitude >= 0 && longitude < 42) {
                if (longitude < 9) zone = 31;
                else if (longitude < 21) zone = 33;
                else if (longitude < 33) zone = 35;
                else zone = 37;
            }
            const south = latitude < 0;
            const definition = `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
            const [east, north] = projection('EPSG:4326', definition, [longitude, latitude]);
            if (!Number.isFinite(east) || !Number.isFinite(north)) throw new Error('Não foi possível converter as coordenadas UTM.');
            return `Zona ${zone}${south ? 'S' : 'N'} · E ${east.toFixed(0)} m · N ${north.toFixed(0)} m`;
        }

        /**
         * Exibe os dados imediatamente e consulta a elevação sem bloquear o mapa.
         * @param {Object} latlng - Ponto geográfico Leaflet.
         */
        async function showPoint(latlng) {
            const latitude = latlng.lat;
            const longitude = latlng.lng >= -180 && latlng.lng <= 180
                ? latlng.lng
                : ((latlng.lng + 180) % 360 + 360) % 360 - 180;
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90) {
                console.error('[PlanMilT][Mapa] Coordenada inválida.');
                return;
            }
            const content = document.createElement('div');
            content.className = 'map-point-info';
            const heading = document.createElement('strong');
            heading.textContent = 'Dados do ponto';
            content.appendChild(heading);

            /**
             * Acrescenta uma linha de dados ao popup.
             * @param {string} label - Nome do dado.
             * @param {string} value - Valor a apresentar.
             * @returns {HTMLElement} Elemento de valor para atualizações.
             */
            function addRow(label, value) {
                const row = document.createElement('div');
                const title = document.createElement('strong');
                const text = document.createElement('span');
                title.textContent = `${label}: `;
                text.textContent = value;
                row.appendChild(title);
                row.appendChild(text);
                content.appendChild(row);
                return text;
            }

            addRow('Decimal (WGS84)', `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
            addRow('Graus, minutos e segundos', `${formatDms(latitude, true)}, ${formatDms(longitude, false)}`);
            try {
                addRow('UTM (WGS84)', formatUtm(latitude, longitude));
            } catch (error) {
                console.error('[PlanMilT][Mapa] Falha ao converter coordenadas UTM.', error);
                addRow('UTM (WGS84)', 'Não foi possível calcular.');
            }
            const elevation = addRow('Elevação SRTM', 'Consultando…');
            elevation.setAttribute('aria-live', 'polite');
            const link = document.createElement('a');
            link.href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(`${latitude},${longitude}`)}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Abrir Street View no Google Maps';
            content.appendChild(link);
            leaflet.popup().setLatLng(latlng).setContent(content).openOn(map);

            try {
                const response = await apiClient.postJson('elevation-profile.php', {
                    points: [{ latitude, longitude }]
                });
                const value = Array.isArray(response) && response.length === 1 && response[0] && response[0].elevation;
                if (typeof value !== 'number' || !Number.isFinite(value) || value === -32768) {
                    throw new Error('Elevação indisponível para este ponto.');
                }
                elevation.textContent = `${value} m`;
            } catch (error) {
                console.error('[PlanMilT][Mapa] Falha ao consultar a elevação.', error);
                elevation.textContent = 'Indisponível; verifique os arquivos de elevação.';
            }
        }

        /**
         * Cancela o temporizador de toque prolongado pendente.
         */
        function cancelTouch() {
            clearTimeout(touchTimer);
            touchTimer = null;
        }

        map.on('draw:drawstart draw:editstart draw:deletestart', () => { drawing = true; cancelTouch(); });
        map.on('draw:drawstop draw:editstop draw:deletestop', () => { drawing = false; });
        map.on('contextmenu', event => {
            cancelTouch();
            if (drawing || container.style.cursor === 'crosshair' || touchOpened) return;
            if (touchStart) touchOpened = true;
            showPoint(event.latlng);
        });
        container.addEventListener('touchstart', event => {
            cancelTouch();
            clearTimeout(touchResetTimer);
            touchOpened = false;
            touchStart = null;
            if (drawing || container.style.cursor === 'crosshair' || event.touches.length !== 1 ||
                event.target.closest('.leaflet-control, .leaflet-popup')) return;
            const touch = event.touches[0];
            touchStart = { x: touch.clientX, y: touch.clientY, latlng: map.mouseEventToLatLng(touch) };
            touchTimer = setTimeout(() => {
                touchOpened = true;
                showPoint(touchStart.latlng);
            }, 650);
        }, { passive: true });
        container.addEventListener('touchmove', event => {
            if (!touchStart || event.touches.length !== 1 ||
                Math.hypot(event.touches[0].clientX - touchStart.x, event.touches[0].clientY - touchStart.y) > 10) {
                cancelTouch();
            }
        }, { passive: true });
        container.addEventListener('touchend', event => {
            cancelTouch();
            if (touchOpened) event.preventDefault();
            touchStart = null;
            touchResetTimer = setTimeout(() => { touchOpened = false; }, 800);
        }, { passive: false });
        container.addEventListener('touchcancel', () => {
            cancelTouch();
            clearTimeout(touchResetTimer);
            touchStart = null;
            touchOpened = false;
        }, { passive: true });
    }
});
