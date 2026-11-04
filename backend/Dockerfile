FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r backend/requirements.txt

COPY pyproject.toml ./
COPY backend ./backend

RUN useradd --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Al arrancar, el gateway aplica las migraciones de Alembic y carga los datos sintéticos (lifespan).
CMD ["uvicorn", "backend.gateway.main:app", "--host", "0.0.0.0", "--port", "8000"]
