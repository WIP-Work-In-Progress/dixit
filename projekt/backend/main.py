import asyncio
import json
import os
from pathlib import Path
from typing import Dict, Set
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Optional model deps (load if available)
try:
    import numpy as np
    from PIL import Image
    from tensorflow.keras.models import load_model
    has_tf = True
except Exception:
    has_tf = False

# Optional HF components
has_torch = False
has_transformers = False
has_sentence_transformers = False
blip_processor = None
blip_model = None
embed_model = None

try:
    import torch
    has_torch = True
    from transformers import BlipProcessor, BlipForConditionalGeneration
    has_transformers = True
except Exception:
    has_torch = False
    has_transformers = False

try:
    from sentence_transformers import SentenceTransformer
    has_sentence_transformers = True
except Exception:
    has_sentence_transformers = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dixit-backend")

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = BASE_DIR / "image_classification_model.h5"
CARDS_METADATA_PATH = BASE_DIR / "cards_metadata.json"
GENERATED_IMAGES_DIR = BASE_DIR / "generated_images"
VOCAB_PATH = BASE_DIR / "vocab_embeddings.json"

# Environment-configurable options
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").strip()
if ALLOWED_ORIGINS:
    allowed_origins = [origin.strip() for origin in ALLOWED_ORIGINS.split(",") if origin.strip()]
else:
    # Default to wildcard for local/dev; override in production with a comma-separated list
    allowed_origins = ["*"]

MODEL_PATH = Path(os.getenv("MODEL_PATH", str(DEFAULT_MODEL_PATH)))
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 5 * 1024 * 1024))  # default 5 MB

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info(f"Allowed origins: {allowed_origins}")
logger.info(f"Model path: {MODEL_PATH}")
logger.info(f"Max upload size: {MAX_UPLOAD_SIZE} bytes")

# Simple room manager: room_code -> set(WebSocket)
rooms: Dict[str, Set[WebSocket]] = {}

# Load cards metadata for convenience
cards_metadata = {}
if CARDS_METADATA_PATH.exists():
    try:
        with open(CARDS_METADATA_PATH, 'r', encoding='utf-8') as f:
            cards_metadata = json.load(f)
            logger.info(f"Loaded cards metadata: {len(cards_metadata)} cards")
    except Exception as e:
        logger.exception("Failed to load cards metadata:")

# Load TF model if available
keras_model = None
if has_tf and MODEL_PATH.exists():
    try:
        keras_model = load_model(str(MODEL_PATH))
        logger.info("Keras model loaded from %s", MODEL_PATH)
    except Exception as e:
        logger.exception("Failed to load Keras model:")
        keras_model = None
else:
    if not has_tf:
        logger.warning("TensorFlow not available in this environment. Keras model will not be loaded.")
    else:
        logger.warning("Keras model file not found at %s. Falling back to metadata if available.", MODEL_PATH)

# Load BLIP and embedding models if available
if has_transformers and has_torch:
    try:
        logger.info("Attempting to load BLIP captioning model (may take time)...")
        blip_processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
        blip_model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base").to('cpu')
        logger.info("BLIP caption model loaded")
    except Exception:
        logger.exception("Failed to load BLIP model:")
        blip_processor = None
        blip_model = None

if has_sentence_transformers:
    try:
        logger.info("Loading sentence-transformers embedding model (all-MiniLM-L6-v2)...")
        embed_model = SentenceTransformer('all-MiniLM-L6-v2')
        logger.info("Embedding model loaded")
    except Exception:
        logger.exception("Failed to load embedding model:")
        embed_model = None

# Utility: compute caption using BLIP
def compute_caption(img_path: Path):
    if not blip_processor or not blip_model:
        raise RuntimeError("BLIP model not available")
    try:
        image = Image.open(img_path).convert('RGB')
        inputs = blip_processor(images=image, return_tensors='pt')
        input_ids = inputs['pixel_values']
        # run on CPU
        out = blip_model.generate(input_ids)
        caption = blip_processor.decode(out[0], skip_special_tokens=True)
        return caption
    except Exception as e:
        logger.exception("Caption generation failed for %s", img_path)
        raise

# Utility: compute text embedding
def compute_text_embedding(text: str):
    if not embed_model:
        raise RuntimeError("Embedding model not available")
    emb = embed_model.encode(text, convert_to_numpy=True)
    return emb.tolist()

