# Dokumentacja
## Opis projektu

Projekt to automatyczna gra Dixit rozgrywana przez boty, wykorzystująca modele AI do klasyfikacji i opisywania obrazów. Każdy bot otrzymuje karty (obrazy), a rozgrywka przebiega zgodnie z zasadami gry Dixit, lecz wszystkie decyzje podejmowane są automatycznie na podstawie analizy obrazów i tekstu.

---

## Struktura projektu

- `classify.py` – klasyfikacja obrazów do klas (np. "book", "animal", "flora") przy użyciu wytrenowanego modelu Keras.
- `classify_knn.py` – klasyfikacja obrazów za pomocą k-najbliższych sąsiadów (kNN) na podstawie histogramów kolorów.
- `classify_tree.py` – klasyfikacja obrazów za pomocą drzewa decyzyjnego na podstawie histogramów kolorów.
- `compare.py` – skrypt porównujący wyniki klasyfikacji tych trzech metod na zbiorze testowym i generujący raport w formacie Markdown.
- `compare_report.md` – wygenerowany raport porównawczy klasyfikatorów (zawiera wyniki, podsumowanie i podgląd obrazów).
- `card_caption.py` – generowanie opisów obrazów oraz obliczanie embeddingów tekstowych i dopasowania do klucza.
- `generate.py` – generowanie obrazów na podstawie promptów tekstowych.
- `generate_prompts.py` – prompty użyte do wygenerowania obrazów.
- `keywords.py` – słownik powiązań: klasa obrazu → lista słów-kluczy.
- `sentence_key.py` – rozbudowany słownik powiązań do klasy.
- `game/reports/game_report_X.md` – raporty z przebiegu przykładowych gier.
- `test_results.md` – wyniki testów klasyfikacji na zbiorze testowym, zawiera obrazy, ich klasy i odgadnięte klasy.
- `main.py` – przebieg całej gry zgodnie z zasadami Dixit.


