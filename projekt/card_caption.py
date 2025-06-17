from transformers import BlipProcessor, BlipForConditionalGeneration, AutoTokenizer, AutoModel
from PIL import Image
import torch
import torch.nn.functional as F
from nltk.translate.bleu_score import sentence_bleu
from classify import classify_image, classify_image_top_k
from keywords import KEYWORDS
from sentence_key import SENTENCE_KEY
import os

device = "cuda" if torch.cuda.is_available() else "cpu"
processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
blip_model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base").to(device)
text_model_name = "thenlper/gte-large"
tokenizer = AutoTokenizer.from_pretrained(text_model_name)
text_model = AutoModel.from_pretrained(text_model_name).to(device)

def generate_caption(image_path, temperature=0.5, min_length=10, max_length=20, num_beams=5):
    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt").to(device)
    out = blip_model.generate(
        **inputs,
        min_length=min_length,
        max_length=max_length,
        num_beams=num_beams,
        temperature=temperature,
        repetition_penalty=2.0
    )
    caption = processor.decode(out[0], skip_special_tokens=True)
    return caption

def get_embedding(text):
    tokens = tokenizer(text, return_tensors="pt", truncation=True, padding=True).to(device)
    with torch.no_grad():
        output = text_model(**tokens)
        embeddings = output.last_hidden_state[:, 0, :] 
        embeddings = F.normalize(embeddings, p=2, dim=1)
    return embeddings.squeeze()

def get_related_words(prompt):
    prompt_lower = prompt.lower().strip()
    for main_key, subdict in SENTENCE_KEY.items():
        for subkey, words in subdict.items():
            if prompt_lower == subkey or prompt_lower in [w.lower() for w in words]:
                return set(w.lower() for w in words)
    return set([prompt_lower])

def classifier_score_top_k(image_path, prompt, k=3):
    top_classes = classify_image_top_k(image_path, k=k)
    prompt_lower = prompt.lower().strip()
    bonus = 0.0
    for class_name, prob in top_classes:
        subdict = SENTENCE_KEY.get(class_name, {})
        for subkey, words in subdict.items():
            if prompt_lower == subkey or prompt_lower in [w.lower() for w in words]:
                bonus += 1.0
                break  
    return min(bonus / k, 1.0)

def custom_score(prompt, caption, prompt_emb, caption_emb):
    cos_sim = F.cosine_similarity(prompt_emb, caption_emb, dim=0).item()
    prompt_words = set(prompt.lower().split())
    caption_words = set(caption.lower().split())
    word_overlap = len(prompt_words & caption_words) / max(1, len(prompt_words))
    bleu = sentence_bleu([prompt.split()], caption.split())
    related_words = get_related_words(prompt)
    related_bonus = 1.0 if any(word in caption.lower() for word in related_words) else 0.0
    return 0.5 * cos_sim + 0.1 * word_overlap + 0.1 * bleu + 0.3

def custom_scoring(image_path, prompt, caption, k=3):
    top_classes = classify_image_top_k(image_path, k=k)
    prompt_lower = prompt.lower().strip()
    class_score = 0.0
    for idx, (class_name, prob) in enumerate(top_classes):
        subdict = SENTENCE_KEY.get(class_name, {})
        for subkey, words in subdict.items():
            words_lower = set(w.lower() for w in words)
            if prompt_lower == subkey or prompt_lower in words_lower:
                if idx == 0:
                    class_score = 0.6
                else:
                    class_score = max(class_score, 0.3)
    caption_emb = get_embedding(caption)
    prompt_emb = get_embedding(prompt)
    emb_scores = []
    if top_classes:
        top1_class = top_classes[0][0]
        subdict = SENTENCE_KEY.get(top1_class, {})
        all_keywords = set()
        for words in subdict.values():
            all_keywords.update(w.lower() for w in words)
        for word in all_keywords:
            word_emb = get_embedding(word)
            cos_sim = F.cosine_similarity(caption_emb, word_emb, dim=0).item()
            emb_scores.append(cos_sim)
    emb_score = max(emb_scores) if emb_scores else F.cosine_similarity(caption_emb, prompt_emb, dim=0).item()
    emb_score = max(0.0, min(emb_score, 1.0)) * 0.4
    total_score = min(class_score + emb_score, 1.0)
    return total_score

