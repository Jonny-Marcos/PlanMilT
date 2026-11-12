<?php
declare(strict_types=1);

namespace PlanMilT\Infrastructure\Elevation;

use InvalidArgumentException;
use RuntimeException;

/**
 * Lê uma grade de elevação limitada dos tiles HGT locais.
 */
final class SrtmTerrainGrid
{
    private const MAX_GRID_SIZE = 65;
    private const MAX_SPAN_DEGREES = 5.0;

    /**
     * Cria uma grade geográfica e informa tiles ausentes sem interromper os demais pontos.
     *
     * @param string $directory Diretório que contém tiles SRTM HGT.
     * @param array{0:float,1:float,2:float,3:float} $bounds Limites sul, oeste, norte e leste.
     * @param int $columns Quantidade de amostras horizontais.
     * @param int $rows Quantidade de amostras verticais.
     * @return array{rows:int,columns:int,elevations:array,missingTiles:string[]} Grade em ordem norte-sul.
     */
    public function sample(string $directory, array $bounds, int $columns, int $rows): array
    {
        if (count($bounds) !== 4
            || !array_is_list($bounds)
            || !array_reduce($bounds, static fn (bool $valid, mixed $value): bool =>
                $valid && (is_int($value) || is_float($value)) && is_finite((float) $value), true)) {
            throw new InvalidArgumentException('Os limites da área são inválidos.');
        }

        [$south, $west, $north, $east] = array_map('floatval', $bounds);
        if ($south < -85 || $north > 85 || $south >= $north
            || $west < -180 || $east > 180 || $west >= $east
            || $north - $south > self::MAX_SPAN_DEGREES
            || $east - $west > self::MAX_SPAN_DEGREES) {
            throw new InvalidArgumentException(
                'Aproxime o mapa e enquadre uma área de até cinco graus para consultar o terreno.'
            );
        }
        if ($columns < 2 || $columns > self::MAX_GRID_SIZE
            || $rows < 2 || $rows > self::MAX_GRID_SIZE) {
            throw new InvalidArgumentException('A resolução da grade de terreno é inválida.');
        }
        if (!is_dir($directory) || !is_readable($directory)) {
            throw new RuntimeException('Os tiles locais de elevação não estão disponíveis.');
        }

        $handles = [];
        $missingTiles = [];
        $elevations = [];

        try {
            for ($row = 0; $row < $rows; $row++) {
                $latitude = $north - ($north - $south) * $row / ($rows - 1);
                $line = [];
                for ($column = 0; $column < $columns; $column++) {
                    $longitude = $west + ($east - $west) * $column / ($columns - 1);
                    $tileName = self::tileName($latitude, $longitude);
                    if (!array_key_exists($tileName, $handles)) {
                        $path = $directory . DIRECTORY_SEPARATOR . $tileName;
                        $handle = is_file($path) ? fopen($path, 'rb') : false;
                        if ($handle === false) {
                            $handles[$tileName] = null;
                            $missingTiles[$tileName] = true;
                        } else {
                            $fileSize = filesize($path);
                            $sampleCount = $fileSize === false ? 0 : (int) ($fileSize / 2);
                            $size = (int) sqrt($sampleCount);
                            if (!in_array($size, [1201, 3601], true)
                                || $size * $size * 2 !== $fileSize) {
                                fclose($handle);
                                throw new RuntimeException('Um tile local de elevação possui formato inválido.');
                            }
                            $handles[$tileName] = ['handle' => $handle, 'size' => $size];
                        }
                    }

                    $tile = $handles[$tileName];
                    $line[] = $tile === null
                        ? null
                        : self::readElevation($tile['handle'], $tile['size'], $latitude, $longitude);
                }
                $elevations[] = $line;
            }
        } finally {
            foreach ($handles as $tile) {
                if (is_array($tile) && is_resource($tile['handle'])) {
                    fclose($tile['handle']);
                }
            }
        }

        return [
            'rows' => $rows,
            'columns' => $columns,
            'elevations' => $elevations,
            'missingTiles' => array_keys($missingTiles),
        ];
    }

    /**
     * Obtém o nome SRTM associado às coordenadas.
     *
     * @param float $latitude Latitude WGS84.
     * @param float $longitude Longitude WGS84.
     * @return string Nome canônico do tile HGT.
     */
    private static function tileName(float $latitude, float $longitude): string
    {
        $latDegree = (int) floor($latitude);
        $lonDegree = (int) floor($longitude);

        return sprintf(
            '%s%02d%s%03d.HGT',
            $latDegree >= 0 ? 'N' : 'S',
            abs($latDegree),
            $lonDegree >= 0 ? 'E' : 'W',
            abs($lonDegree)
        );
    }

    /**
     * Lê uma amostra big-endian no tile aberto.
     *
     * @param resource $handle Arquivo HGT aberto.
     * @param int $size Dimensão do tile.
     * @param float $latitude Latitude da amostra.
     * @param float $longitude Longitude da amostra.
     * @return int|null Elevação em metros ou null para NODATA.
     */
    private static function readElevation($handle, int $size, float $latitude, float $longitude): ?int
    {
        $tileLatitude = (int) floor($latitude);
        $tileLongitude = (int) floor($longitude);
        $row = min($size - 1, max(0, (int) floor((1 - ($latitude - $tileLatitude)) * ($size - 1))));
        $column = min($size - 1, max(0, (int) floor(($longitude - $tileLongitude) * ($size - 1))));
        if (fseek($handle, ($row * $size + $column) * 2) !== 0) {
            throw new RuntimeException('Não foi possível ler um tile local de elevação.');
        }
        $bytes = fread($handle, 2);
        if ($bytes === false || strlen($bytes) !== 2) {
            throw new RuntimeException('Não foi possível ler um tile local de elevação.');
        }
        $elevation = unpack('n', $bytes)[1];
        if ($elevation === 0x8000) {
            return null;
        }

        return $elevation >= 0x8000 ? $elevation - 0x10000 : $elevation;
    }
}
