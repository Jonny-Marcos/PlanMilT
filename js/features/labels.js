/**
 * @fileoverview Adiciona e atualiza rótulos de feições para o motor de posicionamento de labels.
 * @requires Leaflet e labelgun carregados pela página.
 */
/**
 * Oculta visualmente o rótulo fornecido pelo motor labelgun.
 * @param {*} label - Rótulo e elemento DOM administrados pelo motor labelgun.
 * @returns {void} Não retorna valor.
 */
var hideLabel = function(label) {
    label.labelObject.style.opacity = 0;
    label.labelObject.style.transition = 'opacity 0s';
};
/**
 * Exibe visualmente o rótulo fornecido pelo motor labelgun.
 * @param {*} label - Rótulo e elemento DOM administrados pelo motor labelgun.
 * @returns {void} Não retorna valor.
 */
var showLabel = function(label) {
    label.labelObject.style.opacity = 1;
    label.labelObject.style.transition = 'opacity 1s';
};
labelEngine = new labelgun.default(hideLabel, showLabel);

var id = 0;
var labels = [];
var totalMarkers = 0;

/**
 * Reinicia e recalcula os rótulos das camadas fornecidas.
 * @param {Array<*>} markers - Camadas Leaflet que contêm marcadores e rótulos.
 */
function resetLabels(markers) {
    labelEngine.reset();
    var i = 0;
    for (var j = 0; j < markers.length; j++) {
        markers[j].eachLayer(function(label){
            addLabel(label, ++i);
        });
    }
  labelEngine.update();
}

/**
 * Registra um rótulo de feição no motor de posicionamento de labels.
 * @param {Object} layer - Camada Leaflet ou feição processada.
 * @param {number} id - Identificador do elemento ou rótulo.
 */
function addLabel(layer, id) {

  // This is ugly but there is no getContainer method on the tooltip :(
  if (layer.getTooltip()) {
      var label = layer.getTooltip()._source._tooltip._container;
      if (label) {

        // We need the bounding rectangle of the label itself
        var rect = label.getBoundingClientRect();

        // We convert the container coordinates (screen space) to Lat/lng
        var bottomLeft = map.containerPointToLatLng([rect.left, rect.bottom]);
        var topRight = map.containerPointToLatLng([rect.right, rect.top]);
        var boundingBox = {
          bottomLeft : [bottomLeft.lng, bottomLeft.lat],
          topRight   : [topRight.lng, topRight.lat]
        };

        // Ingest the label into labelgun itself
        labelEngine.ingestLabel(
          boundingBox,
          id,
          parseInt(Math.random() * (5 - 1) + 1), // Weight
          label,
          "Test " + id,
          false
        );

        // If the label hasn't been added to the map already
        // add it and set the added flag to true
        if (!layer.added) {
          layer.addTo(map);
          layer.added = true;
        }
      }
  }
}