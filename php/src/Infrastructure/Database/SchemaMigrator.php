<?php
declare(strict_types=1);

namespace PlanMilT\Infrastructure\Database;

use PDO;
use RuntimeException;
use Throwable;

/**
 * Aplica migrações incrementais e compatíveis ao esquema SQLite da aplicação.
 */
final class SchemaMigrator
{
    private const VERSION = 7;

    /**
     * Renomeia o esquema legado e padroniza timestamps sem remover registros.
     *
     * Duplicatas bloqueiam a migração antes que as restrições de unicidade sejam criadas.
     *
     * @param PDO $database Conexão SQLite da aplicação.
     */
    public static function migrate(PDO $database): void
    {
        $version = (int) $database->query('PRAGMA user_version')->fetchColumn();
        if ($version >= self::VERSION) {
            return;
        }

        $database->beginTransaction();

        try {
            if ($version < 1) {
                self::addLegacyUniqueIndexes($database);
                $database->exec('PRAGMA user_version = 1');
            }

            if ($version < 2) {
                foreach ([
                    ['desenhos', 'drawings'],
                    ['imagens', 'images'],
                    ['sigs', 'map_services'],
                    ['task_sequences', 'task_sequences']
                ] as [$legacyName, $currentName]) {
                    if (!self::tableExists($database, $legacyName)
                        && !self::tableExists($database, $currentName)) {
                        throw new RuntimeException(
                            "A tabela esperada {$legacyName} não foi encontrada. "
                            . 'A migração foi interrompida sem alterar o esquema.'
                        );
                    }
                }

                self::renameTable($database, 'desenhos', 'drawings');
                self::renameTable($database, 'imagens', 'images');
                self::renameTable($database, 'sigs', 'map_services');

                self::renameColumn($database, 'drawings', 'usuario', 'username');
                self::renameColumn($database, 'drawings', 'senha', 'password_hash');
                self::renameColumn($database, 'drawings', 'leaflet', 'geojson');

                self::renameColumn($database, 'images', 'imagem', 'image');
                self::renameColumn($database, 'images', 'localizacao', 'location');
                self::renameColumn($database, 'images', 'data_criacao', 'created_at');
                self::renameColumn($database, 'images', 'descricao', 'description');
                self::renameColumn($database, 'images', 'senha', 'password_hash');
                self::renameColumn($database, 'images', 'compartilhavel', 'is_shared');

                self::renameColumn($database, 'map_services', 'Nome', 'name');
                self::renameColumn($database, 'map_services', 'URL', 'url');

                self::renameColumn($database, 'task_sequences', 'password', 'password_hash');
                self::renameColumn($database, 'task_sequences', 'date_created', 'created_at');
                self::renameColumn($database, 'task_sequences', 'date_modified', 'updated_at');

                self::ensureTimestamps($database, 'drawings');
                self::ensureTimestamps($database, 'images');
                self::ensureTimestamps($database, 'map_services');
                self::ensureTimestamps($database, 'task_sequences');

                $database->exec('DROP INDEX IF EXISTS idx_desenhos_usuario_link');
                $database->exec('DROP INDEX IF EXISTS idx_task_sequences_name');
                self::createUniqueIndex($database, 'drawings', 'idx_drawings_username_link', ['username', 'link']);
                self::createUniqueIndex($database, 'task_sequences', 'idx_task_sequences_name', ['name']);

                $database->exec('PRAGMA user_version = 2');
            }

            if ($version < 3) {
                $database->exec(
                    'CREATE TABLE map_layer_categories ('
                    . 'code TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_order INTEGER NOT NULL UNIQUE)'
                );
                foreach ([
                    ['terrain', 'Terreno e relevo', 1],
                    ['hydrography', 'Hidrografia e recursos hídricos', 2],
                    ['transport', 'Transporte e mobilidade', 3],
                    ['urban', 'Áreas urbanas e edificações', 4],
                    ['population', 'População e ocupação humana', 5],
                    ['essential_services', 'Energia e serviços essenciais', 6],
                    ['telecommunications', 'Telecomunicações e conectividade', 7],
                    ['health_emergency', 'Saúde e resposta a emergências', 8],
                    ['environment_risk', 'Ambiente, clima e riscos', 9],
                    ['jurisdiction', 'Limites e áreas de jurisdição', 10],
                ] as [$code, $name, $displayOrder]) {
                    $statement = $database->prepare(
                        'INSERT INTO map_layer_categories (code, name, display_order) VALUES (?, ?, ?)'
                    );
                    $statement->execute([$code, $name, $displayOrder]);
                }

                $database->exec(
                    'CREATE TABLE map_layers ('
                    . 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
                    . 'map_service_id INTEGER NOT NULL, '
                    . 'layer_name TEXT NOT NULL, '
                    . 'layer_title TEXT NOT NULL DEFAULT \'\', '
                    . 'abstract TEXT NOT NULL DEFAULT \'\', '
                    . 'keywords TEXT NOT NULL DEFAULT \'[]\', '
                    . 'queryable INTEGER NOT NULL DEFAULT 0, '
                    . 'category_code TEXT, '
                    . 'category_source TEXT NOT NULL DEFAULT \'metadata\', '
                    . 'military_relevance TEXT NOT NULL DEFAULT \'not_triaged\', '
                    . 'review_status TEXT NOT NULL DEFAULT \'pending\', '
                    . 'category_rank INTEGER, '
                    . 'feature_info_status TEXT NOT NULL DEFAULT \'\', '
                    . 'feature_info_format TEXT NOT NULL DEFAULT \'\', '
                    . 'feature_info_fields TEXT NOT NULL DEFAULT \'\', '
                    . 'feature_info_sample TEXT NOT NULL DEFAULT \'\', '
                    . 'latest_year INTEGER, '
                    . 'collected_at TEXT NOT NULL, '
                    . 'created_at TEXT NOT NULL DEFAULT (datetime(\'now\')), '
                    . 'updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')), '
                    . 'UNIQUE (map_service_id, layer_name), '
                    . 'FOREIGN KEY (map_service_id) REFERENCES map_services(id) ON DELETE CASCADE, '
                    . 'FOREIGN KEY (category_code) REFERENCES map_layer_categories(code))'
                );
                $database->exec('CREATE INDEX idx_map_layers_category_rank ON map_layers (category_code, category_rank)');
                $database->exec('CREATE INDEX idx_map_layers_service ON map_layers (map_service_id)');
                $database->exec('CREATE INDEX idx_map_layers_name ON map_layers (layer_name)');
                $database->exec('CREATE INDEX idx_map_layers_title ON map_layers (layer_title)');
                $database->exec('PRAGMA user_version = 3');
            }

