# Unit Test Interface

A web page that opens a websocket (`wss://litcal-test.johnromanodorazio.com`) which communicates with the [unit test server](https://github.com/Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/LitCalTestServer.php),
sends unit test requests in succession and collects the response data asynchronously, showing results graphically on the page as they come in.

The UI implements `jQuery`, `Bootstrap`, and `Fontawesome`.

## Some notes about the Unit Test server

The websocket **server** is at [Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/LitCalTestServer.php](https://github.com/Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/LitCalTestServer.php).

The **main logic** for the Unit Test server is at [Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/LitCalHealth.php](https://github.com/Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/LitCalHealth.php).

The Unit Test server implements [cboden/ratchet](https://github.com/ratchetphp/Ratchet) to create the websocket server that listens for client connections.

The Unit Test server also implements [swaggest/json-schema](https://github.com/swaggest/php-json-schema) to validate JSON source files or outputs against predefined schemas.

## Local environment

Both the **Liturgical Calendar API** and the **Websocket Server** must be running in order for the Unit Test Interface to work.

If either the Liturgical Calendar API or the Websocket Server are running on ports other than the defaults (`8000` and `8080`),
you will need to adjust the `API_PROTOCOL`, `API_HOST`, and `API_PORT` environment variables in an `.env.local` file
(or in an `.env.development` file for the development environment). See the `.env.example` file for more defaults.

If you have the Liturgical Calendar API loaded in the same VSCode workspace as the Unit Test Interface,
you can easily launch the API and the websocket server by using <kbd>CTRL</kbd>+<kbd>SHIFT</kbd>+<kbd>B</kbd> (<kbd>CMD</kbd>+<kbd>SHIFT</kbd>+<kbd>B</kbd> on macOS)
and launching the related tasks `litcal-api-with-browser` (or `api-server-no-browser`) and `litcal-tests-websockets`.
Then you can launch the Unit Test Interface via its own task `litcal-tests-webui`.
