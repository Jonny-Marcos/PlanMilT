/**
 * @fileoverview Guarda frequência de gráficos e camadas WMS recentes neste navegador.
 * @exports window.PlanMilT.localHistory
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.localHistory = (() => {
    const key = `planmilt.catalog-history.v1:${new URL('.', window.location.href).pathname}`;

    /**
     * Lê o histórico local e informa falhas ao console.
     * @returns {Object|null} Histórico ou null quando os dados estão indisponíveis.
     */
    function read() {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return { graphics: [], layers: [] };
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.graphics) || !Array.isArray(data.layers)
                || data.graphics.some(item => !item || typeof item.name !== 'string'
                    || !Number.isSafeInteger(item.count) || item.count < 1)
                || data.layers.some(item => !item || !Number.isSafeInteger(item.serviceId)
                    || item.serviceId < 1 || typeof item.layerName !== 'string' || !item.layerName
                    || typeof item.title !== 'string'
                    || typeof item.categoryCode !== 'string' || typeof item.categoryName !== 'string'
                    || !Number.isFinite(item.latestYear))) {
                throw new Error('Histórico local inválido.');
            }
            return data;
        } catch (error) {
            console.error('[PlanMilT][Histórico] Não foi possível ler o histórico local.', error);
            return null;
        }
    }

    /**
     * Persiste o histórico sem guardar URLs de serviços ou dados de desenhos.
     * @param {Object} data - Histórico atualizado.
     */
    function write(data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('[PlanMilT][Histórico] Não foi possível salvar o histórico local.', error);
        }
    }

    return Object.freeze({
        /** @returns {string[]} Gráficos em ordem de uso. */
        graphics() {
            const data = read();
            return data ? [...data.graphics].sort((a, b) => b.count - a.count).map(item => item.name) : [];
        },
        /** @param {string} name - Identificador do gráfico criado. */
        recordGraphic(name) {
            if (typeof name !== 'string' || !name) {
                console.error('[PlanMilT][Histórico] Identificador de gráfico inválido.');
                return;
            }
            const data = read();
            if (!data) return;
            const previous = data.graphics.find(item => item.name === name);
            data.graphics = [{ name, count: previous ? Math.min(Number.MAX_SAFE_INTEGER, previous.count + 1) : 1 },
                ...data.graphics.filter(item => item.name !== name)];
            write(data);
        },
        /** @returns {Object[]} Camadas, da mais recente à mais antiga. */
        layers() {
            const data = read();
            return data ? data.layers.slice(0, 50) : [];
        },
        /** @param {Object[]} layers - Camadas confirmadas para inclusão no mapa. */
        recordLayers(layers) {
            const data = read();
            if (!data) return;
            for (const layer of layers) {
                const item = {
                    serviceId: Number(layer.serviceId),
                    layerName: layer.layerName,
                    title: layer.title || layer.layerName,
                    categoryCode: layer.categoryCode || '',
                    categoryName: layer.categoryName || '',
                    latestYear: Number(layer.latestYear || 0)
                };
                if (!Number.isSafeInteger(item.serviceId) || item.serviceId < 1
                    || typeof item.layerName !== 'string' || !item.layerName
                    || typeof item.title !== 'string' || typeof item.categoryCode !== 'string'
                    || typeof item.categoryName !== 'string' || !Number.isFinite(item.latestYear)) {
                    console.error('[PlanMilT][Histórico] Dados de camada inválidos; histórico não foi salvo.');
                    return;
                }
                data.layers = [item, ...data.layers.filter(previous =>
                    previous.serviceId !== item.serviceId || previous.layerName !== item.layerName)].slice(0, 50);
            }
            write(data);
        }
    });
})();