            if ($version < 4) {
                $database->exec(
                    'CREATE TABLE admin_users ('
                    . 'id INTEGER PRIMARY KEY CHECK (id = 1), '
                    . 'password_hash TEXT NOT NULL, '
                    . 'must_change_password INTEGER NOT NULL DEFAULT 1, '
                    . 'updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'
                );
                $passwordHash = password_hash('12345678', PASSWORD_DEFAULT);
                if (!is_string($passwordHash)) {
                    throw new RuntimeException('Não foi possível inicializar a senha administrativa.');
                }
                $statement = $database->prepare(
                    'INSERT INTO admin_users (id, password_hash, must_change_password) VALUES (1, ?, 1)'
                );
                $statement->execute([$passwordHash]);
                $database->exec(
                    'CREATE TABLE admin_login_attempts ('
                    . 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
                    . 'address_hash TEXT NOT NULL, '
                    . 'attempted_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'
                );
                $database->exec(
                    'CREATE INDEX idx_admin_login_attempts_address_time '
                    . 'ON admin_login_attempts (address_hash, attempted_at)'
                );
                $database->exec('PRAGMA user_version = 4');
            }

            if ($version < 5) {
                $database->exec(
                    'CREATE TABLE app_settings ('
                    . 'setting_key TEXT PRIMARY KEY, '
                    . 'setting_value TEXT NOT NULL, '
                    . 'updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'
                );
                $defaults = [
                    'defaultLayers' => [
                        'OpenTopo',
                        'Google Satellite',
                        'Infraestruturas',
                        'Quadrículas - UTM',
                        'BDGEx - CTM50',
                    ],
                    'center' => [-21.5699, -51.2457],
                    'zoom' => 12,
                ];
                $statement = $database->prepare(
                    'INSERT INTO app_settings (setting_key, setting_value) VALUES (\'map_defaults\', ?)'
                );
                $statement->execute([
                    json_encode($defaults, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)
                ]);
                $database->exec('PRAGMA user_version = 5');
            }

