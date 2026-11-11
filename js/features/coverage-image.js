/**
 * @fileoverview Rasteriza coberturas georreferenciadas e conserva imagens em desenhos e exportações.
 * @exports window.PlanMilT.coverageImage
 * @requires Leaflet, Turf e Canvas do navegador
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.coverageImage = Object.freeze((() => {
    const radialCount = 72;
    const maxSteps = 200;
    const pixels = 1024;
    let editableGroup;
    let activeMap;

    /**
     * Inicializa o grupo de imagens separado das ferramentas de edição vetorial.
     * @param {Object} map - Mapa Leaflet.
     * @param {Object} leaflet - Namespace Leaflet.
     * @param {Object} layerControl - Controle de camadas.
     */
    function attach(map, leaflet, layerControl) {
        activeMap = map;
        editableGroup = leaflet.featureGroup().addTo(map);
        layerControl.addOverlay(editableGroup, 'Coberturas de rádio');
    }

    /**
     * Define uma resolução radial limitada para dispositivos com menos recursos.
     * @param {number} radius - Raio em quilômetros.
     * @returns {Object} Número de passos e distância entre amostras.
     */
    function resolution(radius) {
        if (!Number.isFinite(radius) || radius <= 0) throw new Error('Informe um raio de cobertura válido.');
        const steps = Math.min(maxSteps, Math.ceil(radius / 0.05));
        return { steps, resolutionKm: radius / steps, radialCount };
    }

    /**
     * Determina a cor da margem entre a potência recebida e a sensibilidade.
     * @param {number} power - Potência recebida em dBm.
     * @param {number} sensitivity - Sensibilidade em dBm.
     * @returns {string} Cor da faixa de margem.
     */
    function signalColor(power, sensitivity) {
        const margin = power - sensitivity;
        if (margin >= 35) return '#00ff00';
        if (margin >= 25) return '#99ff33';
        if (margin >= 15) return '#ffff00';
        if (margin >= 5) return '#ff9900';
        return '#ff0000';
    }

    /**
     * Verifica se os limites podem ser usados na projeção do mapa.
     * @param {*} bounds - Limites geográficos.
     * @returns {boolean} Indica se os limites são válidos.
     */
    function validBounds(bounds) {
        return Array.isArray(bounds) && bounds.length === 2 &&
            bounds.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite)) &&
            bounds[0][0] >= -85 && bounds[1][0] <= 85 &&
            bounds[0][1] >= -180 && bounds[1][1] <= 180 &&
            bounds[0][0] < bounds[1][0] && bounds[0][1] < bounds[1][1] &&
            bounds[1][1] - bounds[0][1] <= 180;
    }

    /**
     * Reprojeta linhas de um raster geográfico WGS84 para o Mercator do Leaflet.
     * @param {Object} source - Imagem ou canvas geográfico.
     * @param {Array<Array<number>>} bounds - Limites sul/oeste e norte/leste.
     * @param {Object} document - Documento usado para criar o canvas.
     * @returns {string} PNG reprojetado em data URL.
     */
    function projectGeographic(source, bounds, document) {
        const width = source.width;
        const height = source.height;
        if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
            width > pixels || height > pixels || !validBounds(bounds)) {
            throw new Error('Dimensões ou limites da imagem de cobertura são inválidos.');
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const target = canvas.getContext('2d');
        if (!target) throw new Error('Não foi possível projetar a imagem de cobertura.');
        const south = bounds[0][0];
        const north = bounds[1][0];
        const mercator = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
        const top = mercator(north);
        const bottom = mercator(south);
        for (let row = 0; row < height; row++) {
            const projected = top - (row + 0.5) / height * (top - bottom);
            const lat = (2 * Math.atan(Math.exp(projected)) - Math.PI / 2) * 180 / Math.PI;
            const sourceRow = Math.max(0, Math.min(height - 1, Math.floor((north - lat) / (north - south) * height)));
            target.drawImage(source, 0, sourceRow, width, 1, 0, row, width, 1);
        }
        return canvas.toDataURL('image/png');
    }

    /**
     * Constrói um raster geográfico WGS84 sem depender do zoom do mapa.
     * @param {Object} options - Centro, raio e dependências.
     * @returns {Object} Desenhador e limites geográficos.
     */
    function createRaster({ center, radius, turf, document }) {
        if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng) ||
            center.lng < -180 || center.lng > 180 || !Number.isFinite(radius) || radius <= 0 ||
            Math.abs(center.lat) + radius / 6371 * 180 / Math.PI > 85) {
            throw new Error('A área de cobertura excede os limites de latitude suportados.');
        }
        const perimeter = [];
        for (let bearing = 0; bearing < 360; bearing += 1) {
            perimeter.push(turf.destination([center.lng, center.lat], radius, bearing, { units: 'kilometers' }).geometry.coordinates);
        }
        const longitudes = perimeter.map(point => point[0]);
        const latitudes = perimeter.map(point => point[1]);
        const west = Math.min(...longitudes);
        const east = Math.max(...longitudes);
        const south = Math.min(...latitudes);
        const north = Math.max(...latitudes);
        if (![west, east, south, north].every(Number.isFinite) || east - west > 180 ||
            west < -180 || east > 180 || south < -85 || north > 85 || east <= west || north <= south) {
            throw new Error('A área de cobertura cruza o antimeridiano ou excede os limites de latitude suportados.');
        }
        const canvas = document.createElement('canvas');
        canvas.width = pixels;
        canvas.height = pixels;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Não foi possível criar a imagem de cobertura.');
        let count = 0;
        return {
            bounds: [[south, west], [north, east]],
            /**
             * Desenha uma célula de cobertura sem conservar uma geometria vetorial.
             * @param {Array<Array<number>>} points - Vértices longitude/latitude.
             * @param {string} color - Cor CSS da célula.
             * @param {number} opacity - Opacidade da célula.
             */
            draw(points, color, opacity) {
                context.beginPath();
                points.forEach(([longitude, latitude], index) => {
                    const x = (longitude - west) / (east - west) * pixels;
                    const y = (north - latitude) / (north - south) * pixels;
                    if (index === 0) context.moveTo(x, y);
                    else context.lineTo(x, y);
                });
                context.closePath();
                context.fillStyle = color;
                context.globalAlpha = opacity;
                context.fill();
                count++;
            },
            /**
             * Converte a imagem geográfica para a projeção Mercator do mapa.
             * @returns {Object} Imagens PNG e limites.
             */
            finish() {
                return { image: canvas.toDataURL('image/png'), mapImage: projectGeographic(canvas, this.bounds, document), bounds: this.bounds, count };
            }
        };
    }

    /**
     * Cria uma imagem Leaflet serializável sem inseri-la no grupo editável de desenhos.
     * @param {Object} feature - Feição que contém os dados da cobertura.
     * @param {Object} leaflet - Namespace Leaflet.
     * @param {Function} [onRemove] - Remove a imagem quando o usuário solicitar.
     * @returns {Object} Sobreposição com serialização GeoJSON.
     */
    function fromFeature(feature, leaflet, onRemove) {
        const data = feature && feature.properties && feature.properties.coverageImage;
        if (!data || !validBounds(data.bounds) ||
            typeof data.image !== 'string' || !data.image.startsWith('data:image/png;base64,') ||
            typeof data.mapImage !== 'string' || !data.mapImage.startsWith('data:image/png;base64,') ||
            !['optical', 'radio'].includes(data.mode) ||
            !Number.isFinite(data.resolutionKm) || data.resolutionKm <= 0) {
            throw new Error('A imagem de cobertura salva é inválida.');
        }
        const overlay = leaflet.imageOverlay(data.mapImage, data.bounds, { interactive: true });
        overlay.on('error', () => {
            console.error('[PlanMilT][Cobertura] Falha ao exibir a imagem.');
            window.Swal.fire('Erro', 'Não foi possível exibir a imagem de cobertura.', 'error');
        });
        overlay.bindPopup(`<b>Cobertura estimada</b><br>Resolução radial: ${data.resolutionKm.toPrecision(3)} km.${onRemove ? '<br><button type="button" data-coverage-remove>Remover cobertura</button>' : ''}`);
        if (onRemove) {
            overlay.on('popupopen', event => {
                event.popup.getElement().querySelector('[data-coverage-remove]').addEventListener('click', () => onRemove(overlay));
            });
        }
        overlay.toGeoJSON = () => feature;
        return overlay;
    }

    /**
     * Adiciona uma feição de imagem ao grupo de coberturas do mapa.
     * @param {Object} feature - Feição persistida.
     * @param {Object} leaflet - Namespace Leaflet.
     * @returns {Object} Imagem adicionada.
     */
    function add(feature, leaflet) {
        if (!editableGroup) throw new Error('O grupo de coberturas não foi inicializado.');
        const layer = fromFeature(feature, leaflet, remove);
        editableGroup.addLayer(layer);
        if (!activeMap.hasLayer(editableGroup)) activeMap.addLayer(editableGroup);
        return layer;
    }

    /**
     * Remove todas as coberturas do grupo de desenhos.
     */
    function clear() { editableGroup.clearLayers(); }

    /**
     * Remove uma cobertura do grupo editável.
     * @param {Object} layer - Imagem a remover.
     */
    function remove(layer) { editableGroup.removeLayer(layer); }

    /**
     * Retorna as coberturas associadas ao desenho editável.
     * @returns {Object} Grupo de imagens.
     */
    function getGroup() { return editableGroup; }

    return { attach, resolution, signalColor, createRaster, projectGeographic, fromFeature, add, clear, remove, getGroup };
})());
