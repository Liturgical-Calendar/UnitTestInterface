<?php

include_once("credentials.php");

function authenticated()
{
    if (!isset($_SERVER['PHP_AUTH_USER']) || !isset($_SERVER['PHP_AUTH_PW'])) {
        return false;
    }
    if ($_SERVER['PHP_AUTH_USER'] === AUTH_USERNAME && password_verify($_SERVER['PHP_AUTH_PW'], AUTH_PASSWORD)) {
        return true;
    }
    return false;
}
