<?php
declare(strict_types=1);

namespace PlanMilT\Application;

use PDO;

/**
 * Encapsula leitura e persistência de planejamentos armazenados no SQLite.
 *
 * O serviço preserva o conteúdo GeoJSON sem decodificá-lo.
 */
final class DrawingsService
{
    private PDO $database;

    /**
     * Cria o serviço com a conexão da aplicação.
     *
     * @param PDO $database Conexão SQLite configurada para a aplicação.
     */
    public function __construct(PDO $database)
    {
        $this->database = $database;
    }

    /**
     * Localiza o planejamento pelo nome e link.
     *
     * @param string $planName Nome armazenado na coluna `plans.name`.
     * @param string $link Identificador do planejamento armazenado na coluna `link`.
     * @return string|null JSON bruto da coluna `geojson`, ou null se não houver registro.
     */
    public function load(string $planName, string $link): ?string
    {
        $statement = $this->database->prepare(
            'SELECT geojson FROM plans WHERE name = :name AND link = :link'
        );
        $statement->execute([
            ':name' => $planName,
            ':link' => $link
        ]);

        $drawing = $statement->fetch(PDO::FETCH_ASSOC);
        return $drawing === false ? null : (string) $drawing['geojson'];
    }

    /**
     * Cria ou atualiza o desenho depois de validar a senha do registro existente.
     *
     * @param string $planName Nome do planejamento.
     * @param string $password Senha em texto claro para validar ou armazenar com hash.
     * @param string $link Identificador do planejamento.
     * @param string $geoJson JSON serializado do conteúdo do planejamento.
     * @return string Mensagem de sucesso ou de senha incorreta esperada pelo endpoint legado.
     */
    public function save(string $planName, string $password, string $link, string $geoJson): string
    {
        $statement = $this->database->prepare(
            'SELECT id, password_hash FROM plans WHERE name = :name AND link = :link'
        );
        $statement->execute([
            ':name' => $planName,
            ':link' => $link
        ]);
        $existingDrawing = $statement->fetch(PDO::FETCH_ASSOC);

        if ($existingDrawing !== false) {
            if (!password_verify($password, $existingDrawing['password_hash'])) {
                return 'Senha incorreta.';
            }

            $statement = $this->database->prepare(
                'UPDATE plans SET geojson = :geojson, updated_at = datetime(\'now\') WHERE id = :id'
            );
            $statement->execute([
                ':id' => $existingDrawing['id'],
                ':geojson' => $geoJson
            ]);

            return 'Desenho atualizado com sucesso!';
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $statement = $this->database->prepare(
            'INSERT INTO plans (name, password_hash, link, geojson, created_at, updated_at) '
            . 'VALUES (:name, :passwordHash, :link, :geojson, datetime(\'now\'), datetime(\'now\'))'
        );
        $statement->execute([
            ':name' => $planName,
            ':passwordHash' => $passwordHash,
            ':link' => $link,
            ':geojson' => $geoJson
        ]);

        return 'Desenho salvo com sucesso!';
    }
}
