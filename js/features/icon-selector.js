/**
 * @fileoverview Carrega ícones do servidor, monta o seletor da toolbar e expõe o ícone atualmente escolhido.
 * @exports window.PlanMilT.iconSelector
 * @requires Container, preview, Leaflet e API client
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.iconSelector = Object.freeze({
    defaultMarkerUrl: 'css/images/marker-icon.png',

    /**
     * Recria ícones persistidos, incluindo o nome legado do marcador padrão do Leaflet.
     * @param {Object} properties - Propriedades da feição.
     * @param {Object} leaflet - Namespace Leaflet.
     * @param {Object} [options] - Dimensões padrão para ícones personalizados.
     * @returns {Object} Ícone Leaflet.
     */
    createStoredIcon(properties, leaflet, options = {}) {
        if (properties.militarySymbol) {
            return window.PlanMilT.militarySymbols.createIcon(properties.militarySymbol, leaflet);
        }
        if (properties.iconUrl === 'marker-icon.png' || properties.iconUrl === this.defaultMarkerUrl) {
            return new leaflet.Icon.Default();
        }
        return leaflet.icon({ iconUrl: properties.iconUrl, iconSize: options.iconSize || [40, 40],
            iconAnchor: options.iconAnchor || [15, 15] });
    },

    /**
     * Carrega e conecta o seletor de ícones à toolbar e à prévia.
     * @param {Object} dependencies - Dependências externas necessárias para inicializar o módulo.
     * @param {HTMLElement} dependencies.container - Elemento DOM que recebe a interface do recurso.
     * @param {HTMLElement} dependencies.preview - Elemento DOM que exibe a pré-visualização do ícone.
     * @param {Object} dependencies.leaflet - Namespace Leaflet usado para criar camadas e controles.
     * @param {Object} dependencies.apiClient - Cliente compartilhado para chamadas à API.
     */
    attach({ container, preview, leaflet, apiClient }) {
        const iconCategories = [
            { label: 'Infantaria', names: `bda-inf-amv bda-inf-bld bda-inf-bld-planejada bda-inf-mec bda-inf-mec-planejada bda-inf-mtz bda-inf-mtz-planejada bda-inf-pqdt
                btl-inf-amv btl-inf-bld btl-inf-mec btl-inf-mnth btl-inf-mtz btl-inf-pqdt cia-inf-bld cia-inf-mec cia-inf-mtz
                ft-btl-inf-mec pc-bda-inf-bld-planejada pc-bda-inf-mec pc-bda-inf-mec-planejada pel-inf-mec pel-inf
                cia-ac corpo-ex pc-de ft-blt-inf-mec ft-btl-inf-bld ft-cia-inf-amv ft-cia-inf-mec
                cia-ass-civ cia-c-ap cia-pe de ft-bil-amv pc-de-pcp-planejada` },
            { label: 'Cavalaria', names: `bda-cav-bld bda-cav-bld-planejada bda-cav-mec bda-cav-mec-planejada esqd-c-bld esqd-c-mec
                ft-reg-c-mec pc-bda-cav-bld-planejada pc-bda-cav-mec-planejada pel-c-mec rgt-cav-bld rgt-cav-mec
                esqd-cav ft-cia-cav-mec ft-esqd-car-cmb ft-rgt-car-cmb ft-rgt-cav-mec reg-cav-bld reg-cav-mec` },
            { label: 'Artilharia', names: `art-c-ex art-div bda-aaae bia-105ar bia-aaae bia-art-cmp bia-art bia-mf gaaae
                gac-105ap gac-105ar gac-155ap gac-155apsr gac-155ar gac gac-155-AR glmf pc-art-div sç-art
                bia-cmdo cia-busc-alvos` },
            { label: 'Engenharia', names: `btl-eng btl-eng-cmb btl-eng-cnst cia-eng-amv cia-eng-bld cia-eng-l cia-eng-mec
                cia-eng-pnt cia-eng-pqdt gpt-eng pc-gpt-eng` },
            { label: 'Logística', names: 'bsau gpt-log btl-log' },
            { label: 'Comunicações', names: `bcom cia-c2 cia-com pel-com btl-com pc-cia-com pel-rad
                btl-com-ge cia-ge mae-confirmada mae-estimada mage-confirmada mage-estimada pel-ge
                bcomge bge gce gp-cntr-sist` },
            { label: 'Aviação', names: 'bavex esqd-avex' }
        ].map(category => ({ ...category, names: category.names.split(/\s+/).filter(Boolean) }));
        const icons = Object.create(null);
        const iconPaths = Object.create(null);
        let selectedIconKey = 'null';

        /**
         * Carrega os dados de ícones e prepara o seletor.
         */
        async function load() {
            const paths = await apiClient.getJson('symbols/icons.php');

            paths.forEach(iconPath => {
                const pathParts = iconPath.split('/');
                const iconFileName = pathParts.pop();
                const iconName = iconFileName.replace('.svg', '');
                const directoryName = pathParts.pop();
                const optionValue = `${directoryName}/${iconName}`;

                icons[optionValue] = leaflet.icon({
                    iconUrl: iconPath,
                    iconSize: [40, 40],
                    iconAnchor: [15, 15],
                    popupAnchor: [0, -15]
                });
                iconPaths[optionValue] = iconPath;
            });

            buildSelector();
        }

        /**
         * Monta no DOM as opções do seletor de ícones.
         */
        function buildSelector() {
            container.innerHTML = '';

            const toggleButton = document.createElement('button');
            toggleButton.id = 'iconSelectorToggle';
            toggleButton.type = 'button';
            toggleButton.textContent = 'Selecionar ícone';
            container.appendChild(toggleButton);

            const selectorContent = document.createElement('div');
            selectorContent.id = 'iconSelectorContent';
            selectorContent.style.display = 'none';
            container.appendChild(selectorContent);

            const iconsByDirectory = {};
            Object.keys(iconPaths).forEach(optionValue => {
                const [directoryName, iconName] = optionValue.split('/');
                iconsByDirectory[directoryName] = iconsByDirectory[directoryName] || [];
                iconsByDirectory[directoryName].push({
                    iconName,
                    optionValue,
                    iconPath: iconPaths[optionValue]
                });
            });

            const folderList = document.createElement('div');
            folderList.className = 'folder-list';
            const categoryList = document.createElement('div');
            categoryList.className = 'folder-list icon-category-list';
            const iconList = document.createElement('div');
            iconList.className = 'icon-list';

            /**
             * Destaca o botão ativo de uma lista de navegação.
             * @param {HTMLElement} list - Lista que contém os botões.
             * @param {HTMLElement} selected - Botão selecionado.
             */
            function selectButton(list, selected) {
                Array.from(list.children).forEach(button => {
                    button.setAttribute('aria-pressed', button === selected ? 'true' : 'false');
                });
            }

            /**
             * Mostra os ícones de um grupo, preservando suas chaves originais.
             * @param {Array<Object>} group - Ícones a apresentar.
             */
            function renderIcons(group) {
                group.forEach(iconData => {
                    const iconItem = document.createElement('div');
                    iconItem.className = 'icon-item';

                    const image = document.createElement('img');
                    image.src = iconData.iconPath;
                    image.alt = iconData.iconName;
                    image.title = iconData.iconName;
                    image.dataset.optionValue = iconData.optionValue;
                    image.className = 'icon-image';
                    image.addEventListener('click', function() {
                        selectedIconKey = this.dataset.optionValue;
                        preview.src = iconPaths[selectedIconKey];
                        preview.hidden = false;
                        selectorContent.style.display = 'none';
                    });

                    iconItem.appendChild(image);
                    iconList.appendChild(iconItem);
                });
            }

            const recentButton = document.createElement('button');
            recentButton.type = 'button';
            recentButton.className = 'folder-button';
            recentButton.textContent = 'Ícones gerados anteriormente';
            recentButton.setAttribute('aria-pressed', 'false');
            recentButton.addEventListener('click', () => {
                selectButton(folderList, recentButton);
                categoryList.innerHTML = '';
                iconList.innerHTML = '';
                const tray = document.createElement('div');
                tray.className = 'recent-symbol-tray';
                iconList.appendChild(tray);
                window.PlanMilT.militarySymbols.renderRecentTray(tray, data => {
                    selectMilitarySymbol(data);
                    selectorContent.style.display = 'none';
                });
            });
            folderList.appendChild(recentButton);

            [['friend', 'Amigo'], ['enemy', 'Inimigo']].forEach(([directoryName, affiliation]) => {
                const folderButton = document.createElement('button');
                folderButton.type = 'button';
                folderButton.textContent = affiliation;
                folderButton.className = 'folder-button';
                folderButton.setAttribute('aria-pressed', 'false');

                folderButton.addEventListener('click', () => {
                    selectButton(folderList, folderButton);
                    categoryList.innerHTML = '';
                    iconList.innerHTML = '';
                    const unclassified = (iconsByDirectory[directoryName] || []).filter(icon =>
                        !iconCategories.some(category => category.names.includes(icon.iconName))
                    );
                    if (unclassified.length) {
                        const heading = document.createElement('div');
                        heading.className = 'icon-group-heading';
                        heading.textContent = 'Ícones sem classificação';
                        iconList.appendChild(heading);
                        renderIcons(unclassified);
                    }

                    iconCategories.forEach(category => {
                        const categoryButton = document.createElement('button');
                        categoryButton.type = 'button';
                        categoryButton.className = 'folder-button';
                        categoryButton.textContent = category.label;
                        categoryButton.setAttribute('aria-pressed', 'false');
                        categoryButton.addEventListener('click', () => {
                            selectButton(categoryList, categoryButton);
                            iconList.innerHTML = '';
                            const group = (iconsByDirectory[directoryName] || []).filter(icon =>
                                category.names.includes(icon.iconName)
                            );
                            if (category.label === 'Comunicações' && (iconsByDirectory.c2 || []).length) {
                                const heading = document.createElement('div');
                                heading.className = 'icon-group-heading';
                                heading.textContent = affiliation;
                                iconList.appendChild(heading);
                                renderIcons(group);
                                const sharedHeading = document.createElement('div');
                                sharedHeading.className = 'icon-group-heading';
                                sharedHeading.textContent = 'C2 (comum)';
                                iconList.appendChild(sharedHeading);
                                renderIcons(iconsByDirectory.c2);
                            } else if (group.length) {
                                renderIcons(group);
                            } else {
                                const empty = document.createElement('p');
                                empty.textContent = 'Nenhum ícone nesta divisão.';
                                iconList.appendChild(empty);
                            }
                        });
                        categoryList.appendChild(categoryButton);
                    });
                });

                folderList.appendChild(folderButton);
            });

            selectorContent.appendChild(folderList);
            selectorContent.appendChild(categoryList);
            selectorContent.appendChild(iconList);
            toggleButton.addEventListener('click', function() {
                selectorContent.style.display = selectorContent.style.display === 'none' || selectorContent.style.display === ''
                    ? 'block'
                    : 'none';
            });
        }

        /**
         * Seleciona um ícone criado sem alterar os ícones existentes.
         * @param {Object} data - Imagem e metadados do símbolo.
         */
        function selectMilitarySymbol(data) {
            selectedIconKey = '__military_symbol__';
            icons[selectedIconKey] = window.PlanMilT.militarySymbols.createIcon(data, leaflet);
            icons[selectedIconKey].militarySymbol = data;
            preview.src = data.iconUrl;
            preview.hidden = false;
        }

        return Object.freeze({
            load,
            /**
             * Retorna a chave do ícone atualmente selecionado.
             */
            getSelectedIconKey() {
                return selectedIconKey;
            },
            /**
             * Retorna o objeto Leaflet do ícone atualmente selecionado.
             */
            getSelectedIcon() {
                return icons[selectedIconKey] || null;
            },
            /**
             * Seleciona um ícone criado sem alterar o catálogo de ícones existente.
             * @param {Object} data - Imagem e metadados do símbolo.
             */
            selectMilitarySymbol
        });
    }
});