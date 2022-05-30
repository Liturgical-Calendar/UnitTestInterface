# Unit Test Interface
A web page that opens a websocket (`wss://litcal-test.johnromanodorazio.com`) to the [unit test server](https://github.com/Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/LitCalTestServer.php),
sends unit test requests in succession and collects the response data asynchronously, showing results graphically on the page as they come in.

The web page makes use of `jQuery`, `Bootstrap`, and `Fontawesome`.

### Some notes about the Unit Test server at https://github.com/Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/LitCalTestServer.php

The main logic for the Unit Test server is at https://github.com/Liturgical-Calendar/LiturgicalCalendarAPI/blob/development/LitCalHealth.php.

The Unit Test server implements [Ratchet](https://github.com/ratchetphp/Ratchet) to create the websocket server that listens for client connections.

The Unit Test server also implements [Swaggest/php-json-schema](https://github.com/swaggest/php-json-schema) to validate JSON source files or outputs against predefined schemas.

The Unit Test server also implements [PHP Unit](https://github.com/sebastianbergmann/phpunit) to carry out specific unit tests.
