��    >        S   �      H     I     U     i     }  	   �     �  E   �     �          	       )   '     Q  &   ]     �     �  
   �     �     �     �  �   �  �   �  �   
  J   �     �  �   �    �	  �   �
     |     �  
   �     �     �  @   �  A     C   N  	   �     �  	   �     �     �  +   �     �  	          j   1  N   �  i   �  j   U     �     �     �  0   �     -     B  !   U     w     �  P  �       3     �  C     �  %        1     K     _  "   h  T   �  
   �  	   �     �       =        \  4   i  !   �     �     �     �            �   1  �   �  �   q  W        s  �   �  '  `    �     �     �     �     �     �  O   �  R   4  X   �  
   �     �     �  	   
       ?   (     h     |  $   �  r   �  O     x   l  y   �     _     y     �  8   �     �     �      �  !        @  t  \     �   B   �         -   	   %          9   4          5          /             3   ;   +          ,   "               0            8         >             .   6       =   2   7                              <   !   
   )   :   (             &                  #      *                1   $          '                   API Version Add or Edit Comment All tests complete! Calendar to test Calendars Catholic Liturgical Calendar Choose the liturgical event for which you would like to create a test Close Comment Create a New Test Create test Define a Unit Test for a Liturgical event Description EXECUTE UNIT TESTS FOR SPECIFIC EVENTS Edit an existing test Exact Correspondence Test Exact date Exact date since year Exact date until year Failed tests: Finally, set the year from which the liturgical event should exist by clicking on the hammer icon inside one of the years in the range. Finally, set the year until which the liturgical event should exist by clicking on the hammer icon inside one of the years in the range. Finally, set the years in which the liturgical event shouldn't exist by clicking on the hammer icon inside the years in the range. First choose the maximum range of years that will belong to the Unit Test. General Roman If the liturgical event is mobile rather than fixed, set the date for the first year you are testing against. In any case you will later be able to adjust the date for each year if needed. In order to verify that the liturgical calendar data produced by the API is actually producing correct data, we can create Unit Tests that allow us to verify that events were / were not created in the calendar, or that they have expected dates from year to year. In the span of years for which we are making an assertion, we assert that the liturgical event should exist, and should fall on an expected date (date can optionally be defined differently for each given year) LitCal Project Liturgical Calendar Loading... Name of Test Per year assertions Please set the year from which the liturgical event should exist Please set the year until which the liturgical event should exist Please set the years in which the liturgical event should not exist Resources Response Format Run Tests Save Save Unit Test Set the base date for this liturgical event Successful tests: Test Type The date input cannot be empty There was an error opening the connection to the server over the websocket. Perhaps the server is offline? This festivity does not seem to exist? Please choose from a value in the list. This range should include a few years after the year in which the liturgical event should cease to exist. This range should include a few years before the year in which the liturgical event should start to exist. Total time for %s tests: Unit Tests Admin Unit Tests Runner VALIDATE CALENDAR DATA FOR YEARS FROM 1970 UNTIL VALIDATE SOURCE DATA Variable existence Websocket connected successfully! Websocket connection closed. Websocket connection status When a liturgical event should no longer exist after a certain year, we assert that for a certain span of years before such year the liturgical event should fall on an expected date (date can optionally be defined differently for each given year), while for a certain span of years after such year the liturgical event should not exist. Years to test You can then remove any years that won't be needed. Project-Id-Version: German (Liturgical Calendar)
Report-Msgid-Bugs-To: 
PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE
Last-Translator: FULL NAME <EMAIL@ADDRESS>
Language-Team: German <https://translate.johnromanodorazio.com/projects/liturgical-calendar/unit-test-interface/de/>
Language: de
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit
Plural-Forms: nplurals=2; plural=n != 1;
X-Generator: Weblate 5.6.1
 API-Version Kommentar hinzufügen oder bearbeiten Alle Tests abgeschlossen! Kalender zum Testen Kalender Katholischer Liturgischer Kalender Wählen Sie das liturgische Ereignis aus, für das Sie einen Test erstellen möchten Schließen Kommentar Erstelle einen neuen Test Test erstellen Definieren Sie einen Unit-Test für ein liturgisches Ereignis Beschreibung FÜHREN SIE UNIT-TESTS FÜR BESTIMMTE EREIGNISSE AUS Einen bestehenden Test bearbeiten Exakte Übereinstimmungstest Genaues Datum Genaues Datum seit Jahr Genaues Datum bis Jahr Fehlgeschlagene Tests: Legen Sie schließlich das Jahr fest, ab dem das liturgische Ereignis existieren soll, indem Sie auf das Hammer-Symbol in einem der Jahre im Bereich klicken. Legen Sie schließlich das Jahr fest, bis zu dem das liturgische Ereignis existieren soll, indem Sie auf das Hammer-Symbol in einem der Jahre im Bereich klicken. Legen Sie schließlich die Jahre fest, in denen das liturgische Ereignis nicht existieren sollte, indem Sie auf das Hammer-Symbol innerhalb der Jahre im Bereich klicken. Wählen Sie zuerst den maximalen Zeitraum der Jahre, die zum Unit-Test gehören werden. Allgemeiner Römischer Wenn das liturgische Ereignis beweglich statt fest ist, legen Sie das Datum für das erste Jahr fest, gegen das Sie testen. In jedem Fall können Sie das Datum später für jedes Jahr anpassen, falls erforderlich. Um zu überprüfen, ob die vom API erzeugten Daten des liturgischen Kalenders tatsächlich korrekte Daten liefern, können wir Unit Tests erstellen, die es uns ermöglichen zu überprüfen, ob Ereignisse im Kalender erstellt wurden oder nicht, oder ob sie von Jahr zu Jahr erwartete Daten haben. Im Zeitraum der Jahre, für die wir eine Behauptung aufstellen, behaupten wir, dass das liturgische Ereignis existieren sollte und an einem erwarteten Datum stattfinden sollte (das Datum kann optional für jedes gegebene Jahr unterschiedlich definiert werden) LitCal-Projekt Liturgischer Kalender Laden... Name des Tests Jährliche Überprüfungen Bitte legen Sie das Jahr fest, ab dem das liturgische Ereignis existieren soll. Bitte legen Sie das Jahr fest, bis zu dem das liturgische Ereignis existieren soll Bitte legen Sie die Jahre fest, in denen das liturgische Ereignis nicht existieren soll. Ressourcen Antwortformat Tests ausführen Speichern Unit-Test speichern Legen Sie das Basisdatum für dieses liturgische Ereignis fest. Erfolgreiche Tests: Testtyp Das Datumsfeld darf nicht leer sein. Es gab einen Fehler beim Öffnen der Verbindung zum Server über das Websocket. Vielleicht ist der Server offline? Dieses Fest scheint nicht zu existieren? Bitte wähle einen Wert aus der Liste. Dieser Bereich sollte einige Jahre nach dem Jahr umfassen, in dem das liturgische Ereignis aufhören soll zu existieren. Dieser Zeitraum sollte einige Jahre vor dem Jahr umfassen, in dem das liturgische Ereignis beginnen sollte zu existieren. Gesamtzeit für %s Tests: Unit-Tests Admin Unit-Test-Läufer VALIDIEREN SIE KALENDERDATEN FÜR DIE JAHRE VON 1970 BIS QUELLDATEN VALIDIEREN Variablenexistenz Websocket erfolgreich verbunden! Websocket-Verbindung geschlossen. Websocket-Verbindungsstatus Wenn ein liturgisches Ereignis nach einem bestimmten Jahr nicht mehr existieren sollte, behaupten wir, dass es für einen bestimmten Zeitraum vor diesem Jahr an einem erwarteten Datum stattfinden sollte (das Datum kann optional für jedes gegebene Jahr unterschiedlich definiert werden), während es für einen bestimmten Zeitraum nach diesem Jahr nicht existieren sollte. Jahre zum Testen Sie können dann alle Jahre entfernen, die nicht benötigt werden. 