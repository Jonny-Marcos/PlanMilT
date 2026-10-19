/**
 * @fileoverview Inicializa sob demanda o editor de temas integrado ao mapa principal.
 * @requires Leaflet, Fabric.js, geocoder, API de imagens, DOM e SweetAlert2.
 */
(function () {
    const state = {
        map: null,
        canvas: null
    };
    const editor = document.getElementById('imageEditor');

    /**
     * Inicializa o mapa, o canvas e os controles do editor uma única vez.
     */
    function initializeEditor() {
        const mapElement = document.getElementById('imageEditorMap');
        const canvasElement = document.getElementById('imageEditorCanvas');

        fabric.Object.prototype.set({
            borderColor: '#333333',
            cornerColor: '#333333',
            cornerStrokeColor: '#ffffff',
            cornerSize: 12,
            transparentCorners: false,
            rotatingPointOffset: 20,
            padding: 0
        });

        state.canvas = new fabric.Canvas(canvasElement, {
            selection: true,
            width: mapElement.offsetWidth,
            height: mapElement.offsetHeight
        });
        state.canvas.wrapperEl.style.position = 'absolute';
        state.canvas.wrapperEl.style.top = '0';
        state.canvas.wrapperEl.style.left = '0';
        state.canvas.wrapperEl.style.zIndex = '500';

        state.map = L.map(mapElement, {
            attributionControl: false,
            zoomControl: true,
            dragging: true,
            zoom: 10
        }).setView([-23.5505, -46.6333], 10);

        L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', {
            opacity: 1,
            attribution: '',
            minZoom: 1,
            maxZoom: 28,
            minNativeZoom: 0,
            maxNativeZoom: 18
        }).addTo(state.map);

        const TranslateControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd: () => {
                const element = L.DomUtil.create('div', 'google-translate-control leaflet-bar');
                element.id = 'google_translate_element';
                element.style.backgroundColor = 'white';
                element.style.padding = '5px';
                element.style.borderRadius = '5px';
                element.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                return element;
            }
        });
        state.map.addControl(new TranslateControl());
        if (window.google?.translate && typeof window.googleTranslateElementInit === 'function') {
            window.googleTranslateElementInit();
        }

        L.Control.geocoder({
            position: 'topright',
            placeholder: 'Buscar cidade...',
            errorMessage: 'Local não encontrado.',
            defaultMarkGeocode: false
        }).on('markgeocode', event => state.map.fitBounds(event.geocode.bbox)).addTo(state.map);

        const imageTools = new L.Control({ position: 'topleft' });
        imageTools.onAdd = () => {
            const element = L.DomUtil.get('imageEditorTools');
            L.DomEvent.disableClickPropagation(element);
            return element;
        };
        imageTools.addTo(state.map);

        addMapLayers();
        state.map.invalidateSize();
    }

    /**
     * Adiciona as quadrículas UTM e a camada BDGEx ao controle de camadas.
     */
    function addMapLayers() {
        const utmGrids = L.layerGroup();
        const gridColors = ['#080', '#800', '#880', '#008', '#080', '#800', '#880'];
        gridColors.forEach((color, index) => {
            utmGrids.addLayer(L.utmGrid(index + 19, true, {
                color,
                showAxisLabels: [100, 1000, 10000, 100000],
                showSquareLabels: [100000],
                showAxis100km: true
            }));
        });

        state.map.addLayer(utmGrids);
        const bdgexLayer = L.tileLayer.wms('https://bdgex.eb.mil.br/mapcache', {
            layers: 'ctm50',
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            tileSize: 96,
            crs: L.CRS.EPSG4326,
            dpiMode: 7,
            tileMatrixSet: 'ctm50-wmsc-2'
        });

        L.control.layers(null, {
            'Quadrículas - UTM': utmGrids,
            'BDGEx - CTM50': bdgexLayer
        }, { collapsed: false }).addTo(state.map);
    }

    /**
     * Abre o editor e cria seus componentes apenas na primeira utilização.
     */
    function openImageEditor() {
        editor.hidden = false;
        if (!state.map) {
            initializeEditor();
        } else {
            requestAnimationFrame(() => state.map.invalidateSize());
        }
    }

    /**
     * Fecha o editor e recalcula o tamanho do mapa principal.
     */
    function closeImageEditor() {
        editor.hidden = true;
        if (window.map) {
            requestAnimationFrame(() => window.map.invalidateSize());
        }
    }

    /**
     * Move o mapa do editor em uma das quatro direções.
     * @param {'up'|'down'|'left'|'right'} direction Direção do deslocamento.
     */
    function moveMap(direction) {
        const offsets = {
            up: [0, -100],
            down: [0, 100],
            left: [-100, 0],
            right: [100, 0]
        };
        if (offsets[direction]) {
            state.map.panBy(offsets[direction]);
        }
    }

    /**
     * Carrega um arquivo local no canvas e ajusta a área de edição ao seu tamanho.
     * @param {File} file Imagem selecionada pelo usuário.
     */
    function loadImage(file) {
        const reader = new FileReader();
        reader.onerror = () => {
            console.error('[PlanMilT][Editor] Falha ao ler o arquivo de imagem.');
            Swal.fire('Erro!', 'Não foi possível ler a imagem selecionada.', 'error');
        };
        reader.onload = event => {
            fabric.Image.fromURL(event.target.result, image => {
                const imageTextureSize = Math.max(image.width, image.height);
                if (imageTextureSize > fabric.textureSize) {
                    fabric.textureSize = imageTextureSize;
                }

                const maxDimension = imageTextureSize * (Math.sqrt(2) / 2);
                const canvasElement = document.getElementById('imageEditorCanvas');
                const mapElement = document.getElementById('imageEditorMap');
                canvasElement.width = maxDimension;
                canvasElement.height = maxDimension;
                state.canvas.setWidth(maxDimension);
                state.canvas.setHeight(maxDimension);

                const scale = Math.min(maxDimension / image.width, maxDimension / image.height);
                image.set({
                    scaleX: scale,
                    scaleY: scale,
                    originX: 'center',
                    originY: 'center',
                    left: maxDimension / 2,
                    top: maxDimension / 2
                });

                state.canvas.clear();
                state.canvas.add(image);
                state.canvas.renderAll();
                mapElement.style.width = `${maxDimension}px`;
                mapElement.style.height = `${maxDimension}px`;
                state.map.invalidateSize();
            }, { crossOrigin: 'anonymous' });
        };
        reader.readAsDataURL(file);
    }

    /**
     * Atualiza ou adiciona um filtro Fabric à imagem ativa.
     * @param {string} filterType Nome do filtro Fabric.
     * @param {Object} options Opções do filtro.
     */
    function applyFilter(filterType, options) {
        const activeObject = state.canvas.getActiveObject();
        if (!activeObject) return;
        let filter = activeObject.filters.find(item => item && item.type === filterType);
        if (filter) {
            Object.assign(filter, options);
        } else {
            filter = new fabric.Image.filters[filterType](options);
            activeObject.filters.push(filter);
        }
        activeObject.applyFilters();
        state.canvas.renderAll();
    }

    /**
     * Remove a cor branca da imagem selecionada.
     */
    function removeBackground() {
        const activeObject = state.canvas.getActiveObject();
        if (!activeObject) {
            console.warn('[PlanMilT][Editor] Selecione uma imagem antes de remover o fundo.');
            return;
        }
        if (activeObject.type !== 'image') return;

        let filter = activeObject.filters.find(item => item && item.type === 'RemoveColor');
        if (!filter) {
            filter = new fabric.Image.filters.RemoveColor({ threshold: 200, color: '#FFFFFF' });
            activeObject.filters.push(filter);
        } else {
            Object.assign(filter, { threshold: 200, color: '#FFFFFF' });
        }
        activeObject.applyFilters();

        const maxDimension = Math.max(activeObject.getScaledWidth(), activeObject.getScaledHeight());
        const scaleReduction = maxDimension > 4000 ? 4000 / maxDimension : 1;
        activeObject.set({
            left: state.canvas.width / 2,
            top: state.canvas.height / 2,
            scaleX: activeObject.scaleX * scaleReduction,
            scaleY: activeObject.scaleY * scaleReduction,
            originX: 'center',
            originY: 'center'
        });
        state.canvas.renderAll();
    }

    /**
     * Remove os filtros da imagem selecionada.
     */
    function resetImage() {
        const activeObject = state.canvas.getActiveObject();
        if (!activeObject) return;
        activeObject.filters = [];
        activeObject.applyFilters();
        state.canvas.renderAll();
    }

    /**
     * Remove a imagem selecionada do canvas.
     */
    function removeImage() {
        const activeObject = state.canvas.getActiveObject();
        if (!activeObject) return;
        state.canvas.remove(activeObject);
        state.canvas.discardActiveObject();
        state.canvas.renderAll();
    }

    /**
     * Alterna o filtro de escala de cinza da imagem selecionada.
     */
    function applyGrayscale() {
        const activeObject = state.canvas.getActiveObject();
        if (!activeObject) {
            alert('Por favor, selecione uma imagem para aplicar o filtro.');
            return;
        }
        if (activeObject.filters.some(filter => filter && filter.type === 'Grayscale')) {
            alert('O filtro de escala de cinza já está aplicado nesta imagem.');
            return;
        }
        activeObject.filters.push(new fabric.Image.filters.Grayscale());
        activeObject.applyFilters();
        state.canvas.renderAll();
    }

    /**
     * Solicita os dados da imagem e envia o calco com seus limites geográficos.
     */
    async function saveImage() {
        state.canvas.renderAll();
        const imageDataUrl = state.canvas.toDataURL('image/png', 1);
        const mapBounds = state.map.getBounds();
        const canvasBounds = [
            [mapBounds.getNorthWest().lat, mapBounds.getNorthWest().lng],
            [mapBounds.getSouthEast().lat, mapBounds.getSouthEast().lng]
        ];

        const { value: formValues } = await Swal.fire({
            title: 'Salvar Imagem',
            html: '<label for="descricao">Título do Calco:</label>' +
                '<input id="swal-input1" class="swal2-input" placeholder="Digite o título">' +
                '<label for="senha">Senha (opcional):</label>' +
                '<input id="swal-input2" class="swal2-input" type="password" placeholder="Digite a senha">' +
                '<label><input type="checkbox" id="swal-input3"> Compartilhar sem senha</label>',
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Salvar',
            preConfirm: () => {
                const descricao = document.getElementById('swal-input1').value;
                const senha = document.getElementById('swal-input2').value;
                const compartilhavel = document.getElementById('swal-input3').checked;
                if (!descricao) {
                    Swal.showValidationMessage('O título do Calco é obrigatório!');
                    return false;
                }
                return { descricao, senha, compartilhavel };
            }
        });
        if (!formValues) return;

        const formData = new FormData();
        formData.append('descricao', formValues.descricao);
        formData.append('senha', formValues.senha);
        formData.append('compartilhavel', formValues.compartilhavel);
        formData.append('imagem', imageDataUrl);
        formData.append('localizacao', JSON.stringify(canvasBounds));

        try {
            const response = await window.PlanMilT.apiClient.request('image-save.php', {
                method: 'POST',
                body: formData
            });
            const message = (await response.text()).trim();
            if (!response.ok || message !== 'Imagem salva com sucesso!') {
                console.error('[PlanMilT][Imagens] Servidor recusou o salvamento.', {
                    status: response.status
                });
                await Swal.fire('Erro!', 'Erro ao salvar a imagem.', 'error');
                return;
            }
            console.info('[PlanMilT][Imagens] Imagem salva.', {
                compartilhavel: formValues.compartilhavel
            });
            await Swal.fire('Sucesso!', 'Imagem salva com sucesso!', 'success');
        } catch (error) {
            console.error('[PlanMilT][Imagens] Falha na requisição de salvamento.', error);
            await Swal.fire('Erro!', 'Erro ao salvar a imagem.', 'error');
        }
    }

    document.getElementById('closeImageEditor').addEventListener('click', closeImageEditor);
    document.getElementById('imageEditorFile').addEventListener('change', event => {
        if (event.target.files[0]) loadImage(event.target.files[0]);
    });
    document.getElementById('imageEditorBrightness').addEventListener('input', event => {
        applyFilter('Brightness', { brightness: parseFloat(event.target.value) - 1 });
    });
    document.getElementById('imageEditorContrast').addEventListener('input', event => {
        applyFilter('Contrast', { contrast: parseFloat(event.target.value) });
    });
    document.getElementById('imageEditorTools').addEventListener('click', event => {
        const action = event.target.closest('[data-image-editor-action]')?.dataset.imageEditorAction;
        const actions = {
            save: saveImage,
            'remove-background': removeBackground,
            grayscale: applyGrayscale,
            reset: resetImage,
            remove: removeImage
        };
        if (action && actions[action]) actions[action]();

        const direction = event.target.closest('[data-image-editor-move]')?.dataset.imageEditorMove;
        if (direction) moveMap(direction);
    });

    window.PlanMilT = window.PlanMilT || {};
    window.PlanMilT.openImageEditor = openImageEditor;

    if (new URLSearchParams(window.location.search).has('abrir-criador-tema')) {
        const url = new URL(window.location.href);
        url.searchParams.delete('abrir-criador-tema');
        window.history.replaceState(null, '', url);
        openImageEditor();
    }
})();
