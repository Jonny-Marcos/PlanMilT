<?php
declare(strict_types=1);

require_once __DIR__ . '/../../php/src/Infrastructure/Http/MapImageProxy.php';

use PlanMilT\Infrastructure\Http\MapImageProxy;

function expectMapImage(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$database = new PDO('sqlite::memory:');
$database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$database->exec('CREATE TABLE map_services (url TEXT NOT NULL)');
$database->exec("INSERT INTO map_services (url) VALUES ('https://maps.example/wms')");
$database->exec("INSERT INTO map_services (url) VALUES ('https://mt0.google.com/vt')");
$service = new MapImageProxy(
    $database,
    static fn (string $host): array => ['93.184.216.34'],
    static fn (string $url, string $address): array => [
        'status' => 200,
        'contentType' => 'image/png',
        'body' => base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII='),
    ]
);
$validWms = 'https://maps.example/wms?SERVICE=WMS&REQUEST=GetMap&FORMAT=image%2Fpng'
    . '&WIDTH=256&HEIGHT=256&BBOX=0,0,1,1';
expectMapImage($service->validateUrl($validWms)['host'] === 'maps.example', 'WMS cadastrado deveria ser aceito.');
expectMapImage(
    $service->validateUrl('https://tile.opentopomap.org/map/12/1234/1234.png')['host'] === 'tile.opentopomap.org',
    'Tile OpenTopo válido deveria ser aceito.'
);

foreach ([
    'http://maps.example/wms?SERVICE=WMS&REQUEST=GetMap&FORMAT=image/png&WIDTH=1&HEIGHT=1&BBOX=0,0,1,1',
    'https://127.0.0.1/wms?SERVICE=WMS&REQUEST=GetMap&FORMAT=image/png&WIDTH=1&HEIGHT=1&BBOX=0,0,1,1',
    'https://unknown.example/wms?SERVICE=WMS&REQUEST=GetMap&FORMAT=image/png&WIDTH=1&HEIGHT=1&BBOX=0,0,1,1',
    'https://maps.example/wms?SERVICE=WMS&REQUEST=GetFeatureInfo&FORMAT=image/png&WIDTH=1&HEIGHT=1&BBOX=0,0,1,1',
    'https://maps.example/wms?SERVICE=WMS&REQUEST=GetMap&FORMAT=image/png&WIDTH=99999&HEIGHT=1&BBOX=0,0,1,1',
    'https://maps.example/wms?SERVICE=WMS&REQUEST=GetMap&FORMAT=image/png&WIDTH=1&HEIGHT=1&BBOX=foo,0,1,1',
    'https://maps.example/wms?SERVICE=WMS&REQUEST=GetMap&REQUEST=GetFeatureInfo&FORMAT=image/png&WIDTH=1&HEIGHT=1&BBOX=0,0,1,1',
    'https://tile.opentopomap.org/map/19/0/0.png',
    'https://mt0.google.com/vt/lyrs=s&x=0&y=0&z=0',
] as $url) {
    try {
        $service->validateUrl($url);
        throw new RuntimeException('URL fora da allowlist foi aceita.');
    } catch (InvalidArgumentException $error) {
    }
}

$image = $service->fetch($validWms);
expectMapImage($image['contentType'] === 'image/png', 'O tipo da resposta deveria ser validado.');
try {
    (new MapImageProxy($database, static fn (): array => ['127.0.0.1']))
        ->fetch($validWms);
    throw new RuntimeException('Endereço privado resolvido foi aceito.');
} catch (InvalidArgumentException $error) {
}

echo "Testes do proxy de imagens do visualizador 3D passaram.\n";
