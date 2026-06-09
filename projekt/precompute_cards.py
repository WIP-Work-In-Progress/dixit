import os
import json
import numpy as np
import tensorflow as tf
import torch
import torch.nn.functional as F
from transformers import BlipProcessor, BlipForConditionalGeneration, AutoTokenizer, AutoModel
from PIL import Image

# Import existing modules
import keywords
import sentence_key

CARDS_FOLDER = "generated_images"
OUTPUT_METADATA_FILE = "cards_metadata.json"
OUTPUT_VOCAB_FILE = "vocab_embeddings.json"

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[PRECOMPUTE] Używane urządzenie: {device}")

# 1. Załadowanie modelu Keras (optymalizacja: tylko raz)
print("[PRECOMPUTE] Ładowanie modelu Keras...")
keras_model = tf.keras.models.load_model('image_classification_model.h5')
train_dir = os.path.join('.', 'data', 'train')
class_labels = sorted([d for d in os.listdir(train_dir) if os.path.isdir(os.path.join(train_dir, d))])
print(f"[PRECOMPUTE] Wczytano {len(class_labels)} klas: {class_labels}")

# 2. Załadowanie modeli Hugging Face (BLIP do opisów i MiniLM do embeddingów)
print("[PRECOMPUTE] Ładowanie modelu BLIP...")
blip_processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
blip_model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base").to(device)

print("[PRECOMPUTE] Ładowanie modelu all-MiniLM-L6-v2 do embeddingów...")
emb_tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
emb_model = AutoModel.from_pretrained("sentence-transformers/all-MiniLM-L6-v2").to(device)

def get_image_top_k(img_path, k=3):
    img = tf.keras.preprocessing.image.load_img(img_path, target_size=(150, 150))
    x = tf.keras.preprocessing.image.img_to_array(img)
    x = x / 255.0
    x = np.expand_dims(x, axis=0)
    preds = keras_model.predict(x, verbose=0)[0]
    top_indices = np.argsort(preds)[::-1][:k]
    return [(class_labels[i], float(preds[i])) for i in top_indices]

def generate_caption(img_path):
    image = Image.open(img_path).convert("RGB")
    inputs = blip_processor(images=image, return_tensors="pt").to(device)
    out = blip_model.generate(
        **inputs,
        min_length=10,
        max_length=22,
        num_beams=1, # greedy search - much faster on CPU
        repetition_penalty=2.0
    )
    caption = blip_processor.decode(out[0], skip_special_tokens=True)
    return caption

def get_text_embedding(text):
    tokens = emb_tokenizer(text, return_tensors="pt", truncation=True, padding=True).to(device)
    with torch.no_grad():
        output = emb_model(**tokens)
        # Mean Pooling
        attention_mask = tokens['attention_mask']
        token_embeddings = output[0]
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        embedding = sum_embeddings / sum_mask
        embedding = F.normalize(embedding, p=2, dim=1)
    return embedding.squeeze().cpu().numpy().tolist()

def main():
    # Pobranie listy obrazów
    all_images = [f for f in os.listdir(CARDS_FOLDER) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))]
    all_images = all_images[:84] # Limit do 84 kart (standardowa talia Dixit)
    print(f"[PRECOMPUTE] Wybrano {len(all_images)} obrazów w folderze {CARDS_FOLDER} do przetworzenia.", flush=True)

    metadata = {}
    
    # Przetwarzanie obrazów
    for idx, fname in enumerate(all_images):
        img_path = os.path.join(CARDS_FOLDER, fname)
        print(f"[{idx+1}/{len(all_images)}] Przetwarzanie {fname}...", flush=True)
        try:
            # 1. Klasyfikacja top-3
            top_classes = get_image_top_k(img_path, k=3)
            # 2. Wygenerowanie opisu
            caption = generate_caption(img_path)
            # 3. Embedding opisu
            caption_emb = get_text_embedding(caption)
            
            metadata[fname] = {
                "filename": fname,
                "caption": caption,
                "top_classes": top_classes, # lista [klasa, score]
                "embedding": caption_emb
            }
        except Exception as e:
            print(f"  [BŁĄD] Nie udało się przetworzyć {fname}: {e}", flush=True)

    # Zapisanie metadanych kart
    with open(OUTPUT_METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    print(f"[PRECOMPUTE] Metadane kart zapisane do {OUTPUT_METADATA_FILE}", flush=True)

    # Przetwarzanie słownika
    print("[PRECOMPUTE] Zbieranie unikalnych słów ze słowników...", flush=True)
    vocab = set()
    for class_name, words in keywords.KEYWORDS.items():
        for w in words:
            vocab.add(w.lower().strip())
            
    for class_name, subdict in sentence_key.SENTENCE_KEY.items():
        for subkey, words in subdict.items():
            vocab.add(subkey.lower().strip())
            for w in words:
                vocab.add(w.lower().strip())
                
    vocab_list = sorted(list(vocab))
    print(f"[PRECOMPUTE] Znaleziono {len(vocab_list)} unikalnych słów. Generowanie embeddingów...", flush=True)
    
    vocab_embeddings = {}
    for idx, word in enumerate(vocab_list):
        if idx % 200 == 0:
            print(f"  [{idx}/{len(vocab_list)}] Generowanie embeddingów...", flush=True)
        try:
            vocab_embeddings[word] = get_text_embedding(word)
        except Exception as e:
            print(f"  [BŁĄD] Nie udało się wygenerować embeddingu dla '{word}': {e}", flush=True)
            
    # Zapisanie bazy słów
    with open(OUTPUT_VOCAB_FILE, "w", encoding="utf-8") as f:
        json.dump(vocab_embeddings, f, ensure_ascii=False)
    print(f"[PRECOMPUTE] Baza embeddingów słownictwa zapisana do {OUTPUT_VOCAB_FILE}")
    print("[PRECOMPUTE] Ukończono pomyślnie!")

if __name__ == "__main__":
    main()
