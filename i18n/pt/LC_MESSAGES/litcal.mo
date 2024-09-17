��    @        Y         �     �     �     �     �  	   �     �  E   �     3     9     A     S  )   _     �  &   �     �     �  
   �     �          #  �   1  �   �  �   B  J   �     	  �   	    �	  �   �
     �     �  
   �     �     �  A     B   E  D   �  	   �     �  	   �     �     �  ,        2  	   D     N  j   n  N   �  i   (  j   �     �          '  0   9     j       !   �     �     �    �  P    \  X     �  3   �  �  �     �     �     �                (  H   I     �     �     �     �  4   �     �  4        ;     U  
   u     �     �     �  �   �  �   K  �   �  P   W     �  �   �  �   q  �   p     T     c     z     �     �  J   �  E   �  G   <     �     �     �     �     �  /   �     �       (   #  a   L  K   �  f   �  h   a     �  $   �        6   )      `      x       �      �      �   !  �   ~  "  n  �#     %  F   %     "      :   =   6   *             3                           '   
   )   .       <                  /         ,   0              4             $   +                5   ?              7           	       9             (   ;   1   8   -                       @             #   &      2                   !      >      %        API Version Add or Edit Comment All tests complete! Calendar to test Calendars Catholic Liturgical Calendar Choose the liturgical event for which you would like to create a test Close Comment Create a New Test Create test Define a Unit Test for a Liturgical event Description EXECUTE UNIT TESTS FOR SPECIFIC EVENTS Edit an existing test Exact Correspondence Test Exact date Exact date since year Exact date until year Failed tests: Finally, set the year from which the liturgical event should exist by clicking on the hammer icon inside one of the years in the range. Finally, set the year until which the liturgical event should exist by clicking on the hammer icon inside one of the years in the range. Finally, set the years in which the liturgical event shouldn't exist by clicking on the hammer icon inside the years in the range. First choose the maximum range of years that will belong to the Unit Test. General Roman If the liturgical event is mobile rather than fixed, set the date for the first year you are testing against. In any case you will later be able to adjust the date for each year if needed. In order to verify that the liturgical calendar data produced by the API is actually producing correct data, we can create Unit Tests that allow us to verify that events were / were not created in the calendar, or that they have expected dates from year to year. In the span of years for which we are making an assertion, we assert that the liturgical event should exist, and should fall on an expected date (date can optionally be defined differently for each given year) LitCal Project Liturgical Calendar Loading... Name of Test Per year assertions Please set the year from which the liturgical event should exist. Please set the year until which the liturgical event should exist. Please set the years in which the liturgical event should not exist. Resources Response Format Run Tests Save Save Unit Test Set the base date for this liturgical event. Successful tests: Test Type The date input cannot be empty. There was an error opening the connection to the server over the websocket. Perhaps the server is offline? This festivity does not seem to exist? Please choose from a value in the list. This range should include a few years after the year in which the liturgical event should cease to exist. This range should include a few years before the year in which the liturgical event should start to exist. Total time for %s tests: Unit Tests Admin Unit Tests Runner VALIDATE CALENDAR DATA FOR YEARS FROM 1970 UNTIL VALIDATE SOURCE DATA Variable existence Websocket connected successfully! Websocket connection closed. Websocket connection status When a liturgical event is expected to be overriden in various years for whatever reason, we assert that it should exist in certain given years on an expected date (date can optionally be defined differently for each given year), and that it should not exist for other given years. When a liturgical event should no longer exist after a certain year, we assert that for a certain span of years before such year the liturgical event should fall on an expected date (date can optionally be defined differently for each given year), while for a certain span of years after such year the liturgical event should not exist. When a liturgical event should only exist after a certain year, we assert that for a certain span of years before such year the liturgical event should not exist, while for a certain span of years after such year the liturgical event should exist and should fall on an expected date (date can optionally be defined differently for each given year). Years to test You can then remove any years that won't be needed. Project-Id-Version: Portuguese (Liturgical Calendar)
Report-Msgid-Bugs-To: 
PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE
Last-Translator: FULL NAME <EMAIL@ADDRESS>
Language-Team: Portuguese <https://translate.johnromanodorazio.com/projects/liturgical-calendar/unit-test-interface/pt/>
Language: pt
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit
Plural-Forms: nplurals=2; plural=n > 1;
X-Generator: Weblate 5.6.1
 Versão da API Adicionar ou Editar Comentário Todos os testes completos! Calendário para teste Calendários Calendário Litúrgico Católico Escolha o evento litúrgico para o qual você gostaria de criar um teste Fechar Comentário Criar um Novo Teste Criar teste Definir um Teste Unitário para um evento litúrgico Descrição EXECUTAR TESTES UNITÁRIOS PARA EVENTOS ESPECÍFICOS Editar um teste existente Teste de Correspondência Exata Data exata Data exata desde o ano Data exata até o ano Testes falhados: Finalmente, defina o ano a partir do qual o evento litúrgico deve existir clicando no ícone do martelo dentro de um dos anos do intervalo. Finalmente, defina o ano até o qual o evento litúrgico deve existir clicando no ícone de martelo dentro de um dos anos do intervalo. Finalmente, defina os anos em que o evento litúrgico não deve existir clicando no ícone do martelo dentro dos anos no intervalo. Primeiro escolha o intervalo máximo de anos que pertencerá ao Teste Unitário. Geral Romano Se o evento litúrgico for móvel em vez de fixo, defina a data para o primeiro ano que você está testando. Em qualquer caso, você poderá ajustar a data para cada ano, se necessário. Para verificar se os dados do calendário litúrgico produzidos pela API estão realmente corretos, podemos criar Testes Unitários que nos permitam verificar se os eventos foram ou não criados no calendário, ou se têm datas esperadas de ano para ano. No intervalo de anos para o qual estamos fazendo uma afirmação, afirmamos que o evento litúrgico deve existir e deve ocorrer em uma data esperada (a data pode ser definida opcionalmente de forma diferente para cada ano dado) Projeto LitCal Calendário Litúrgico Carregando... Nome do Teste Afirmações por ano Por favor, defina o ano a partir do qual o evento litúrgico deve existir. Por favor, defina o ano até o qual o evento litúrgico deve existir. Por favor, defina os anos em que o evento litúrgico não deve existir. Recursos Formato de Resposta Executar Testes Salvar Salvar Teste Unitário Defina a data base para este evento litúrgico. Testes bem-sucedidos: Tipo de Teste A entrada de data não pode estar vazia. Houve um erro ao abrir a conexão com o servidor via websocket. Talvez o servidor esteja offline? Essa festividade parece não existir? Por favor, escolha um valor da lista. Esse intervalo deve incluir alguns anos após o ano em que o evento litúrgico deve deixar de existir. Este intervalo deve incluir alguns anos antes do ano em que o evento litúrgico deve começar a existir. Tempo total para %s testes: Administração de Testes Unitários Executor de Testes Unitários VALIDAR DADOS DO CALENDÁRIO PARA OS ANOS DE 1970 ATÉ VALIDAR DADOS DE ORIGEM Existência da variável Websocket conectado com sucesso! Conexão do websocket fechada. Status da conexão do websocket Quando se espera que um evento litúrgico seja substituído em vários anos por qualquer motivo, afirmamos que ele deve existir em certos anos em uma data esperada (a data pode ser definida opcionalmente de forma diferente para cada ano dado), e que não deve existir em outros anos dados. Quando um evento litúrgico não deve mais existir após um determinado ano, afirmamos que, para um determinado intervalo de anos antes desse ano, o evento litúrgico deve ocorrer em uma data esperada (a data pode ser definida opcionalmente de forma diferente para cada ano dado), enquanto para um determinado intervalo de anos após esse ano, o evento litúrgico não deve existir. Quando um evento litúrgico deve existir apenas após um certo ano, afirmamos que por um certo período de anos antes desse ano o evento litúrgico não deve existir, enquanto por um certo período de anos após esse ano o evento litúrgico deve existir e deve cair em uma data esperada (a data pode ser definida opcionalmente de forma diferente para cada ano dado). Anos para testar Você pode então remover quaisquer anos que não serão necessários. 