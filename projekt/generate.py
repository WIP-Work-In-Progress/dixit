from datetime import datetime
import time
import os
import uuid
from PIL import Image
import requests

from generate_prompts import categories

def crop_to_aspect(image, target_aspect=2/3):
    width, height = image.size
    current_aspect = width / height
    if current_aspect > target_aspect:
        new_width = int(height * target_aspect)
        left = (width - new_width) // 2
        right = left + new_width
        top = 0
        bottom = height
    else:
        new_height = int(width / target_aspect)
        top = (height - new_height) // 2
        bottom = top + new_height
        left = 0
        right = width
    return image.crop((left, top, right, bottom))

def generate_images_pollynation_ai(prompt, save_path):
    prompt += str(uuid.uuid4())  
    formatted_prompt = prompt.replace(" ", "-")
    url = f"https://image.pollinations.ai/prompt/{formatted_prompt}"

    while True:
        try:
            response = requests.get(url)
            if response.status_code == 200:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                image_save_name = f"img_{timestamp}.png"
                image_save_path = os.path.join(save_path, image_save_name)
                os.makedirs(os.path.dirname(image_save_path), exist_ok=True)

                with open(image_save_path, 'wb') as f:
                    f.write(response.content)

                image = Image.open(image_save_path)
                image = image.crop((0, 0, image.width, image.height - 48))
                cropped_image = crop_to_aspect(image, target_aspect=2/3)
                card_width, card_height = 400, 600
                resized_image = cropped_image.resize((card_width, card_height), Image.LANCZOS)
                resized_image.save(image_save_path)

                return image_save_path
            else:
                print(f"Retrying... Status code: {response.status_code}")
        except requests.RequestException as e:
            print(f"Request failed: {e}. Retrying...")
        time.sleep(5)

if __name__ == "__main__":
    print("=" * 50)
    print("DIXIT-STYLE IMAGE GENERATOR FOR ALL CATEGORIES")
    print("=" * 50)
    print("Generating surreal, artistic images for all categories from generate_prompts.py")
    print("Images will be saved to the 'data/train/<category>' directories.")
    print("Press Ctrl+C at any time to stop the generation process.")
    print("=" * 50)

    try:
        for category, prompts in categories.items():
            save_path = os.path.join("data", "train", category)
            print(f"\nGenerating images for class: {category}")
            for i, prompt in enumerate(prompts):
                try:
                    image_path = generate_images_pollynation_ai(prompt, save_path)
                    print(f"  [{i+1}/{len(prompts)}] Saved to {image_path}")

                    generated_images_path = "generated_images"
                    image_path2 = generate_images_pollynation_ai(prompt, generated_images_path)
                    print(f"  [{i+1}/{len(prompts)}] Also saved to {image_path2}")

                    time.sleep(2)
                except Exception as e:
                    print(f"  ✗ Error generating image: {e}")
        print(f"\nSuccessfully generated images for all categories.")
    except KeyboardInterrupt:
        print("\n\nImage generation interrupted by user.")
    except Exception as e:
        print(f"\n\nAn error occurred during image generation: {e}")