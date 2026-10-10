"""Reglas de Pages: caché de assets independiente del HTML generado."""
def write_files(dist, source, langs, path_for):
    rules = source.rstrip() + '\n'
    routes = sorted({'/' + path_for(lang, page).lstrip('/') for lang in langs for page in ('home', 'privacy')})
    for route in ('/*.html', *routes):
        rules += f'\n{route}\n  Cache-Control: public, max-age=0, must-revalidate\n'
    (dist / '_headers').write_text(rules, encoding='utf-8')
