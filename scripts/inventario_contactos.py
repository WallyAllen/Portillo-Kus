"""Inventario de contactos del HTML generado, sin ejecutar JS ni abrir canales.

Si se instala en scripts/, dist predeterminado es ../dist. En staging usar --dist.
Los WA data-wa con href=# se informan con su URL esperada por el JS actual.
"""
import argparse
from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit


class Contacts(HTMLParser):
    def __init__(self, page):
        super().__init__(convert_charrefs=True)
        self.page = page
        self.language = ""
        self.rows = []
        self.anchor = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html":
            self.language = attrs.get("lang", "")
        if tag != "a":
            return
        href = attrs.get("href", "") or ""
        url = urlsplit(href)
        channel = ("whatsapp" if "data-wa" in attrs or (url.hostname or "").lower() in ("wa.me", "www.wa.me")
                   else "telefono" if url.scheme.lower() == "tel"
                   else "mail" if url.scheme.lower() == "mailto" else None)
        if channel is None:
            return
        expected_event = {"whatsapp": "whatsapp_click", "telefono": "telefono_click", "mail": "mail_click"}[channel]
        missing = [key for key in ("href", "data-event", "data-button", "data-lang") if not attrs.get(key)]
        issues = []
        if attrs.get("data-event") != expected_event:
            issues.append("data-event no corresponde al canal")
        if attrs.get("data-lang") != self.language.split("-")[0]:
            issues.append("data-lang no corresponde al idioma del documento")
        if channel == "whatsapp":
            dynamic = "data-wa" in attrs
            number = attrs.get("data-wa-number", "") if dynamic else url.path.strip("/")
            message = attrs.get("data-wa-msg", "") if dynamic else parse_qs(url.query).get("text", [""])[0]
            if dynamic:
                missing.extend(key for key in ("data-wa-number", "data-wa-msg") if not attrs.get(key))
            if not number.isdecimal():
                issues.append("numero WA vacio o no numerico")
            effective = "https://wa.me/" + number + "?text=" + quote(message, safe="~()*!.'-") if dynamic else href
            resolution = "JS: data-wa" if dynamic else "HTML"
        else:
            number = unquote(url.path)
            message = parse_qs(url.query).get("body", [""])[0] if channel == "mail" else ""
            effective = href
            resolution = "HTML"
        self.anchor = {"page": self.page, "line": self.getpos()[0], "language": self.language,
                       "channel": channel, "button": attrs.get("data-button", ""), "event": attrs.get("data-event", ""),
                       "data_lang": attrs.get("data-lang", ""), "number_or_email": number,
                       "message": message, "href_html": href, "href_expected": effective,
                       "resolution": resolution, "text": "", "missing_attributes": missing, "issues": issues}
        self.rows.append(self.anchor)

    def handle_data(self, data):
        if self.anchor is not None:
            self.anchor["text"] += data

    def handle_endtag(self, tag):
        if tag == "a" and self.anchor is not None:
            self.anchor["text"] = " ".join(self.anchor["text"].split())
            self.anchor = None


def markdown(report):
    def cell(value):
        return str(value).replace("|", "\\|").replace("\n", " ")
    lines = ["# Inventario de contactos", "", "Lectura estatica de dist. URLs WA con data-wa calculadas como el JS; requieren comprobacion en navegador.",
             "No acredita titularidad o atencion de numeros y mails ni envia mensajes.", "",
             f"HTML leidos: {report['pages']}. Contactos: {len(report['contacts'])}. Filas con problemas: {report['problem_rows']}.", "",
             "| Idioma | Canal | Cantidad |", "| --- | --- | ---: |"]
    for key, count in sorted(Counter((row['language'], row['channel']) for row in report['contacts']).items()):
        lines.append(f"| {key[0]} | {key[1]} | {count} |")
    lines += ["", "| Pagina:linea | Idioma | Canal | Boton | Numero o mail | Mensaje | href HTML | Resolucion | Faltantes o problemas |",
              "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for row in report['contacts']:
        values = [f"{row['page']}:{row['line']}", row['language'], row['channel'], row['button'], row['number_or_email'],
                  row['message'], row['href_html'], row['resolution'], "; ".join(row['missing_attributes'] + row['issues']) or "ninguno"]
        lines.append("| " + " | ".join(map(cell, values)) + " |")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dist", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    files = sorted(args.dist.rglob("*.html"))
    if not files:
        parser.error(f"No hay HTML en {args.dist}")
    rows = []
    for file in files:
        reader = Contacts(file.relative_to(args.dist).as_posix())
        reader.feed(file.read_text(encoding="utf-8"))
        reader.close()
        rows.extend(reader.rows)
    report = {"dist": str(args.dist.resolve()), "pages": len(files), "contacts": rows,
              "problem_rows": sum(bool(row['missing_attributes'] or row['issues']) for row in rows)}
    output = json.dumps(report, ensure_ascii=False, indent=2) + "\n" if args.format == "json" else markdown(report)
    if args.output:
        args.output.write_text(output, encoding="utf-8")
        print(f"{len(files)} HTML; {len(rows)} contactos; {report['problem_rows']} filas con problemas; {args.output}")
    else:
        print(output, end="")
    return int(bool(report['problem_rows']))


if __name__ == "__main__":
    raise SystemExit(main())
