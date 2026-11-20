"""Generate display variants from the checked-in originals (Pillow required).

Development-only asset preparation; production builds use the generated WebP
files directly and do not need Python or runtime image transformation.
"""
from pathlib import Path
from PIL import Image

directory = Path(__file__).resolve().parents[1] / "public" / "technical-services"
for name in ("zhangwei", "lina", "wangqiang"):
    with Image.open(directory / f"provider-{name}-v1.png") as original:
        for variant, width in (("card", 216), ("portrait", 640)):
            image = original.convert("RGB")
            image.thumbnail((width, width), Image.Resampling.LANCZOS)
            image.save(directory / f"provider-{name}-{variant}-v2.webp", "WEBP", quality=85, method=6)

with Image.open(directory / "ai-technical-service-hero-v1.png") as original:
    # The banner spans a wide desktop layout. Retain original resolution/alpha.
    original.save(directory / "ai-technical-service-hero-v2.webp", "WEBP", quality=85, method=6)

for file in sorted(directory.glob("*-v2.webp")):
    print(file.name, file.stat().st_size)
