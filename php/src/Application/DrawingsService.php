<?php
declare(strict_types=1);

namespace PlanMilT\Application;

use PDO;

/**
 * Encapsula leitura e persistência de desenhos armazenados no SQLite.
 *
 * O serviço preserva o conteúdo JSON de `leaflet` sem decodificá-lo.
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
     * Localiza o desenho pelo usuário e link.
     *
     * @param string $user Identificador armazenado na coluna `usuario`.
     * @param string $link Identificador do desenho armazenado na coluna `link`.
     * @return string|null JSON bruto da coluna `leaflet`, ou null se não houver registro.
     */
    public function load(string $user, string $link): ?string
    {
        $statement = $this->database->prepare(
            'SELECT leaflet FROM desenhos WHERE usuario = :usuario AND link = :link'
        );
        $statement->execute([
            ':usuario' => $user,
            ':link' => $link
        ]);

        $drawing = $statement->fetch(PDO::FETCH_ASSOC);
        return $drawing === false ? null : (string) $drawing['leaflet'];
    }

    /**
     * Cria ou atualiza o desenho depois de validar a senha do registro existente.
     *
     * @param string $user Identificador do usuário proprietário do desenho.
     * @param string $password Senha em texto claro para validar ou armazenar com hash.
     * @param string $link Identificador do desenho.
     * @param string $leaflet JSON serializado do conteúdo do desenho.
     * @return string Mensagem de sucesso ou de senha incorreta esperada pelo endpoint legado.
     */
    public function save(string $user, string $password, string $link, string $leaflet): string
    {
        $statement = $this->database->prepare(
            'SELECT senha FROM desenhos WHERE usuario = :usuario AND link = :link'
        );
        $statement->execute([
            ':usuario' => $user,
            ':link' => $link
        ]);
        $existingDrawing = $statement->fetch(PDO::FETCH_ASSOC);

        if ($existingDrawing !== false) {
            if (!password_verify($password, $existingDrawing['senha'])) {
                return 'Senha incorreta.';
            }

            $statement = $this->database->prepare(
                'UPDATE desenhos SET link = :link, leaflet = :leaflet '
                . 'WHERE usuario = :usuario AND senha = :senhaHash'
            );
            $statement->execute([
                ':usuario' => $user,
                ':senhaHash' => $existingDrawing['senha'],
                ':link' => $link,
                ':leaflet' => $leaflet
            ]);

            return 'Desenho atualizado com sucesso!';
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $statement = $this->database->prepare(
            'INSERT INTO desenhos (usuario, senha, link, leaflet) '
            . 'VALUES (:usuario, :senhaHash, :link, :leaflet)'
        );
        $statement->execute([
            ':usuario' => $user,
            ':senhaHash' => $passwordHash,
            ':link' => $link,
            ':leaflet' => $leaflet
        ]);

        return 'Desenho salvo com sucesso!';
    }
}
