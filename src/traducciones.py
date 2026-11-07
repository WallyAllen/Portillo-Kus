"""Respaldo al español para los textos sin traducir.

traducciones-pendientes.json lo escribe el panel: {"pendientes": {clave: {"fecha": ..., "viejo": {idioma: texto}}}}.
clave es la de content.*.json ("hero.sub") o "equipo:<id>.<campo>". Un idioma está pendiente
mientras figura en "viejo", que guarda el español de su última traducción válida.
worker/traducciones.js tiene la copia en JS de estas reglas (ver tests/test_panel_reglas.py).
"""
import json

PENDING = "[PENDIENTE]"


def oculto(value):
    """Vacío o pendiente: el bloque que depende de ese dato no se genera."""
    value = str(value).strip()
    return not value or value.startswith(PENDING)


def cargar(path):
    if not path.is_file():
        return {}
    pendientes = json.loads(path.read_text(encoding="utf-8"))["pendientes"]
    if not isinstance(pendientes, dict) or not all(
            isinstance(e, dict) and isinstance(e.get("viejo"), dict) for e in pendientes.values()):
        raise ValueError(f"{path.name} no tiene el formato esperado")
    return pendientes


def aplicar(contents, pendientes, base):
    """Completa cada idioma con el español. Devuelve {idioma: claves que muestran español}.

    Una clave faltante cae al español sólo si está en la lista: si no, es un error de programación
    y lo frena el control de claves. Sin dato real en español no se revela nada: el otro idioma
    no publica un texto propio, y --produccion falla igual que por el español.
    """
    respaldos = {}
    for code, flat in contents.items():
        if code == base:
            continue
        respaldos[code] = set()
        for key, es in contents[base].items():
            listada = code in pendientes.get(key, {}).get("viejo", {})
            if key not in flat and not listada:
                continue
            propio = flat.get(key, "")
            if oculto(es):
                if key not in flat or not oculto(propio):
                    flat[key] = es
            elif listada or oculto(propio):
                flat[key] = es
                respaldos[code].add(key)
    return respaldos
