/**
 * @fileoverview Recupera o último estado do mapa neste navegador usando IndexedDB.
 * @exports window.PlanMilT.localSession
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.localSession = (() => {
    const databaseName = `planmilt.session.v1:${new URL('.', window.location.href).pathname}`;

    /**
     * Abre o armazenamento local do estado do mapa.
     * @returns {Promise<IDBDatabase>} Banco de dados do navegador.
     */
    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('session');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('O armazenamento local está bloqueado por outra aba.'));
        });
    }

    /**
     * Lê ou grava um snapshot em uma única transação.
     * @param {IDBDatabase} db - Banco aberto.
     * @param {Object} [snapshot] - Estado a gravar; omitido para leitura.
     * @returns {Promise<Object|undefined>} Estado lido ou confirmação de gravação.
     */
    function transact(db, snapshot) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('session', snapshot === undefined ? 'readonly' : 'readwrite');
            const store = transaction.objectStore('session');
            const request = snapshot === undefined ? store.get('latest') : store.put(snapshot, 'latest');
            transaction.oncomplete = () => resolve(snapshot === undefined ? request.result : undefined);
            transaction.onerror = () => reject(transaction.error || request.error);
            transaction.onabort = () => reject(transaction.error || new Error('Transação local cancelada.'));
        });
    }

    /**
     * Inicia observação e restauração do mapa.
     * @param {Object} dependencies - Dependências do mapa e dos grupos editáveis.
     * @returns {Promise<void>} Restauração inicial concluída.
     */
    async function start({ map, leaflet: L, drawnItems, layerRegistry, addNewOverlayLayer, tacticalGraphics }) {
        let db;
        let restoring = true;
        let changedDuringStartup = false;
        let blocked = false;
        let timer;
        let writing = Promise.resolve();
        let revision = 0;
        let notice;
        const initialLayers = new Map(Object.entries(layerRegistry));
        const coverage = window.PlanMilT.coverageImage.getGroup();

        /**
         * Mantém falhas visíveis sem interromper diálogos abertos.
         * @param {string} message - Mensagem curta para o usuário.
         * @param {Error} error - Falha de armazenamento ou restauração.
         */
        function report(message, error) {
            console.error('[PlanMilT][Rascunho local]', message, { name: error?.name || 'Error' });
            if (!notice) {
                notice = document.createElement('div');
                notice.setAttribute('role', 'alert');
                Object.assign(notice.style, { position: 'fixed', bottom: '8px', right: '8px', zIndex: '10000',
                    background: '#fff3cd', color: '#503800', padding: '10px', maxWidth: '360px' });
                document.body.appendChild(notice);
            }
            notice.textContent = message;
        }

        /**
         * Converte os limites de uma imagem Leaflet para coordenadas simples.
         * @param {Object} bounds - Limites Leaflet.
         * @returns {number[][]} Coordenadas sul/oeste e norte/leste.
         */
        function boundsArray(bounds) {
            return [[bounds.getSouth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()]];
        }

        /**
         * Obtém as feições e imagens de um grupo, preservando ícones de importação.
         * @param {Object} layer - Camada Leaflet.
         * @returns {Object[]} Componentes serializáveis.
         */
        function serializeLayer(layer) {
            const geometryType = layer.feature?.geometry?.type;
            if (typeof layer.eachLayer === 'function' && geometryType !== 'MultiPoint' && geometryType !== 'GeometryCollection') {
                const result = [];
                layer.eachLayer(child => {
                    for (const entry of serializeLayer(child)) result.push(entry);
                });
                return result;
            }
            if (typeof layer.toGeoJSON === 'function') {
                const feature = layer.toGeoJSON(false);
                if (feature.type === 'FeatureCollection') {
                    return feature.features.map(item => ({ type: 'feature', feature: item }));
                }
                const properties = { ...(feature.properties || {}) };
                const options = layer.options || {};
                if (L.Circle && layer instanceof L.Circle) {
                    const center = layer.getLatLng();
                    properties.shape = 'circle';
                    properties.center = [center.lat, center.lng];
                    properties.radius = layer.getRadius();
                }
                if (options.icon?.options?.iconUrl && !properties.iconUrl) {
                    properties.iconUrl = options.icon.options.iconUrl;
                    properties.iconSize = options.icon.options.iconSize;
                    properties.iconAnchor = options.icon.options.iconAnchor;
                }
                for (const key of ['color', 'weight', 'opacity', 'fillColor', 'fillOpacity', 'dashArray']) {
                    if (properties[key] === undefined && options[key] !== undefined) properties[key] = options[key];
                }
                return [{ type: 'feature', feature: { ...feature, properties } }];
            }
            if (typeof layer.getBounds === 'function' && typeof layer._url === 'string') {
                if (!layer._url.startsWith('data:image/')) {
                    throw new Error('Uma imagem de camada não está disponível como cópia local.');
                }
                return [{ type: 'image', url: layer._url, bounds: boundsArray(layer.getBounds()), opacity: layer.options.opacity }];
            }
            throw new Error('Uma camada não pode ser armazenada neste navegador.');
        }

        /**
         * Cria um snapshot dos desenhos e das camadas presentes e visíveis.
         * @returns {Object} Dados locais sem senhas ou tokens.
         */
        function snapshot() {
            const drawings = { type: 'FeatureCollection', features: [] };
            for (const entry of serializeLayer(drawnItems)) {
                if (entry.type !== 'feature') throw new Error('Uma imagem editável não pode ser armazenada.');
                drawings.features.push(entry.feature);
            }
            for (const feature of window.PlanMilT.geoJsonSerialization.toFeatureCollection(coverage, false).features) {
                drawings.features.push(feature);
            }
            const layers = Object.entries(layerRegistry).map(([name, layer]) => {
                const active = map.hasLayer(layer);
                if (initialLayers.get(name) === layer && name !== 'Sugestão de Planejamento') {
                    return { type: 'builtin', name, active, opacity: layer.options?.opacity };
                }
                if (layer.wmsParams && typeof layer._url === 'string') {
                    const url = new URL(layer._url, window.location.href);
                    const sensitive = key => /token|pass|secret|auth|credential|api.?key|(?:^|[_-])key(?:$|[_-])|signature|session/i.test(key);
                    if (url.username || url.password || [...url.searchParams.keys()].some(sensitive)
                        || Object.keys(layer.wmsParams).some(sensitive)) {
                        const error = new Error('Uma camada WMS contém credenciais e não pode ser guardada localmente.');
                        error.code = 'credential-wms';
                        throw error;
                    }
                    return { type: 'wms', name, active, url: layer._url, params: { ...layer.wmsParams },
                        opacity: layer.options?.opacity };
                }
                const entries = serializeLayer(layer);
                if (typeof layer.eachLayer !== 'function' && entries.length === 1 && entries[0].type === 'image') {
                    return { ...entries[0], name, active };
                }
                return { type: name === 'Sugestão de Planejamento' && initialLayers.get(name) === layer ? 'planning' : 'group',
                    name, active, entries };
            });
            const center = map.getCenter();
            return { version: 1, drawings, layers, coverageActive: map.hasLayer(coverage),
                center: [center.lat, center.lng], zoom: map.getZoom() };
        }

        /**
         * Agenda gravações sequenciais para impedir que snapshots antigos substituam novos.
         */
        function persist() {
            timer = undefined;
            if (restoring || blocked || !db) return;
            const currentRevision = ++revision;
            let current;
            try {
                current = structuredClone(snapshot());
            } catch (error) {
                report(error.code === 'credential-wms'
                    ? 'Não foi possível guardar o rascunho local: remova a camada WMS com credenciais ou salve o planejamento no servidor.'
                    : 'Não foi possível guardar o rascunho local. Salve o planejamento no servidor.', error);
                return;
            }
            writing = writing.then(() => transact(db, current)).then(() => {
                if (notice && currentRevision === revision) { notice.remove(); notice = null; }
            }).catch(error => report('Não foi possível guardar o rascunho local. Salve o planejamento no servidor.', error));
        }

        /**
         * Agrupa alterações próximas antes de gravar o estado completo.
         */
        function save() {
            if (restoring || blocked || !db) return;
            clearTimeout(timer);
            timer = setTimeout(persist, 500);
        }

        /**
         * Reconstrói uma camada de uma feição armazenada.
         * @param {Object} feature - Feição GeoJSON.
         * @returns {Object} Camada Leaflet.
         */
        function featureLayer(feature) {
            const properties = feature.properties || {};
            if (properties.coverageImage) return window.PlanMilT.coverageImage.fromFeature(feature, L);
            if (feature.geometry?.type === 'Point' && properties.shape === 'circle') {
                const circle = L.circle(properties.center, { radius: properties.radius, color: properties.color,
                    fillColor: properties.fillColor || properties.color, fillOpacity: properties.fillOpacity ?? 0.5 });
                circle.feature = feature;
                return circle;
            }
            const group = L.geoJson(feature, {
                pointToLayer(item, latlng) {
                    const props = item.properties || {};
                    if (props.iconUrl) {
                        const icon = props.militarySymbol ? window.PlanMilT.militarySymbols.createIcon(props.militarySymbol, L)
                            : L.icon({ iconUrl: props.iconUrl, iconSize: props.iconSize || [40, 40], iconAnchor: props.iconAnchor || [15, 15] });
                        return L.marker(latlng, { icon });
                    }
                    if (props.text) {
                        const icon = Array.isArray(props.boundaryOffset) && ['boundaryLabel', 'boundaryMark', 'boundaryDesignation'].includes(props.role)
                            ? window.PlanMilT.tacticalGraphics.createBoundaryLabelIcon(L, props.text, props.boundaryOffset, props.color)
                            : L.divIcon({ className: 'custom-text-label', html: props.text, iconSize: [100, 30], iconAnchor: [15, 15] });
                        return L.marker(latlng, { icon });
                    }
                    return L.marker(latlng);
                },
                onEachFeature(item, layer) {
                    const props = item.properties || {};
                    const style = {};
                    for (const key of ['color', 'weight', 'opacity', 'fillColor', 'fillOpacity', 'dashArray']) {
                        if (props[key] !== undefined) style[key] = props[key];
                    }
                    if (props.fillPattern) style.fillPattern = window.PlanMilT.drawingPatterns.get(map, L, props.fillPattern, props.color);
                    if (layer.setStyle) layer.setStyle(style);
                    if (props.boundaryId && props.tacticalGraphic?.name === 'Boundary' && item.geometry.type === 'LineString') {
                        tacticalGraphics.registerBoundaryLayer(layer);
                    }
                }
            });
            const layers = group.getLayers();
            if (layers.length !== 1) throw new Error('Uma feição local não pôde ser restaurada.');
            return layers[0];
        }

        /**
         * Restaura componentes de uma camada composta.
         * @param {Object} target - Grupo Leaflet de destino.
         * @param {Object[]} entries - Componentes serializados.
         */
        function restoreEntries(target, entries) {
            for (const item of entries) {
                if (item.type === 'feature') target.addLayer(featureLayer(item.feature));
                else if (item.type === 'image' && typeof item.url === 'string' && item.url.startsWith('data:image/')) {
                    target.addLayer(L.imageOverlay(item.url, item.bounds, { opacity: item.opacity }));
                } else throw new Error('Componente de camada local inválido.');
            }
        }

        /**
         * Aplica o snapshot somente depois de validar sua estrutura básica.
         * @param {Object} state - Snapshot previamente armazenado.
         */
        async function restore(state) {
            if (!state || state.version !== 1 || state.drawings?.type !== 'FeatureCollection'
                || !Array.isArray(state.drawings.features) || !Array.isArray(state.layers)
                || !Array.isArray(state.center) || state.center.length !== 2
                || !state.center.every(Number.isFinite) || !Number.isFinite(state.zoom)) {
                throw new Error('O rascunho local está inválido.');
            }
            await window.PlanMilT.drawingLoading.restore(state.drawings);
            for (const item of state.layers) {
                let layer = initialLayers.get(item.name);
                if (item.type === 'planning' && layer) {
                    restoreEntries(layer, item.entries);
                } else if (item.type === 'wms') {
                    if (layerRegistry[item.name]) continue;
                    layer = L.tileLayer.wms(item.url, { ...item.params, opacity: item.opacity });
                    addNewOverlayLayer(item.name, layer);
                } else if (item.type === 'group') {
                    if (layerRegistry[item.name]) continue;
                    layer = L.featureGroup();
                    restoreEntries(layer, item.entries);
                    addNewOverlayLayer(item.name, layer);
                } else if (item.type === 'image' && typeof item.url === 'string' && item.url.startsWith('data:image/')) {
                    if (layerRegistry[item.name]) continue;
                    layer = L.imageOverlay(item.url, item.bounds, { opacity: item.opacity });
                    addNewOverlayLayer(item.name, layer);
                } else if (item.type !== 'builtin' && item.type !== 'planning') {
                    throw new Error('Tipo de camada local inválido.');
                }
                if (!layer) continue;
                if (item.opacity !== undefined && layer.setOpacity) layer.setOpacity(item.opacity);
                if (item.active && !map.hasLayer(layer)) map.addLayer(layer);
                if (!item.active && map.hasLayer(layer)) map.removeLayer(layer);
            }
            if (state.coverageActive && !map.hasLayer(coverage)) map.addLayer(coverage);
            if (!state.coverageActive && map.hasLayer(coverage)) map.removeLayer(coverage);
            map.setView(state.center, state.zoom);
        }

        drawnItems.on('layeradd layerremove', () => { if (restoring) changedDuringStartup = true; else save(); });
        coverage.on('layeradd layerremove', () => { if (restoring) changedDuringStartup = true; else save(); });
        initialLayers.get('Sugestão de Planejamento')?.on('layeradd layerremove', save);
        map.on('draw:drawstart draw:editstart draw:deletestart overlayadd overlayremove mousedown touchstart', () => {
            if (restoring) changedDuringStartup = true;
        });
        map.on('draw:edited draw:deleted overlayadd overlayremove moveend layeradd layerremove planmilt:changed', save);
        document.getElementById('transparencySlider').addEventListener('change', save);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && timer !== undefined) {
                clearTimeout(timer);
                persist();
            }
        });

        try {
            db = await openDatabase();
            const state = await transact(db);
            if (state && !changedDuringStartup) {
                await restore(state);
                window.PlanMilT.localSessionRestored = true;
            }
            else if (state) {
                blocked = true;
                report('O rascunho anterior não foi carregado porque o mapa já foi alterado. Salve o trabalho atual e recarregue a página para recuperá-lo.',
                    new Error('Restauração cancelada para preservar as alterações atuais.'));
            }
            restoring = false;
            if (changedDuringStartup && !state) save();
        } catch (error) {
            report('Não foi possível recuperar o rascunho local. Os desenhos anteriores não foram substituídos.', error);
        }
    }

    return Object.freeze({ start });
})();
