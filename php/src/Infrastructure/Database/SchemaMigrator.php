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
    private const VERSION = 2;

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
