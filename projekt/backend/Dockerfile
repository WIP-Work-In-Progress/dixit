FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN apt-get update && apt-get install -y build-essential libgl1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt

COPY backend /app
COPY cards_metadata.json /app/cards_metadata.json
COPY generated_images /app/generated_images
COPY image_classification_model.h5 /app/image_classification_model.h5

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
