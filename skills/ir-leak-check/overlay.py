"""Overlay a thermal image on a camera photo, using the alignment JSON copied from the web app.

python overlay.py photo.jpg thermal.jpg --align '{"H":[...9 numbers...]}' --out out
-> out_blend.png (thermal at --alpha over photo), out_swipe.png (left thermal, right photo), out_checker.png.
H maps thermal (u,v in 0..1) to photo (x,y in 0..1), same as align-core.js.
"""
import argparse, json
from PIL import Image, ImageDraw


def inv3(m):
    a, b, c, d, e, f, g, h, i = m
    r = [e * i - f * h, c * h - b * i, b * f - c * e,
         f * g - d * i, a * i - c * g, c * d - a * f,
         d * h - e * g, b * g - a * h, a * e - b * d]
    det = a * r[0] + b * r[3] + c * r[6]
    return [x / det for x in r]


def mul3(A, B):
    return [sum(A[3 * r + k] * B[3 * k + c] for k in range(3)) for r in range(3) for c in range(3)]


def default_h(tw, th, pw, ph):
    k = (pw / ph) / (tw / th)
    return [1, 0, 0, 0, k, 0.5 - 0.5 * k, 0, 0, 1]


def place(photo, thermal, H):
    """Thermal warped onto a transparent layer the size of the photo."""
    W, Hh = photo.size
    # PIL wants output pixel -> input pixel: diag(tw,th) · H⁻¹ · diag(1/W,1/H)
    M = mul3(mul3([thermal.width, 0, 0, 0, thermal.height, 0, 0, 0, 1], inv3(H)), [1 / W, 0, 0, 0, 1 / Hh, 0, 0, 0, 1])
    M = [v / M[8] for v in M]
    return thermal.convert("RGBA").transform((W, Hh), Image.PERSPECTIVE, M[:8], Image.BILINEAR)


def blend(photo, layer, alpha):
    layer = layer.copy()
    layer.putalpha(layer.getchannel("A").point(lambda v: round(v * alpha)))
    return Image.alpha_composite(photo.convert("RGBA"), layer)


def swipe(photo, layer, pos):
    out = photo.convert("RGBA")
    x = round(pos * photo.width)
    out.alpha_composite(layer.crop((0, 0, x, photo.height)), (0, 0))
    ImageDraw.Draw(out).rectangle((x - 2, 0, x + 1, photo.height), fill="white")
    return out


def checker(photo, layer, n=8):
    out = photo.convert("RGBA")
    s = photo.width / n
    mask = Image.new("L", photo.size)
    d = ImageDraw.Draw(mask)
    for i in range(n):
        for j in range(int(photo.height / s) + 1):
            if (i + j) % 2:
                d.rectangle((round(i * s), round(j * s), round((i + 1) * s) - 1, round((j + 1) * s) - 1), fill=255)
    masked = layer.copy()
    masked.putalpha(Image.composite(layer.getchannel("A"), Image.new("L", photo.size), mask))
    return Image.alpha_composite(out, masked)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("photo"); p.add_argument("thermal")
    p.add_argument("--align", help='{"H":[...]} from the web app; default: thermal as wide as the photo, centred')
    p.add_argument("--alpha", type=float, default=0.6)
    p.add_argument("--swipe", type=float, default=0.5)
    p.add_argument("--out", default="overlay")
    a = p.parse_args()
    photo = Image.open(a.photo); thermal = Image.open(a.thermal)
    H = json.loads(a.align)["H"] if a.align else default_h(*thermal.size, *photo.size)
    layer = place(photo, thermal, H)
    outs = {"blend": blend(photo, layer, a.alpha), "swipe": swipe(photo, layer, a.swipe), "checker": checker(photo, layer)}
    for k, img in outs.items():
        img.convert("RGB").save(f"{a.out}_{k}.png")
    print(*(f"{a.out}_{k}.png" for k in outs))


if __name__ == "__main__":
    main()
