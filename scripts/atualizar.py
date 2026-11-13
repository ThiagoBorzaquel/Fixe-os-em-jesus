#!/usr/bin/env python3
"""Publica o devocional do dia (fuso de Brasília) e mantém o histórico.

Uso:  python scripts/atualizar.py [--data AAAA-MM-DD] [--validar]

Segurança: tudo é calculado e validado em memória; os arquivos só são
gravados no final (de forma atômica). Se algo falhar, o último conteúdo
publicado permanece intacto e o site continua funcionando.
"""
import argparse, json, os, re, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
CAMPOS = ["id", "titulo", "passagem", "versiculo", "reflexao", "aplicacao", "encorajamento"]


def ler(caminho, padrao=None):
    try:
        return json.loads(Path(caminho).read_text(encoding="utf-8"))
    except FileNotFoundError:
        if padrao is not None:
            return padrao
        raise


def gravar(caminho, conteudo):
    """Grava de forma atômica (arquivo temporário + substituição)."""
    caminho = Path(caminho)
    fd, tmp = tempfile.mkstemp(dir=caminho.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(conteudo)
    os.replace(tmp, caminho)


def como_json(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def validar(pool):
    ids = set()
    for d in pool:
        faltam = [c for c in CAMPOS if not d.get(c)]
        if faltam:
            raise ValueError(f"Devocional {d.get('id', '?')} sem campos: {faltam}")
        if d["id"] in ids:
            raise ValueError(f"ID duplicado: {d['id']}")
        ids.add(d["id"])
        v = d["versiculo"]
        if not v.get("referencia") or not v.get("texto"):
            raise ValueError(f"Versículo incompleto em {d['id']}")
        if not isinstance(d["reflexao"], list):
            raise ValueError(f"'reflexao' deve ser uma lista em {d['id']}")
    if not pool:
        raise ValueError("A biblioteca de devocionais está vazia.")


def escolher(pool, historico, data_iso, dias_minimos):
    """Escolhe o devocional menos recentemente usado, evitando repetições curtas."""
    ultimo_uso = {}
    for h in historico:  # historico está em ordem decrescente de data
        ultimo_uso.setdefault(h["devocional"]["id"], h["data"])
    dia = datetime.fromisoformat(data_iso).date()

    def idade(d):
        u = ultimo_uso.get(d["id"])
        return 10**6 if u is None else (dia - datetime.fromisoformat(u).date()).days

    ordenados = sorted(pool, key=lambda d: (-idade(d), d["id"]))
    elegiveis = [d for d in ordenados if idade(d) >= dias_minimos]
    return (elegiveis or ordenados)[0]


def aplicar_site_url(novo, cfg):
    """Troca a URL base nos HTML, regenera sitemap.xml e robots.txt."""
    novo = novo.rstrip("/") + "/"
    antigo = cfg["site_url"].rstrip("/") + "/"
    hoje = datetime.now(ZoneInfo("America/Sao_Paulo")).date().isoformat()
    saidas = {}
    for arq in RAIZ.rglob("*.html"):
        if ".git" in arq.parts:
            continue
        texto = arq.read_text(encoding="utf-8")
        novo_texto = texto.replace(antigo, novo)
        if arq.name == "404.html":
            novo_texto = novo_texto.replace(urlparse(antigo).path, urlparse(novo).path)
        if novo_texto != texto:
            saidas[arq] = novo_texto
    paginas = ["", "oracao/", "anteriores/"]
    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
               + "".join(f"  <url><loc>{novo}{p}</loc><lastmod>{hoje}</lastmod></url>\n" for p in paginas)
               + "</urlset>\n")
    robots = f"User-agent: *\nAllow: /\n\nSitemap: {novo}sitemap.xml\n"
    return saidas, sitemap, robots, novo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", help="Força a data (AAAA-MM-DD). Padrão: hoje em Brasília.")
    ap.add_argument("--validar", action="store_true", help="Apenas valida os dados.")
    args = ap.parse_args()

    cfg = ler(RAIZ / "config.json")
    pool = ler(DATA / "devocionais.json")
    validar(pool)
    for o in ler(DATA / "oracoes.json"):
        if not all(o.get(c) for c in ["id", "categoria", "titulo", "texto", "passagem", "versiculo"]):
            raise ValueError(f"Oração incompleta: {o.get('id', '?')}")
    if args.validar:
        print(f"OK: {len(pool)} devocionais e orações válidos.")
        return

    agora = datetime.now(ZoneInfo("America/Sao_Paulo"))
    data_iso = args.data or agora.date().isoformat()
    datetime.fromisoformat(data_iso)  # valida o formato

    historico = ler(DATA / "historico.json", [])
    existente = next((h for h in historico if h["data"] == data_iso), None)
    if existente:
        escolhido, publicado_em = existente["devocional"], existente["publicado_em"]
    else:
        escolhido = escolher(pool, historico, data_iso, min(cfg.get("dias_minimos_sem_repetir", 10), len(pool) - 1))
        publicado_em = agora.isoformat(timespec="seconds")
        historico.append({"data": data_iso, "publicado_em": publicado_em, "devocional": escolhido})
        historico.sort(key=lambda h: h["data"], reverse=True)

    hoje = {"data": data_iso, "publicado_em": publicado_em, "devocional": escolhido}
    url = os.environ.get("SITE_URL", "").strip() or cfg["site_url"]
    html, sitemap, robots, url_final = aplicar_site_url(url, cfg)

    # Tudo validado: agora grava.
    gravar(DATA / "historico.json", como_json(historico))
    gravar(DATA / "hoje.json", como_json(hoje))
    for arq, texto in html.items():
        gravar(arq, texto)
    gravar(RAIZ / "sitemap.xml", sitemap)
    gravar(RAIZ / "robots.txt", robots)
    cfg["site_url"] = url_final
    gravar(RAIZ / "config.json", como_json(cfg))
    print(f"Publicado {data_iso}: {escolhido['id']} — {escolhido['titulo']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f"ERRO: {e}", file=sys.stderr)
        sys.exit(1)
