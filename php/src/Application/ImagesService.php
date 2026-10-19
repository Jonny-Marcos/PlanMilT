<?php
declare(strict_types=1);

namespace PlanMilT\Application;

use PDO;

/**
 * Encapsula a criação e atualização de imagens armazenadas no SQLite.
 */
final class ImagesService
{
    private PDO $database;

    /**
     * Cria o serviço com a conexão SQLite da aplicação.
     *
     * @param PDO $database Conexão configurada para a aplicação.
     */
    public function __construct(PDO $database)
    {
        $this->database = $database;
    }

    /**
     * Cria uma imagem ou atualiza uma existente após validar sua senha atual.
     *
     * @param string $image Conteúdo binário da imagem.
     * @param string $description Nome exibido para o tema.
     * @param string $location Limites geográficos serializados em JSON.
     * @param string $password Nova senha opcional.
     * @param bool $isShared Indica se o tema pode ser carregado sem senha.
     * @param int|null $imageId Identificador do tema a atualizar; null cria um registro.
     * @param string $currentPassword Senha atual para autorizar atualização.
     * @return string Mensagem compatível com o endpoint legado.
     */
    public function save(
        string $image,
        string $description,
        string $location,
        string $password,
        bool $isShared,
        ?int $imageId = null,
        string $currentPassword = '',
        ?string $createdAt = null
    ): string {
        if ($imageId !== null) {
            return $this->update(
                $imageId,
                $image,
                $description,
                $location,
                $password,
                $isShared,
                $currentPassword
            );
        }

        $passwordHash = $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : '';
        $statement = $this->database->prepare(
            'INSERT INTO images (image, location, created_at, updated_at, description, password_hash, is_shared) '
            . 'VALUES (:image, :location, :createdAt, datetime(\'now\'), :description, :passwordHash, :isShared)'
        );
        $statement->bindValue(':image', $image, PDO::PARAM_LOB);
        $statement->bindValue(':location', $location);
        $statement->bindValue(':createdAt', $createdAt ?? gmdate('Y-m-d H:i:s'));
        $statement->bindValue(':description', $description);
        $statement->bindValue(':passwordHash', $passwordHash);
        $statement->bindValue(':isShared', $isShared ? 1 : 0, PDO::PARAM_INT);
        $statement->execute();

        return 'Imagem salva com sucesso!';
    }

    /**
     * Atualiza conteúdo e metadados sem trocar a senha se nenhuma nova for enviada.
     *
     * @param int $imageId Identificador do registro.
     * @param string $image Novo conteúdo binário.
     * @param string $description Novo nome.
     * @param string $location Novos limites geográficos serializados.
     * @param string $password Nova senha opcional.
     * @param bool $isShared Novo estado de compartilhamento.
     * @param string $currentPassword Senha atual para autenticação.
     * @return string Mensagem de resultado.
     */
    private function update(
        int $imageId,
        string $image,
        string $description,
        string $location,
        string $password,
        bool $isShared,
        string $currentPassword
    ): string {
        $statement = $this->database->prepare(
            'SELECT password_hash FROM images WHERE id = :id'
        );
        $statement->execute([':id' => $imageId]);
        $existingImage = $statement->fetch(PDO::FETCH_ASSOC);

        if ($existingImage === false) {
            return 'Imagem não encontrada.';
        }

        $storedPasswordHash = (string) $existingImage['password_hash'];
        if ($storedPasswordHash !== '' &&
            ($currentPassword === '' || !password_verify($currentPassword, $storedPasswordHash))) {
            return 'Senha incorreta ou não fornecida.';
        }

        $passwordHash = $password !== ''
            ? password_hash($password, PASSWORD_DEFAULT)
            : $storedPasswordHash;
        $statement = $this->database->prepare(
            'UPDATE images SET image = :image, location = :location, description = :description, '
            . 'password_hash = :passwordHash, is_shared = :isShared, updated_at = datetime(\'now\') '
            . 'WHERE id = :id'
        );
        $statement->bindValue(':image', $image, PDO::PARAM_LOB);
        $statement->bindValue(':location', $location);
        $statement->bindValue(':description', $description);
        $statement->bindValue(':passwordHash', $passwordHash);
        $statement->bindValue(':isShared', $isShared ? 1 : 0, PDO::PARAM_INT);
        $statement->bindValue(':id', $imageId, PDO::PARAM_INT);
        $statement->execute();

        return 'Imagem atualizada com sucesso!';
    }
}
