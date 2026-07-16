# Unit Test Interface

A web page that opens a websocket (`wss://litcal-test.johnromanodorazio.com`) which communicates with the [unit test server](https://github.com/Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/LitCalTestServer.php),
sends unit test requests in succession and collects the response data asynchronously, showing results graphically on the page as they come in.

The UI implements native ES6 JavaScript, `Bootstrap 5`, and `Font Awesome`.

## Some notes about the Unit Test server

The websocket **server** is at [Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/public/LitCalTestServer.php](https://github.com/Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/public/LitCalTestServer.php).

The **main logic** for the Unit Test server is at [Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/src/Health.php](https://github.com/Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/src/Health.php).

The Unit Test server implements [cboden/ratchet](https://github.com/ratchetphp/Ratchet) to create the websocket server that listens for client connections.

The Unit Test server also implements [swaggest/json-schema](https://github.com/swaggest/php-json-schema) to validate JSON source files or outputs against predefined schemas.

## Local environment

Both the **Liturgical Calendar API** and the **Websocket Server** must be running in order for the Unit Test Interface to work.
There are two ways to get a working local environment: the full docker stack, or running the services natively.

### Option 1: full docker stack

The [LiturgicalCalendarFrontend](https://github.com/Liturgical-Calendar/LiturgicalCalendarFrontend) repository provides a
docker compose stack that runs everything needed (API + websocket server, PostgreSQL, auth services, and this test interface):

```bash
cd ../LiturgicalCalendarFrontend
docker compose up -d
```

The test interface is then available at `http://localhost:3003`. The `litcal-tests` service bind-mounts this repository,
so local changes to PHP / JS / assets are picked up live without rebuilding the image.

### Option 2: without docker

1. **Start PostgreSQL** — the API requires a database connection on every request. The simplest option is the API repo's own db service
   (or point `DB_HOST` / `DB_PORT` in the API's `.env.local` at a native PostgreSQL instance):

   ```bash
   cd ../LiturgicalCalendarAPI
   docker compose up -d db litcal-migrate
   ```

2. **Start the API and the websocket server** (from the LiturgicalCalendarAPI repository):

   ```bash
   composer start      # API on localhost:8000
   composer ws:start   # websocket server on localhost:8082
   ```

3. **Start the test interface** (from this repository):

   ```bash
   composer install
   php -S localhost:3003
   ```

If either the Liturgical Calendar API or the Websocket Server are running on ports other than the defaults (`8000` and `8082`),
you will need to adjust the `API_PROTOCOL`, `API_HOST`, `API_PORT` and `WS_PROTOCOL`, `WS_HOST`, `WS_PORT` environment variables
in an `.env.local` file (or in an `.env.development` file for the development environment). See the `.env.example` file for more defaults.

> [!IMPORTANT]
> **WSL2 users (browser on Windows):** set `WS_HOST=127.0.0.1` instead of `localhost` when running the websocket server natively.
> Windows browsers resolve `localhost` to IPv6 `::1` first, but WSL does not forward Windows-side IPv6 loopback connections
> into the WSL VM (in either NAT or mirrored networking mode — only IPv4 loopback passes through), so the connection is
> closed immediately. HTTP requests recover by falling back to IPv4, WebSockets do not. Binding the websocket server to IPv6
> inside WSL (e.g. `WS_HOST="[::]"` in the API's `.env.local`) does not help, since the Windows-to-WSL `::1` path itself is
> missing; connecting explicitly via `127.0.0.1` is the reliable workaround.
> Leave `API_HOST=localhost`: the websocket server matches resource URLs against the API's configured host when resolving
> JSON schemas, so `127.0.0.1` there would make the base API path `schema-valid` checks fail.
> The docker stack is unaffected because Docker Desktop's proxy listens on both IPv4 and IPv6 on the Windows side.

If you have the Liturgical Calendar API loaded in the same VSCode workspace as the Unit Test Interface,
you can easily launch the API and the websocket server by using <kbd>CTRL</kbd>+<kbd>SHIFT</kbd>+<kbd>B</kbd> (<kbd>CMD</kbd>+<kbd>SHIFT</kbd>+<kbd>B</kbd> on macOS)
and launching the related tasks `litcal-api-with-browser` (or `api-server-no-browser`) and `litcal-tests-websockets`.
Then you can launch the Unit Test Interface via its own task `litcal-tests-webui`.