# Utility: compute keras predictions
def compute_keras_preds(img_path: Path):
    if keras_model is None:
        raise RuntimeError("Keras model not available")
    img = Image.open(img_path).convert('RGB')
    input_shape = keras_model.input_shape
    if isinstance(input_shape, tuple):
        _, h, w, c = input_shape
    else:
        _, h, w, c = input_shape[0]
    img = img.resize((w, h))
    arr = np.asarray(img).astype('float32') / 255.0
    arr = np.expand_dims(arr, axis=0)
    preds = keras_model.predict(arr)
    probs = np.squeeze(preds)
    # For labels, attempt to read class labels from data/train directory if exists
    class_labels = []
    train_dir = BASE_DIR / 'data' / 'train'
    if train_dir.exists():
        class_labels = sorted([d.name for d in train_dir.iterdir() if d.is_dir()])
    else:
        # fallback to numeric indices
        class_labels = [str(i) for i in range(len(probs))]
    top_idx = list(map(int, probs.argsort()[-3:][::-1]))
    top = [(class_labels[i] if i < len(class_labels) else str(i), float(probs[i])) for i in top_idx]
    return top

# Compute full metadata for a given image path
def analyze_image(img_path: Path):
    result = {"filename": img_path.name}
    # classification
    if keras_model is None:
        raise RuntimeError("Keras model unavailable")
    result['top_classes'] = compute_keras_preds(img_path)
    # caption
    if blip_processor and blip_model:
        try:
            caption = compute_caption(img_path)
            result['caption'] = caption
        except Exception:
            result['caption'] = ''
    else:
        result['caption'] = ''
    # embedding
    if embed_model:
        try:
            text_for_emb = result.get('caption') or result['top_classes'][0][0]
            emb = compute_text_embedding(text_for_emb)
            result['embedding'] = emb
        except Exception:
            result['embedding'] = None
    else:
        result['embedding'] = None
    return result


