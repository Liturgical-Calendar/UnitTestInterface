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
    rm -rf /var/lib/apt/lists/*

# Copy the Composer binary from the official, pinned image instead of piping the
# installer through php (which skips signature verification).
COPY --from=composer:2.8 /usr/bin/composer /usr/local/bin/composer

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
# Ship the template for reference only. Runtime configuration is supplied via
# environment variables (e.g. `docker run --env-file .env` or `-e KEY=value`);
# phpdotenv's safeLoad() tolerates the absence of a .env file. We deliberately do
# NOT bake a .env.local, which would hardcode localhost defaults and a placeholder
# JWT secret into the image.
COPY ./.env.example ./.env.example

# Stage 2: final build
FROM php:8.4-cli AS main

# Set the working directory
WORKDIR /var/www/html

# Install runtime dependencies (shared libraries only, not the -dev packages used
# for compiling the extensions in the build stage). Versioned names track the base
# image's Debian release (currently trixie: libicu76, libzip5).
RUN apt-get update -y && \
    apt-get install -y --no-install-suggests --no-install-recommends \
    libyaml-0-2 libicu76 libzip5 locales-all && \
    rm -rf /var/lib/apt/lists/*

# Copy the compiled PHP extensions from the build stage
COPY --from=build /usr/local/lib/php/extensions /usr/local/lib/php/extensions
COPY --from=build /usr/local/etc/php/conf.d /usr/local/etc/php/conf.d
COPY --from=build /var/www/html /var/www/html

# Expose port 3003 to the host
EXPOSE 3003

# Command to run PHP's built-in server
CMD ["php", "-S", "0.0.0.0:3003", "-t", "/var/www/html"]
