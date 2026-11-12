/**
 * @fileoverview Monta uma textura Mercator a partir dos tiles OpenTopo ou BDGEx.
 * @exports window.PlanMilT.map3dTexture
 * @requires Mapa Leaflet e cliente HTTP.
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.map3dTexture = Object.freeze({
    /**
     * Busca e posiciona somente os tiles da camada selecionada sobre a área do mapa.
     * @param {Object} map - Mapa Leaflet usado para projetar coordenadas.
     * @param {number[]} bounds - Limites sul, oeste, norte e leste.
     * @param {string} source - Camada "opentopo" ou "bdgex".
     * @returns {Promise<string>} Textura PNG em projeção Web Mercator.
     */
    async create(map, bounds, source) {
        if (!['opentopo', 'bdgex'].includes(source)) throw new Error('Camada 3D inválida.');
        const [south, west, north, east] = bounds;
        if (![south, west, north, east].every(Number.isFinite)
            || south >= north || west >= east || south < -85 || north > 85
            || west < -180 || east > 180 || north - south > 5 || east - west > 5) {
            throw new Error('Aproxime o mapa e enquadre uma área de até cinco graus para consultar o terreno.');
        }
        const tileSize = source === 'bdgex' ? 96 : 256;
        let zoom = Math.max(0, Math.min(18, Math.floor(map.getZoom())));
        let left, top, right, bottom, minX, maxX, minY, maxY;
        do {
            const northwest = map.project([north, west], zoom);
            const southeast = map.project([south, east], zoom);
            ({ x: left, y: top } = northwest);
            ({ x: right, y: bottom } = southeast);
            minX = Math.floor(left / tileSize);
            maxX = Math.ceil(right / tileSize) - 1;
            minY = Math.floor(top / tileSize);
            maxY = Math.ceil(bottom / tileSize) - 1;
            if ((maxX - minX + 1) * (maxY - minY + 1) <= 64 || zoom === 0) break;
            zoom--;
        } while (true);

        const canvas = document.createElement('canvas');
        const dimensions = map.getSize();
        const scale = Math.min(1, 1400 / Math.max(dimensions.x, dimensions.y));
        canvas.width = Math.max(1, Math.round(dimensions.x * scale));
        canvas.height = Math.max(1, Math.round(dimensions.y * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Não foi possível preparar a imagem da camada 3D.');
        context.fillStyle = '#e8e8e8';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const tiles = [];
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) tiles.push({ x, y });
        }
        let index = 0;
        let failed = false;
        const workers = Array.from({ length: Math.min(4, tiles.length) }, async () => {
            while (index < tiles.length) {
                const { x, y } = tiles[index++];
                let url;
                if (source === 'opentopo') {
                    url = `https://tile.opentopomap.org/${zoom}/${x}/${y}.png`;
                } else {
                    const nw = map.unproject([x * tileSize, y * tileSize], zoom);
                    const se = map.unproject([(x + 1) * tileSize, (y + 1) * tileSize], zoom);
                    const bbox = [nw.lng, se.lat, se.lng, nw.lat].map(value => value.toFixed(10)).join(',');
                    const params = new URLSearchParams({
                        service: 'WMS', request: 'GetMap', version: '1.1.1', layers: 'ctm50',
                        styles: '', format: 'image/png', transparent: 'true', srs: 'EPSG:4326',
                        width: '96', height: '96', dpimode: '7', tilematrixset: 'ctm50-wmsc-2', bbox
                    });
                    url = `https://bdgex.eb.mil.br/mapcache?${params}`;
                }
                try {
                    const response = await window.PlanMilT.apiClient.request('php/endpoints/map-image-proxy.php', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const objectUrl = URL.createObjectURL(await response.blob());
                    try {
                        const image = new Image();
                        await new Promise((resolve, reject) => {
                            image.onload = resolve;
                            image.onerror = () => reject(new Error('Imagem de tile inválida.'));
                            image.src = objectUrl;
                        });
                        const destinationX = (x * tileSize - left) / (right - left) * canvas.width;
                        const destinationWidth = tileSize / (right - left) * canvas.width;
                        if (source === 'opentopo') {
                            context.drawImage(image, destinationX,
                                (y * tileSize - top) / (bottom - top) * canvas.height,
                                destinationWidth, tileSize / (bottom - top) * canvas.height);
                        } else {
                            const nw = map.unproject([x * tileSize, y * tileSize], zoom);
                            const se = map.unproject([(x + 1) * tileSize, (y + 1) * tileSize], zoom);
                            for (let row = 0; row < tileSize; row++) {
                                const northLat = nw.lat + (se.lat - nw.lat) * row / tileSize;
                                const southLat = nw.lat + (se.lat - nw.lat) * (row + 1) / tileSize;
                                const northY = map.project([northLat, nw.lng], zoom).y;
                                const southY = map.project([southLat, nw.lng], zoom).y;
                                context.drawImage(image, 0, row, tileSize, 1, destinationX,
                                    (northY - top) / (bottom - top) * canvas.height,
                                    destinationWidth, (southY - northY) / (bottom - top) * canvas.height + 0.1);
                            }
                        }
                    } finally {
                        URL.revokeObjectURL(objectUrl);
                    }
                } catch (error) {
                    console.error('[PlanMilT][3D] Falha ao carregar tile da camada.', error);
                    failed = true;
                }
            }
        });
        await Promise.all(workers);
        if (failed) throw new Error('Não foi possível carregar a camada escolhida. Verifique a conexão e tente novamente.');
        return canvas.toDataURL('image/png');
    }
});
