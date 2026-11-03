"""Overlay a thermal image on a camera photo. Same alignment JSON as the web app.

python overlay.py photo.jpg thermal.jpg --align '{"x":0.5,"y":0.5,"w":1,"rot":0}' --out out
-> out_blend.png (thermal at --alpha over photo) and out_swipe.png (left: thermal, right: photo).
"""
import argparse, json
from PIL import Image, ImageDraw


def place(photo, thermal, a):
    """Thermal resized/rotated/positioned onto a transparent layer the size of the photo."""
    W, H = photo.size
    tw = max(1, round(a["w"] * W))
    th = max(1, round(tw * thermal.height / thermal.width))
    t = thermal.convert("RGBA").resize((tw, th), Image.LANCZOS)
    t = t.rotate(-a.get("rot", 0), expand=True, resample=Image.BICUBIC)  # canvas rotates clockwise, PIL counter-clockwise
    layer = Image.new("RGBA", (W, H))
    layer.paste(t, (round(a["x"] * W - t.width / 2), round(a["y"] * H - t.height / 2)), t)
    return layer


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


def main():
    p = argparse.ArgumentParser()
    p.add_argument("photo"); p.add_argument("thermal")
    p.add_argument("--align", default='{"x":0.5,"y":0.5,"w":1,"rot":0}')
    p.add_argument("--alpha", type=float, default=0.6)
    p.add_argument("--swipe", type=float, default=0.5)
    p.add_argument("--out", default="overlay")
    a = p.parse_args()
    photo = Image.open(a.photo); thermal = Image.open(a.thermal)
    layer = place(photo, thermal, json.loads(a.align))
    blend(photo, layer, a.alpha).convert("RGB").save(a.out + "_blend.png")
    swipe(photo, layer, a.swipe).convert("RGB").save(a.out + "_swipe.png")
    print(a.out + "_blend.png", a.out + "_swipe.png")


if __name__ == "__main__":
    main()
