"""Medición opcional y validación de botones; sin datos personales."""
from html.parser import HTMLParser
import json
import re
from urllib.parse import urlsplit

EVENTS = ("whatsapp_click", "telefono_click", "mail_click", "mapa_click", "como_llegar_click")
BUTTONS = (
    "cabecera", "menu-movil", "portada", "necesidad-ciudadania",
    "necesidad-residencia", "necesidad-expulsion", "ciudadania",
    "area-laboral", "area-familia", "area-penal", "area-sucesiones",
    "area-danos", "area-consumidor", "area-empresas", "area-ciudadania-europea",
    "area-escribania", "proceso", "exterior", "contacto", "contacto-oficina-1",
    "contacto-oficina-2", "contacto-mapa", "contacto-como-llegar", "barra-movil", "privacidad", "pagina-404",
)
TOPICS = (
    "ciudadania", "residencia", "expulsion", "escribania", "laboral", "familia", "penal",
    "sucesiones", "danos", "consumidor", "empresas", "ciudadania-europea",
)


def analytics_fields(lang, website_id=None):
    """No ID / blanco: no se agrega script ni conexiones externas de Umami."""
    website_id = (website_id or "").strip()
    if website_id and not re.fullmatch(
        r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}", website_id
    ):
        raise ValueError("UMAMI_ID debe ser el UUID real del sitio de Umami Cloud, o quedar vacío.")
    script = ""
    if website_id:
        script = (
            '<script defer src="https://cloud.umami.is/script.js" '
            f'data-website-id="{website_id}" data-exclude-search="true" '
            'data-exclude-hash="true" data-do-not-track="true"></script>'
        )
    config = json.dumps({"events": EVENTS, "buttons": BUTTONS, "topics": TOPICS},
                        separators=(",", ":"))
    listener = ""
    if website_id:
        listener = '''<script>
(function(){
  "use strict";
  var allowed = __CONFIG__;
  // Un único listener: no usar data-umami-event en paralelo.
  document.addEventListener('click', function(event){
    var target = event.target;
    var button = target && target.closest ? target.closest('[data-event]') : null;
    if (!button || !window.umami || typeof window.umami.track !== 'function') return;
    var name = button.getAttribute('data-event');
    var id = button.getAttribute('data-button');
    var lang = button.getAttribute('data-lang');
    var pageLang = document.documentElement.lang.split('-')[0];
    if (allowed.events.indexOf(name) < 0 || allowed.buttons.indexOf(id) < 0 || lang !== pageLang) return;
    var props = { idioma: lang, boton: id };
    var topic = button.getAttribute('data-topic');
    if (allowed.topics.indexOf(topic) >= 0) props.tema = topic;
    // Nunca enviar href, mensaje de WhatsApp, texto, teléfono, mail o datos libres.
    try {
      var request = window.umami.track(name, props);
      if (request && typeof request.catch === 'function') request.catch(function(){});
    } catch (error) { /* La medición no debe bloquear el contacto. */ }
  });
})();
</script>'''.replace('__CONFIG__', config)
    return {
        "analytics_script": script,
        "analytics_listener": listener,
        "analytics_lang": lang,
    }


class AnalyticsValidator(HTMLParser):
    def __init__(self, lang):
        super().__init__()
        self.lang = lang
        self.errors = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        line = self.getpos()[0]
        if any(key.startswith("data-umami-event") for key in attrs):
            self.errors.append(f"línea {line}: usar solo data-event; data-umami-event duplica eventos")
        href = (attrs.get("href") or "").strip()
        url = urlsplit(href)
        expected = None
        if "data-wa" in attrs or (url.hostname or "").lower() in ("wa.me", "www.wa.me"):
            expected = "whatsapp_click"
        elif url.scheme.lower() == "tel":
            expected = "telefono_click"
        elif url.scheme.lower() == "mailto":
            expected = "mail_click"
        if expected is None and "data-event" not in attrs:
            return
        event = attrs.get("data-event")
        problems = []
        if event not in EVENTS or (expected and event != expected):
            problems.append(f"data-event debe ser {expected or 'un evento previsto'}")
        if attrs.get("data-button") not in BUTTONS:
            problems.append("data-button debe ser un identificador previsto")
        if attrs.get("data-lang") != self.lang:
            problems.append(f"data-lang debe ser {self.lang}")
        if "data-topic" in attrs and attrs["data-topic"] not in TOPICS:
            problems.append("data-topic debe ser un tema previsto")
        if problems:
            self.errors.append(f"línea {line}: {'; '.join(problems)}")


def validate_analytics(markup, lang):
    """Se aplica también a páginas secundarias, incluida la de privacidad."""
    parser = AnalyticsValidator(lang)
    parser.feed(markup)
    if parser.errors:
        raise ValueError(f"Medición inválida ({lang}):\n" + "\n".join(parser.errors))
