<?php
declare(strict_types=1);

use PlanMilT\Infrastructure\Database\ConnectionFactory;
use PlanMilT\Infrastructure\Database\SchemaMigrator;

require_once dirname(__DIR__, 2) . '/php/src/Infrastructure/Database/SchemaMigrator.php';
require_once dirname(__DIR__, 2) . '/php/src/Infrastructure/Database/ConnectionFactory.php';

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

$createLegacySchema = static function (): PDO {
    $database = new PDO('sqlite::memory:');
    $database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $database->exec(
        'CREATE TABLE desenhos ('
        . 'id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT NOT NULL, senha TEXT NOT NULL, '
        . 'leaflet TEXT NOT NULL, link TEXT)'
    );
    $database->exec(
        'CREATE TABLE imagens ('
        . 'id INTEGER PRIMARY KEY AUTOINCREMENT, imagem BLOB, localizacao TEXT, data_criacao TEXT, '
        . 'descricao TEXT, senha TEXT, compartilhavel BOOLEAN)'
    );
    $database->exec(
        'CREATE TABLE sigs (id INTEGER PRIMARY KEY AUTOINCREMENT, Nome TEXT, URL TEXT)'
    );
    $database->exec(
        'CREATE TABLE task_sequences ('
        . 'id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, password TEXT NOT NULL, '
        . 'sequence TEXT NOT NULL, date_created TEXT, date_modified TEXT, description TEXT)'
    );

    return $database;
};

$database = $createLegacySchema();
$database->exec("INSERT INTO desenhos (usuario, senha, leaflet, link) VALUES ('user', 'hash', '{\"type\":\"FeatureCollection\"}', 'map')");
$database->exec("INSERT INTO imagens (imagem, localizacao, data_criacao, descricao, senha, compartilhavel) VALUES (X'89504E47', '[[1,2],[3,4]]', '2024-05-01 12:00:00', 'test image', '', 1)");
$database->exec("INSERT INTO sigs (Nome, URL) VALUES ('Test map', 'https://maps.example.test/wms')");
$database->exec("INSERT INTO task_sequences (name, password, sequence, date_created, date_modified, description) VALUES ('plan', 'hash', '[]', '2024-05-02 12:00:00', '2024-05-03 12:00:00', 'test plan')");

SchemaMigrator::migrate($database);
SchemaMigrator::migrate($database);
$assert((int) $database->query('PRAGMA user_version')->fetchColumn() === 5, 'Schema version was not recorded.');

$expectedTables = [
    'admin_login_attempts', 'admin_users', 'app_settings', 'drawings', 'images', 'map_layer_categories',
    'map_layers', 'map_services', 'task_sequences'
];
$actualTables = $database->query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
)->fetchAll(PDO::FETCH_COLUMN);
sort($expectedTables);
$assert($actualTables === $expectedTables, 'Legacy table names were not fully migrated.');
$assert(
    (int) $database->query('SELECT COUNT(*) FROM map_layer_categories')->fetchColumn() === 10,
    'Catalog migration did not seed the ten layer categories.'
);
$mapDefaults = json_decode(
    (string) $database->query("SELECT setting_value FROM app_settings WHERE setting_key = 'map_defaults'")->fetchColumn(),
    true
);
$assert(
    $mapDefaults === ['defaultLayers' => ['OpenTopo'], 'center' => null, 'zoom' => null],
    'The map defaults setting was not initialized.'
);
$assert(
    (int) $database->query('SELECT COUNT(*) FROM map_layers')->fetchColumn() === 0,
    'Catalog migration should create an empty layer catalog without inventing records.'
);
$adminAccount = $database->query(
    'SELECT password_hash, must_change_password FROM admin_users WHERE id = 1'
)->fetch(PDO::FETCH_ASSOC);
$assert(
    is_array($adminAccount)
    && password_verify('12345678', $adminAccount['password_hash'])
    && (int) $adminAccount['must_change_password'] === 1
    && $adminAccount['password_hash'] !== '12345678',
    'The initial admin credential was not stored as a forced-change password hash.'
);

$drawing = $database->query(
    'SELECT username, password_hash, geojson, link, created_at, updated_at FROM drawings'
)->fetch(PDO::FETCH_ASSOC);
$assert(
    $drawing['username'] === 'user'
    && $drawing['password_hash'] === 'hash'
    && $drawing['geojson'] === '{"type":"FeatureCollection"}'
    && $drawing['link'] === 'map'
    && $drawing['created_at'] !== ''
    && $drawing['updated_at'] !== '',
    'Drawing data or timestamps were not migrated.'
);

