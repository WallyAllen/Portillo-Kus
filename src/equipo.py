"""Abogados del estudio: se leen de equipo.json, un solo archivo pensado para el panel.

Agregar, sacar o editar a alguien es tocar esa lista. Sale en producción sólo quien
tiene "publicado": true, y entonces todos sus datos tienen que estar completos.
La vista previa (build sin --produccion) muestra también los borradores.
"""
from html import escape
import json

TEXTOS = ("cargo", "idiomas", "biografia")
OBLIGATORIOS = ("cargo", "biografia")
ICONO_PERSONA = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 '
                 '0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.4-8 5.3V21h16v-1.7c0-2.9-3.6-5.3-8-5.3Z"/></svg>')
ICONO_LINKEDIN = ('<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M5 3a2 '
                  '2 0 1 1 0 4 2 2 0 0 1 0-4ZM3.3 8.6h3.4V21H3.3V8.6Zm5.6 0h3.3v1.7c.5-.9 1.7-2 3.6-2 3.8 0 4.5 2.4 '
                  '4.5 5.6V21h-3.4v-6.2c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2V21H8.9V8.6Z"/></svg>')


def _incompleto(valor):
    valor = str(valor).strip()
    return not valor or "[" in valor


def cargar(path, todos, publicados, imagenes):
    """Devuelve la lista validada. Un error acá frena el build en cualquier modo."""
    try:
        abogados = json.loads(path.read_text(encoding="utf-8"))["abogados"]
    except (OSError, ValueError, KeyError) as error:
        raise ValueError(f"equipo.json no se pudo leer: {error}") from error
    errores = []
    for abogado in abogados:
        nombre = abogado.get("nombre", "(sin nombre)")
        for campo in TEXTOS:
            faltan = set(todos) - set(abogado.get(campo, {}))
            if faltan:
                errores.append(f"{nombre}: {campo} sin {', '.join(sorted(faltan))}")
        if abogado.get("publicado") is not True:
            continue
        if _incompleto(nombre):
            errores.append(f"{nombre}: falta el nombre real")
        foto = str(abogado.get("foto", ""))
        if not foto.startswith("abogado-") or not (imagenes / foto).is_file():
            errores.append(f"{nombre}: falta la foto (portillo-images/abogado-*)")
        for campo in OBLIGATORIOS:
            errores += [f"{nombre}: falta {campo} en {code}" for code in publicados
                        if _incompleto(abogado.get(campo, {}).get(code, ""))]
        for code in publicados:  # opcional, pero nunca con un texto de muestra
            if "[" in str(abogado.get("idiomas", {}).get(code, "")):
                errores.append(f"{nombre}: idiomas de muestra en {code}")
        if "[" in str(abogado.get("matricula", "")):
            errores.append(f"{nombre}: matrícula de muestra")
        if abogado.get("linkedin") and not str(abogado["linkedin"]).startswith("https://www.linkedin.com/in/"):
            errores.append(f"{nombre}: linkedin debe empezar con https://www.linkedin.com/in/")
    if errores:
        raise ValueError("equipo.json:\n" + "\n".join(errores))
    return abogados


def visibles(abogados, produccion):
    return [a for a in abogados if not produccion or a.get("publicado") is True]


def imagenes_usadas(abogados):
    """<img> sueltos para que prepare_images genere las variantes de estas fotos."""
    return "".join(f'<img src="portillo-images/{escape(a["foto"], quote=True)}">' for a in abogados if a.get("foto"))


def _foto(abogado, prefijo, alt):
    if not abogado.get("foto"):
        return f'<span class="abogado-sin-foto">{ICONO_PERSONA}</span>'
    return (f'<img src="{prefijo}portillo-images/{escape(abogado["foto"], quote=True)}" '
            f'alt="{escape(alt, quote=True)}" loading="lazy">')


def render(abogados, code, textos, prefijo):
    """textos: claves ya aplanadas de content.<code>.json."""
    tarjetas, dialogos = [], []
    for numero, a in enumerate(abogados, 1):
        id_ = f"abogado-{numero}"
        nombre, cargo = escape(a["nombre"]), escape(a["cargo"][code])
        matricula = (f'<p class="abogado-matricula">{textos["estudio.tag_matricula"]} {escape(a["matricula"])}</p>'
                     if a.get("matricula") else "")
        tarjetas.append(
            f'<li class="abogado reveal" style="--i:{numero - 1}"><div class="abogado-foto">{_foto(a, prefijo, a["nombre"])}</div>'
            f'<h3 class="abogado-nombre">{nombre}</h3><p class="abogado-cargo">{cargo}</p>{matricula}'
            f'<button type="button" class="btn btn-secondary abogado-abrir" data-abogado="{id_}" aria-haspopup="dialog">'
            f'{textos["equipo.ver_perfil"]}</button></li>')
        parrafos = "".join(f"<p>{escape(p.strip())}</p>" for p in a["biografia"][code].split("\n\n") if p.strip())
        idiomas = (f'<p class="abogado-idiomas"><strong>{textos["equipo.tag_idiomas"]}:</strong> {escape(a["idiomas"][code])}</p>'
                   if a["idiomas"][code].strip() else "")
        linkedin = (f'<a class="abogado-linkedin" href="{escape(a["linkedin"], quote=True)}" target="_blank" rel="noopener" '
                    f'aria-label="LinkedIn: {escape(a["nombre"], quote=True)}">{ICONO_LINKEDIN}</a>' if a.get("linkedin") else "")
        pie = f'<div class="abogado-pie">{idiomas}{linkedin}</div>' if idiomas or linkedin else ""
        dialogos.append(
            f'<dialog class="abogado-dialog" id="{id_}" aria-labelledby="{id_}-nombre"><div class="abogado-dialog-body">'
            f'<button type="button" class="abogado-cerrar" aria-label="{textos["equipo.cerrar"]}">×</button>'
            f'<header class="abogado-cabecera"><div class="abogado-foto">{_foto(a, prefijo, "")}</div><div>'
            f'<h3 class="abogado-nombre" id="{id_}-nombre">{nombre}</h3><p class="abogado-cargo">{cargo}</p>{matricula}</div></header>'
            f'<div class="abogado-bio">{parrafos}</div>{pie}</div></dialog>')
    if not tarjetas:
        return ""
    return f'<ul class="equipo-grid stagger">{"".join(tarjetas)}</ul>{"".join(dialogos)}'