@app.get('/api/cards_metadata')
async def cards_metadata_endpoint(background_tasks: BackgroundTasks):
    """Return metadata for all cards. If precomputed file exists and models are not available, return 503 (per requirement to use real models).
    If models are available, compute metadata on demand and cache to file."""
    # If models not available, do not return precomputed metadata (user insisted on real model usage)
    if keras_model is None:
        raise HTTPException(status_code=503, detail="Classification model not available on server")
    # Compute metadata for all images in GENERATED_IMAGES_DIR
    if not GENERATED_IMAGES_DIR.exists():
        raise HTTPException(status_code=404, detail="No card images found on server")

    files = [p for p in GENERATED_IMAGES_DIR.iterdir() if p.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp'}]
    metadata_out = {}
    for p in files:
        try:
            metadata_out[p.name] = analyze_image(p)
        except Exception as e:
            logger.exception("Failed to analyze %s: %s", p, e)
            # skip problematic images
    # Persist to cards_metadata.json for future reference
    try:
        with open(CARDS_METADATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(metadata_out, f, ensure_ascii=False, indent=2)
    except Exception:
        logger.exception("Failed to save cards_metadata.json")
    return JSONResponse(content=metadata_out)


@app.post('/api/embed_text')
async def embed_text_endpoint(payload: dict):
    text = payload.get('text') if isinstance(payload, dict) else None
    if not text:
        raise HTTPException(status_code=400, detail='Missing text')
    if not embed_model:
        raise HTTPException(status_code=503, detail='Embedding model not available')
    try:
        emb = compute_text_embedding(text)
        return {"embedding": emb}
    except Exception as e:
        logger.exception("Embedding failure")
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/predict_card/{card_id}')
async def predict_card(card_id: str):
    # If card image not found
    img_path = GENERATED_IMAGES_DIR / card_id
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Card image not found on server")

    # Require keras model at minimum
    if keras_model is None:
        raise HTTPException(status_code=503, detail="Classification model not available on server")

    try:
        # Full analysis (classification, caption, embedding when available)
        meta = analyze_image(img_path)
        return JSONResponse(content={"from": "model", "meta": meta})
    except Exception as e:
        logger.exception("Prediction failed:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health():
    return {"status": "ok", "model_loaded": bool(keras_model)}


@app.get("/api/ready")
async def ready():
    """Readiness endpoint: signals model load state and basic runtime info."""
    return {
        "status": "ready",
        "model_loaded": bool(keras_model),
        "model_path": str(MODEL_PATH) if MODEL_PATH.exists() else None,
        "rooms_active": len(rooms)
    }


@app.websocket("/ws/{room}")
async def websocket_endpoint(websocket: WebSocket, room: str):
    await websocket.accept()
    if room not in rooms:
        rooms[room] = set()
    rooms[room].add(websocket)
    logger.info(f"Client connected to room {room} (total: {len(rooms[room])})")

    try:
        while True:
            data = await websocket.receive_text()
            # Broadcast to all clients in the room
            for ws in list(rooms.get(room, set())):
                try:
                    await ws.send_text(data)
                except Exception:
                    # ignore broken sockets; cleanup later
                    logger.debug("Failed to send to a client in room %s", room)
    except WebSocketDisconnect:
        # Clean up websocket from room safely
        try:
            if room in rooms and websocket in rooms[room]:
                rooms[room].remove(websocket)
                logger.info(f"Client disconnected from room {room} (remaining: {len(rooms.get(room, []))})")
                if len(rooms[room]) == 0:
                    del rooms[room]
        except Exception:
            logger.exception("Error cleaning up websocket on disconnect")
    except Exception as e:
        logger.exception("WebSocket error:")
        try:
            if room in rooms and websocket in rooms[room]:
                rooms[room].remove(websocket)
        except Exception:
            pass


@app.post("/api/upload_image")
async def upload_image(file: UploadFile = File(...)):
    """Upload image to server (saved into generated_images) and return assigned card id (filename)."""
    try:
        content = await file.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"Uploaded file too large (max {MAX_UPLOAD_SIZE} bytes)")

        # Sanitize filename to prevent path traversal
        filename = os.path.basename(file.filename)
        # Allow only common image extensions
        allowed_ext = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
        _, ext = os.path.splitext(filename.lower())
        if ext not in allowed_ext:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        save_path = GENERATED_IMAGES_DIR / filename
        with open(save_path, 'wb') as f:
            f.write(content)
        logger.info(f"Saved uploaded image as {save_path}")
        return {"saved_as": filename}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to save uploaded image:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/vocab_embeddings')
async def vocab_embeddings_endpoint():
    """Return a map word->embedding. If precomputed file exists, return it. Otherwise compute using embed_model from keywords and sentence_key and cache it."""
    # If precomputed file exists, return it
    if VOCAB_PATH.exists():
        try:
            with open(VOCAB_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return JSONResponse(content=data)
        except Exception:
            logger.exception("Failed to read existing vocab file")
            raise HTTPException(status_code=500, detail="Failed to read vocab file")

    # Otherwise, compute if embedding model available
    if not embed_model:
        raise HTTPException(status_code=503, detail="Embedding model not available to compute vocab embeddings")

    # Build vocabulary from keywords.py and sentence_key.py
    try:
        import keywords as kw
        import sentence_key as sk
    except Exception:
        logger.exception("Failed to import keyword sources")
        raise HTTPException(status_code=500, detail="Internal error building vocab list")

    vocab_set = set()
    # from keywords.KEYWORDS
    try:
        for k, words in getattr(kw, 'KEYWORDS', {}).items():
            for w in words:
                vocab_set.add(w.lower().strip())
    except Exception:
        logger.exception("Error processing keywords.KEYWORDS")

    # from sentence_key.SENTENCE_KEY
    try:
        for key, mapping in getattr(sk, 'SENTENCE_KEY', {}).items():
            vocab_set.add(key.lower().strip())
            for subk, arr in mapping.items():
                vocab_set.add(subk.lower().strip())
                for w in arr:
                    vocab_set.add(w.lower().strip())
    except Exception:
        logger.exception("Error processing sentence_key.SENTENCE_KEY")

    vocab_list = sorted([w for w in vocab_set if w])
    logger.info("Computing embeddings for %d vocab words", len(vocab_list))

    embeddings = {}
    try:
        # compute in batches to avoid memory spikes
        batch_size = 64
        for i in range(0, len(vocab_list), batch_size):
            batch = vocab_list[i:i+batch_size]
            embs = embed_model.encode(batch, convert_to_numpy=True)
            for j, w in enumerate(batch):
                embeddings[w] = embs[j].tolist()
    except Exception:
        logger.exception("Failed to compute embeddings for vocab")
        raise HTTPException(status_code=500, detail="Embedding computation failed")

    # Cache to file
    try:
        with open(VOCAB_PATH, 'w', encoding='utf-8') as f:
            json.dump(embeddings, f, ensure_ascii=False)
    except Exception:
        logger.exception("Failed to save vocab embeddings to disk")

    return JSONResponse(content=embeddings)


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Dixit backend (uvicorn) on 0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
