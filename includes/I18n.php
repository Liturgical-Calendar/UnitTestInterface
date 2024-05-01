<?php

class I18n {

    public string $locale;
    public array $langsAvailable = [];
    public array $langsAssoc = [];

    public function __construct() {

        $this->langsAvailable = ['en', ...array_map('basename', glob("i18n/*", GLOB_ONLYDIR))];

        if( !empty( $_COOKIE["currentLocale"] ) && in_array($_COOKIE["currentLocale"], $this->langsAvailable ) ) {
            $this->locale = $_COOKIE["currentLocale"];
        }
        elseif( isset( $_SERVER['HTTP_ACCEPT_LANGUAGE'] ) && in_array( $_SERVER['HTTP_ACCEPT_LANGUAGE'], $this->langsAvailable ) ) {
            $this->locale = Locale::acceptFromHttp( $_SERVER['HTTP_ACCEPT_LANGUAGE'] );
        }
        else {
            $this->locale = "en";
        }
        //we only need the two letter ISO code, not the national extension, when setting the text domain...
        if( $this->locale !== 'la' && $this->locale !== "LA" ) {
            $LOCALE = Locale::getPrimaryLanguage( $this->locale );
            $REGION = Locale::getRegion( $this->locale );
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

        foreach( $this->langsAvailable as $lang ) {
            $this->langsAssoc[$lang] = Locale::getDisplayLanguage($lang, $this->locale);
        }
        asort($this->langsAssoc);
    }

}