def get_keyword_class(prompt):
    prompt_lower = prompt.lower().strip()
    for class_name, words in KEYWORDS.items():
        if prompt_lower in [w.lower() for w in words]:
            return class_name
    return None

def dixit_custom_scoring(image_path, storyteller_keyword, caption, k=3):
    keyword_class = get_keyword_class(storyteller_keyword)
    top_classes = classify_image_top_k(image_path, k=k)
    class_names = [class_name for class_name, _ in top_classes]
    class_score = 0.0
    if keyword_class in class_names:
        idx = class_names.index(keyword_class)
        if idx == 0:
            class_score = 0.6
        elif idx == 1:
            class_score = 0.2
        elif idx == 2:
            class_score = 0.1
    caption_emb = get_embedding(caption)
    emb_scores = []
    if keyword_class and keyword_class in SENTENCE_KEY:
        subdict = SENTENCE_KEY[keyword_class]
        all_keywords = set()
        for words in subdict.values():
            all_keywords.update(w.lower() for w in words)
        for word in all_keywords:
            word_emb = get_embedding(word)
            cos_sim = F.cosine_similarity(caption_emb, word_emb, dim=0).item()
            emb_scores.append(cos_sim)
    emb_score = max(emb_scores) if emb_scores else 0.0
    emb_score = max(0.0, min(emb_score, 1.0)) * 0.4
    total_score = min(class_score + emb_score, 1.0)
    return total_score

def fair_scoring(image_path, storyteller_class, prompt, caption, k=3):
    top_classes = classify_image_top_k(image_path, k=k)
    class_names = [class_name for class_name, _ in top_classes]
    class_score = 0.0
    if storyteller_class in class_names:
        idx = class_names.index(storyteller_class)
        if idx == 0:
            class_score = 0.6
        elif idx == 1:
            class_score = 0.2
        elif idx == 2:
            class_score = 0.1

    prompt_emb = get_embedding(prompt)
    caption_emb = get_embedding(caption)
    emb_score = F.cosine_similarity(prompt_emb, caption_emb, dim=0).item()
    emb_score = max(0.0, min(emb_score, 1.0)) * 0.4

    total_score = min(class_score + emb_score, 1.0)
    return total_score, {"class_score": class_score, "emb_score": emb_score}

# if __name__ == "__main__":
#     import os
#     from classify import classify_image_top_k
#
#     test_folder = "test"
#     storyteller_class = "flora"
#     prompt = "nature"
#     print(f"\n=== TEST: fair_scoring dla klasy '{storyteller_class}' i klucza '{prompt}' ===\n")
#     results = []
#     for fname in os.listdir(test_folder):
#         if not fname.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')):
#             continue
#         img_path = os.path.join(test_folder, fname)
#         try:
#             caption = generate_caption(img_path)
#             # Klasyfikacja zdjęcia
#             top_classes = classify_image_top_k(img_path, k=3)
#             class_names = [class_name for class_name, _ in top_classes]
#             score, debug = fair_scoring(img_path, storyteller_class, prompt, caption)
#             print(f"{fname:30} | score={score:.4f} | \"{caption}\"")
#             print(f"  -> Punkty za klasę: {debug['class_score']:.3f}")
#             print(f"  -> Punkty za embedding: {debug['emb_score']:.3f}")
#             print(f"  -> Klasyfikacja zdjęcia: {class_names}")
#             print(f"  -> Oczekiwana klasa storytellera: {storyteller_class}")
#             results.append((fname, caption, score))
#         except Exception as e:
#             print(f"{fname:30} | Błąd: {e}")
#     print("\n=== Ranking ===")
#     for name, caption, score in sorted(results, key=lambda x: x[2], reverse=True):
#         print(f"{name:30} | score={score:.4f} | \"{caption}\"")