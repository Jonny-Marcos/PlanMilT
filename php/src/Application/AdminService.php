<?php
declare(strict_types=1);

namespace PlanMilT\Application;

use PDO;
use RuntimeException;
use Throwable;

/**
 * Autentica o administrador e limita a manutenção a registros conhecidos da aplicação.
 */
final class AdminService
{
    private const PAGE_SIZE = 100;
    private const LOGIN_WINDOW_MINUTES = 15;
    private const MAX_LOGIN_ATTEMPTS = 5;
    private const MAX_JSON_BYTES = 5242880;

    private PDO $database;

    /**
     * Cria o serviço administrativo com a conexão SQLite migrada.
     *
     * @param PDO $database Conexão SQLite da aplicação.
     */
    public function __construct(PDO $database)
    {
        $this->database = $database;
    }

    /**
     * Valida a senha administrativa e aplica limite de tentativas por endereço de origem.
     *
     * @param string $password Senha recebida pelo endpoint.
     * @param string $remoteAddress Endereço remoto fornecido pelo servidor web.
     * @return array{mustChangePassword: bool} Estado de configuração da conta.
     */
    public function authenticate(string $password, string $remoteAddress): array
    {
        $account = $this->getAdminAccount();
        $addressHash = hash('sha256', $remoteAddress);
        $this->database->exec(
            'DELETE FROM admin_login_attempts WHERE attempted_at < datetime(\'now\', \'-1 day\')'
        );
        $statement = $this->database->prepare(
            'SELECT COUNT(*) FROM admin_login_attempts '
            . 'WHERE address_hash = ? AND attempted_at >= datetime(\'now\', ?)'
        );
        $statement->execute([$addressHash, '-' . self::LOGIN_WINDOW_MINUTES . ' minutes']);
        if ((int) $statement->fetchColumn() >= self::MAX_LOGIN_ATTEMPTS) {
            throw new RuntimeException('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
        }

        if (!password_verify($password, (string) $account['password_hash'])) {
            $statement = $this->database->prepare(
                'INSERT INTO admin_login_attempts (address_hash) VALUES (?)'
            );
            $statement->execute([$addressHash]);
            throw new RuntimeException('Senha administrativa inválida.');
        }

        $mustChangePassword = (int) $account['must_change_password'] === 1;

        $statement = $this->database->prepare(
            'DELETE FROM admin_login_attempts WHERE address_hash = ?'
        );
        $statement->execute([$addressHash]);

        return ['mustChangePassword' => $mustChangePassword];
    }

    /**
     * Substitui a senha inicial ou atual após confirmar a credencial atual.
     *
     * @param string $currentPassword Senha atual da conta administrativa.
     * @param string $newPassword Nova senha administrativa.
     */
    public function changePassword(string $currentPassword, string $newPassword): void
    {
        $characterCount = preg_match_all('/./us', $newPassword, $characters);
        if ($characterCount === false || $characterCount < 8 || strlen($newPassword) > 1024) {
            throw new RuntimeException('A nova senha deve ter entre 8 e 1024 caracteres.');
        }

        $account = $this->getAdminAccount();
        if (!password_verify($currentPassword, (string) $account['password_hash'])) {
            throw new RuntimeException('A senha atual está incorreta.');
        }
        $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
        if (!is_string($passwordHash)) {
            throw new RuntimeException('Não foi possível atualizar a senha administrativa.');
        }

        $statement = $this->database->prepare(
            'UPDATE admin_users SET password_hash = ?, must_change_password = 0, updated_at = datetime(\'now\') '
            . 'WHERE id = 1'
        );
        $statement->execute([$passwordHash]);
    }

    /**
     * Retorna uma página de registros de uma entidade explicitamente autorizada.
     *
     * @param string $entity Entidade administrativa permitida.
     * @param int $offset Deslocamento da paginação.
     * @return array<int, array<string, mixed>>
     */
    public function listRecords(string $entity, int $offset = 0): array
    {
        if ($offset < 0 || $offset > 1000000) {
            throw new RuntimeException('Página inválida.');
        }

        $queries = [
            'map_services' => 'SELECT id, name, url, created_at, updated_at FROM map_services ORDER BY name COLLATE NOCASE',
            'map_layers' => 'SELECT id, map_service_id, layer_name, layer_title, category_code, '
                . 'military_relevance, review_status, category_rank FROM map_layers ORDER BY layer_title COLLATE NOCASE',
            'drawings' => 'SELECT id, username, link, created_at, updated_at FROM drawings ORDER BY id DESC',
            'images' => 'SELECT id, description, location, is_shared, created_at, updated_at FROM images ORDER BY id DESC',
            'task_sequences' => 'SELECT id, name, description, created_at, updated_at FROM task_sequences ORDER BY name COLLATE NOCASE',
        ];
        if (!isset($queries[$entity])) {
            throw new RuntimeException('Tipo de registro não permitido.');
        }

        $statement = $this->database->prepare($queries[$entity] . ' LIMIT ' . self::PAGE_SIZE . ' OFFSET ?');
        $statement->bindValue(1, $offset, PDO::PARAM_INT);
        $statement->execute();

        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Obtém os campos editáveis de um registro, sem retornar hashes de senha nem imagens BLOB.
     *
     * @param string $entity Entidade administrativa permitida.
     * @param int $id Identificador numérico do registro.
     * @return array<string, mixed> Registro encontrado.
     */
    public function getRecord(string $entity, int $id): array
    {
        if ($id < 1) {
            throw new RuntimeException('Identificador inválido.');
        }

        $queries = [
            'map_services' => 'SELECT id, name, url FROM map_services WHERE id = ?',
            'map_layers' => 'SELECT id, category_code, military_relevance, review_status, category_rank '
                . 'FROM map_layers WHERE id = ?',
            'drawings' => 'SELECT id, username, link, geojson FROM drawings WHERE id = ?',
            'images' => 'SELECT id, description, location, is_shared FROM images WHERE id = ?',
            'task_sequences' => 'SELECT id, name, sequence, description FROM task_sequences WHERE id = ?',
        ];
        if (!isset($queries[$entity])) {
            throw new RuntimeException('Tipo de registro não permitido.');
        }

        $statement = $this->database->prepare($queries[$entity]);
        $statement->execute([$id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($record)) {
            throw new RuntimeException('Registro não encontrado.');
        }

        return $record;
    }

    /**
     * Cria ou atualiza um registro seguindo os campos permitidos para cada entidade.
     *
     * @param string $entity Entidade administrativa permitida.
     * @param int $id Identificador existente ou zero para criação suportada.
     * @param array<string, mixed> $data Campos enviados pelo painel.
     * @return int Identificador do registro salvo.
     */
    public function saveRecord(string $entity, int $id, array $data): int
    {
        switch ($entity) {
            case 'map_services':
                $name = $this->requiredString($data, 'name', 200);
                $url = $this->validateServiceUrl($this->requiredString($data, 'url', 2048));
                if ($id === 0) {
                    $statement = $this->database->prepare(
                        'INSERT INTO map_services (name, url, created_at, updated_at) '
                        . 'VALUES (?, ?, datetime(\'now\'), datetime(\'now\'))'
                    );
                    $statement->execute([$name, $url]);
                    return (int) $this->database->lastInsertId();
                }
                $statement = $this->database->prepare(
                    'UPDATE map_services SET name = ?, url = ?, updated_at = datetime(\'now\') WHERE id = ?'
                );
                $statement->execute([$name, $url, $id]);
                return $this->requireUpdatedRecord($statement->rowCount(), 'map_services', $id);

            case 'drawings':
                $username = $this->requiredString($data, 'username', 120);
                $link = $this->requiredString($data, 'link', 2048);
                $geoJson = $this->requiredJson($data, 'geojson');
                $drawingData = json_decode($geoJson, true);
                if (!is_array($drawingData)
                    || ($drawingData['type'] ?? null) !== 'FeatureCollection'
                    || !is_array($drawingData['features'] ?? null)) {
                    throw new RuntimeException('O desenho deve ser uma FeatureCollection GeoJSON.');
                }
                if ($id === 0) {
                    $password = $this->requiredString($data, 'password', 1024, false);
                    $statement = $this->database->prepare(
                        'INSERT INTO drawings (username, password_hash, link, geojson, created_at, updated_at) '
                        . 'VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
                    );
                    $statement->execute([$username, password_hash($password, PASSWORD_DEFAULT), $link, $geoJson]);
                    return (int) $this->database->lastInsertId();
                }
                $statement = $this->database->prepare(
                    'UPDATE drawings SET username = ?, link = ?, geojson = ?, updated_at = datetime(\'now\') WHERE id = ?'
                );
                $statement->execute([$username, $link, $geoJson, $id]);
                return $this->requireUpdatedRecord($statement->rowCount(), 'drawings', $id);

            case 'images':
                if ($id < 1) {
                    throw new RuntimeException('Imagens devem ser criadas pelo editor de temas.');
                }
                $description = $this->requiredString($data, 'description', 255);
                $location = $this->requiredJson($data, 'location');
                $bounds = json_decode($location, true);
                if (!is_array($bounds) || count($bounds) < 2) {
                    throw new RuntimeException('Os limites geográficos da imagem são inválidos.');
                }
                $isShared = $this->booleanValue($data, 'is_shared');
                $statement = $this->database->prepare(
                    'UPDATE images SET description = ?, location = ?, is_shared = ?, '
                    . 'updated_at = datetime(\'now\') WHERE id = ?'
                );
                $statement->execute([$description, $location, $isShared ? 1 : 0, $id]);
                return $this->requireUpdatedRecord($statement->rowCount(), 'images', $id);

            case 'task_sequences':
                $name = $this->requiredString($data, 'name', 200);
                $sequence = $this->requiredJson($data, 'sequence');
                $description = $this->optionalString($data, 'description', 2000);
                if ($id === 0) {
                    $password = $this->requiredString($data, 'password', 1024);
                    $statement = $this->database->prepare(
                        'INSERT INTO task_sequences (name, password_hash, sequence, description, created_at, updated_at) '
                        . 'VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
                    );
                    $statement->execute([$name, password_hash($password, PASSWORD_DEFAULT), $sequence, $description]);
                    return (int) $this->database->lastInsertId();
                }
                $statement = $this->database->prepare(
                    'UPDATE task_sequences SET name = ?, sequence = ?, description = ?, '
                    . 'updated_at = datetime(\'now\') WHERE id = ?'
                );
                $statement->execute([$name, $sequence, $description, $id]);
                return $this->requireUpdatedRecord($statement->rowCount(), 'task_sequences', $id);

            case 'map_layers':
                if ($id < 1) {
                    throw new RuntimeException('Camadas do catálogo são criadas pela importação WMS.');
                }
                $categoryCode = $this->optionalString($data, 'category_code', 64);
                $relevance = $this->requiredChoice(
                    $data,
                    'military_relevance',
                    ['not_triaged', 'potentially_relevant']
                );
                $reviewStatus = $this->requiredChoice($data, 'review_status', ['pending', 'reviewed']);
                $rank = $this->nullableInteger($data, 'category_rank', 1, 10);
                if ($categoryCode !== null) {
                    $statement = $this->database->prepare('SELECT 1 FROM map_layer_categories WHERE code = ?');
                    $statement->execute([$categoryCode]);
                    if ($statement->fetchColumn() === false) {
                        throw new RuntimeException('Categoria do catálogo inexistente.');
                    }
                }
                if ($rank !== null && $categoryCode === null) {
                    throw new RuntimeException('Informe uma categoria antes de definir a posição recomendada.');
                }
                if ($rank !== null) {
                    $statement = $this->database->prepare(
                        'SELECT 1 FROM map_layers WHERE category_code = ? AND category_rank = ? AND id <> ?'
                    );
                    $statement->execute([$categoryCode, $rank, $id]);
                    if ($statement->fetchColumn() !== false) {
                        throw new RuntimeException('Esta posição já está ocupada na categoria selecionada.');
                    }
                }
                $statement = $this->database->prepare(
                    'UPDATE map_layers SET category_code = ?, category_source = \'manual\', '
                    . 'military_relevance = ?, review_status = ?, category_rank = ?, '
                    . 'updated_at = datetime(\'now\') WHERE id = ?'
                );
                $statement->execute([$categoryCode, $relevance, $reviewStatus, $rank, $id]);
                return $this->requireUpdatedRecord($statement->rowCount(), 'map_layers', $id);
        }

        throw new RuntimeException('Tipo de registro não permitido.');
    }

    /**
     * Exclui um registro suportado; remover um SIG também remove explicitamente suas camadas do catálogo.
     *
     * @param string $entity Entidade administrativa permitida.
     * @param int $id Identificador do registro.
     */
    public function deleteRecord(string $entity, int $id): void
    {
        if ($id < 1) {
            throw new RuntimeException('Identificador inválido.');
        }

        $tables = [
            'map_services' => 'map_services',
            'map_layers' => 'map_layers',
            'drawings' => 'drawings',
            'images' => 'images',
            'task_sequences' => 'task_sequences',
        ];
        if (!isset($tables[$entity])) {
            throw new RuntimeException('Tipo de registro não permitido.');
        }

        $this->database->beginTransaction();
        try {
            if ($entity === 'map_services') {
                $layers = $this->database->prepare('DELETE FROM map_layers WHERE map_service_id = ?');
                $layers->execute([$id]);
            }
            $statement = $this->database->prepare('DELETE FROM "' . $tables[$entity] . '" WHERE id = ?');
            $statement->execute([$id]);
            if ($statement->rowCount() === 0) {
                throw new RuntimeException('Registro não encontrado.');
            }
            $this->database->commit();
        } catch (Throwable $error) {
            if ($this->database->inTransaction()) {
                $this->database->rollBack();
            }
            throw $error;
        }
    }

    /**
     * Lê a conta administrativa inicial da tabela singleton.
     *
     * @return array{password_hash: string, must_change_password: int}
     */
    private function getAdminAccount(): array
    {
        $account = $this->database->query(
            'SELECT password_hash, must_change_password FROM admin_users WHERE id = 1'
        )->fetch(PDO::FETCH_ASSOC);
        if (!is_array($account)) {
            throw new RuntimeException('Conta administrativa não inicializada.');
        }

        return $account;
    }

    /**
     * Valida uma string recebida do painel com limite de tamanho explícito.
     *
     * @param array<string, mixed> $data Campos da requisição.
     * @param string $key Nome do campo.
     * @param int $maxBytes Tamanho máximo em bytes.
     * @param bool $allowEmpty Permite string vazia.
     */
    private function requiredString(array $data, string $key, int $maxBytes, bool $allowEmpty = false): string
    {
        $value = $data[$key] ?? null;
        if (!is_string($value) || strlen($value) > $maxBytes || (!$allowEmpty && trim($value) === '')) {
            throw new RuntimeException('Campo inválido: ' . $key . '.');
        }

        return $value;
    }

    /**
     * Valida um campo textual opcional.
     *
     * @param array<string, mixed> $data Campos da requisição.
     * @param string $key Nome do campo.
     * @param int $maxBytes Tamanho máximo em bytes.
     */
    private function optionalString(array $data, string $key, int $maxBytes): ?string
    {
        if (!array_key_exists($key, $data) || $data[$key] === null || $data[$key] === '') {
            return null;
        }
        if (!is_string($data[$key]) || strlen($data[$key]) > $maxBytes) {
            throw new RuntimeException('Campo inválido: ' . $key . '.');
        }

        return $data[$key];
    }

    /**
     * Confirma que o conteúdo é JSON válido e não excede o limite permitido.
     *
     * @param array<string, mixed> $data Campos da requisição.
     * @param string $key Nome do campo.
     */
    private function requiredJson(array $data, string $key): string
    {
        $value = $this->requiredString($data, $key, self::MAX_JSON_BYTES);
        try {
            json_decode($value, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $error) {
            throw new RuntimeException('JSON inválido no campo ' . $key . '.');
        }

        return $value;
    }

    /**
     * Aceita somente URLs HTTP(S) absolutas sem credenciais embutidas.
     *
     * @param string $url Endereço do serviço SIG.
     */
    private function validateServiceUrl(string $url): string
    {
        $parts = parse_url($url);
        if (!is_array($parts)
            || !isset($parts['scheme'], $parts['host'])
            || !in_array(strtolower($parts['scheme']), ['http', 'https'], true)
            || isset($parts['user'])
            || isset($parts['pass'])) {
            throw new RuntimeException('A URL do serviço deve usar HTTP ou HTTPS e possuir um host válido.');
        }

        return $url;
    }

    /**
     * Valida um campo booleano recebido em JSON.
     *
     * @param array<string, mixed> $data Campos da requisição.
     * @param string $key Nome do campo.
     */
    private function booleanValue(array $data, string $key): bool
    {
        $value = $data[$key] ?? null;
        if (!in_array($value, [true, false, 0, 1, '0', '1'], true)) {
            throw new RuntimeException('Campo booleano inválido: ' . $key . '.');
        }

        return in_array($value, [true, 1, '1'], true);
    }

    /**
     * Valida um campo textual contra uma lista fechada de valores.
     *
     * @param array<string, mixed> $data Campos da requisição.
     * @param string $key Nome do campo.
     * @param array<int, string> $allowed Valores aceitos.
     */
    private function requiredChoice(array $data, string $key, array $allowed): string
    {
        $value = $this->requiredString($data, $key, 80);
        if (!in_array($value, $allowed, true)) {
            throw new RuntimeException('Valor inválido para o campo ' . $key . '.');
        }

        return $value;
    }

    /**
     * Valida um inteiro opcional dentro de um intervalo fechado.
     *
     * @param array<string, mixed> $data Campos da requisição.
     * @param string $key Nome do campo.
     * @param int $minimum Menor valor permitido.
     * @param int $maximum Maior valor permitido.
     */
    private function nullableInteger(array $data, string $key, int $minimum, int $maximum): ?int
    {
        if (!array_key_exists($key, $data) || $data[$key] === null || $data[$key] === '') {
            return null;
        }
        $value = filter_var($data[$key], FILTER_VALIDATE_INT);
        if ($value === false || $value < $minimum || $value > $maximum) {
            throw new RuntimeException('Número inválido no campo ' . $key . '.');
        }

        return $value;
    }

    /**
     * Distingue uma atualização sem mudança real da ausência do registro.
     *
     * @param int $affectedRows Linhas alteradas pelo PDO.
     * @param string $table Tabela previamente permitida.
     * @param int $id Identificador editado.
     */
    private function requireUpdatedRecord(int $affectedRows, string $table, int $id): int
    {
        if ($affectedRows === 0) {
            $allowedTables = ['map_services', 'drawings', 'images', 'task_sequences', 'map_layers'];
            if (!in_array($table, $allowedTables, true)) {
                throw new RuntimeException('Tipo de registro não permitido.');
            }
            $statement = $this->database->prepare('SELECT 1 FROM "' . $table . '" WHERE id = ?');
            $statement->execute([$id]);
            if ($statement->fetchColumn() === false) {
                throw new RuntimeException('Registro não encontrado.');
            }
        }

        return $id;
    }
}
