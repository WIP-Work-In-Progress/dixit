import os
import random
from classify import classify_image, classify_image_top_k
import keywords
from card_caption import get_embedding, generate_caption, fair_scoring
from PIL import Image

NUM_BOTS = 4
CARDS_PER_BOT = 4
CARDS_FOLDER = "generated_images"
NUM_ROUNDS = 1

bots = [f"Bot_{i+1}" for i in range(NUM_BOTS)]

def save_image_markdown(img_path, title=None):
    md = ""
    if title:
        md += f"**{title}**  \n"
    rel_path = img_path.replace("\\", "/")
    md += f"![{os.path.basename(img_path)}]({rel_path})\n\n"
    return md

def main():
    all_cards = [os.path.join(CARDS_FOLDER, f) for f in os.listdir(CARDS_FOLDER) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))]
    random.shuffle(all_cards)
    print(f"[INFO] Wczytano {len(all_cards)} kart z folderu {CARDS_FOLDER}")

    REPORTS_DIR = "game_reports"
    os.makedirs(REPORTS_DIR, exist_ok=True)
    n = 1
    while os.path.exists(os.path.join(REPORTS_DIR, f"game_report_{n}.md")):
        n += 1
    report_filename = os.path.join(REPORTS_DIR, f"game_report_{n}.md")

    hands = {bot: [] for bot in bots}
    card_idx = 0
    for bot in bots:
        hands[bot] = all_cards[card_idx:card_idx+CARDS_PER_BOT]
        card_idx += CARDS_PER_BOT

    player_points = {bot: 0 for bot in bots}

    bot_generation_params = {}
    for bot in bots:
        bot_generation_params[bot] = {
            "temperature": random.uniform(0.4, 1.0),
            "min_length": random.randint(8, 15),
            "max_length": random.randint(16, 25),
            "num_beams": random.choice([3, 4, 5, 6])
        }

    with open(report_filename, "w", encoding="utf-8") as md:
        md.write(f"# Przebieg gry Dixit ({NUM_ROUNDS} rund)\n\n")

        for round_num in range(1, NUM_ROUNDS+1):
            md.write(f"\n---\n\n## Runda {round_num}\n\n")
            print(f"\n========== Runda {round_num} ==========")

            storyteller = bots[(round_num-1) % NUM_BOTS]
            print(f"[INFO] Storyteller: {storyteller}")

            story_card = random.choice(hands[storyteller])
            print(f"[INFO] Storyteller wybrał kartę: {story_card}")

            story_card_class = classify_image(story_card)
            print(f"[INFO] Klasa storytellerowej karty: {story_card_class}")

            possible_keywords = keywords.KEYWORDS.get(story_card_class, ["brak słów"])
            chosen_keyword = random.choice(possible_keywords)
            print(f"[INFO] Wylosowane słowo-klucz: {chosen_keyword}")

            collected_cards = [(storyteller, story_card)]
            bot_debug = {}

            for bot in bots:
                if bot == storyteller:
                    continue
                bot_prompt = chosen_keyword 
                print(f"[BOT] {bot} analizuje swoje karty pod kątem klasy: {story_card_class} i klucza: {bot_prompt}")
                best_score = -float('inf')
                best_card = None
                best_caption = ""
                best_debug = None
                debug_data = []
                for card in hands[bot]:
                    try:
                        params = bot_generation_params[bot]
                        caption = generate_caption(card, **params)
                        score, debug = fair_scoring(card, story_card_class, bot_prompt, caption, k=3)
                        card_class = classify_image(card)
                        debug_data.append({
                            "card": card,
                            "caption": caption,
                            "similarity": score,
                            "class_score": debug["class_score"],
                            "emb_score": debug["emb_score"],
                            "card_class": card_class
                        })
                        print(f"    [CHECK] {card} -> '{caption}' | score: {score:.3f} (class_score: {debug['class_score']:.3f}, emb_score: {debug['emb_score']:.3f}, class_label: {card_class})")
                        if score > best_score:
                            best_score = score
                            best_card = card
                            best_caption = caption
                            best_debug = debug
                    except Exception as e:
                        debug_data.append({
                            "card": card,
                            "caption": f"Błąd: {e}",
                            "similarity": 0,
                            "class_score": 0,
                            "emb_score": 0,
                            "card_class": "?"
                        })
                        print(f"    [ERROR] {card} -> Błąd: {e}")
                bot_debug[bot] = {
                    "debug_data": debug_data,
                    "best_card": best_card,
                    "best_score": best_score,
                    "best_caption": best_caption,
                    "best_debug": best_debug
                }
                print(f"[BOT] {bot} wybrał kartę: {best_card} (score: {best_score:.3f})")
                collected_cards.append((bot, best_card))

            # --- ETAP ZGADYWANIA ---
            votes = {card: 0 for _, card in collected_cards}
            votes_details = {card: [] for _, card in collected_cards}
            guessing_debug = {}

            for bot in bots:
                if bot == storyteller:
                    continue
                print(f"[GUESS] {bot} analizuje karty na stole (bez swojej)")
                best_score = -float('inf')
                best_card = None
                best_caption = ""
                best_debug = None
                debug_data = []
                params = bot_generation_params[bot] 
                for owner, card in collected_cards:
                    if owner == bot:
                        continue
                    try:
                        caption = generate_caption(card, **params)  
                        score, debug = fair_scoring(card, story_card_class, chosen_keyword, caption, k=3)
                        card_class = classify_image(card)
                        debug_data.append({
                            "card": card,
                            "owner": owner,
                            "caption": caption,
                            "similarity": score,
                            "class_score": debug["class_score"],
                            "emb_score": debug["emb_score"],
                            "card_class": card_class
                        })
                        print(f"    [CHECK] {card} ({owner}) -> '{caption}' | score: {score:.3f} (class_score: {debug['class_score']:.3f}, emb_score: {debug['emb_score']:.3f}, class_label: {card_class})")
                        if score > best_score:
                            best_score = score
                            best_card = card
                            best_caption = caption
                            best_debug = debug
                    except Exception as e:
                        debug_data.append({
                            "card": card,
                            "owner": owner,
                            "caption": f"Błąd: {e}",
                            "similarity": 0,
                            "class_score": 0,
                            "emb_score": 0,
                            "card_class": "?"
                        })
                        print(f"    [ERROR] {card} ({owner}) -> Błąd: {e}")
                votes[best_card] += 1
                votes_details[best_card].append(bot)
                guessing_debug[bot] = {
                    "debug_data": debug_data,
                    "voted_card": best_card,
                    "voted_caption": best_caption,
                    "voted_score": best_score,
                    "voted_debug": best_debug
                }
                print(f"[GUESS] {bot} zagłosował na kartę: {best_card} (score: {best_score:.3f})")

            storyteller_card = story_card
            correct_voters = votes_details.get(storyteller_card, [])
            if 0 < len(correct_voters) < (NUM_BOTS - 1):
                player_points[storyteller] += 3
                for bot in correct_voters:
                    player_points[bot] += 3
            else:
                for bot, card in collected_cards:
                    if bot == storyteller:
                        continue
                    player_points[bot] += 2 * len(votes_details.get(card, []))

            md.write(f"## Storyteller: **{storyteller}**\n\n")
            md.write(f"### Karty storyteller'a:\n")
            for card in hands[storyteller]:
                md.write(save_image_markdown(card))
            md.write(f"### Wybrana karta storyteller'a:\n")
            md.write(save_image_markdown(story_card, title="Wybrana karta storyteller'a"))
            md.write(f"**Klasa karty:** `{story_card_class}`  \n")
            md.write(f"**Hasło (klucz):** `{chosen_keyword}`\n\n")

            for bot in bots:
                md.write(f"---\n\n")
                md.write(f"## {bot}\n\n")
                md.write(f"### Karty na ręce:\n")
                for card in hands[bot]:
                    md.write(save_image_markdown(card))
                if bot == storyteller:
                    md.write(f"**Storyteller wybrał:** {os.path.basename(story_card)}\n\n")
                    continue
                md.write(f"### Analiza dopasowania kart do klucza: `{chosen_keyword}`\n\n")
                for entry in bot_debug[bot]["debug_data"]:
                    md.write(save_image_markdown(entry["card"]))
                    md.write(f"*Opis:* {entry['caption']}  \n")
                    md.write(f"*Klasa obrazu:* `{entry['card_class']}`  \n")
                    md.write(f"*Punkty za klasę:* `{entry['class_score']:.3f}`  \n")
                    md.write(f"*Punkty za embedding:* `{entry['emb_score']:.3f}`  \n")
                    md.write(f"*Dopasowanie do klucza (suma):* **{entry['similarity']*100:.2f}%**\n\n")
                md.write(f"**{bot} wybrał:**\n")
                md.write(save_image_markdown(bot_debug[bot]["best_card"], title=f"Najlepsza karta ({bot})"))
                md.write(f"*Opis:* {bot_debug[bot]['best_caption']}  \n")
                md.write(f"*Najlepsze dopasowanie:* **{bot_debug[bot]['best_score']*100:.2f}%**\n\n")

            md.write("---\n\n")
            md.write("## Karty na stole do zgadywania:\n\n")
            for bot, card in collected_cards:
                md.write(save_image_markdown(card, title=f"{bot}"))
            md.write("\n")

            md.write("---\n\n")
            md.write("## Etap zgadywania\n\n")
            for bot in bots:
                if bot == storyteller:
                    continue
                md.write(f"### {bot} analizuje karty na stole (nie może głosować na swoją):\n\n")
                for entry in guessing_debug[bot]["debug_data"]:
                    md.write(save_image_markdown(entry["card"], title=f"Karta {entry['owner']}"))
                    md.write(f"*Opis:* {entry['caption']}  \n")
                    md.write(f"*Klasa obrazu:* `{entry['card_class']}`  \n")
                    md.write(f"*Punkty za klasę:* `{entry['class_score']:.3f}`  \n")
                    md.write(f"*Punkty za embedding:* `{entry['emb_score']:.3f}`  \n")
                    md.write(f"*Dopasowanie do klucza (suma):* **{entry['similarity']*100:.2f}%**\n\n")
                md.write(f"**{bot} zagłosował na kartę {os.path.basename(guessing_debug[bot]['voted_card'])}** (dopisanie: {guessing_debug[bot]['voted_score']*100:.2f}%)\n\n")

            md.write("---\n\n")
            md.write("## Statystyki głosowania\n\n")
            for card in votes:
                md.write(save_image_markdown(card))
                md.write(f"Głosy: **{votes[card]}**  \n")
                if votes_details[card]:
                    md.write(f"Głosowali: {', '.join(votes_details[card])}\n")
                md.write(f"\n**Szczegóły dopasowań dla tej karty:**\n")
                for bot in bots:
                    if bot == storyteller:
                        continue
                    for entry in guessing_debug[bot]["debug_data"]:
                        if entry["card"] == card:
                            bot_prompt = chosen_keyword 
                            md.write(f"- **{bot}**: prompt: `{bot_prompt}` | caption: \"{entry['caption']}\" | score: {entry['similarity']:.3f} (class: {entry['class_score']:.3f}, emb: {entry['emb_score']:.3f})\n")
                md.write("\n")

            md.write("---\n\n")
            md.write("## Punkty po tej rundzie\n\n")
            for bot in bots:
                md.write(f"- **{bot}**: {player_points[bot]} pkt\n")
            md.write("\n")

    print(f"Przebieg gry zapisany do {report_filename}")

if __name__ == "__main__":
    main()

