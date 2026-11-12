<?php
declare(strict_types=1);

require_once __DIR__ . '/../../php/src/Infrastructure/Elevation/SrtmTerrainGrid.php';

use PlanMilT\Infrastructure\Elevation\SrtmTerrainGrid;

function expectTerrain(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$directory = sys_get_temp_dir() . '/planmilt-terrain-' . bin2hex(random_bytes(8));
mkdir($directory);

try {
    $tilePath = $directory . '/N00E000.HGT';
    file_put_contents($tilePath, str_repeat("\0", 1201 * 1201 * 2));
    $handle = fopen($tilePath, 'r+b');
    fseek($handle, (600 * 1201 + 600) * 2);
    fwrite($handle, pack('n', 123));
    fclose($handle);

    $service = new SrtmTerrainGrid();
    $grid = $service->sample($directory, [0.4, 0.4, 0.6, 0.6], 3, 3);
    expectTerrain($grid['rows'] === 3 && $grid['columns'] === 3, 'Dimensões da grade incorretas.');
    expectTerrain($grid['elevations'][1][1] === 123, 'Amostra de elevação incorreta.');
    expectTerrain($grid['missingTiles'] === [], 'Tile presente foi marcado como ausente.');

    $partial = $service->sample($directory, [-0.6, -0.6, -0.4, -0.4], 3, 3);
    expectTerrain($partial['elevations'][0][0] === null, 'Amostra sem tile deveria ser nula.');
    expectTerrain($partial['missingTiles'] === ['S01W001.HGT'], 'Tile ausente não foi informado.');

    foreach ([
        [[-3, -3, 3, 3], 3, 3],
        [[0.6, 0.4, 0.4, 0.6], 3, 3],
        [[0.4, 0.4, 0.6, 0.6], 66, 3],
    ] as [$bounds, $columns, $rows]) {
        try {
            $service->sample($directory, $bounds, $columns, $rows);
            throw new RuntimeException('Entrada de grade inválida aceita.');
        } catch (InvalidArgumentException $error) {
        }
    }

    $invalidPath = $directory . '/N01E000.HGT';
    file_put_contents($invalidPath, 'invalid');
    try {
        $service->sample($directory, [1.1, 0.1, 1.2, 0.2], 2, 2);
        throw new RuntimeException('Tile HGT inválido aceito.');
    } catch (RuntimeException $error) {
        expectTerrain(str_contains($error->getMessage(), 'formato inválido'), 'Erro de tile inválido inesperado.');
    }

    echo "Testes da grade SRTM para o visualizador 3D passaram.\n";
} finally {
    foreach (new DirectoryIterator($directory) as $entry) {
        if (!$entry->isDot() && $entry->isFile()) {
            unlink($entry->getPathname());
        }
    }
    rmdir($directory);
}
