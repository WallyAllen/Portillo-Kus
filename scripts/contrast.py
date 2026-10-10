"""Contraste conservador sobre fondos renderizados, incluidas fotos/gradientes.

audit-browser.cjs exporta rectángulos de cada nodo de texto y una captura sin
relleno de texto. Se evalúan TODOS los colores de los píxeles de cada rectángulo,
no sólo el color CSS de fondo. El mínimo exige revisión si cae debajo de AA.
"""
import argparse
import csv
import json
from pathlib import Path
import re
from PIL import Image


def luminance(rgb):
    channels = [value / 255 for value in rgb]
    return sum(weight * (value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4)
               for value, weight in zip(channels, (.2126, .7152, .0722)))


def ratio(front, back):
    bright, dark = sorted((luminance(front), luminance(back)), reverse=True)
    return (bright + .05) / (dark + .05)


def inspect(input_path):
    audit = json.loads(input_path.read_text(encoding='utf-8'))
    image = Image.open(input_path.parent / audit['background_screenshot']).convert('RGB')
    records = []
    for text in audit['text']:
        channels = [float(number) for number in re.findall(r'[\d.]+', text['color'])]
        if len(channels) < 3:
            raise ValueError(f"Color sin resolver: {text['color']}")
        alpha = (channels[3] if len(channels) == 4 else 1) * text['opacity']
        threshold = 3 if text['fontSize'] >= 24 or (text['fontSize'] >= 18.666 and text['fontWeight'] >= 700) else 4.5
        colors = set()
        for rect in text['rects']:
            # Rango de texto; redondeo hacia dentro excluye borde ajeno al glifo.
            box = (max(0, int(rect['x'] + 1)), max(0, int(rect['y'] + 1)),
                   min(image.width, int(rect['x'] + rect['width'] - 1)),
                   min(image.height, int(rect['y'] + rect['height'] - 1)))
            if box[2] > box[0] and box[3] > box[1]:
                crop = image.crop(box)
                colors.update(color for _, color in crop.getcolors(crop.width * crop.height))
        if not colors:
            continue
        worst = min(colors, key=lambda back: ratio(
            tuple(channels[index] * alpha + back[index] * (1 - alpha) for index in range(3)), back))
        contrast = ratio(tuple(channels[index] * alpha + worst[index] * (1 - alpha)
                               for index in range(3)), worst)
        records.append({**text, 'background_worst': worst, 'contrast': round(contrast,3),
                        'threshold': threshold, 'pass': contrast >= threshold})
    output = input_path.with_name(input_path.stem + '-contrast.json')
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    combinations = sorted(set((item['color'], str(item['background_worst']), item['threshold'],
                               item['contrast'], item['pass']) for item in records))
    with output.with_suffix('.csv').open('w', encoding='utf-8', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(('texto_rgb', 'fondo_rgb_peor', 'umbral', 'ratio', 'cumple'))
        writer.writerows(combinations)
    failures = [item for item in records if not item['pass']]
    print(json.dumps({'file': str(input_path), 'text_nodes': len(records),
                      'combinations': len(combinations), 'failures': len(failures),
                      'details': [{'selector': item['selector'], 'text': item['text'],
                                   'contrast': item['contrast'], 'threshold': item['threshold']}
                                  for item in failures]}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reports', type=Path, nargs='+')
    args = parser.parse_args()
    for report in args.reports:
        inspect(report)


if __name__ == '__main__':
    main()
