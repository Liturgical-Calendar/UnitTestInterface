# Use the official PHP 8.4 CLI image as the base image
FROM php:8.4-cli AS build

# Install necessary PHP extensions and Composer in one step to minimize layers
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    apt-get update -y && \
    apt-get install -y --no-install-suggests --no-install-recommends \
        libicu-dev libonig-dev libzip-dev gettext libyaml-dev && \
    docker-php-ext-install intl zip calendar gettext && \
    pecl install apcu yaml && \
    docker-php-ext-enable intl zip calendar apcu yaml gettext && \
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /var/www/html

# Copy composer files first for caching purposes
COPY composer.json composer.lock ./

# Run composer install to install dependencies
RUN --mount=type=cache,target=/tmp/composer \
    composer install --no-interaction --prefer-dist \
    --optimize-autoloader --no-dev

# Copy the application code
COPY ./src ./src
COPY ./includes ./includes
COPY ./layout ./layout
COPY ./components ./components
COPY ./assets ./assets
COPY ./i18n ./i18n
COPY ./*.php ./
COPY ./.env.example ./.env.local

# Generate default credentials file for Docker (user: admin, password: admin)
RUN php -r "file_put_contents('credentials.php', \"<?php\ndefine('AUTH_USERS', ['admin' => '\" . password_hash('admin', PASSWORD_BCRYPT) . \"']);\n\");"

# Stage 2: final build
FROM php:8.4-cli AS main

# Set the working directory
WORKDIR /var/www/html

# Install runtime dependencies
RUN apt-get update -y && \
    apt-get install -y --no-install-suggests --no-install-recommends \
    libyaml-0-2 libicu-dev libzip-dev locales-all && \
    rm -rf /var/lib/apt/lists/*

# Copy the compiled PHP extensions from the build stage
COPY --from=build /usr/local/lib/php/extensions /usr/local/lib/php/extensions
COPY --from=build /usr/local/etc/php/conf.d /usr/local/etc/php/conf.d
COPY --from=build /var/www/html /var/www/html

# Expose port 3003 to the host
EXPOSE 3003

# Command to run PHP's built-in server
CMD ["php", "-S", "0.0.0.0:3003", "-t", "/var/www/html"]
