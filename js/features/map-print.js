/**
 * @fileoverview Impressão do mapa em folhas A4/A3: divide o quadro visível em quantas folhas forem
 * necessárias na escala escolhida (zoom atual ou 1:N), repetindo as camadas ativas, com escala gráfica e rodapé.
 * @exports window.PlanMilT.mapPrint
 * @requires Leaflet, leaflet.browser.print (apenas o controle e as rotinas de clonagem de camadas) e SweetAlert2
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.mapPrint = (() => {
    const PAPER_SIZES_MM = Object.freeze({
        A4: Object.freeze({ width: 210, height: 297 }),
        A3: Object.freeze({ width: 297, height: 420 })
    });
    const PAGE_MARGIN_MM = 10;
    const FOOTER_HEIGHT_MM = 8;
    // Folga de 1 mm evita que o conteúdo ultrapasse a área útil e gere uma folha em branco.
    const SAFETY_MM = 1;
    // Faixa de 4 mm junto ao papel que nenhuma marcação ocupa, pois muitas impressoras não imprimem ali.
    const UNPRINTABLE_MM = 4;
    const CSS_PIXELS_PER_MM = 96 / 25.4;
    const METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392804097;
    const SCALE_PRESETS = Object.freeze([5000, 10000, 25000, 50000, 100000, 250000, 500000]);
    const MIN_SCALE = 1000;
    const MAX_SCALE = 5000000;
    const MAX_SHEETS = 24;
    const TILE_WAIT_LIMIT_MS = 30000;
    const ORIENTATION_LABELS = Object.freeze({ portrait: 'retrato', landscape: 'paisagem' });

    /**
     * Calcula a área do mapa impresso dentro das margens de uma folha.
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
        const reserved = SAFETY_MM + (withFooter ? FOOTER_HEIGHT_MM : 0);
        return orientation === 'landscape'
            ? { width: long, height: short - reserved }
            : { width: short, height: long - reserved };
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
     * Calcula a extensão do terreno coberta por uma folha.
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
     * Divide o quadro visível do mapa em folhas contíguas, centralizando a grade sobre o quadro.
     * @param {Object} map - Mapa Leaflet (usa `getBounds`, `project` e `unproject`).
     * @param {number} zoom - Zoom (possivelmente fracionário) da impressão.
     * @param {{width: number, height: number}} areaMm - Área do mapa em cada folha, em milímetros.
     * @returns {{columns: number, rows: number, sheets: Array<{row: number, column: number, center: Object}>}} Grade de folhas, da esquerda para a direita e de cima para baixo.
     */
    function computeGrid(map, zoom, areaMm) {
        const bounds = map.getBounds();
        const northWest = map.project(bounds.getNorthWest(), zoom);
        const southEast = map.project(bounds.getSouthEast(), zoom);
        const pageWidth = areaMm.width * CSS_PIXELS_PER_MM;
        const pageHeight = areaMm.height * CSS_PIXELS_PER_MM;
        const width = southEast.x - northWest.x;
        const height = southEast.y - northWest.y;
        // A tolerância evita uma folha extra por erro de arredondamento em quadros que cabem exatamente.
        const columns = Math.max(1, Math.ceil(width / pageWidth - 1e-6));
        const rows = Math.max(1, Math.ceil(height / pageHeight - 1e-6));
        const originX = northWest.x + width / 2 - columns * pageWidth / 2;
        const originY = northWest.y + height / 2 - rows * pageHeight / 2;
        const sheets = [];
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                sheets.push({
                    row, column,
                    center: map.unproject({ x: originX + (column + 0.5) * pageWidth, y: originY + (row + 0.5) * pageHeight }, zoom)
                });
            }
        }
        return { columns, rows, sheets };
    }

    /**
     * Valida as escolhas do formulário e resolve escala, zoom e grade de folhas.
     * @param {Object} input - Valores do formulário (`paper`, `orientation`, `scaleChoice`, `customScale`, `footer`).
     * @param {Object} context - Contexto do mapa (`latitude`, `currentZoom`, `minZoom`, `maxZoom`, `computeGrid` opcional).
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
        const grid = context.computeGrid ? context.computeGrid(zoom, areaMm) : null;
        if (grid && grid.sheets.length > MAX_SHEETS) {
            return { error: `Esta escala exige ${grid.sheets.length} folhas (máximo ${MAX_SHEETS}). Aproxime o mapa ou use uma escala menor.` };
        }
        return {
            settings: {
                paper: input.paper, orientation: input.orientation, scale, zoom, approximate, footer,
                areaMm, groundMeters: getGroundSizeMeters(scale, areaMm), grid
            }
        };
    }

    /**
     * Monta o texto do rodapé de uma folha impressa.
     * @param {Object} settings - Configuração resolvida da impressão.
     * @param {{row: number, column: number}} [sheet] - Folha atual, para numerá-la.
     * @param {Date} [date] - Data de impressão.
     * @returns {string} Texto simples do rodapé.
     */
    function buildFooterText(settings, sheet, date = new Date()) {
        const scale = settings.approximate ? `Escala aproximada ${formatScale(roundScale(settings.scale))}`
            : `Escala ${formatScale(settings.scale)}`;
        const parts = [scale, `Folha ${settings.paper} ${ORIENTATION_LABELS[settings.orientation]}`];
        const grid = settings.grid;
        if (sheet && grid && grid.sheets.length > 1) {
            const number = sheet.row * grid.columns + sheet.column + 1;
            parts.push(`Folha ${number} de ${grid.sheets.length} (linha ${sheet.row + 1}, coluna ${sheet.column + 1})`);
        }
        parts.push(`Impresso em ${date.toLocaleDateString('pt-BR')}`);
        return parts.join(' · ');
    }

    /**
     * Identifica as folhas vizinhas (numeradas a partir de 1) que devem ser coladas em cada borda e canto.
     * @param {{columns: number, rows: number}} grid - Grade de folhas.
     * @param {{row: number, column: number}} sheet - Folha atual.
     * @returns {Object<string, number|null>} Número da vizinha em `top`, `bottom`, `left`, `right` e cantos, ou null.
     */
    function getNeighbors(grid, sheet) {
        const at = (dRow, dColumn) => {
            const row = sheet.row + dRow;
            const column = sheet.column + dColumn;
            if (row < 0 || column < 0 || row >= grid.rows || column >= grid.columns) return null;
            return row * grid.columns + column + 1;
        };
        return {
            top: at(-1, 0), bottom: at(1, 0), left: at(0, -1), right: at(0, 1),
            topLeft: at(-1, -1), topRight: at(-1, 1), bottomLeft: at(1, -1), bottomRight: at(1, 1)
        };
    }

    /**
     * Gera o CSS da sobreposição de impressão (tela e `@media print`).
     * @param {Object} settings - Configuração resolvida da impressão.
     * @returns {string} Texto CSS.
     */
    function buildPrintCss(settings) {
        const size = PAPER_SIZES_MM[settings.paper];
        const landscape = settings.orientation === 'landscape';
        const pageWidth = landscape ? size.height : size.width;
        // 1 mm a menos evita que o arredondamento do navegador crie uma folha em branco.
        const pageHeight = (landscape ? size.width : size.height) - 1;
        return `#mapPrintSheets{position:fixed;inset:0;z-index:100000;overflow:auto;background:#6b7280;padding:56px 0 20px;font-family:sans-serif}
#mapPrintSheets .map-print-bar{position:fixed;top:0;left:0;right:0;height:44px;z-index:2;display:flex;align-items:center;gap:8px;padding:0 12px;background:#243447;color:#fff;font-size:14px}
#mapPrintSheets .map-print-bar button{height:30px;padding:0 12px;border:0;border-radius:6px;cursor:pointer;font:inherit}
#mapPrintSheets .map-print-sheet{position:relative;box-sizing:border-box;width:${pageWidth}mm;height:${pageHeight}mm;background:#fff;margin:0 auto 16px;box-shadow:0 2px 8px rgba(0,0,0,.4);overflow:hidden;color:#000}
#mapPrintSheets .map-print-map{position:absolute;left:${PAGE_MARGIN_MM}mm;top:${PAGE_MARGIN_MM}mm;outline:.25mm solid #444;outline-offset:-.25mm}
#mapPrintSheets .map-print-footer{position:absolute;left:${PAGE_MARGIN_MM}mm;font-size:12px;text-align:center;white-space:nowrap;overflow:hidden}
#mapPrintSheets .map-print-edge{position:absolute;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;white-space:nowrap;color:#000}
#mapPrintSheets .map-print-edge.top,#mapPrintSheets .map-print-edge.bottom{left:${PAGE_MARGIN_MM}mm;right:${PAGE_MARGIN_MM}mm;height:5mm}
#mapPrintSheets .map-print-edge.top{top:${UNPRINTABLE_MM}mm}
#mapPrintSheets .map-print-edge.bottom{bottom:${UNPRINTABLE_MM + 1}mm}
#mapPrintSheets .map-print-edge.left,#mapPrintSheets .map-print-edge.right{top:${PAGE_MARGIN_MM}mm;bottom:${PAGE_MARGIN_MM}mm;width:5mm;writing-mode:vertical-rl}
#mapPrintSheets .map-print-edge.left{left:${UNPRINTABLE_MM}mm;transform:rotate(180deg)}
#mapPrintSheets .map-print-edge.right{right:${UNPRINTABLE_MM}mm}
#mapPrintSheets .map-print-edge.corner{width:12mm;height:5mm;font-size:9px;font-weight:400}
#mapPrintSheets .map-print-edge.topLeft{left:${UNPRINTABLE_MM}mm;top:${UNPRINTABLE_MM}mm}
#mapPrintSheets .map-print-edge.topRight{right:${UNPRINTABLE_MM}mm;top:${UNPRINTABLE_MM}mm}
#mapPrintSheets .map-print-edge.bottomLeft{left:${UNPRINTABLE_MM}mm;bottom:${UNPRINTABLE_MM + 1}mm}
#mapPrintSheets .map-print-edge.bottomRight{right:${UNPRINTABLE_MM}mm;bottom:${UNPRINTABLE_MM + 1}mm}
#mapPrintSheets .map-print-index{padding:${PAGE_MARGIN_MM}mm;font-size:12px;line-height:1.4}
#mapPrintSheets .map-print-index h2{margin:0 0 4mm;font-size:18px}
#mapPrintSheets .map-print-index p{margin:0 0 3mm}
#mapPrintSheets .map-print-index table{width:100%;table-layout:fixed;border-collapse:collapse;margin-top:4mm}
#mapPrintSheets .map-print-index td{border:.3mm solid #000;height:16mm;text-align:center;font-size:16px;font-weight:700}
#mapPrintSheets .map-print-index td small{display:block;font-size:9px;font-weight:400}
@media print{
html,body{height:auto!important;overflow:visible!important;background:#fff!important}
body>*:not(#mapPrintSheets){display:none!important}
#mapPrintSheets{position:static;inset:auto;overflow:visible;background:none;padding:0}
#mapPrintSheets .map-print-bar{display:none}
#mapPrintSheets .map-print-sheet{margin:0;box-shadow:none;break-after:page;page-break-after:always}
#mapPrintSheets .map-print-sheet:last-child{break-after:auto;page-break-after:auto}
@page{size:${settings.paper} ${settings.orientation};margin:0}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}`;
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
<p class="map-print-hint">Todo o quadro visível no mapa é impresso, em quantas folhas forem necessárias (até ${MAX_SHEETS}), com as camadas ativas. A escala é exata na latitude do centro do mapa. Na janela do navegador, use o mesmo papel e orientação, escala 100 % (sem “ajustar à página”) e desative cabeçalhos e rodapés.</p>
</div>`;
    }

    /**
     * Liga o controle de impressão ao mapa.
     * @param {Object} dependencies - `map`, `leaflet`, `Swal` e, opcionalmente, `doc`, `win` e `settleMs` (espera após o carregamento dos tiles).
     * @returns {{control: Object, open: Function, print: Function, close: Function}} Controle criado e ações disponíveis.
     */
    function attach({ map, leaflet, Swal, doc = document, win = window, settleMs = 800 }) {
        let session = null;

        /**
         * Informa se algum mapa de folha ainda carrega tiles.
         * @param {Array<Object>} maps - Mapas das folhas.
         * @returns {boolean} Verdadeiro enquanto houver carregamento.
         */
        function isLoading(maps) {
            return maps.some(sheetMap => Object.values(sheetMap._layers || {}).some(layer => layer._loading));
        }

        /**
         * Copia para o mapa da folha as camadas hoje visíveis no mapa principal.
         * @param {Object} sheetMap - Mapa da folha.
         * @returns {number} Quantidade de camadas que não puderam ser copiadas.
         */
        function copyLayers(sheetMap) {
            const utils = leaflet.BrowserPrint.Utils;
            let skipped = 0;
            for (const [name, pane] of Object.entries(map.getPanes())) {
                if (!sheetMap.getPane(name)) {
                    const created = sheetMap.createPane(name);
                    if (created && created.style && pane && pane.style) created.style.zIndex = pane.style.zIndex;
                }
            }
            for (const layer of Object.values(map._layers)) {
                if (layer instanceof leaflet.Popup || layer instanceof leaflet.Tooltip || !utils.getType(layer)) continue;
                const clone = utils.cloneLayer(layer);
                if (!clone) {
                    skipped++;
                    continue;
                }
                clone.addTo(sheetMap);
                const tooltip = layer.getTooltip && layer.getTooltip();
                if (tooltip && clone.bindTooltip) clone.bindTooltip(tooltip.getContent(), tooltip.options);
            }
            return skipped;
        }

        /**
         * Cria um elemento com classe e texto opcionais.
         * @param {string} tag - Nome da tag.
         * @param {string} [className] - Classe CSS.
         * @param {string} [text] - Texto simples.
         * @returns {Object} Elemento criado.
         */
        function createElement(tag, className, text) {
            const element = doc.createElement(tag);
            if (className) element.className = className;
            if (text !== undefined) element.textContent = text;
            return element;
        }

        /**
         * Cria a página-índice com a tabela de montagem do mosaico.
         * @param {Object} settings - Configuração resolvida da impressão.
         * @returns {Object} Elemento da página.
         */
        function buildIndexPage(settings) {
            const grid = settings.grid;
            const page = createElement('div', 'map-print-sheet map-print-index');
            page.appendChild(createElement('h2', '', 'Mapa de montagem do mosaico'));
            page.appendChild(createElement('p', '', `${grid.sheets.length} folhas ${settings.paper} ${ORIENTATION_LABELS[settings.orientation]} (${grid.columns} colunas × ${grid.rows} linhas), `
                + `${settings.approximate ? 'escala aproximada ' + formatScale(roundScale(settings.scale)) : 'escala ' + formatScale(settings.scale)}.`));
            page.appendChild(createElement('p', '', 'Recorte as margens ao longo da moldura de cada folha e cole-as lado a lado, conforme a tabela. '
                + 'Em cada borda, a marcação indica o número da folha vizinha que deve ser colada ali; nos cantos, a folha diagonal.'));
            const table = createElement('table');
            for (let row = 0; row < grid.rows; row++) {
                const tr = createElement('tr');
                for (let column = 0; column < grid.columns; column++) {
                    const cell = createElement('td', '', String(row * grid.columns + column + 1));
                    cell.appendChild(createElement('small', '', `L${row + 1} · C${column + 1}`));
                    tr.appendChild(cell);
                }
                table.appendChild(tr);
            }
            page.appendChild(table);
            page.appendChild(createElement('p', '', `Cada folha cobre ${formatDistance(settings.groundMeters.width)} × ${formatDistance(settings.groundMeters.height)} no terreno.`));
            return page;
        }

        /**
         * Adiciona à folha as marcações de colagem nas bordas e nos cantos.
         * @param {Object} sheetEl - Elemento da folha.
         * @param {Object} grid - Grade de folhas.
         * @param {{row: number, column: number}} sheet - Folha atual.
         */
        function addEdgeMarks(sheetEl, grid, sheet) {
            const neighbors = getNeighbors(grid, sheet);
            const arrows = { top: '▲', bottom: '▼', left: '◀', right: '▶' };
            for (const [position, number] of Object.entries(neighbors)) {
                if (number === null) continue;
                const corner = !(position in arrows);
                const text = corner ? `Folha ${number}` : `${arrows[position]} Cole a folha ${number} ${arrows[position]}`;
                sheetEl.appendChild(createElement('div', `map-print-edge ${position}${corner ? ' corner' : ''}`, text));
            }
        }

        /** Remove a sobreposição de impressão e libera os mapas das folhas. */
        function close() {
            if (!session) return;
            const current = session;
            session = null;
            current.cancelled = true;
            clearTimeout(current.timer);
            win.removeEventListener('afterprint', current.onAfterPrint);
            current.maps.forEach(sheetMap => sheetMap.remove());
            current.overlay.remove();
            current.style.remove();
        }

        /**
         * Monta as folhas, espera os tiles e abre a impressão do navegador.
         * @param {Object} settings - Resultado de `resolveSettings`.
         * @returns {Promise<void>} Resolve quando a impressão do navegador for solicitada ou cancelada.
         */
        async function print(settings) {
            close();
            leaflet.BrowserPrint.Utils.initialize();
            const grid = settings.grid || computeGrid(map, settings.zoom, settings.areaMm);
            const footerMm = settings.footer ? FOOTER_HEIGHT_MM : 0;
            const style = doc.createElement('style');
            style.textContent = buildPrintCss(settings);
            doc.head.appendChild(style);
            const overlay = doc.createElement('div');
            overlay.id = 'mapPrintSheets';
            const bar = doc.createElement('div');
            bar.className = 'map-print-bar';
            const status = doc.createElement('span');
            const printButton = doc.createElement('button');
            printButton.textContent = 'Imprimir';
            printButton.disabled = true;
            const closeButton = doc.createElement('button');
            closeButton.textContent = 'Fechar';
            bar.append(status, printButton, closeButton);
            overlay.appendChild(bar);
            doc.body.appendChild(overlay);
            const current = { overlay, style, maps: [], timer: null, cancelled: false, onAfterPrint: () => close() };
            session = current;
            closeButton.addEventListener('click', close);
            printButton.addEventListener('click', () => win.print());
            win.addEventListener('afterprint', current.onAfterPrint);
            status.textContent = `Preparando ${grid.sheets.length} folha(s) ${settings.paper}…`;

            let skipped = 0;
            if (grid.sheets.length > 1) overlay.appendChild(buildIndexPage({ ...settings, grid }));
            for (const sheet of grid.sheets) {
                const sheetEl = createElement('div', 'map-print-sheet');
                const mapEl = createElement('div', 'map-print-map');
                mapEl.style.width = `${settings.areaMm.width}mm`;
                mapEl.style.height = `${settings.areaMm.height}mm`;
                sheetEl.appendChild(mapEl);
                if (settings.footer) {
                    const footerEl = createElement('div', 'map-print-footer', buildFooterText(settings, sheet));
                    footerEl.style.top = `${PAGE_MARGIN_MM + settings.areaMm.height}mm`;
                    footerEl.style.width = `${settings.areaMm.width}mm`;
                    footerEl.style.height = `${footerMm}mm`;
                    footerEl.style.lineHeight = `${footerMm}mm`;
                    sheetEl.appendChild(footerEl);
                }
                addEdgeMarks(sheetEl, grid, sheet);
                overlay.appendChild(sheetEl);
                const sheetMap = leaflet.map(mapEl, {
                    crs: map.options.crs, minZoom: map.getMinZoom(), maxZoom: map.getMaxZoom(), zoomSnap: 0,
                    zoomControl: false, attributionControl: false, dragging: false, keyboard: false,
                    scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false, boxZoom: false, tap: false,
                    zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false
                });
                current.maps.push(sheetMap);
                sheetMap.setView(sheet.center, settings.zoom, { animate: false });
                skipped += copyLayers(sheetMap);
                if (settings.footer) {
                    leaflet.control.scale({ maxWidth: 150, metric: true, imperial: false, position: 'bottomleft' }).addTo(sheetMap);
                }
            }
            if (skipped) console.warn(`[PlanMilT][Impressão] ${skipped} camada(s) sem suporte à impressão foram omitidas.`);

            const startedAt = Date.now();
            await new Promise(resolve => {
                const poll = () => {
                    if (current.cancelled) return resolve();
                    if (isLoading(current.maps) && Date.now() - startedAt < TILE_WAIT_LIMIT_MS) {
                        current.timer = setTimeout(poll, 100);
                    } else {
                        current.timer = setTimeout(resolve, settleMs);
                    }
                };
                poll();
            });
            if (current.cancelled) return;
            status.textContent = `${grid.sheets.length} folha(s) ${settings.paper} · ${formatScale(settings.scale)}. Use Imprimir se a janela não abrir.`;
            printButton.disabled = false;
            win.print();
        }

        /**
         * Pergunta os parâmetros e inicia a impressão.
         * @returns {Promise<Object|null>} Configuração usada ou null ao cancelar.
         */
        async function open() {
            const latitude = map.getCenter().lat;
            const size = map.getSize();
            const context = {
                latitude, currentZoom: map.getZoom(), minZoom: map.getMinZoom(), maxZoom: map.getMaxZoom(),
                computeGrid: (zoom, areaMm) => computeGrid(map, zoom, areaMm)
            };
            const readForm = () => {
                const value = id => doc.getElementById(id);
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
                    const summary = doc.getElementById('mapPrintSummary');
                    const custom = doc.getElementById('mapPrintCustomScale');
                    const refresh = () => {
                        custom.hidden = doc.getElementById('mapPrintScale').value !== 'custom';
                        const { settings, error } = readForm();
                        if (error) {
                            summary.textContent = custom.hidden || custom.value ? error : 'Informe a escala desejada.';
                            return;
                        }
                        const count = settings.grid.sheets.length;
                        summary.textContent = `${settings.approximate ? 'Escala aproximada' : 'Escala'} `
                            + `${formatScale(settings.approximate ? roundScale(settings.scale) : settings.scale)} · `
                            + `${count} folha${count > 1 ? 's' : ''} (${settings.grid.columns} × ${settings.grid.rows}); cada uma cobre `
                            + `${formatDistance(settings.groundMeters.width)} × ${formatDistance(settings.groundMeters.height)}.`;
                    };
                    for (const id of ['mapPrintPaper', 'mapPrintOrientation', 'mapPrintScale', 'mapPrintFooter']) {
                        doc.getElementById(id).addEventListener('change', refresh);
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
                await print(result.value);
            } catch (error) {
                close();
                console.error('[PlanMilT][Impressão] Falha ao preparar a impressão.', error);
                await Swal.fire('Erro', 'Não foi possível preparar a impressão do mapa.', 'error');
                return null;
            }
            return result.value;
        }

        const entry = leaflet.BrowserPrint.Mode.Portrait('A4', { title: 'Imprimir mapa', action: () => () => { open(); } });
        const control = leaflet.control.browserPrint({
            position: 'topright', title: 'Imprimir mapa (A4/A3, em escala)', printModes: [entry]
        }).addTo(map);
        return { control, open, print, close };
    }

    return Object.freeze({
        PAPER_SIZES_MM, PAGE_MARGIN_MM, SCALE_PRESETS, MAX_SHEETS, getMapAreaMm, scaleForZoom, zoomForScale,
        getGroundSizeMeters, roundScale, formatScale, formatDistance, computeGrid, getNeighbors, resolveSettings,
        buildFooterText, attach
    });
})();
