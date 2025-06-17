from tensorflow.keras.preprocessing import image
import tensorflow as tf
import numpy as np
import os

img_width, img_height = 150, 150
train_dir = os.path.join('.', 'data', 'train')

def get_class_labels(train_dir):
    class_labels = sorted([d for d in os.listdir(train_dir) if os.path.isdir(os.path.join(train_dir, d))])
    return {i: label for i, label in enumerate(class_labels)}

def predict_image(img_path):
    model = tf.keras.models.load_model('image_classification_model.h5')
    class_labels = get_class_labels(train_dir)

    img = image.load_img(img_path, target_size=(img_width, img_height))
    x = image.img_to_array(img)
    x = x / 255.0
    x = np.expand_dims(x, axis=0)

    preds = model.predict(x)
    pred_class = np.argmax(preds, axis=1)[0]
    print(f"Obraz '{img_path}' został zaklasyfikowany jako: {class_labels[pred_class]}")

predict_image('cards/DIXIT_QUEST_CARD_4_72dpi.png')