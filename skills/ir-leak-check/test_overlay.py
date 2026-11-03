from PIL import Image
from overlay import place, blend, swipe, checker, default_h


def test_full_cover_blend_swipe_checker():
    photo = Image.new("RGB", (100, 50), "black")
    thermal = Image.new("RGB", (10, 5), (200, 0, 0))
    layer = place(photo, thermal, default_h(10, 5, 100, 50))  # same aspect: covers the whole photo
    assert blend(photo, layer, 0.5).getpixel((50, 25))[0] in (99, 100, 101)
    s = swipe(photo, layer, 0.5)
    assert s.getpixel((10, 25))[:3] == (200, 0, 0) and s.getpixel((90, 25))[:3] == (0, 0, 0)
    c = checker(photo, layer)  # 8 columns of 12.5 px: first square photo, second thermal
    assert c.getpixel((5, 5))[:3] == (0, 0, 0) and c.getpixel((18, 5))[:3] == (200, 0, 0)


def test_perspective_matches_js_convention():
    # H shifts thermal to the right half of the photo: x = 0.5 + 0.5u, y = v
    photo = Image.new("RGB", (100, 50), "black")
    layer = place(photo, Image.new("RGB", (20, 10), "red"), [0.5, 0, 0.5, 0, 1, 0, 0, 0, 1])
    assert layer.getpixel((25, 25))[3] == 0 and layer.getpixel((75, 25))[:3] == (255, 0, 0)


if __name__ == "__main__":
    test_full_cover_blend_swipe_checker(); test_perspective_matches_js_convention(); print("overlay: all ok")
