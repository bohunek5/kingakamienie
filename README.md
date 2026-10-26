# Kinga Kamienie

Strona: https://bohunek5.github.io/kingakamienie/

Lokalny konfigurator kolczyka 3D na białym tle: 52 materiały, sześć szlifów, trzy osadzenia, trzy metale i cztery wykończenia kamienia. Oświetlenie studyjne HDR oraz śledzenie załamań i odbić światła wewnątrz przejrzystych kamieni.

Biblioteka obejmuje kamienie jubilerskie, kwarce, minerały ozdobne, materiały organiczne i 10 artystycznych wariantów kosmicznych. Malachit, turkus, lapis i pozostałe minerały mają proceduralne powierzchnie. Kolekcja kosmiczna to autorskie interpretacje — Mars, Księżyc, meteoryt, lawa, mgławica, zorza, czarna dziura, gwiezdny pył, lodowa planeta i plazma. Przełącznik „Żywy kamień” animuje ich materiały; w trybie ograniczenia ruchu animacja jest domyślnie wyłączona.

```sh
npm install
npm run dev
```

Otwórz http://127.0.0.1:5173. Przeciąganie myszą obraca model, kółko przybliża. Na iPhonie jeden palec przewija stronę, dwa obracają i przybliżają model. Klawiatura po wybraniu sceny: strzałki obracają, `+` / `-` zmieniają przybliżenie, `Home` przywraca kadr.

`npm run build` przygotowuje produkcyjną wersję w `dist/` z bazą `/kingakamienie/`. `npm run preview` udostępnia ją pod http://127.0.0.1:5174/kingakamienie/. Każdy push do `main` uruchamia testy, budowę i wdrożenie GitHub Pages. `npm test` sprawdza geometrię kamieni i styki opraw.

Ekran hasła jest prostą blokadą interfejsu po stronie przeglądarki. GitHub Pages i publiczne repozytorium udostępniają pliki publicznie; nie jest to uwierzytelnianie serwerowe. Hasło porównywane jest przez SHA-256, wejście zapamiętywane w bieżącej karcie, a przycisk kłódki ponownie blokuje atelier.

PNG zapisuje bieżący kadr na białym tle w szerokości 2400 px. GLB zawiera geometrię w metrach i standardowe materiały PBR; specjalizowany shader optyczny jest zastępowany materiałem transmisyjnym glTF. Proceduralne wzory, wnętrza i animacje są dostępne w lokalnej aplikacji; eksport GLB odwzorowuje ich podstawowy kolor i wykończenie. JSON pozwala zapisać i ponownie wczytać pełny projekt. Ostatni wybór odtwarza się po odświeżeniu strony.

Geometria jest parametrycznym modelem wizualizacyjnym. Wymiary opisują model; masa kamienia jest szacunkiem z objętości siatki i przyjętej gęstości, a nie pomiarem rzeczywistego wyrobu. Przygotowanie do odlewu wymaga osobnej walidacji jubilerskiej.

Podstawa techniczna: [Three.js](https://threejs.org/), [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), [glTF Exporter](https://threejs.org/docs/pages/GLTFExporter.html). Referencja gamy kamieni: [GIA Gem Encyclopedia](https://www.gia.edu/gem-encyclopedia). Parametry optyczne są reprezentatywnymi ustawieniami wizualizacji; naturalne próbki różnią się barwą, przejrzystością i strukturą. Konstrukcja sceny, geometrii i interfejsu znajduje się w `src/`. Modele, fonty i materiały działają lokalnie, bez zewnętrznych żądań podczas korzystania z aplikacji.
