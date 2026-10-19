<?php
declare(strict_types=1);

use PlanMilT\Application\AdminService;

require_once dirname(__DIR__, 2) . '/php/src/Application/AdminService.php';

$database = new PDO('sqlite::memory:');
$database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$database->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$database->exec(
    'CREATE TABLE admin_users ('
    . 'id INTEGER PRIMARY KEY, password_hash TEXT NOT NULL, must_change_password INTEGER NOT NULL, '
    . 'updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'
);
$database->exec(
    'CREATE TABLE admin_login_attempts ('
    . 'id INTEGER PRIMARY KEY AUTOINCREMENT, address_hash TEXT NOT NULL, '
    . 'attempted_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'
);
$database->prepare(
    'INSERT INTO admin_users (id, password_hash, must_change_password) VALUES (1, ?, 1)'
)->execute([password_hash('12345678', PASSWORD_DEFAULT)]);
$database->exec(
    'CREATE TABLE map_services (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, url TEXT, created_at TEXT, updated_at TEXT)'
);
$database->exec(
    'CREATE TABLE map_layer_categories (code TEXT PRIMARY KEY, name TEXT NOT NULL)'
);
$database->exec("INSERT INTO map_layer_categories (code, name) VALUES ('terrain', 'Terreno')");
$database->exec(
    'CREATE TABLE map_layers ('
    . 'id INTEGER PRIMARY KEY AUTOINCREMENT, map_service_id INTEGER, layer_name TEXT, layer_title TEXT, '
    . 'category_code TEXT, category_source TEXT, military_relevance TEXT, review_status TEXT, category_rank INTEGER, '
    . 'updated_at TEXT)'
);
$database->exec(
    'CREATE TABLE drawings ('
    . 'id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, password_hash TEXT, link TEXT, geojson TEXT, '
    . 'created_at TEXT, updated_at TEXT)'
);
$database->exec(
    'CREATE TABLE images ('
    . 'id INTEGER PRIMARY KEY AUTOINCREMENT, image BLOB, location TEXT, description TEXT, password_hash TEXT, '
    . 'is_shared INTEGER, created_at TEXT, updated_at TEXT)'
);
$database->exec(
    'CREATE TABLE task_sequences ('
    . 'id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, password_hash TEXT, sequence TEXT, description TEXT, '
    . 'created_at TEXT, updated_at TEXT)'
);

$service = new AdminService($database);
$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};
$assertThrows = static function (callable $operation, string $message): void {
    try {
        $operation();
    } catch (RuntimeException $error) {
        return;
    }
    throw new RuntimeException($message);
};

$initialLogin = $service->authenticate('12345678', '198.51.100.5');
$assert($initialLogin['mustChangePassword'], 'The initial login must require password replacement.');
$assertThrows(
    static fn () => $service->changePassword('12345678', 'short'),
    'A weak administrator password was accepted.'
);
$service->changePassword('12345678', 'new-pass');
$remoteLogin = $service->authenticate('new-pass', '198.51.100.5');
$assert(!$remoteLogin['mustChangePassword'], 'A changed admin password did not unlock administration.');
$assertThrows(
    static fn () => $service->authenticate('wrong-password', '203.0.113.5'),
    'An invalid administrator password was accepted.'
);
$assertThrows(
    static fn () => $service->authenticate('wrong-password', '203.0.113.5'),
    'An invalid administrator password was accepted.'
);
$assertThrows(
    static fn () => $service->authenticate('wrong-password', '203.0.113.5'),
    'An invalid administrator password was accepted.'
);
$assertThrows(
    static fn () => $service->authenticate('wrong-password', '203.0.113.5'),
    'An invalid administrator password was accepted.'
);
$assertThrows(
    static fn () => $service->authenticate('wrong-password', '203.0.113.5'),
    'An invalid administrator password was accepted.'
);
$assertThrows(
    static fn () => $service->authenticate('new-pass', '203.0.113.5'),
    'Login rate limiting did not block repeated failures.'
);

