import os
import sys
import numpy as np
import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Flatten, Dense
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras.preprocessing import image

train_dir = os.path.join('.', 'data', 'train')
test_dir = os.path.join('.', 'data', 'test')

for dir_path, name in zip([train_dir, test_dir], ["train", "test"]):
    if not os.path.isdir(dir_path):
        print(f"Błąd: Katalog danych '{dir_path}' ({name}) nie istnieje. Utwórz wymagane katalogi i dodaj dane przed uruchomieniem programu.")
        sys.exit(1)

img_width, img_height = 150, 150

def get_class_labels(train_dir):
    return sorted([d for d in os.listdir(train_dir) if os.path.isdir(os.path.join(train_dir, d))])

def classify_image_top_k(img_path, k=3):
    model = tf.keras.models.load_model('image_classification_model.h5')
    train_dir = os.path.join('.', 'data', 'train')
    class_labels = get_class_labels(train_dir)
    img = image.load_img(img_path, target_size=(150, 150))
    x = image.img_to_array(img)
    x = x / 255.0
    x = np.expand_dims(x, axis=0)
    preds = model.predict(x)[0]
    top_indices = np.argsort(preds)[::-1][:k]
    return [(class_labels[i], float(preds[i])) for i in top_indices]

def classify_image(img_path):
    top1 = classify_image_top_k(img_path, k=1)
    return top1[0][0] 

if __name__ == "__main__":
    train_datagen = ImageDataGenerator(rescale=1./255)

    train_generator = train_datagen.flow_from_directory(
        train_dir,
        target_size=(img_width, img_height),
        batch_size=32,
        class_mode='categorical'
    )

    test_datagen = ImageDataGenerator(rescale=1./255)

    model = Sequential([
        Conv2D(32, (3, 3), activation='relu', input_shape=(img_width, img_height, 3)),
        MaxPooling2D(pool_size=(2, 2)),
        Conv2D(64, (3, 3), activation='relu'),
        MaxPooling2D(pool_size=(2, 2)),
        Flatten(),
        Dense(128, activation='relu'),
        Dense(len(train_generator.class_indices), activation='softmax')
    ])

    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

    early_stopping = EarlyStopping(monitor='loss', patience=5)

    model.fit(
        train_generator,
        epochs=30,
        callbacks=[early_stopping]
    )

    model.save('image_classification_model.h5')

    test_generator = test_datagen.flow_from_directory(
        test_dir,
        target_size=(img_width, img_height),
        batch_size=32,
        class_mode='categorical'
    )

    test_loss, test_accuracy = model.evaluate(test_generator)
    print(f'Test accuracy: {test_accuracy:.2f}')
