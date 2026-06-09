import json
import os

print("[CONVERT] Konwersja JSON do JS w toku...")
try:
    if os.path.exists("cards_metadata.json"):
        with open("cards_metadata.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        with open("cards_metadata.js", "w", encoding="utf-8") as f:
            f.write("window.cardsMetadata = ")
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write(";\n")
        print("[CONVERT] Utworzono cards_metadata.js")
    else:
        print("[CONVERT] Błąd: cards_metadata.json nie istnieje!")

    if os.path.exists("vocab_embeddings.json"):
        with open("vocab_embeddings.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        with open("vocab_embeddings.js", "w", encoding="utf-8") as f:
            f.write("window.vocabEmbeddings = ")
            json.dump(data, f, ensure_ascii=False)
            f.write(";\n")
        print("[CONVERT] Utworzono vocab_embeddings.js")
    else:
        print("[CONVERT] Błąd: vocab_embeddings.json nie istnieje!")
        
    print("[CONVERT] Konwersja zakończona sukcesem!")
except Exception as e:
    print(f"[CONVERT] Błąd podczas konwersji: {e}")
