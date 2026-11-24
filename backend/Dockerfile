FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Usuario sem privilegio: se alguem explorar a API, nao cai como root.
RUN useradd --create-home --uid 1000 hiraku \
 && mkdir -p /app/data \
 && chown hiraku:hiraku /app/data

WORKDIR /app

# Dependencias primeiro: aproveita o cache de camadas do Docker.
# So as de producao; pytest e pip-audit ficam em requirements-dev.txt.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

USER hiraku

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
