import os
from classify import classify_image_top_k
from classify_knn import classify_image_knn
from classify_tree import classify_image_tree

TEST_DIR = "data/test"
REPORT_MD = "compare_report.md"

def get_true_class_from_path(img_path):
    return os.path.basename(os.path.dirname(img_path))

def color_text(text, color):
    return f'<span style="color:{color}">{text}</span>'

def compare_classifiers(test_dir, report_md):
    rows = []
    cnn_hits = 0
    knn_hits = 0
    tree_hits = 0
    total = 0

    for root, dirs, files in os.walk(test_dir):
        for fname in files:
            if not fname.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')):
                continue
            img_path = os.path.join(root, fname)
            rel_path = img_path.replace("\\", "/")
            true_class = get_true_class_from_path(img_path)
            cnn_top3 = classify_image_top_k(img_path, k=3)
            knn_top3 = classify_image_knn(img_path)
            tree_top3 = classify_image_tree(img_path)
            cnn_top1 = cnn_top3[0][0] if cnn_top3 else "-"
            knn_top1 = knn_top3[0][0] if knn_top3 else "-"
            tree_top1 = tree_top3[0][0] if tree_top3 else "-"
            cnn_top3_str = ", ".join([f"{c[0]}({c[1]:.2f})" for c in cnn_top3])
            knn_top3_str = ", ".join([f"{c[0]}({c[1]:.2f})" for c in knn_top3])
            tree_top3_str = ", ".join([f"{c[0]}({c[1]:.2f})" for c in tree_top3])

            def mark_result(pred, true):
                if pred == true:
                    return color_text(pred, "green")
                else:
                    return color_text(pred, "red")

            cnn_marked = mark_result(cnn_top1, true_class)
            knn_marked = mark_result(knn_top1, true_class)
            tree_marked = mark_result(tree_top1, true_class)

            if cnn_top1 == true_class:
                cnn_hits += 1
            if knn_top1 == true_class:
                knn_hits += 1
            if tree_top1 == true_class:
                tree_hits += 1
            total += 1

            rows.append(f"| ![]({rel_path}) | {fname} | `{true_class}` | {cnn_marked} | {knn_marked} | {tree_marked} | {cnn_top3_str} | {knn_top3_str} | {tree_top3_str} |")

    cnn_acc = cnn_hits / total * 100 if total else 0
    knn_acc = knn_hits / total * 100 if total else 0
    tree_acc = tree_hits / total * 100 if total else 0

    best = max([("CNN", cnn_acc), ("kNN", knn_acc), ("Drzewo", tree_acc)], key=lambda x: x[1])
    best_str = f"**Najlepszy klasyfikator:** {best[0]} ({best[1]:.2f}% trafień top1)**"

    with open(report_md, "w", encoding="utf-8") as md:
        md.write("# Porównanie klasyfikatorów obrazów\n\n")
        md.write(f"**Podsumowanie:**\n\n")
        md.write(f"- Trafność CNN: **{cnn_acc:.2f}%** ({cnn_hits}/{total})\n")
        md.write(f"- Trafność kNN: **{knn_acc:.2f}%** ({knn_hits}/{total})\n")
        md.write(f"- Trafność Drzewo: **{tree_acc:.2f}%** ({tree_hits}/{total})\n")
        md.write(f"\n{best_str}\n\n")
        md.write("| Obrazek | Plik | Prawidłowa klasa | CNN (top1) | kNN (top1) | Drzewo (top1) | CNN top3 | kNN top3 | Drzewo top3 |\n")
        md.write("|---------|------|------------------|-------------|------------|---------------|----------|----------|-------------|\n")
        for row in rows:
            md.write(row + "\n")
    print(f"Raport porównawczy zapisany do {report_md}")

if __name__ == "__main__":
    compare_classifiers(TEST_DIR, REPORT_MD)