$image = $database->query(
    'SELECT image, location, created_at, updated_at, description, password_hash, is_shared FROM images'
)->fetch(PDO::FETCH_ASSOC);
$assert(
    $image['image'] === hex2bin('89504E47')
    && $image['location'] === '[[1,2],[3,4]]'
    && $image['created_at'] === '2024-05-01 12:00:00'
    && $image['updated_at'] === '2024-05-01 12:00:00'
    && $image['description'] === 'test image'
    && $image['password_hash'] === ''
    && (int) $image['is_shared'] === 1,
    'Image data was not preserved or its timestamps were not initialized.'
);

$service = $database->query('SELECT name, url, created_at, updated_at FROM map_services')->fetch(PDO::FETCH_ASSOC);
$assert(
    $service['name'] === 'Test map'
    && $service['url'] === 'https://maps.example.test/wms'
    && $service['created_at'] !== ''
    && $service['updated_at'] !== '',
    'Map service data or timestamps were not migrated.'
);

$sequence = $database->query(
    'SELECT password_hash, created_at, updated_at FROM task_sequences'
)->fetch(PDO::FETCH_ASSOC);
$assert(
    $sequence['password_hash'] === 'hash'
    && $sequence['created_at'] === '2024-05-02 12:00:00'
    && $sequence['updated_at'] === '2024-05-03 12:00:00',
    'Sequence data or existing timestamps were not preserved.'
);

foreach ([
    "INSERT INTO drawings (username, password_hash, geojson, link, created_at, updated_at) VALUES ('user', 'hash', '{}', 'map', datetime('now'), datetime('now'))",
    "INSERT INTO task_sequences (name, password_hash, sequence, created_at, updated_at) VALUES ('plan', 'hash', '[]', datetime('now'), datetime('now'))"
] as $duplicateInsert) {
    try {
        $database->exec($duplicateInsert);
        throw new RuntimeException('Unique database keys allowed a duplicate record.');
    } catch (PDOException $error) {
        $assert(str_contains($error->getMessage(), 'UNIQUE constraint failed'), 'Unexpected duplicate-key error.');
    }
}

$duplicates = $createLegacySchema();
$duplicates->exec(
    "INSERT INTO desenhos (usuario, senha, leaflet, link) VALUES "
    . "('user', 'hash', '{}', 'map'), ('user', 'hash', '{\"changed\":true}', 'map')"
);

try {
    SchemaMigrator::migrate($duplicates);
    throw new RuntimeException('Migration should refuse to alter a database with duplicate drawings.');
} catch (RuntimeException $error) {
    $assert(
        str_contains($error->getMessage(), 'desenhos'),
        'Migration did not explain which legacy duplicate table blocks the upgrade.'
    );
}

$assert(
    (int) $duplicates->query('SELECT COUNT(*) FROM desenhos')->fetchColumn() === 2,
    'Migration changed or deleted existing duplicate records.'
);
$assert(
    (int) $duplicates->query('PRAGMA user_version')->fetchColumn() === 0,
    'Failed migration incorrectly marked the schema as updated.'
);

$factoryPath = sys_get_temp_dir() . '/planmilt-schema-' . bin2hex(random_bytes(8)) . '.sqlite';
$factoryDatabase = $createLegacySchema();
$factoryDatabase->exec('VACUUM INTO ' . $factoryDatabase->quote($factoryPath));
unset($factoryDatabase);

$previousPath = getenv('PLANMILT_DB_PATH');
putenv('PLANMILT_DB_PATH=' . $factoryPath);
try {
    $factoryConnection = ConnectionFactory::create();
    $assert((int) $factoryConnection->query('PRAGMA user_version')->fetchColumn() === 5, 'ConnectionFactory did not apply migrations.');
    $indexes = $factoryConnection->query(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN "
        . "('idx_drawings_username_link', 'idx_task_sequences_name')"
    )->fetchColumn();
    $assert((int) $indexes === 2, 'ConnectionFactory did not create the expected unique indexes.');
    unset($factoryConnection);
} finally {
    putenv($previousPath === false ? 'PLANMILT_DB_PATH' : 'PLANMILT_DB_PATH=' . $previousPath);
    if (is_file($factoryPath)) {
        unlink($factoryPath);
    }
}

echo "SchemaMigrator tests passed.\n";
