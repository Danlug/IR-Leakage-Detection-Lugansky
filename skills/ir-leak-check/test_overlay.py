from PIL import Image
from overlay import place, blend, swipe


def test_blend_and_swipe():
    photo = Image.new("RGB", (100, 50), "black")
    thermal = Image.new("RGB", (10, 5), (200, 0, 0))
    layer = place(photo, thermal, {"x": 0.5, "y": 0.5, "w": 1, "rot": 0})  # covers the whole photo
    assert blend(photo, layer, 0.5).getpixel((50, 25))[0] in (99, 100, 101)
    s = swipe(photo, layer, 0.5)
    assert s.getpixel((10, 25))[:3] == (200, 0, 0)   # left of divider: thermal
    assert s.getpixel((90, 25))[:3] == (0, 0, 0)     # right: photo


def test_offset_outside_leaves_photo():
    photo = Image.new("RGB", (100, 50), "black")
    layer = place(photo, Image.new("RGB", (10, 5), "red"), {"x": 2, "y": 2, "w": 0.2, "rot": 0})
    assert blend(photo, layer, 1).getpixel((50, 25))[:3] == (0, 0, 0)
