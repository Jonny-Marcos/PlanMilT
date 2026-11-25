/**
 * @fileoverview Impressão do mapa em folhas A4/A3, com escala fixa ou zoom atual, escala gráfica e rodapé.
 * @exports window.PlanMilT.mapPrint
 * @requires Leaflet, leaflet.browser.print e SweetAlert2
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.mapPrint = (() => {
    const PAPER_SIZES_MM = Object.freeze({
        A4: Object.freeze({ width: 210, height: 297 }),
        A3: Object.freeze({ width: 297, height: 420 })
    });
    const PAGE_MARGIN_MM = 10;
    const FOOTER_HEIGHT_MM = 8;
    // O plugin reserva a altura do rodapé mais 1 mm ao calcular a altura do mapa.
    const FOOTER_RESERVED_MM = FOOTER_HEIGHT_MM + 1;
    const CSS_PIXELS_PER_MM = 96 / 25.4;
    const METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392804097;
    const SCALE_PRESETS = Object.freeze([5000, 10000, 25000, 50000, 100000, 250000, 500000]);
    const MIN_SCALE = 1000;
    const MAX_SCALE = 5000000;
    const ORIENTATION_LABELS = Object.freeze({ portrait: 'retrato', landscape: 'paisagem' });

    /**
     * Calcula a área do mapa impresso dentro das margens da folha.
     * @param {string} paper - Folha (`A4` ou `A3`).
     * @param {string} orientation - `portrait` ou `landscape`.
     * @param {boolean} withFooter - Indica se o rodapé reduz a altura do mapa.
     * @returns {{width: number, height: number}} Dimensões em milímetros.
     */
    function getMapAreaMm(paper, orientation, withFooter) {
        const size = PAPER_SIZES_MM[paper];
        if (!size) throw new Error('Folha não suportada.');
        const short = size.width - 2 * PAGE_MARGIN_MM;
        const long = size.height - 2 * PAGE_MARGIN_MM;
        const footer = withFooter ? FOOTER_RESERVED_MM : 0;
        return orientation === 'landscape'
            ? { width: long, height: short - footer }
            : { width: short, height: long - footer };
    }

    /**
     * Converte o zoom Web Mercator na escala de impressão a 96 dpi CSS.
     * @param {number} zoom - Nível de zoom do Leaflet.
     * @param {number} latitude - Latitude em graus onde a escala é exata.
     * @returns {number} Denominador da escala (1:N).
     */
    function scaleForZoom(zoom, latitude) {
        const metersPerPixel = METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos(latitude * Math.PI / 180) / 2 ** zoom;
        return metersPerPixel * CSS_PIXELS_PER_MM * 1000;
    }

    /**
     * Calcula o zoom (possivelmente fracionário) que produz a escala pedida.
     * @param {number} scale - Denominador da escala (1:N).
     * @param {number} latitude - Latitude em graus onde a escala é exata.
     * @returns {number} Nível de zoom do Leaflet.
     */
    function zoomForScale(scale, latitude) {
        const metersPerPixel = scale / 1000 / CSS_PIXELS_PER_MM;
        return Math.log2(METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos(latitude * Math.PI / 180) / metersPerPixel);
    }

    /**
     * Calcula a extensão do terreno coberta pela área impressa.
     * @param {number} scale - Denominador da escala (1:N).
     * @param {{width: number, height: number}} areaMm - Área do mapa em milímetros.
     * @returns {{width: number, height: number}} Dimensões em metros.
     */
    function getGroundSizeMeters(scale, areaMm) {
        return { width: areaMm.width * scale / 1000, height: areaMm.height * scale / 1000 };
    }

    /**
     * Arredonda uma escala aproximada a três algarismos significativos.
     * @param {number} scale - Denominador da escala.
     * @returns {number} Denominador arredondado.
     */
    function roundScale(scale) {
        const step = 10 ** Math.max(0, Math.floor(Math.log10(scale)) - 2);
        return Math.round(scale / step) * step;
    }

    /**
     * Formata uma escala como `1:50.000`.
     * @param {number} scale - Denominador da escala.
     * @returns {string} Escala formatada.
     */
    function formatScale(scale) {
        return `1:${Math.round(scale).toLocaleString('pt-BR')}`;
    }

    /**
     * Formata uma distância em metros ou quilômetros.
     * @param {number} meters - Distância em metros.
     * @returns {string} Distância formatada.
     */
    function formatDistance(meters) {
        if (meters < 1000) return `${Math.round(meters).toLocaleString('pt-BR')} m`;
        return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
    }

    /**
     * Valida as escolhas do formulário e resolve escala e zoom de impressão.
     * @param {Object} input - Valores do formulário (`paper`, `orientation`, `scaleChoice`, `customScale`, `footer`).
     * @param {Object} context - Contexto do mapa (`latitude`, `currentZoom`, `minZoom`, `maxZoom`).
     * @returns {{settings?: Object, error?: string}} Configuração pronta ou mensagem de erro.
     */
    function resolveSettings(input, context) {
        if (!PAPER_SIZES_MM[input.paper]) return { error: 'Escolha a folha A4 ou A3.' };
        if (!ORIENTATION_LABELS[input.orientation]) return { error: 'Escolha a orientação da folha.' };
        let scale;
        let zoom;
        let approximate = false;
        if (input.scaleChoice === 'current') {
            zoom = context.currentZoom;
            scale = scaleForZoom(zoom, context.latitude);
            approximate = true;
        } else {
            scale = input.scaleChoice === 'custom' ? Number(input.customScale) : Number(input.scaleChoice);
            if (!Number.isInteger(scale) || scale < MIN_SCALE || scale > MAX_SCALE) {
                return { error: `Informe uma escala inteira entre ${formatScale(MIN_SCALE)} e ${formatScale(MAX_SCALE)}.` };
            }
            zoom = zoomForScale(scale, context.latitude);
            if (zoom < context.minZoom || zoom > context.maxZoom) {
                return { error: 'Esta escala não pode ser obtida no zoom suportado pelo mapa nesta latitude.' };
            }
        }
        const footer = Boolean(input.footer);
        const areaMm = getMapAreaMm(input.paper, input.orientation, footer);
        return {
            settings: {
                paper: input.paper, orientation: input.orientation, scale, zoom, approximate, footer,
                areaMm, groundMeters: getGroundSizeMeters(scale, areaMm)
            }
        };
    }

    /**
     * Monta o texto do rodapé da folha impressa.
     * @param {Object} settings - Configuração resolvida da impressão.
     * @param {Date} [date] - Data de impressão.
     * @returns {string} Texto simples do rodapé.
     */
    function buildFooterText(settings, date = new Date()) {
        const scale = settings.approximate ? `Escala aproximada ${formatScale(roundScale(settings.scale))}`
            : `Escala ${formatScale(settings.scale)}`;
        return `${scale} · Folha ${settings.paper} ${ORIENTATION_LABELS[settings.orientation]} · `
            + `Impresso em ${date.toLocaleDateString('pt-BR')}`;
    }

    /**
     * Cria o modo do plugin de impressão para a configuração escolhida.
     * @param {Object} leaflet - Namespace Leaflet com `BrowserPrint`.
     * @param {Object} settings - Configuração resolvida da impressão.
     * @returns {Object} Modo de impressão do plugin.
     */
    function buildMode(leaflet, settings) {
        const factory = settings.orientation === 'landscape'
            ? leaflet.BrowserPrint.Mode.Landscape : leaflet.BrowserPrint.Mode.Portrait;
        return factory(settings.paper, {
            title: `${settings.paper} ${ORIENTATION_LABELS[settings.orientation]}`,
            margin: PAGE_MARGIN_MM,
            zoom: settings.zoom,
            footer: {
                enabled: settings.footer, text: buildFooterText(settings),
                size: `${FOOTER_HEIGHT_MM}mm`, overTheMap: false
            }
        });
    }

    /**
     * Faz o plugin usar milímetros físicos, sem multiplicar a folha por `devicePixelRatio`.
     * @param {Object} helper - `L.BrowserPrint.Helper`.
     */
    function ignorePixelRatio(helper) {
        if (helper.pixelRatioIgnored) return;
        const original = helper.getSize;
        helper.getSize = function getSizeWithoutPixelRatio(mode, orientation) {
            const size = original.call(this, mode, orientation);
            const ratio = window.devicePixelRatio || 1;
            const toMm = value => `${Math.round(parseFloat(value) / ratio * 1000) / 1000}mm`;
            return { Width: toMm(size.Width), Height: toMm(size.Height) };
        };
        helper.pixelRatioIgnored = true;
    }

    /**
     * Gera o HTML do formulário de impressão.
     * @param {Object} context - Escala aproximada atual e orientação inicial.
     * @returns {string} HTML com estilos próprios do diálogo.
     */
    function buildDialogHtml({ currentScale, orientation }) {
        const selected = value => (value === orientation ? ' selected' : '');
        const presets = SCALE_PRESETS.map(value => `<option value="${value}">${formatScale(value)}</option>`).join('');
        return `<style>
.swal2-popup.map-print-modal{width:min(460px,calc(100vw - 28px))!important;padding:20px!important}
#mapPrintDialog{text-align:left;font:14px/1.45 sans-serif;color:#27364a}
#mapPrintDialog label{display:block;margin:10px 0 4px;font-size:13px;font-weight:600}
#mapPrintDialog select,#mapPrintDialog input[type=number]{box-sizing:border-box;width:100%;height:40px;margin:0;padding:6px;border:1px solid #c5cad2;border-radius:6px;font:inherit}
#mapPrintDialog .map-print-check{display:flex;align-items:center;gap:8px;font-weight:400}
#mapPrintDialog .map-print-check input{width:17px;height:17px;margin:0;accent-color:#435f88}
#mapPrintDialog #mapPrintSummary{margin:12px 0 6px;padding:8px 10px;background:#eef1f5;border-radius:6px}
#mapPrintDialog .map-print-hint{margin:6px 0 0;font-size:12px;color:#5b6778}
</style><div id="mapPrintDialog">
<label for="mapPrintPaper">Folha</label>
<select id="mapPrintPaper"><option value="A4">A4 (210 × 297 mm)</option><option value="A3">A3 (297 × 420 mm)</option></select>
<label for="mapPrintOrientation">Orientação</label>
<select id="mapPrintOrientation"><option value="portrait"${selected('portrait')}>Retrato</option><option value="landscape"${selected('landscape')}>Paisagem</option></select>
<label for="mapPrintScale">Escala</label>
<select id="mapPrintScale"><option value="current">Zoom atual da tela (≈ ${formatScale(roundScale(currentScale))})</option>${presets}<option value="custom">Outra escala…</option></select>
<input id="mapPrintCustomScale" type="number" min="${MIN_SCALE}" max="${MAX_SCALE}" step="1" placeholder="Ex.: 40000" aria-label="Denominador da escala" hidden>
<label class="map-print-check"><input id="mapPrintFooter" type="checkbox" checked> Incluir escala gráfica e rodapé com a escala</label>
<p id="mapPrintSummary" role="status"></p>
<p class="map-print-hint">A impressão é centralizada no centro do mapa visível. A escala é exata na latitude desse centro. Na janela do navegador, use o mesmo papel e orientação, escala 100 % (sem “ajustar à página”) e desative cabeçalhos e rodapés.</p>
</div>`;
    }

    /**
     * Liga o controle de impressão ao mapa.
     * @param {Object} dependencies - Mapa, Leaflet e SweetAlert2.
     * @returns {{control: Object, open: Function, print: Function}} Controle criado e ações disponíveis.
     */
    function attach({ map, leaflet, Swal }) {
        ignorePixelRatio(leaflet.BrowserPrint.Helper);
        const printer = leaflet.browserPrint(map, { documentTitle: 'Planejamento PlanMilT', closePopupsOnPrint: true });
        let pending = null;
        let savedZoomSnap;
        let snapOverridden = false;

        /** Permite zoom fracionário apenas na criação do mapa de impressão. */
        function allowFractionalZoom() {
            savedZoomSnap = Object.prototype.hasOwnProperty.call(map.options, 'zoomSnap')
                ? map.options.zoomSnap : undefined;
            map.options.zoomSnap = 0;
            snapOverridden = true;
        }

        /** Restaura o ajuste de zoom do mapa principal. */
        function restoreZoomSnap() {
            if (!snapOverridden) return;
            if (savedZoomSnap === undefined) delete map.options.zoomSnap;
            else map.options.zoomSnap = savedZoomSnap;
            snapOverridden = false;
        }

        map.on(leaflet.BrowserPrint.Event.PrintInit, allowFractionalZoom);
        map.on(leaflet.BrowserPrint.Event.PrintCancel, () => { restoreZoomSnap(); pending = null; });
        map.on(leaflet.BrowserPrint.Event.PrintStart, event => {
            restoreZoomSnap();
            if (!pending) return;
            if (pending.footer) {
                leaflet.control.scale({ maxWidth: 150, metric: true, imperial: false, position: 'bottomleft' })
                    .addTo(event.printMap);
                const footer = document.getElementById('print-footer');
                if (footer) footer.style.fontSize = '12px';
            }
        });
        map.on(leaflet.BrowserPrint.Event.PrintEnd, () => { pending = null; });

        /**
         * Imprime com a configuração resolvida.
         * @param {Object} settings - Resultado de `resolveSettings`.
         */
        function print(settings) {
            pending = settings;
            printer.print(buildMode(leaflet, settings));
        }

        /**
         * Pergunta os parâmetros e inicia a impressão.
         * @returns {Promise<Object|null>} Configuração usada ou null ao cancelar.
         */
        async function open() {
            const latitude = map.getCenter().lat;
            const size = map.getSize();
            const context = {
                latitude, currentZoom: map.getZoom(), minZoom: map.getMinZoom(), maxZoom: map.getMaxZoom()
            };
            const readForm = () => {
                const value = id => document.getElementById(id);
                return resolveSettings({
                    paper: value('mapPrintPaper').value, orientation: value('mapPrintOrientation').value,
                    scaleChoice: value('mapPrintScale').value, customScale: value('mapPrintCustomScale').value,
                    footer: value('mapPrintFooter').checked
                }, context);
            };
            const result = await Swal.fire({
                title: 'Imprimir mapa',
                customClass: { popup: 'map-print-modal' },
                html: buildDialogHtml({
                    currentScale: scaleForZoom(context.currentZoom, latitude),
                    orientation: size.x > size.y ? 'landscape' : 'portrait'
                }),
                showCancelButton: true,
                confirmButtonText: 'Imprimir',
                cancelButtonText: 'Cancelar',
                didOpen: () => {
                    const summary = document.getElementById('mapPrintSummary');
                    const custom = document.getElementById('mapPrintCustomScale');
                    const refresh = () => {
                        custom.hidden = document.getElementById('mapPrintScale').value !== 'custom';
                        const { settings, error } = readForm();
                        summary.textContent = error ? (custom.hidden || custom.value ? error : 'Informe a escala desejada.')
                            : `${settings.approximate ? 'Escala aproximada' : 'Escala'} `
                            + `${formatScale(settings.approximate ? roundScale(settings.scale) : settings.scale)} · cobre `
                            + `${formatDistance(settings.groundMeters.width)} × ${formatDistance(settings.groundMeters.height)} no terreno.`;
                    };
                    for (const id of ['mapPrintPaper', 'mapPrintOrientation', 'mapPrintScale', 'mapPrintFooter']) {
                        document.getElementById(id).addEventListener('change', refresh);
                    }
                    custom.addEventListener('input', refresh);
                    refresh();
                },
                preConfirm: () => {
                    const { settings, error } = readForm();
                    if (error) {
                        Swal.showValidationMessage(error);
                        return false;
                    }
                    return settings;
                }
            });
            if (!result.isConfirmed) return null;
            try {
                print(result.value);
            } catch (error) {
                restoreZoomSnap();
                pending = null;
                console.error('[PlanMilT][Impressão] Falha ao preparar a impressão.', error);
                await Swal.fire('Erro', 'Não foi possível preparar a impressão do mapa.', 'error');
                return null;
            }
            return result.value;
        }

        const entry = leaflet.BrowserPrint.Mode.Portrait('A4', { title: 'Imprimir mapa', action: () => () => { open(); } });
        const control = leaflet.control.browserPrint({
            position: 'topright', title: 'Imprimir mapa (A4/A3, em escala)', printModes: [entry]
        }, printer).addTo(map);
        return { control, open, print };
    }

    return Object.freeze({
        PAPER_SIZES_MM, PAGE_MARGIN_MM, SCALE_PRESETS, getMapAreaMm, scaleForZoom, zoomForScale,
        getGroundSizeMeters, roundScale, formatScale, formatDistance, resolveSettings, buildFooterText,
        buildMode, ignorePixelRatio, attach
    });
})();
