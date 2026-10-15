<?php
declare(strict_types=1);

namespace PlanMilT\Tools;

use DOMDocument;
use DOMElement;
use DOMXPath;
use InvalidArgumentException;

final class WmsCapabilitiesParser
{
    /**
     * Extrai metadados descritivos das camadas nomeadas de um documento WMS.
     *
     * @param string $xml Documento XML retornado por GetCapabilities.
    * @return array{version: string, info_formats: array<int, string>, layers: array<int, array{name: string, title: string, abstract: string, keywords: array<int, string>, queryable: string, crs: array<int, string>, bbox: array{minx: float, miny: float, maxx: float, maxy: float}|null}>}
     */
    public static function parse(string $xml): array
    {
        $document = new DOMDocument();
        $previousErrorMode = libxml_use_internal_errors(true);

        try {
            $loaded = $document->loadXML($xml, LIBXML_NONET | LIBXML_NOBLANKS);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previousErrorMode);
        }

        if (!$loaded || !in_array($document->documentElement?->localName, ['WMS_Capabilities', 'WMT_MS_Capabilities'], true)) {
            throw new InvalidArgumentException('Documento WMS GetCapabilities inválido.');
        }

        $xpath = new DOMXPath($document);
        $rootLayer = $xpath->query('./*[local-name()="Capability"]/*[local-name()="Layer"]', $document->documentElement)?->item(0);
        if (!$rootLayer instanceof DOMElement) {
            throw new InvalidArgumentException('Documento WMS sem camada raiz.');
        }

        $infoFormats = [];
        foreach ($xpath->query('./*[local-name()="Capability"]/*[local-name()="Request"]/*[local-name()="GetFeatureInfo"]/*[local-name()="Format"]', $document->documentElement) ?: [] as $format) {
            $value = self::normalizeText($format->textContent);
            if ($value !== '') {
                $infoFormats[] = $value;
            }
        }

        $layers = [];
        self::appendLayers($rootLayer, $xpath, '', [], null, $layers);

        return [
            'version' => $document->documentElement->getAttribute('version'),
            'info_formats' => array_values(array_unique($infoFormats)),
            'layers' => $layers,
        ];
    }

    /**
     * Percorre grupos e camadas filhas, preservando o atributo queryable herdado.
     *
     * @param DOMElement $parent Camada ou grupo WMS atual.
     * @param DOMXPath $xpath Seletor XML do documento.
     * @param string $inheritedQueryable Valor queryable herdado do grupo pai.
     * @param array<int, string> $inheritedCrs CRS herdados do grupo pai.
     * @param array{minx: float, miny: float, maxx: float, maxy: float}|null $inheritedBbox Extensão geográfica herdada.
     * @param array<int, array{name: string, title: string, abstract: string, keywords: array<int, string>, queryable: string, crs: array<int, string>, bbox: array{minx: float, miny: float, maxx: float, maxy: float}|null}> $layers Camadas encontradas.
     */
    private static function appendLayers(
        DOMElement $parent,
        DOMXPath $xpath,
        string $inheritedQueryable,
        array $inheritedCrs,
        ?array $inheritedBbox,
        array &$layers
    ): void
    {
        $queryable = $parent->hasAttribute('queryable') ? $parent->getAttribute('queryable') : $inheritedQueryable;
        $crs = $inheritedCrs;
        foreach ($xpath->query('./*[local-name()="CRS" or local-name()="SRS"]', $parent) ?: [] as $crsNode) {
            foreach (preg_split('/\s+/', self::normalizeText($crsNode->textContent)) ?: [] as $value) {
                $value = strtoupper($value);
                if (in_array($value, ['EPSG:4326', 'CRS:84'], true)) {
                    $crs[] = $value;
                }
            }
        }
        $crs = array_values(array_unique($crs));
        $bbox = self::directGeographicBbox($xpath, $parent) ?? $inheritedBbox;
        $name = self::directText($xpath, $parent, 'Name');

        if ($name !== '') {
            $keywords = [];
            foreach ($xpath->query('./*[local-name()="KeywordList"]/*[local-name()="Keyword"]', $parent) ?: [] as $keyword) {
                $value = self::normalizeText($keyword->textContent);
                if ($value !== '') {
                    $keywords[] = $value;
                }
            }

            $layers[] = [
                'name' => $name,
                'title' => self::directText($xpath, $parent, 'Title'),
                'abstract' => self::directText($xpath, $parent, 'Abstract'),
                'keywords' => $keywords,
                'queryable' => $queryable,
                'crs' => $crs,
                'bbox' => $bbox,
            ];
        }

        foreach ($xpath->query('./*[local-name()="Layer"]', $parent) ?: [] as $child) {
            if ($child instanceof DOMElement) {
                self::appendLayers($child, $xpath, $queryable, $crs, $bbox, $layers);
            }
        }
    }

    /**
     * Lê a extensão geográfica sem ambiguidade de ordem dos eixos.
     *
     * @param DOMXPath $xpath Seletor XML do documento.
     * @param DOMElement $parent Elemento de camada.
     * @return array{minx: float, miny: float, maxx: float, maxy: float}|null
     */
    private static function directGeographicBbox(DOMXPath $xpath, DOMElement $parent): ?array
    {
        $geographic = $xpath->query('./*[local-name()="EX_GeographicBoundingBox"]', $parent)?->item(0);
        if ($geographic instanceof DOMElement) {
            $bounds = [];
            foreach ([
                'westBoundLongitude' => 'minx',
                'southBoundLatitude' => 'miny',
                'eastBoundLongitude' => 'maxx',
                'northBoundLatitude' => 'maxy',
            ] as $elementName => $key) {
                $value = self::directText($xpath, $geographic, $elementName);
                if ($value === '' || !is_numeric($value)) {
                    return null;
                }
                $bounds[$key] = (float) $value;
            }

            return self::validBbox($bounds) ? $bounds : null;
        }

        $legacy = $xpath->query('./*[local-name()="LatLonBoundingBox"]', $parent)?->item(0);
        if ($legacy instanceof DOMElement) {
            $bounds = [];
            foreach (['minx', 'miny', 'maxx', 'maxy'] as $key) {
                if (!$legacy->hasAttribute($key) || !is_numeric($legacy->getAttribute($key))) {
                    return null;
                }
                $bounds[$key] = (float) $legacy->getAttribute($key);
            }

            return self::validBbox($bounds) ? $bounds : null;
        }

        return null;
    }

    /**
     * Confere se a extensão contém coordenadas geográficas plausíveis.
     *
     * @param array{minx: float, miny: float, maxx: float, maxy: float} $bbox Extensão candidata.
     */
    private static function validBbox(array $bbox): bool
    {
        return $bbox['minx'] >= -180 && $bbox['maxx'] <= 180
            && $bbox['miny'] >= -90 && $bbox['maxy'] <= 90
            && $bbox['minx'] < $bbox['maxx'] && $bbox['miny'] < $bbox['maxy'];
    }

    /**
     * Retorna o texto de um filho XML direto.
     *
     * @param DOMXPath $xpath Seletor XML do documento.
     * @param DOMElement $parent Elemento pai.
     * @param string $name Nome local do elemento filho.
     */
    private static function directText(DOMXPath $xpath, DOMElement $parent, string $name): string
    {
        $node = $xpath->query('./*[local-name()="' . $name . '"]', $parent)?->item(0);

        return $node ? self::normalizeText($node->textContent) : '';
    }

    /**
     * Normaliza espaços em metadados textuais.
     *
     * @param string $text Texto original.
     */
    private static function normalizeText(string $text): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $text));
    }
}