$serviceId = $service->saveRecord('map_services', 0, [
    'name' => 'SIG de teste',
    'url' => 'https://maps.example.test/wms',
]);
$assert($serviceId === 1, 'A map service was not created.');
$assertThrows(
    static fn () => $service->saveRecord('map_services', $serviceId, [
        'name' => 'URL inválida',
        'url' => 'file:///etc/passwd',
    ]),
    'An unsupported map service URL was accepted.'
);
$database->exec(
    "INSERT INTO map_layers (map_service_id, layer_name, layer_title, category_code, category_source, "
    . "military_relevance, review_status, category_rank, updated_at) "
    . "VALUES (1, 'terrain', 'Terreno', NULL, 'metadata', 'not_triaged', 'pending', NULL, datetime('now'))"
);
$layerId = (int) $database->lastInsertId();
$service->saveRecord('map_layers', $layerId, [
    'category_code' => 'terrain',
    'military_relevance' => 'potentially_relevant',
    'review_status' => 'reviewed',
    'category_rank' => 1,
]);
$layer = $service->getRecord('map_layers', $layerId);
$assert(
    $layer['category_code'] === 'terrain'
    && $layer['military_relevance'] === 'potentially_relevant'
    && $layer['review_status'] === 'reviewed'
    && (int) $layer['category_rank'] === 1,
    'Map layer classification changes were not saved.'
);

$drawingId = $service->saveRecord('drawings', 0, [
    'username' => 'admin-created',
    'link' => 'test-map',
    'geojson' => '{"type":"FeatureCollection","features":[]}',
    'password' => 'drawing-secret',
]);
$drawing = $service->getRecord('drawings', $drawingId);
$assert(!isset($drawing['password_hash']), 'Drawing password hashes were exposed to the admin panel.');
$service->saveRecord('drawings', $drawingId, [
    'username' => 'renamed',
    'link' => 'test-map',
    'geojson' => '{"type":"FeatureCollection","features":[{"type":"Feature"}]}',
]);
$assert(
    (string) $database->query('SELECT username FROM drawings WHERE id = ' . $drawingId)->fetchColumn() === 'renamed',
    'An existing drawing was not updated.'
);
$assertThrows(
    static fn () => $service->saveRecord('drawings', $drawingId, [
        'username' => 'invalid',
        'link' => 'test-map',
        'geojson' => '{',
    ]),
    'Invalid GeoJSON was accepted.'
);

$database->prepare(
    'INSERT INTO images (image, location, description, password_hash, is_shared, created_at, updated_at) '
    . 'VALUES (?, ?, ?, ?, 0, datetime(\'now\'), datetime(\'now\'))'
)->execute(["\x89PNG", '[[1,2],[3,4]]', 'Tema', password_hash('theme-secret', PASSWORD_DEFAULT)]);
$imageId = (int) $database->lastInsertId();
$imageList = $service->listRecords('images');
$assert(
    !array_key_exists('image', $imageList[0])
    && !array_key_exists('password_hash', $imageList[0]),
    'Image bytes or password hashes were exposed in the admin listing.'
);
$service->saveRecord('images', $imageId, [
    'description' => 'Tema editado',
    'location' => '[[5,6],[7,8]]',
    'is_shared' => true,
]);
$assert(
    $database->query('SELECT image FROM images WHERE id = ' . $imageId)->fetchColumn() === "\x89PNG"
    && (string) $database->query('SELECT description FROM images WHERE id = ' . $imageId)->fetchColumn() === 'Tema editado',
    'Editing image metadata changed the stored image or failed to update its description.'
);

$sequenceId = $service->saveRecord('task_sequences', 0, [
    'name' => 'Plano admin',
    'sequence' => '[]',
    'description' => 'Sequência criada pelo painel',
    'password' => 'sequence-secret',
]);
$sequence = $service->getRecord('task_sequences', $sequenceId);
$assert(!isset($sequence['password_hash']), 'Task sequence password hashes were exposed.');
$service->saveRecord('task_sequences', $sequenceId, [
    'name' => 'Plano atualizado',
    'sequence' => '[{"type":"move"}]',
    'description' => 'Atualizado',
]);
$assert(
    (string) $database->query('SELECT name FROM task_sequences WHERE id = ' . $sequenceId)->fetchColumn() === 'Plano atualizado',
    'An existing task sequence was not updated.'
);

$assertThrows(
    static fn () => $service->listRecords('sqlite_master'),
    'The admin panel accepted a table outside its allowlist.'
);
$service->deleteRecord('map_services', $serviceId);
$assert(
    (int) $database->query('SELECT COUNT(*) FROM map_layers')->fetchColumn() === 0
    && (int) $database->query('SELECT COUNT(*) FROM map_services')->fetchColumn() === 0,
    'Deleting a map service did not remove its catalog layers transactionally.'
);

echo "AdminService tests passed.\n";
