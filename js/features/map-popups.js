/**
 * @fileoverview Ajusta o conteúdo de popups gerados pelo mapa e os limites de impressão/visualização.
 * @requires Leaflet e variáveis do mapa carregadas no escopo legado.
 */
            /**
             * Remove do popup as linhas sem valor para a feição atual.
             * @param {string} content - Conteúdo do popup que será filtrado.
             * @param {Object} feature - Feição GeoJSON associada à camada.
             */
            function removeEmptyRowsFromPopupContent(content, feature) {
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = content;
                var rows = tempDiv.querySelectorAll('tr');
                for (var i = 0; i < rows.length; i++) {
                    var td = rows[i].querySelector('td.visible-with-data');
                    var key = td ? td.id : '';
                    if (td && td.classList.contains('visible-with-data') && feature.properties[key] == null) {
                        rows[i].parentNode.removeChild(rows[i]);
                    }
                }
                return tempDiv.innerHTML;
            }




            document.querySelector(".leaflet-popup-pane").addEventListener("load", function(event) {
                var tagName = event.target.tagName,
                    popup = map._popup;
                // Also check if flag is already set.
                if (tagName === "IMG" && popup && !popup._updated) {
                    popup._updated = true; // Set flag to prevent looping.
                    popup.update();
                }
            }, true);


            var measureControl = new L.Control.Measure({
                position: 'topright',
                primaryLengthUnit: 'meters',
                secondaryLengthUnit: 'kilometers',
                primaryAreaUnit: 'sqmeters',
                secondaryAreaUnit: 'hectares',
                activeColor: '#db4a29', // Cor das linhas ativas
                completedColor: '#9b2d14'
            });
            measureControl.addTo(map);

            // Personalizar o botão de alternância
            var measureToggleButton = document.getElementsByClassName('leaflet-control-measure-toggle')[0];
            measureToggleButton.innerHTML = '';
            measureToggleButton.className += ' fas fa-ruler';
            measureToggleButton.title = 'Medição'; // Adiciona um título em português



            var bounds_group = new L.featureGroup([]);
            /**
             * Ajusta os limites de visualização usados pelos controles do mapa.
             */
            function setBounds() {
            }



            // Adiciona o botão de exportação
            L.control.browserPrint({
                position: 'topright',
                title: 'Print ...',
            }).addTo(map);

            // Adiciona o controle de escala ao mapa
            L.control.scale({maxWidth: 100, metric: true, imperial: false, position: 'bottomleft'}).addTo(map);

            // Adiciona um evento de clique ao botão de impressão
            document.querySelector('.leaflet-control-browser-print a').addEventListener('click', function() {
                var originalZoom = map.getZoom();
                var targetZoom = 13; // Defina o nível de zoom desejado para a escala 1:50000

                // Ajusta o zoom do mapa para a escala desejada
                map.setZoom(targetZoom);

                // Garante que o controle de escala seja atualizado
                map.on('zoomend', function() {
                    setTimeout(function() {
                        // Chama a função de impressão padrão do navegador
                        window.print();

                        // Restaura o zoom original após a impressão
                        map.setZoom(originalZoom);
                    }, 1000); // Aguarda 1 segundo antes de imprimir para garantir que o mapa e a escala sejam atualizados
                });
            });







            // Função para salvar os desenhos via AJAX
