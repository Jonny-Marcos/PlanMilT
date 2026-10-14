/**
 * @fileoverview Carrega ícones do servidor, monta o seletor da toolbar e expõe o ícone atualmente escolhido.
 * @exports window.PlanMilT.iconSelector
 * @requires Container, preview, Leaflet e API client
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.iconSelector = Object.freeze({
    /**
     * Carrega e conecta o seletor de ícones à toolbar e à prévia.
     * @param {Object} dependencies - Dependências externas necessárias para inicializar o módulo.
     * @param {HTMLElement} dependencies.container - Elemento DOM que recebe a interface do recurso.
     * @param {HTMLElement} dependencies.preview - Elemento DOM que exibe a pré-visualização do ícone.
     * @param {Object} dependencies.leaflet - Namespace Leaflet usado para criar camadas e controles.
     * @param {Object} dependencies.apiClient - Cliente compartilhado para chamadas à API.
     */
    attach({ container, preview, leaflet, apiClient }) {
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
            const iconList = document.createElement('div');
            iconList.className = 'icon-list';

            Object.keys(iconsByDirectory).forEach(directoryName => {
                const folderButton = document.createElement('button');
                folderButton.textContent = directoryName;
                folderButton.dataset.directory = directoryName;
                folderButton.className = 'folder-button';

                folderButton.addEventListener('click', function() {
                    const selectedDirectory = this.dataset.directory;
                    iconList.innerHTML = '';

                    iconsByDirectory[selectedDirectory].forEach(iconData => {
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
                            preview.style.display = 'inline';
                            preview.style.width = '40px';
                            preview.style.height = '40px';
                            selectorContent.style.display = 'none';
                            toggleButton.textContent = 'Ícone selecionado: ';
                        });

                        iconItem.appendChild(image);
                        iconList.appendChild(iconItem);
                    });
                });

                folderList.appendChild(folderButton);
            });

            selectorContent.appendChild(folderList);
            selectorContent.appendChild(iconList);
            toggleButton.addEventListener('click', function() {
                selectorContent.style.display = selectorContent.style.display === 'none' || selectorContent.style.display === ''
                    ? 'block'
                    : 'none';
            });
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
            }
        });
    }
});