<?php

if (false === file_exists("credentials.php")) {
    die("missing credentials definition");
}

include_once("credentials.php");

if (false === defined("AUTH_USERS")) {
    die("missing AUTH_USERS definition");
}

/** @disregard P1011 since AUTH_USERS is defined in credentials.php */
if (false === is_array(AUTH_USERS) || 0 === count(AUTH_USERS)) {
    die("AUTH_USERS must be an array");
}

/**
 * Verifies if the user is authenticated.
 *
 * @return boolean True if the user is authenticated, false otherwise.
 */
function authenticated()
{
    if (!isset($_SERVER['PHP_AUTH_USER']) || !isset($_SERVER['PHP_AUTH_PW'])) {
        return false;
    }
    /** @disregard P1011 since AUTH_USERS is defined in credentials.php */
    if (array_key_exists($_SERVER['PHP_AUTH_USER'], AUTH_USERS) && password_verify($_SERVER['PHP_AUTH_PW'], AUTH_USERS[$_SERVER['PHP_AUTH_USER']])) {
        return true;
    }
    return false;
}
