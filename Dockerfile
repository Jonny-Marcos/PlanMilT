# Usar uma versão suportada do PHP com Apache
FROM php:8.4-apache

# Instalar as extensões usadas pelo SQLite e pelo proxy HTTP
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4-openssl-dev \
    libsqlite3-dev \
    && docker-php-ext-install pdo_sqlite curl \
    && rm -rf /var/lib/apt/lists/*

# Configurar o Apache para aplicar as regras de compatibilidade e proteção.
RUN a2enmod rewrite && \
    printf '<Directory /var/www/html>\n    AllowOverride All\n    Require all granted\n</Directory>\n' \
        > /etc/apache2/conf-available/planmilt-overrides.conf && \
    a2enconf planmilt-overrides && \
    echo "ServerName PlanMilT" >> /etc/apache2/apache2.conf

# Copiar somente os arquivos necessários para servir a aplicação
COPY --chown=root:root .htaccess /var/www/html/.htaccess
COPY --chown=root:root php/ /var/www/html/php/
COPY --chown=root:root index.html criador-tema.html favicon.ico /var/www/html/
COPY --chown=root:root css/ /var/www/html/css/
COPY --chown=root:root js/ /var/www/html/js/
COPY --chown=root:root symbols/ /var/www/html/symbols/
COPY --chown=root:root webfonts/ /var/www/html/webfonts/
COPY --chown=root:root SRTM3/ /var/www/html/SRTM3/
# Manter o código somente para leitura e permitir escrita apenas nos dados operacionais
RUN mkdir -p /var/lib/planmilt && \
    chmod -R a=rX /var/www/html && \
    chown -R www-data:www-data /var/lib/planmilt /var/www/html/SRTM3 && \
    chmod -R u+rwX /var/lib/planmilt /var/www/html/SRTM3

# Copiar o arquivo de configuração do PHP
COPY php.ini /usr/local/etc/php/php.ini

ENV PLANMILT_DB_PATH=/var/lib/planmilt/bd.db

# Configurar o diretório de trabalho
WORKDIR /var/www/html

# Expor a porta padrão do servidor Apache
EXPOSE 80

# Iniciar o Apache no modo foreground
CMD ["apache2-foreground"]