            if ($version < 6) {
                $legacyDefaults = json_encode([
                    'defaultLayers' => ['OpenTopo'],
                    'center' => null,
                    'zoom' => null,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
                $defaults = json_encode([
                    'defaultLayers' => [
                        'OpenTopo',
                        'Google Satellite',
                        'Infraestruturas',
                        'Quadrículas - UTM',
                        'BDGEx - CTM50',
                    ],
                    'center' => [-21.5699, -51.2457],
                    'zoom' => 12,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
                $statement = $database->prepare(
                    'UPDATE app_settings SET setting_value = ?, updated_at = datetime(\'now\') '
                    . 'WHERE setting_key = ? AND setting_value = ?'
                );
                $statement->execute([$defaults, 'map_defaults', $legacyDefaults]);
                $database->exec('PRAGMA user_version = 6');
            }

            if ($version < 7) {
                $previousDefaults = json_encode([
                    'defaultLayers' => [
                        'OpenTopo',
                        'Google Satellite',
                        'Infraestruturas',
                        'Quadrículas - UTM',
                        'BDGEx - CTM50',
                    ],
                    'center' => [-21.5699, -51.2457],
                    'zoom' => 12,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
                $defaults = json_encode([
                    'defaultLayers' => ['OpenTopo'],
                    'center' => [-21.5699, -51.2457],
                    'zoom' => 12,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
                $statement = $database->prepare(
                    'UPDATE app_settings SET setting_value = ?, updated_at = datetime(\'now\') '
                    . 'WHERE setting_key = ? AND setting_value = ?'
                );
                $statement->execute([$defaults, 'map_defaults', $previousDefaults]);
                $database->exec('PRAGMA user_version = 7');
            }

            $database->commit();
        } catch (Throwable $error) {
            if ($database->inTransaction()) {
                $database->rollBack();
            }
            throw $error;
        }
    }

    /**
     * Cria índices únicos na estrutura legada antes da migração de nomes.
     *
     * @param PDO $database Conexão SQLite da aplicação.
     */
    private static function addLegacyUniqueIndexes(PDO $database): void
    {
        if (self::tableExists($database, 'desenhos')
            && self::columnExists($database, 'desenhos', 'usuario')
            && self::columnExists($database, 'desenhos', 'link')) {
            self::createUniqueIndex(
                $database,
                'desenhos',
                'idx_desenhos_usuario_link',
                ['usuario', 'link']
            );
        }

        if (self::tableExists($database, 'task_sequences')
            && self::columnExists($database, 'task_sequences', 'name')) {
            self::createUniqueIndex(
                $database,
                'task_sequences',
                'idx_task_sequences_name',
                ['name']
            );
        }
    }

    /**
     * Renomeia uma tabela se somente o nome legado existir.
     *
     * @param PDO $database Conexão SQLite da aplicação.
     * @param string $legacyName Nome legado da tabela.
     * @param string $currentName Nome atual em inglês.
     */
    private static function renameTable(PDO $database, string $legacyName, string $currentName): void
    {
        $hasLegacy = self::tableExists($database, $legacyName);
        $hasCurrent = self::tableExists($database, $currentName);

        if ($hasLegacy && $hasCurrent) {
            throw new RuntimeException(
                "As tabelas {$legacyName} e {$currentName} coexistem. "
                . 'Resolva a duplicidade antes de migrar o esquema.'
            );
        }

        if ($hasLegacy) {
            $database->exec("ALTER TABLE \"{$legacyName}\" RENAME TO \"{$currentName}\"");
        }
    }

    /**
     * Renomeia uma coluna apenas quando há nome legado e nenhum conflito.
     *
     * @param PDO $database Conexão SQLite da aplicação.
     * @param string $table Nome atual da tabela.
     * @param string $legacyName Nome legado da coluna.
     * @param string $currentName Nome atual em inglês.
     */
    private static function renameColumn(PDO $database, string $table, string $legacyName, string $currentName): void
    {
        if (!self::tableExists($database, $table)) {
            return;
        }

        $hasLegacy = self::columnExists($database, $table, $legacyName);
        $hasCurrent = self::columnExists($database, $table, $currentName);
        if ($hasLegacy && $hasCurrent) {
            throw new RuntimeException(
                "As colunas {$table}.{$legacyName} e {$table}.{$currentName} coexistem. "
                . 'Resolva a duplicidade antes de migrar o esquema.'
            );
        }

        if ($hasLegacy) {
            $database->exec(
                "ALTER TABLE \"{$table}\" RENAME COLUMN \"{$legacyName}\" TO \"{$currentName}\""
            );
        }
    }

    /**
     * Adiciona timestamps ausentes e preenche registros sem data.
     *
     * @param PDO $database Conexão SQLite da aplicação.
     * @param string $table Tabela que recebe `created_at` e `updated_at`.
     */
    private static function ensureTimestamps(PDO $database, string $table): void
    {
        if (!self::tableExists($database, $table)) {
            return;
        }

        if (!self::columnExists($database, $table, 'created_at')) {
            $database->exec("ALTER TABLE \"{$table}\" ADD COLUMN created_at TEXT");
        }
        if (!self::columnExists($database, $table, 'updated_at')) {
            $database->exec("ALTER TABLE \"{$table}\" ADD COLUMN updated_at TEXT");
        }

        $database->exec(
            "UPDATE \"{$table}\" SET created_at = COALESCE(NULLIF(created_at, ''), datetime('now')), "
            . "updated_at = COALESCE(NULLIF(updated_at, ''), NULLIF(created_at, ''), datetime('now'))"
        );
    }

    /**
     * Cria um índice único, recusando a migração se os dados já colidirem.
     *
     * @param PDO $database Conexão SQLite da aplicação.
     * @param string $table Tabela indexada.
     * @param string $indexName Nome interno do índice.
     * @param array<int, string> $columns Colunas que compõem a chave única.
     */
    private static function createUniqueIndex(PDO $database, string $table, string $indexName, array $columns): void
    {
        if (!self::tableExists($database, $table)) {
            return;
        }

        foreach ($columns as $column) {
            if (!self::columnExists($database, $table, $column)) {
                return;
            }
        }

        $columnList = implode(', ', array_map(
            static fn (string $column): string => '"' . $column . '"',
            $columns
        ));
        $notNullColumns = implode(' AND ', array_map(
            static fn (string $column): string => '"' . $column . '" IS NOT NULL',
            $columns
        ));
        $groupColumns = $columnList;
        $duplicates = (int) $database->query(
            "SELECT COUNT(*) FROM (SELECT {$groupColumns} FROM \"{$table}\" "
            . "WHERE {$notNullColumns} GROUP BY {$groupColumns} HAVING COUNT(*) > 1)"
        )->fetchColumn();
        if ($duplicates > 0) {
            throw new RuntimeException(
                'Há registros duplicados em ' . $table . ' (' . implode(', ', $columns) . '). '
                . 'A migração foi interrompida sem alterar os dados.'
            );
        }

        $database->exec(
            "CREATE UNIQUE INDEX IF NOT EXISTS \"{$indexName}\" ON \"{$table}\" ({$columnList})"
        );
    }

    /**
     * Consulta a existência de uma tabela no catálogo SQLite.
     *
     * @param PDO $database Conexão SQLite da aplicação.
     * @param string $table Nome da tabela.
     */
    private static function tableExists(PDO $database, string $table): bool
    {
        $statement = $database->prepare(
            'SELECT 1 FROM sqlite_master WHERE type = :type AND name = :name'
        );
        $statement->execute([
            ':type' => 'table',
            ':name' => $table
        ]);

        return $statement->fetchColumn() !== false;
    }

    /**
     * Consulta a existência de uma coluna na tabela SQLite.
     *
     * @param PDO $database Conexão SQLite da aplicação.
     * @param string $table Nome da tabela.
     * @param string $column Nome da coluna.
     */
    private static function columnExists(PDO $database, string $table, string $column): bool
    {
        $statement = $database->query("PRAGMA table_info(\"{$table}\")");
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $definition) {
            if ($definition['name'] === $column) {
                return true;
            }
        }

        return false;
    }
}
