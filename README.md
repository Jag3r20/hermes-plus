# Hermes Plus

Three tools running together via a single Docker Compose file — no personal data, clean start.

| Tool | URL |
|---|---|
| Hermes Dashboard | http://localhost:9119 |
| Hermes WebUI | http://localhost:8787 |
| Obsidian Klon (vault editor) | http://localhost:3333 |

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## Quick start

```bash
git clone --recurse-submodules https://github.com/Jag3r20/hermes-plus.git
cd hermes-plus
docker compose up -d
```

First run takes a few minutes — Docker pulls/builds the images.

## Stop

```bash
docker compose down        # stop, keep data
docker compose down -v     # stop + wipe all data
```
