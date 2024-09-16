<?php

if (false === file_exists("credentials.php")) {
    die("missing credentials definition");
}

include_once("credentials.php");

if (false === defined("AUTH_USERS")) {
    die("missing AUTH_USERS definition");
}

if (false === is_array(AUTH_USERS) || 0 === count(AUTH_USERS)) {
    die("AUTH_USERS must be an array");
}

function authenticated()
{
    if (!isset($_SERVER['PHP_AUTH_USER']) || !isset($_SERVER['PHP_AUTH_PW'])) {
        return false;
    }
    if (array_key_exists($_SERVER['PHP_AUTH_USER'], AUTH_USERS) && password_verify($_SERVER['PHP_AUTH_PW'], AUTH_USERS[$_SERVER['PHP_AUTH_USER']])) {
        return true;
    }
    return false;
}
