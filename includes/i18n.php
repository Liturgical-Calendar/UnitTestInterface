<?php

class i18n {

    public string $LOCALE;

    public function __construct() {

        if( !empty( $_COOKIE["currentLocale"] ) ) {
            $this->LOCALE = $_COOKIE["currentLocale"];
        }
        elseif( isset( $_SERVER['HTTP_ACCEPT_LANGUAGE'] ) ) {
            $this->LOCALE = Locale::acceptFromHttp( $_SERVER['HTTP_ACCEPT_LANGUAGE'] );
        }
        else {
            $this->LOCALE = "en";
        }
        //we only need the two letter ISO code, not the national extension, when setting the text domain...
        if( $this->LOCALE !== 'la' && $this->LOCALE !== "LA" ) {
            $LOCALE = Locale::getPrimaryLanguage( $this->LOCALE );
            $REGION = Locale::getRegion( $this->LOCALE );
        } else {
            $LOCALE = 'la';
            $REGION = 'VA';
        }

        $localeArray = [
            $LOCALE . '_' . $REGION . '.utf8',
            $LOCALE . '_' . $REGION . '.UTF-8',
            $LOCALE . '_' . $REGION,
            $LOCALE . '_' . strtoupper( $LOCALE) . '.utf8',
            $LOCALE . '_' . strtoupper( $LOCALE ) . '.UTF-8',
            $LOCALE . '_' . strtoupper( $LOCALE ),
            $LOCALE . '.utf8',
            $LOCALE . '.UTF-8',
            $LOCALE
        ];
        setlocale( LC_ALL, $localeArray );
        bindtextdomain("litcal", "i18n");
        textdomain("litcal");

    }

}
