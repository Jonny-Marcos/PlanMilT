<?php
declare(strict_types=1);

require_once __DIR__ . '/../../php/src/Application/ElevationDownloadService.php';

use PlanMilT\Application\ElevationDownloadService;

function expectElevation(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$directory = sys_get_temp_dir() . '/planmilt-elevation-' . bin2hex(random_bytes(8));
mkdir($directory);
try {
    $service = new ElevationDownloadService($directory, static function (string $name, string $path): void {
        expectElevation($name === 'S22W052.HGT', 'Nome incorreto.');
        $file = gzopen($path, 'wb');
        $row = '';
        for ($col = 0; $col < 3601; $col++) $row .= pack('n', $col);
        for ($i = 0; $i < 3601; $i++) gzwrite($file, $row);
        gzclose($file);
    });
    expectElevation($service->ensureTile('s22w052.hgt') === 'S22W052.HGT', 'Nome canônico incorreto.');
    $target = $directory . '/S22W052.HGT';
    expectElevation(filesize($target) === 1201 * 1201 * 2, 'Tamanho reduzido incorreto.');
    $handle = fopen($target, 'rb');
    $samples = unpack('n3', fread($handle, 6));
    fclose($handle);
    expectElevation(array_values($samples) === [0, 3, 6], 'Subamostragem incorreta.');
    $existing = hash_file('sha256', $target);
    $service->ensureTile('S22W052.HGT');
    expectElevation(hash_file('sha256', $target) === $existing, 'Tile existente foi alterado.');
    try {
        $service->ensureTile('../S22W052.HGT');
        throw new RuntimeException('Nome inválido aceito.');
    } catch (InvalidArgumentException $expected) {
    }
    $bad = new ElevationDownloadService($directory, static function (string $name, string $path): void {
        file_put_contents($path, gzencode('incompleto'));
    });
    try {
        $bad->ensureTile('S22W053.HGT');
        throw new RuntimeException('Tile truncado aceito.');
    } catch (RuntimeException $error) {
        expectElevation(strpos($error->getMessage(), 'incompleto') !== false, 'Erro incorreto para tile truncado.');
    }
    expectElevation(!file_exists($directory . '/S22W053.HGT'), 'Tile truncado foi publicado.');
    echo "Testes de download de elevação passaram.\n";
} finally {
    foreach (new DirectoryIterator($directory) as $entry) {
        if (!$entry->isDot() && $entry->isFile()) unlink($entry->getPathname());
    }
    rmdir($directory);
}
