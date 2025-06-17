import os
import numpy as np
from PIL import Image
from sklearn.tree import DecisionTreeClassifier
import joblib

def extract_features(img_path, bins=(8, 8, 8)):
    image = Image.open(img_path).convert("RGB").resize((64, 64))
    arr = np.array(image)
    hist = np.histogramdd(
        arr.reshape(-1, 3),
        bins=bins,
        range=[(0, 256), (0, 256), (0, 256)]
    )[0]
    hist = hist.flatten()
    hist = hist / np.sum(hist)
    return hist

def prepare_dataset(data_dir):
    X, y = [], []
    class_labels = sorted([d for d in os.listdir(data_dir) if os.path.isdir(os.path.join(data_dir, d))])
    for label in class_labels:
        class_dir = os.path.join(data_dir, label)
        for fname in os.listdir(class_dir):
            if fname.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')):
                img_path = os.path.join(class_dir, fname)
                features = extract_features(img_path)
                X.append(features)
                y.append(label)
    return np.array(X), np.array(y), class_labels

def train_tree_classifier(data_dir, model_path="tree_model.joblib"):
    X, y, class_labels = prepare_dataset(data_dir)
    tree = DecisionTreeClassifier(max_depth=10)
    tree.fit(X, y)
    joblib.dump((tree, class_labels), model_path)
    print(f"Model drzewa decyzyjnego zapisany do {model_path}")

def classify_image_tree(img_path, model_path="tree_model.joblib"):
    tree, class_labels = joblib.load(model_path)
    features = extract_features(img_path)
    pred = tree.predict([features])[0]
    probs = tree.predict_proba([features])[0]
    top_indices = np.argsort(probs)[::-1][:3]
    return [(class_labels[i], float(probs[i])) for i in top_indices]

if __name__ == "__main__":
    train_tree_classifier("data/train")
    test_img = "test/img_20250523_124036.png"
    results = classify_image_tree(test_img)
    print("Klasyfikacja drzewo decyzyjne:")
    for label, prob in results:
        print(f"{label}: {prob:.3f}")