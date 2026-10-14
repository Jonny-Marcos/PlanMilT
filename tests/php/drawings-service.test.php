<?php
declare(strict_types=1);

use PlanMilT\Application\DrawingsService;

require_once dirname(__DIR__, 2) . '/php/src/Application/DrawingsService.php';

$database = new PDO('sqlite::memory:');
$database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$database->exec(
    'CREATE TABLE desenhos ('
    . 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
    . 'usuario TEXT NOT NULL, '
    . 'senha TEXT NOT NULL, '
    . 'link TEXT NOT NULL, '
    . 'leaflet TEXT NOT NULL'
    . ')'
);

$service = new DrawingsService($database);
$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

$assert($service->load('user-a', 'map-1') === null, 'Missing drawing should return null.');

$drawingJson = '{"type":"FeatureCollection","features":[]}';
$created = $service->save('user-a', 'secret', 'map-1', $drawingJson);
$assert($created === 'Desenho salvo com sucesso!', 'Drawing creation response changed.');
$assert($service->load('user-a', 'map-1') === $drawingJson, 'Stored drawing JSON was altered.');

$wrongPassword = $service->save('user-a', 'wrong-secret', 'map-1', '{"features":[1]}');
$assert($wrongPassword === 'Senha incorreta.', 'Incorrect password should not update a drawing.');
$assert($service->load('user-a', 'map-1') === $drawingJson, 'Rejected update modified the drawing.');

$updatedJson = '{"type":"FeatureCollection","features":[{"id":1}]}';
$updated = $service->save('user-a', 'secret', 'map-1', $updatedJson);
$assert($updated === 'Desenho atualizado com sucesso!', 'Drawing update response changed.');
$assert($service->load('user-a', 'map-1') === $updatedJson, 'Drawing update was not persisted.');

$otherLinkJson = '{"type":"FeatureCollection","features":[{"id":2}]}';
$otherDrawing = $service->save('user-a', 'another-secret', 'map-2', $otherLinkJson);
$assert($otherDrawing === 'Desenho salvo com sucesso!', 'A different link should create a separate drawing.');
$assert($service->load('user-a', 'map-2') === $otherLinkJson, 'Separate drawing was not persisted.');

echo "DrawingsService tests passed.\n";
