import os
import numpy as np
from PIL import Image
from sklearn.neighbors import KNeighborsClassifier
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

def train_knn_classifier(data_dir, model_path="knn_model.joblib"):
    X, y, class_labels = prepare_dataset(data_dir)
    knn = KNeighborsClassifier(n_neighbors=3)
    knn.fit(X, y)
    joblib.dump((knn, class_labels), model_path)
    print(f"Model KNN zapisany do {model_path}")

def classify_image_knn(img_path, model_path="knn_model.joblib"):
    knn, class_labels = joblib.load(model_path)
    features = extract_features(img_path)
    pred = knn.predict([features])[0]
    probs = knn.predict_proba([features])[0]
    top_indices = np.argsort(probs)[::-1][:3]
    return [(class_labels[i], float(probs[i])) for i in top_indices]

if __name__ == "__main__":
    train_knn_classifier("data/train")
    test_img = "test/img_20250523_124036.png"
    results = classify_image_knn(test_img)
    print("Klasyfikacja kNN:")
    for label, prob in results:
        print(f"{label}: {prob:.3f}")