---
## Używane technologie/modele
- `Pollination` - Generowanie wszystkich zdjęć w zbiorze treningowym, testowym oraz do stosu gier.
- `Własny model do klasyfikacji` - Za pomocą sieci neuronowe, CNN. Trenowanie na własnym zbiorze treningowym.
-`kNN (scikit-learn)`**` – klasyfikacja obrazów na podstawie histogramów kolorów i k-najbliższych sąsiadów.
- `Drzewo decyzyjne (scikit-learn)` – klasyfikacja obrazów na podstawie histogramów kolorów i drzewa decyzyjnego.
- `BLIP` - Model został wykorzystany do generowania opisu zdjęcia. Model analizuje kartę i zwraca opis, można wpływać na długość i dokładnośc opisów za pomocą zmiennych.
- `GTE-large` - embedding, zmiana tekstu opisu oraz klucza na wektor liczb, porównanie ich podobieństwa za pomocą cosine similarity
- `NLTK` - przetwarzanie tekstu, tokenizacja, usuwanie znaków, lematyzaja, ogólnie "czyszczenie tekstu"
---

## Jak działa moja implementacja gry Dixit

1. **Rozdanie kart**  
   Każdy bot otrzymuje losowo wybrane obrazy jako swoje karty.

2. **Wybór storyteller'a**  
   Jeden z botów zostaje storytellerem w danej rundzie.

3. **Wybór karty i klucza**  
   Storyteller wybiera kartę ze swojej ręki, klasyfikuje ją za pomocą wytrenowanego modelu na własnym zbiorze treningowym, a następnie dla urozmaicenia rozgrywki losuje słowo-klucz powiązane z tą klasą z pliku, znajdujący się w pliku keywords.txt.

4. **Dobieranie kart przez pozostałych botów**  
   Pozostałe boty wybierają ze swojej ręki kartę, która ich zdaniem najlepiej pasuje do podanego klucza. Wykorzystują do tego generowanie opisu, embeddingi tekstowe oraz klasyfikację.

5. **Głosowanie**  
   Wszystkie wybrane karty są tasowane i wykładane na stół. Każdy bot (oprócz storyteller'a) głosuje, która karta według niego należała do storyteller'a, analizując opisy i klasyfikacje kart.



---
### 1. Wybór karty przez bota (dobieranie do klucza)

- Bot analizuje każdą kartę ze swojej ręki.
- Dla każdej karty:
    1. **Generuje opis obrazka** (caption) za pomocą modelu BLIP.
    2. **Klasyfikuje obrazek** i pobiera 3 najbardziej prawdopodobne klasy.
    3. **Sprawdza, czy klasa powiązana ze słowem storyteller'a** (czyli klucz z keywords) znajduje się w top1/top2/top3 klasyfikacji, odpowiednio dostosowyując ilość punktów.
    4. **Oblicza podobieństwo embeddingu opisu obrazka** do embeddingów wszystkich słów powiązanych z tą klasą (z sentence_key).
    5. **Suma punktów za klasyfikację i embedding** daje końcowy score (max 1.0).
- Bot wybiera kartę z najwyższym score jako swoją propozycję do klucza.

---
### 2. Głosowanie botów (wybór karty storyteller'a na stole)

- Bot analizuje wszystkie karty wyłożone na stół (oprócz swojej).
- Dla każdej karty na stole:
    1. **Generuje opis obrazka** (caption).
    2. **Klasyfikuje obrazek** i pobiera top3 klasy.
    3. **Sprawdza, czy klasa powiązana z kluczem storyteller'a** jest w top1/top2/top3 klasyfikacji (analogicznie jak wyżej).
    4. **Oblicza embedding opisu** i porównuje go do embeddingów słów z sentence_key dla tej klasy (analogiczni jak wyżej).
    5. **Suma punktów** za klasyfikację i embedding daje score dla tej karty.
- Bot głosuje na kartę z najwyższym score.

---



## Klasyfikacja obrazów

- Do klasyfikacji wykorzystywany jest model Keras zapisany w pliku `image_classification_model.h5`.
- Funkcja [`classify_image`](classify.py) zwraca najbardziej prawdopodobną klasę obrazu.
- Funkcja [`classify_image_top_k`](classify.py) zwraca listę kilku najbardziej prawdopodobnych klas wraz z prawdopodobieństwami.
- Klasy są powiązane ze słowami-kluczami w [`keywords.py`](keywords.py).

---
## Porównanie klasyfikatorów obrazów

W celach badawczych porównywałam różne podejścia do klasyfikacji obrazów:

- **Moja wytrenowana sieć CNN** (Convolutional Neural Network)
- **k-najbliższych sąsiadów (kNN)** na histogramach kolorów
- **Drzewo decyzyjne** na histogramach kolorów


Okazało się, że **moja wytrenowana sieć CNN osiągnęła najwyższą trafność** w przypisywaniu prawidłowych klas do obrazów.

**Przykład:**

- Trafność CNN: **70.52%** (122/173)
- Trafność kNN: **32.95%** (57/173)
- Trafność Drzewo: **30.06%** (52/173)

| Obrazek | Plik | Prawidłowa klasa | CNN (top1) | kNN (top1) | Drzewo (top1) | CNN top3 | kNN top3 | Drzewo top3 |
|---------|------|------------------|-------------|------------|---------------|----------|----------|-------------|
| ![](data/test/book/img_20250614_201205.png) | img_20250614_201205.png | `book` | <span style="color:green">book</span> | <span style="color:red">fire</span> | <span style="color:green">book</span> | book(1.00), flora(0.00), computer(0.00) | fire(0.33), book(0.33), animal(0.33) | book(0.74), computer(0.09), flora(0.06) |
| ![](data/test/computer/img_20250614_201729.png) | img_20250614_201729.png | `computer` | <span style="color:green">computer</span> | <span style="color:red">sky</span> | <span style="color:red">dark</span> | computer(1.00), flora(0.00), dark(0.00) | sky(0.33), flora(0.33), animal(0.33) | dark(0.90), winter(0.02), tree(0.02) |

### cały raport znajduje się w pliku `compare_report.md`

### Wniosek  
- Moja własna sieć CNN okazała się zdecydowanie najlepszym - klasyfikatorem dla tego zadania i danych, dlate jest ona używana w grze.
---

## Generowanie opisu zdjęcia
- Każdy bot losuje różne wartoścci do generowania opisu, aby się trochę od siebie różniły
- Przykład przy głosowaniu:

![img_20250615_024504.png](generated_images/img_20250615_024504.png)


**Szczegóły dopasowań dla tej karty:**
- **Bot_2**: prompt: `bonfire` | caption: "a fire burns in the fireplace of a house" | score: 0.910 (class: 0.600, emb: 0.310)
- **Bot_3**: prompt: `bonfire` | caption: "a fire burns in the fireplace of a house on a black background" | score: 0.904 (class: 0.600, emb: 0.304)
- **Bot_4**: prompt: `bonfire` | caption: "a fire is burning in the fireplace, with flames coming out of it" | score: 0.903 (class: 0.600, emb: 0.303)
### Jak widać, boty nie zawsze myślą dokładnie tak samo, i promty mogą się trochę od siebie różnić.



## Testowanie i ewaluacja

- Wyniki klasyfikacji na zbiorze testowym znajdują się w [`test_results.md`](test_results.md).
- Raporty z przykładowych gier: [`game_report_1.md`](game_report_1.md), [`game_report_2.md`](game_report_2.md), itd.

---
## Przykłady poprawnie działającej klasyfikacji
| Podgląd | Ścieżka obrazu | Oryginalna klasa | Zgadnięta klasa |
|---|---|---|---|
| ![](data/test/book/img_20250614_201205.png) | data/test/book/img_20250614_201205.png | book | book |
| ![](data/test/tree/img_20250614_205510.png) | data/test/tree/img_20250614_205510.png | tree | tree |
| ![](data/test/fire/img_20250614_202755.png) | data/test/fire/img_20250614_202755.png | fire | fire |


## Przypadki błędnej klasyfikacji
| Podgląd | Ścieżka obrazu | Oryginalna klasa | Zgadnięta klasa |
|---|---|---|---|
| ![](data/test/animal/img_20250614_200720.png) | data/test/animal/img_20250614_200720.png | animal | computer |
| ![](data/test/book/img_20250614_201030.png) | data/test/book/img_20250614_201030.png | book | computer |
| ![](data/test/computer/img_20250614_201644.png) | data/test/computer/img_20250614_201644.png | computer | animal |

- Niestety, model nie jest idealny, gdyż jego accuracy wynosi około 70%


## Ciekawe przypadki klasyfikacji

| Podgląd | Ścieżka obrazu | Oryginalna klasa | Zgadnięta klasa |
|---|---|---|---|
| ![](data/test/animal/img_20250614_200537.png) | data/test/animal/img_20250614_200537.png | animal | book |
| ![](data/test/animal/img_20250614_200658.png) | data/test/animal/img_20250614_200658.png | animal | sunny |
| ![](data/test/animal/img_20250614_200607.png) | data/test/animal/img_20250614_200607.png | animal | sky |

- Pomimo, iż model, źle rozpoznał przypisaną klasę, rozpoznał inną, która jak widać na obrazie, również pasuje tematycznie.


## Przebieg gry oraz analiza działania programu 




---

## Runda 1

## Storyteller: **Bot_1**
### Storyteller losuje kartę ze swojej ręi, po czym dokonuje na niej klasyfikacji, dając słodo klucz dla innych graczy.

### Karty storyteller'a:
![img_20250615_024504.png](generated_images/img_20250615_024504.png)

![img_20250615_021409.png](generated_images/img_20250615_021409.png)

![img_20250610_123225.png](generated_images/img_20250610_123225.png)

![img_20250615_025723.png](generated_images/img_20250615_025723.png)

### Wybrana karta storyteller'a:
**Wybrana karta storyteller'a**  
![img_20250615_024504.png](generated_images/img_20250615_024504.png)

**Klasa karty:** `fire`  
**Hasło (klucz):** `bonfire`

---

## Bot_1


### Karty na ręce:
![img_20250615_024504.png](generated_images/img_20250615_024504.png)

![img_20250615_021409.png](generated_images/img_20250615_021409.png)

![img_20250610_123225.png](generated_images/img_20250610_123225.png)

![img_20250615_025723.png](generated_images/img_20250615_025723.png)

**Storyteller wybrał:** img_20250615_024504.png

---

## Bot_2
### Gracz analizuje swoje wszystkie karty, dokonując na nich kalsyfikacji oraz embeddingu wygenerowanego promptu do klucza, starająć się dobrać kartkę, która najbardziej odwzorowywuje tematykę zadaną przez storytellera.
### Karty na ręce:
![img_20250615_015856.png](generated_images/img_20250615_015856.png)

![img_20250615_023436.png](generated_images/img_20250615_023436.png)

![img_20250615_024104.png](generated_images/img_20250615_024104.png)

![img_20250615_023027.png](generated_images/img_20250615_023027.png)

### Analiza dopasowania kart do klucza: `bonfire`

![img_20250615_015856.png](generated_images/img_20250615_015856.png)

*Opis:* two penguins floating in the water with mountains in the background  
*Klasa obrazu:* `animal`  
*Punkty za klasę:* `0.000`  
*Punkty za embedding:* `0.262`  
*Dopasowanie do klucza (suma):* **26.17%**

![img_20250615_023436.png](generated_images/img_20250615_023436.png)

*Opis:* a man standing in front of a full moon  
*Klasa obrazu:* `dark`  
*Punkty za klasę:* `0.000`  
*Punkty za embedding:* `0.311`  
*Dopasowanie do klucza (suma):* **31.10%**

![img_20250615_024104.png](generated_images/img_20250615_024104.png)

*Opis:* an image of a castle with fire coming out of it  
*Klasa obrazu:* `fire`  
*Punkty za klasę:* `0.600`  
*Punkty za embedding:* `0.341`  
*Dopasowanie do klucza (suma):* **94.09%**

![img_20250615_023027.png](generated_images/img_20250615_023027.png)

*Opis:* a clock tower with a blue sky in the background  
*Klasa obrazu:* `watch`  
*Punkty za klasę:* `0.000`  
*Punkty za embedding:* `0.317`  
*Dopasowanie do klucza (suma):* **31.66%**

**Bot_2 wybrał:**
**Najlepsza karta (Bot_2)**  
![img_20250615_024104.png](generated_images/img_20250615_024104.png)

*Opis:* an image of a castle with fire coming out of it  
*Najlepsze dopasowanie:* **94.09%**

---

## Bot_3

### Karty na ręce:
![img_20250610_123312.png](generated_images/img_20250610_123312.png)

![img_20250615_025014.png](generated_images/img_20250615_025014.png)

![img_20250615_020155.png](generated_images/img_20250615_020155.png)

![img_20250615_015957.png](generated_images/img_20250615_015957.png)

### Analiza dopasowania kart do klucza: `bonfire`

![img_20250610_123312.png](generated_images/img_20250610_123312.png)

*Opis:* a forest with green trees and moss on the ground  
*Klasa obrazu:* `dark`  
*Punkty za klasę:* `0.000`  
*Punkty za embedding:* `0.289`  
*Dopasowanie do klucza (suma):* **28.88%**

![img_20250615_025014.png](generated_images/img_20250615_025014.png)

*Opis:* a field of colorful flowers in the spring stock photo  
*Klasa obrazu:* `flora`  
*Punkty za klasę:* `0.000`  
*Punkty za embedding:* `0.283`  
*Dopasowanie do klucza (suma):* **28.26%**

![img_20250615_020155.png](generated_images/img_20250615_020155.png)

*Opis:* a mouse reading a map in the forest with mushrooms and mushrooms  
*Klasa obrazu:* `animal`  
*Punkty za klasę:* `0.000`  
*Punkty za embedding:* `0.306`  
*Dopasowanie do klucza (suma):* **30.64%**

![img_20250615_015957.png](generated_images/img_20250615_015957.png)

*Opis:* a bear is floating in the water surrounded by lanterns  
*Klasa obrazu:* `animal`  
*Punkty za klasę:* `0.100`  
*Punkty za embedding:* `0.318`  
*Dopasowanie do klucza (suma):* **41.76%**
- Obraz dostał dopasowanie do klucza bonfire, ponieważ po analizie klasyfikacji, była to 3 najbardziej prawdopodobna klasa
**Bot_3 wybrał:**
**Najlepsza karta (Bot_3)**  
![img_20250615_015957.png](generated_images/img_20250615_015957.png)

*Opis:* a bear is floating in the water surrounded by lanterns  
*Najlepsze dopasowanie:* **41.76%**

---

## Bot_4

### Karty na ręce:
![img_20250615_024224.png](generated_images/img_20250615_024224.png)

![img_20250615_022806.png](generated_images/img_20250615_022806.png)

![img_20250615_025847.png](generated_images/img_20250615_025847.png)

![img_20250615_025523.png](generated_images/img_20250615_025523.png)

### Analiza dopasowania kart do klucza: `bonfire`

![img_20250615_024224.png](generated_images/img_20250615_024224.png)

*Opis:* a spiral staircase in the middle of a room with a fire place  
*Klasa obrazu:* `fire`  
*Punkty za klasę:* `0.600`  
*Punkty za embedding:* `0.329`  
*Dopasowanie do klucza (suma):* **92.90%**

![img_20250615_022806.png](generated_images/img_20250615_022806.png)

*Opis:* a forest with lots of pine trees and green grass in the fore  
*Klasa obrazu:* `dark`  
*Punkty za klasę:* `0.000`  
*Punkty za embedding:* `0.322`  
*Dopasowanie do klucza (suma):* **32.19%**

![img_20250615_025847.png](generated_images/img_20250615_025847.png)

*Opis:* a woman is sitting in the grass with tea cups flying around her  
*Klasa obrazu:* `food`  
*Punkty za klasę:* `0.000`  
*Punkty za embedding:* `0.299`  
*Dopasowanie do klucza (suma):* **29.89%**

![img_20250615_025523.png](generated_images/img_20250615_025523.png)

*Opis:* an open book with a small plant growing out of it  
*Klasa obrazu:* `flora`  
*Punkty za klasę:* `0.000`  
*Punkty za embedding:* `0.317`  
*Dopasowanie do klucza (suma):* **31.74%**

**Bot_4 wybrał:**
**Najlepsza karta (Bot_4)**  
![img_20250615_024224.png](generated_images/img_20250615_024224.png)

*Opis:* a spiral staircase in the middle of a room with a fire place  
*Najlepsze dopasowanie:* **92.90%**

---

## Karty na stole do zgadywania:

**Bot_1**  
![img_20250615_024504.png](generated_images/img_20250615_024504.png)

**Bot_2**  
![img_20250615_024104.png](generated_images/img_20250615_024104.png)

**Bot_3**  
![img_20250615_015957.png](generated_images/img_20250615_015957.png)

**Bot_4**  
![img_20250615_024224.png](generated_images/img_20250615_024224.png)


---

## Etap zgadywania

### Bot_2 analizuje karty na stole (nie może głosować na swoją):

**Karta Bot_1**  
![img_20250615_024504.png](generated_images/img_20250615_024504.png)

*Opis:* a fire burns in the fireplace of a house  
*Klasa obrazu:* `fire`  
*Punkty za klasę:* `0.600`  
*Punkty za embedding:* `0.310`  
*Dopasowanie do klucza (suma):* **90.99%**

**Karta Bot_3**  
![img_20250615_015957.png](generated_images/img_20250615_015957.png)

*Opis:* a bear is floating in the water surrounded by lanterns  
*Klasa obrazu:* `animal`  
*Punkty za klasę:* `0.100`  
*Punkty za embedding:* `0.318`  
*Dopasowanie do klucza (suma):* **41.76%**

**Karta Bot_4**  
![img_20250615_024224.png](generated_images/img_20250615_024224.png)

*Opis:* a spiral staircase with fire in the middle of it  
*Klasa obrazu:* `fire`  
*Punkty za klasę:* `0.600`  
*Punkty za embedding:* `0.335`  
*Dopasowanie do klucza (suma):* **93.52%**

**Bot_2 zagłosował na kartę img_20250615_024224.png** (dopisanie: 93.52%)

### Bot_3 analizuje karty na stole (nie może głosować na swoją):

**Karta Bot_1**  
![img_20250615_024504.png](generated_images/img_20250615_024504.png)

*Opis:* a fire burns in the fireplace of a house on a black background  
*Klasa obrazu:* `fire`  
*Punkty za klasę:* `0.600`  
*Punkty za embedding:* `0.304`  
*Dopasowanie do klucza (suma):* **90.45%**

**Karta Bot_2**  
![img_20250615_024104.png](generated_images/img_20250615_024104.png)

*Opis:* an image of a castle with fire coming out of it  
*Klasa obrazu:* `fire`  
*Punkty za klasę:* `0.600`  
*Punkty za embedding:* `0.341`  
*Dopasowanie do klucza (suma):* **94.09%**

**Karta Bot_4**  
![img_20250615_024224.png](generated_images/img_20250615_024224.png)

*Opis:* a spiral staircase with fire in the middle of it  
*Klasa obrazu:* `fire`  
*Punkty za klasę:* `0.600`  
*Punkty za embedding:* `0.335`  
*Dopasowanie do klucza (suma):* **93.52%**

**Bot_3 zagłosował na kartę img_20250615_024104.png** (dopisanie: 94.09%)

### Bot_4 analizuje karty na stole (nie może głosować na swoją):

**Karta Bot_1**  
![img_20250615_024504.png](generated_images/img_20250615_024504.png)

*Opis:* a fire is burning in the fireplace, with flames coming out of it  
*Klasa obrazu:* `fire`  
*Punkty za klasę:* `0.600`  
*Punkty za embedding:* `0.303`  
*Dopasowanie do klucza (suma):* **90.31%**

**Karta Bot_2**  
![img_20250615_024104.png](generated_images/img_20250615_024104.png)

*Opis:* an image of a castle with fire coming out of it  
*Klasa obrazu:* `fire`  
*Punkty za klasę:* `0.600`  
*Punkty za embedding:* `0.341`  
*Dopasowanie do klucza (suma):* **94.09%**

**Karta Bot_3**  
![img_20250615_015957.png](generated_images/img_20250615_015957.png)

*Opis:* a bear is floating in the water surrounded by many lanterns  
*Klasa obrazu:* `animal`  
*Punkty za klasę:* `0.100`  
*Punkty za embedding:* `0.316`  
*Dopasowanie do klucza (suma):* **41.61%**

**Bot_4 zagłosował na kartę img_20250615_024104.png** (dopisanie: 94.09%)

---

## Statystyki głosowania

![img_20250615_024504.png](generated_images/img_20250615_024504.png)

Głosy: **0**  

**Szczegóły dopasowań dla tej karty:**
- **Bot_2**: prompt: `bonfire` | caption: "a fire burns in the fireplace of a house" | score: 0.910 (class: 0.600, emb: 0.310)
- **Bot_3**: prompt: `bonfire` | caption: "a fire burns in the fireplace of a house on a black background" | score: 0.904 (class: 0.600, emb: 0.304)
- **Bot_4**: prompt: `bonfire` | caption: "a fire is burning in the fireplace, with flames coming out of it" | score: 0.903 (class: 0.600, emb: 0.303)
- Jak widać, boty nie zawsze myślą dokładnie tak samo, i promty mogą się trochę od siebei różnić.

![img_20250615_024104.png](generated_images/img_20250615_024104.png)

Głosy: **2**  
Głosowali: Bot_3, Bot_4

**Szczegóły dopasowań dla tej karty:**
- **Bot_3**: prompt: `bonfire` | caption: "an image of a castle with fire coming out of it" | score: 0.941 (class: 0.600, emb: 0.341)
- **Bot_4**: prompt: `bonfire` | caption: "an image of a castle with fire coming out of it" | score: 0.941 (class: 0.600, emb: 0.341)

![img_20250615_015957.png](generated_images/img_20250615_015957.png)

Głosy: **0**  

**Szczegóły dopasowań dla tej karty:**
- **Bot_2**: prompt: `bonfire` | caption: "a bear is floating in the water surrounded by lanterns" | score: 0.418 (class: 0.100, emb: 0.318)
- **Bot_4**: prompt: `bonfire` | caption: "a bear is floating in the water surrounded by many lanterns" | score: 0.416 (class: 0.100, emb: 0.316)

![img_20250615_024224.png](generated_images/img_20250615_024224.png)

Głosy: **1**  
Głosowali: Bot_2

**Szczegóły dopasowań dla tej karty:**
- **Bot_2**: prompt: `bonfire` | caption: "a spiral staircase with fire in the middle of it" | score: 0.935 (class: 0.600, emb: 0.335)
- **Bot_3**: prompt: `bonfire` | caption: "a spiral staircase with fire in the middle of it" | score: 0.935 (class: 0.600, emb: 0.335)

---

## Punkty po tej rundzie

- **Bot_1**: 0 pkt
- **Bot_2**: 4 pkt
- **Bot_3**: 0 pkt
- **Bot_4**: 2 pkt



## Wymagania środowiskowe i biblioteki

Aby uruchomić projekt, wymagane są:

### Wersja Pythona
- Python 3.8 lub nowszy

### Biblioteki Python (możesz zainstalować przez pip)
```sh
pip install tensorflow
pip install torch
pip install transformers
pip install pillow
pip install numpy
pip install nltk
pip install scikit-learn
pip install joblib
```

### Dodatkowe wymagania
- Plik modelu: `image_classification_model.h5` (wytrenuj lub pobierz)
- Foldery z danymi: `data/train`, `data/test`, `cards`, `generated_images`
- (Opcjonalnie) GPU i sterowniki CUDA dla przyspieszenia modeli BLIP/GTE

### Używane biblioteki w projekcie:
- `tensorflow` – trenowanie i użycie modelu klasyfikacji obrazów
- `torch` – modele embeddingów tekstowych (GTE, BLIP)
- `transformers` – ładowanie modeli BLIP, GTE
- `Pillow (PIL)` – obsługa obrazów
- `numpy` – operacje na macierzach
- `nltk` – przetwarzanie tekstu (tokenizacja, lematyzacja)
- `scikit-learn` – ewaluacja, metryki
- `os`, `random`, `sys` – standardowe biblioteki do obsługi plików i systemu

### Przygotowanie środowiska
1. Zainstaluj wymagane biblioteki (patrz wyżej).
2. Przygotuj dane i modele zgodnie z instrukcją w dokumentacji.
3. Uruchom skrypt gry (`main.py` lub `dixit_game.py`).

---

## Autor
Aleksandra Stadnicka
