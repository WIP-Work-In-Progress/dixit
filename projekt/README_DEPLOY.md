Deployment guide

This repository contains a Dixit AI game: frontend (static) + backend (FastAPI) that uses real ML models for classification, captioning and embeddings.

Goal: Deploy frontend to GitHub Pages and backend to Render (or Railway). Backend must run real models (TensorFlow, BLIP, sentence-transformers).

Render quick steps
1. Create a Render account and connect your GitHub repository.
2. In Render, create a new Web Service and choose this repo and branch `main`.
3. If using this repo layout, set the "Root Directory" to the project root. Build command:
   pip install -r backend/requirements.txt
   Start command:
   uvicorn backend.main:app --host 0.0.0.0 --port $PORT
4. Environment variables (set in Render dashboard or in render.yaml):
   - ALLOWED_ORIGINS: https://<your-gh-username>.github.io
   - MODEL_PATH: /home/render/project/image_classification_model.h5 (if you plan to include model in repo)
   - MAX_UPLOAD_SIZE: 5242880
5. If you plan to include `image_classification_model.h5` in the repo, be mindful of size limits. Alternatively, upload it to Render via file storage or use a mounting solution.
6. Deploy. After successful build, note the public HTTPS URL (e.g. https://dixit-backend.onrender.com)

GitHub Pages (frontend)
1. Copy the static frontend files to the `docs/` folder (index.html, game.js, style.css, generated_images/, cards/ etc.) OR use `gh-pages` branch deployment.
2. In `index.html`, set `window.BACKEND_URL = 'https://<your-backend>.onrender.com'` (or configure CI to replace during deploy).
3. Commit and push. In GitHub → Settings → Pages, enable Pages from branch `main` / folder `docs/` (or from `gh-pages`).
4. Wait for site to be published (https://<your-gh-username>.github.io/<repo>/)

Testing
- Health: GET https://<your-backend>/api/health (should return model_loaded true if models loaded)
- Ready: GET https://<your-backend>/api/ready
- Cards metadata: GET https://<your-backend>/api/cards_metadata (requires model available)
- Vocab embeddings: GET https://<your-backend>/api/vocab_embeddings
- Embed text: POST https://<your-backend>/api/embed_text {"text": "mystery"}
- Upload image: POST multipart/form-data to /api/upload_image

Notes on resource usage
- TensorFlow and torch are heavy; the free Render plan may not have enough memory or CPU for large models. If you encounter OOM during model load, consider:
  - Using smaller models
  - Using a paid instance with more RAM
  - Offloading captioning or embeddings to a separate, more powerful service

Security
- Do NOT commit secrets to repository. Use Render environment variables for secrets and production config.

If you want, I can:
- Add GitHub Actions to automate frontend publish to GH Pages.
- Create a small test script to run against deployed backend and validate endpoints.
