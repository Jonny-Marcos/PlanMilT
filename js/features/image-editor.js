/**
 * @fileoverview Inicializa sob demanda o editor de temas integrado ao mapa principal.
 * @requires Leaflet, Fabric.js, geocoder, API de imagens, DOM e SweetAlert2.
 */
(function () {
    const state = {
        map: null,
        canvas: null,
        geocoderControl: null,
        mode: 'image',
        mapShortcutHeld: false,
        mapDrag: null,
        width: 0,
        height: 0
    };
    const editor = document.getElementById('imageEditor');

    /**
     * Inicializa o mapa, o canvas e os controles do editor uma única vez.
     */
    function initializeEditor() {
        const mapElement = document.getElementById('imageEditorMap');
        const canvasElement = document.getElementById('imageEditorCanvas');

        fabric.filterBackend = new fabric.Canvas2dFilterBackend();
        fabric.Object.prototype.set({
            borderColor: '#333333',
            cornerColor: '#333333',
            cornerStrokeColor: '#ffffff',
            cornerSize: 14,
            transparentCorners: false,
            rotatingPointOffset: 20,
            padding: 0
        });

        state.canvas = new fabric.Canvas(canvasElement, {
            selection: true,
            preserveObjectStacking: true,
            width: mapElement.clientWidth,
            height: mapElement.clientHeight
        });
        state.canvas.wrapperEl.style.position = 'absolute';
        state.canvas.wrapperEl.style.top = '0';
        state.canvas.wrapperEl.style.left = '0';
        state.canvas.wrapperEl.style.zIndex = '500';
        state.canvas.wrapperEl.style.pointerEvents = 'auto';
        state.canvas.wrapperEl.style.overflow = 'visible';
        state.canvas.upperCanvasEl.style.pointerEvents = 'auto';
        state.canvas.upperCanvasEl.style.zIndex = '2';
        state.canvas.upperCanvasEl.style.touchAction = 'none';
        state.canvas.lowerCanvasEl.style.pointerEvents = 'none';
        state.canvas.lowerCanvasEl.style.zIndex = '1';
        state.canvas.skipTargetFind = false;
        state.canvas.selection = false;
        state.width = mapElement.clientWidth;
        state.height = mapElement.clientHeight;

        const mainMap = window.map;
        const initialCenter = mainMap ? mainMap.getCenter() : [-23.5505, -46.6333];
        const initialZoom = mainMap ? mainMap.getZoom() : 10;
        state.map = L.map(mapElement, {
            attributionControl: false,
            zoomControl: true,
            dragging: false,
            zoom: 10
        }).setView(initialCenter, initialZoom);

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
                element.id = 'image_editor_google_translate_element';
                element.style.backgroundColor = 'white';
                element.style.padding = '5px';
                element.style.borderRadius = '5px';
                element.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                return element;
            }
        });
        state.map.addControl(new TranslateControl());
        if (window.google?.translate?.TranslateElement) {
            new window.google.translate.TranslateElement({
                pageLanguage: 'pt-br'
            }, 'image_editor_google_translate_element');
        }

        state.geocoderControl = L.Control.geocoder({
            position: 'topright',
            placeholder: 'Buscar cidade...',
            errorMessage: 'Local não encontrado.',
            defaultMarkGeocode: false
        }).on('markgeocode', event => state.map.fitBounds(event.geocode.bbox));
        state.geocoderControl.addTo(state.map);

        const imageTools = new L.Control({ position: 'topleft' });
        imageTools.onAdd = () => {
            const element = L.DomUtil.get('imageEditorTools');
            L.DomEvent.disableClickPropagation(element);
            return element;
        };
        imageTools.addTo(state.map);

        addMapLayers();
        state.map.invalidateSize();
        mapElement.addEventListener('pointerdown', handleMapPointerDown, true);
        mapElement.addEventListener('pointermove', handleMapPointerMove);
        mapElement.addEventListener('pointerup', finishMapPointerDrag);
        mapElement.addEventListener('pointercancel', finishMapPointerDrag);
        setMode('image');
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
        showMainMenu();
        if (!state.map) {
            initializeEditor();
        } else {
            setMode('image');
            requestAnimationFrame(resizeEditor);
        }
    }

    /**
     * Fecha o editor e recalcula o tamanho do mapa principal.
     */
    function closeImageEditor() {
        editor.hidden = true;
        showMainMenu();
        if (window.map) {
            requestAnimationFrame(() => window.map.invalidateSize());
        }
    }

    /**
     * Alterna entre posicionar a imagem e navegar pelo mapa.
     * @param {'image'|'map'} mode Modo de interação ativo.
     */
    function setMode(mode) {
        state.mode = mode;
        const isMapMode = mode === 'map';
        const modeButton = document.getElementById('imageEditorMode');
        const hasImage = state.canvas.getObjects().some(object => object.type === 'image');
        const hint = document.getElementById('imageEditorHint');
        const modeLabel = document.getElementById('imageEditorModeLabel');
        modeLabel.textContent = isMapMode ? 'Posicionar imagem' : 'Mover mapa';
        modeButton.setAttribute('aria-pressed', String(isMapMode));
        modeButton.classList.toggle('image-editor-mode-active', isMapMode);
        hint.hidden = !hasImage;
        hint.textContent = isMapMode
            ? 'Arraste para navegar; volte a Posicionar imagem para editar.'
            : 'Arraste a imagem para mover; use os cantos para redimensionar ou esticar e a alça superior para girar.';
        state.canvas.selection = !isMapMode;
        state.canvas.wrapperEl.style.pointerEvents = isMapMode ? 'none' : 'auto';
        [state.map.zoomControl.getContainer(), state.geocoderControl.getContainer()]
            .forEach(control => {
                control.hidden = !isMapMode;
                control.style.display = isMapMode ? '' : 'none';
            });

        ['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'boxZoom', 'keyboard', 'touchZoom']
            .forEach(interaction => {
                const handler = state.map[interaction];
                if (!handler) return;
                if (isMapMode) {
                    handler.enable();
                } else {
                    handler.disable();
                }
            });
        if (isMapMode) {
            state.canvas.discardActiveObject();
            state.canvas.renderAll();
        } else {
            const image = state.canvas.getObjects().find(object => object.type === 'image');
            if (image) state.canvas.setActiveObject(image);
        }
    }

    /**
     * Desloca o mapa em uma direção sem alterar a posição da imagem.
     * @param {'up'|'down'|'left'|'right'} direction Direção do deslocamento.
     */
    function panMap(direction) {
        const offsets = {
            up: [0, -120],
            down: [0, 120],
            left: [-120, 0],
            right: [120, 0]
        };
        const offset = offsets[direction];
        if (offset) state.map.panBy(offset);
    }

    /**
     * Aplica o zoom solicitado pelos controles do editor.
     * @param {'in'|'out'} direction Aproximar ou afastar o mapa.
     */
    function zoomMap(direction) {
        if (direction === 'in') state.map.zoomIn();
        if (direction === 'out') state.map.zoomOut();
    }

    /**
     * Ignora atalhos de navegação enquanto o usuário interage com campos editáveis.
     * @param {EventTarget} target Elemento que recebeu o evento de teclado.
     * @returns {boolean} Se o foco está em um campo editável.
     */
    function isEditableTarget(target) {
        return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
    }

    /**
     * Inicia o arrasto manual do mapa quando Espaço ou Alt estiver pressionado.
     * @param {PointerEvent} event Evento de ponteiro.
     */
    function handleMapPointerDown(event) {
        if (!state.mapShortcutHeld && !event.altKey) return;
        if (event.target.closest?.('.leaflet-control, button, input, select, textarea, a')) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        state.map.dragging.disable();
        state.mapDrag = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            target: event.currentTarget
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    /**
     * Move o mapa conforme o deslocamento do ponteiro capturado.
     * @param {PointerEvent} event Evento de ponteiro.
     */
    function handleMapPointerMove(event) {
        if (!state.mapDrag || state.mapDrag.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - state.mapDrag.x;
        const deltaY = event.clientY - state.mapDrag.y;
        state.mapDrag.x = event.clientX;
        state.mapDrag.y = event.clientY;
        event.preventDefault();
        state.map.panBy([deltaX, deltaY], { animate: false });
    }

    /**
     * Finaliza o arrasto manual do mapa e restaura a interação do modo atual.
     * @param {PointerEvent} event Evento de ponteiro ou cancelamento.
     */
    function finishMapPointerDrag(event) {
        if (!state.mapDrag || (event.pointerId !== undefined &&
            state.mapDrag.pointerId !== event.pointerId)) return;
        const { pointerId, target } = state.mapDrag;
        state.mapDrag = null;
        if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
        if (state.mode === 'map') state.map.dragging.enable();
    }

    /**
     * Permite arrastar o mapa mantendo Espaço ou Alt pressionado.
     * @param {KeyboardEvent} event Evento de teclado.
     */
    function handleMapShortcutDown(event) {
        if (editor.hidden || event.repeat || isEditableTarget(event.target)) return;
        if (event.code !== 'Space' && event.key !== 'Alt') return;
        event.preventDefault();
        state.mapShortcutHeld = true;
        setMode('map');
    }

    /**
     * Retorna ao posicionamento da imagem quando Espaço ou Alt é solto.
     * @param {KeyboardEvent} event Evento de teclado.
     */
    function handleMapShortcutUp(event) {
        if (editor.hidden || (event.code !== 'Space' && event.key !== 'Alt')) return;
        state.mapShortcutHeld = false;
        if (state.mapDrag) finishMapPointerDrag({});
        setMode('image');
    }

    /**
     * Mostra o menu principal e esconde os ajustes.
     */
    function showMainMenu() {
        document.getElementById('imageEditorMainMenu').hidden = false;
        document.getElementById('imageEditorAdjustmentMenu').hidden = true;
        document.getElementById('imageEditorOpenAdjustments').setAttribute('aria-expanded', 'false');
    }

    /**
     * Abre a tela de ajustes no lugar do menu principal.
     */
    function showAdjustmentMenu() {
        document.getElementById('imageEditorMainMenu').hidden = true;
        document.getElementById('imageEditorAdjustmentMenu').hidden = false;
        document.getElementById('imageEditorOpenAdjustments').setAttribute('aria-expanded', 'true');
    }

    /**
     * Mantém canvas e mapa alinhados quando o editor muda de tamanho.
     */
    function resizeEditor() {
        if (editor.hidden || !state.map || !state.canvas) return;
        const mapElement = document.getElementById('imageEditorMap');
        const width = mapElement.clientWidth;
        const height = mapElement.clientHeight;
        const offsetX = (width - state.width) / 2;
        const offsetY = (height - state.height) / 2;

        state.canvas.getObjects().forEach(object => {
            object.set({
                left: object.left + offsetX,
                top: object.top + offsetY
            });
            object.setCoords();
        });
        state.canvas.setDimensions({ width, height });
        state.canvas.renderAll();
        state.width = width;
        state.height = height;
        state.map.invalidateSize();
    }

    /**
     * Carrega a imagem no centro do mapa sem alterar o tamanho da área de edição.
     * @param {File} file Imagem selecionada pelo usuário.
     */
    function loadImage(file) {
        if (!file || !file.type.startsWith('image/')) {
            Swal.fire('Arquivo inválido', 'Escolha um arquivo de imagem para criar o tema.', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => {
            console.error('[PlanMilT][Editor] Falha ao ler o arquivo de imagem.');
            Swal.fire('Erro!', 'Não foi possível ler a imagem selecionada.', 'error');
        };
        reader.onload = event => {
            fabric.Image.fromURL(event.target.result, image => {
                if (!image || image.width <= 0 || image.height <= 0) {
                    console.error('[PlanMilT][Editor] O arquivo selecionado não pôde ser decodificado como imagem.');
                    Swal.fire('Erro!', 'Não foi possível abrir a imagem selecionada.', 'error');
                    return;
                }
                const scale = Math.min(
                    (state.width * 0.8) / image.width,
                    (state.height * 0.8) / image.height
                );
                image.set({
                    scaleX: scale,
                    scaleY: scale,
                    originX: 'center',
                    originY: 'center',
                    left: state.width / 2,
                    top: state.height / 2,
                    selectable: true,
                    evented: true,
                    hasControls: true,
                    hasBorders: true,
                    lockMovementX: false,
                    lockMovementY: false,
                    lockScalingX: false,
                    lockScalingY: false,
                    lockRotation: false,
                    lockUniScaling: false
                });

                state.canvas.clear();
                image.setCoords();
                state.canvas.add(image);
                state.canvas.setActiveObject(image);
                state.canvas.calcOffset();
                state.canvas.renderAll();
                document.getElementById('imageEditorDropHint').hidden = true;
                document.getElementById('imageEditorBrightness').value = '1';
                document.getElementById('imageEditorContrast').value = '1';
                setMode('image');
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
        if (!activeObject || activeObject.type !== 'image') return;
        state.canvas.remove(activeObject);
        state.canvas.discardActiveObject();
        state.canvas.renderAll();
        document.getElementById('imageEditorDropHint').hidden = false;
        setMode('image');
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
        if (!state.canvas.getObjects().some(object => object.type === 'image')) {
            await Swal.fire('Imagem necessária', 'Envie uma imagem antes de salvar o tema.', 'warning');
            return;
        }
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
        event.target.value = '';
    });
    document.getElementById('imageEditorBrightness').addEventListener('input', event => {
        applyFilter('Brightness', { brightness: parseFloat(event.target.value) - 1 });
    });
    document.getElementById('imageEditorContrast').addEventListener('input', event => {
        applyFilter('Contrast', { contrast: parseFloat(event.target.value) });
    });
    document.getElementById('imageEditorTools').addEventListener('click', event => {
        if (event.target.closest('[data-image-editor-back]')) {
            showMainMenu();
            return;
        }
        if (event.target.closest('#imageEditorOpenAdjustments')) {
            showAdjustmentMenu();
            return;
        }
        const action = event.target.closest('[data-image-editor-action]')?.dataset.imageEditorAction;
        const actions = {
            save: saveImage,
            'remove-background': removeBackground,
            grayscale: applyGrayscale,
            reset: resetImage,
            remove: removeImage
        };
        if (action && actions[action]) actions[action]();
    });
    document.getElementById('imageEditorMode').addEventListener('click', () => {
        setMode(state.mode === 'image' ? 'map' : 'image');
    });
    document.getElementById('imageEditorNavigation').addEventListener('click', event => {
        const panDirection = event.target.closest('[data-image-editor-pan]')?.dataset.imageEditorPan;
        if (panDirection) {
            panMap(panDirection);
            return;
        }
        const zoomDirection = event.target.closest('[data-image-editor-zoom]')?.dataset.imageEditorZoom;
        if (zoomDirection) zoomMap(zoomDirection);
    });
    editor.addEventListener('dragover', event => {
        event.preventDefault();
        editor.classList.add('is-drop-target');
    });
    editor.addEventListener('dragleave', event => {
        if (!editor.contains(event.relatedTarget)) {
            editor.classList.remove('is-drop-target');
        }
    });
    editor.addEventListener('drop', event => {
        event.preventDefault();
        editor.classList.remove('is-drop-target');
        const file = event.dataTransfer?.files?.[0];
        if (file) loadImage(file);
    });
    window.addEventListener('resize', resizeEditor);
    window.addEventListener('keydown', handleMapShortcutDown, true);
    window.addEventListener('keyup', handleMapShortcutUp, true);
    window.addEventListener('blur', () => {
        state.mapShortcutHeld = false;
        if (state.mapDrag) finishMapPointerDrag({});
        if (!editor.hidden && state.mode === 'map') setMode('image');
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
