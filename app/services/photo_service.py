import base64
import io
import os
import re
import shutil
import uuid
from datetime import datetime
from app.config import PHOTOS_DIR
from PySide6.QtCore import QUrl

try:
    from PIL import Image, ExifTags
except ImportError:
    Image = None

def _extract_photo_date(raw_bytes):
    """Retourne la date de prise de vue (YYYY-MM-DD) depuis les EXIF, ou None."""
    if Image is None:
        print("[PhotoService] Pillow n'est pas installé : pip install pillow")
        return None
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        exif = img.getexif()
        if not exif:
            print("[PhotoService] Aucune donnée EXIF dans cette image")
            return None

        candidates = []
        try:
            exif_ifd = exif.get_ifd(0x8769)   # sous-IFD Exif (sans dépendre de ExifTags.IFD)
            candidates += [exif_ifd.get(36867), exif_ifd.get(36868)]  # DateTimeOriginal, Digitized
        except Exception:
            pass
        candidates.append(exif.get(306))      # DateTime (fallback)

        for raw in candidates:
            if not raw:
                continue
            if isinstance(raw, bytes):
                raw = raw.decode(errors="ignore")
            m = re.match(r"(\d{4}):(\d{2}):(\d{2})", raw.strip("\x00 \n"))
            if m and m.group(1) != "0000":
                return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
        print(f"[PhotoService] Aucune date trouvée dans les EXIF : {candidates}")
    except Exception as e:
        print(f"[PhotoService] Lecture EXIF impossible : {type(e).__name__}: {e}")
    return None

def cleanup_orphan_photos(point_repository):
    if not os.path.isdir(PHOTOS_DIR):
        return
    used = point_repository.list_photo_filenames()
    for filename in os.listdir(PHOTOS_DIR):
        if filename not in used:
            try:
                os.remove(os.path.join(PHOTOS_DIR, filename))
            except OSError:
                pass

class PhotoService:
    def save_photo_for_point(self, point_repository, point_id, source_path):
        os.makedirs(PHOTOS_DIR, exist_ok=True)

        extension = os.path.splitext(source_path)[1]
        new_filename = f"{uuid.uuid4().hex}{extension}"
        dest_path = os.path.join(PHOTOS_DIR, new_filename)

        shutil.copy2(source_path, dest_path)

        with open(source_path, 'rb') as f:
            photo_date = _extract_photo_date(f.read())

        point_repository.set_photo(point_id, new_filename, photo_date)
        return {
            "photo_url": QUrl.fromLocalFile(dest_path).toString(),
            "photo_date": photo_date,
        }

    def save_photo_from_bytes(self, point_repository, point_id, original_filename, data_url):
        os.makedirs(PHOTOS_DIR, exist_ok=True)

        _, encoded = data_url.split(',', 1)
        raw_bytes = base64.b64decode(encoded)

        extension = os.path.splitext(original_filename)[1] or '.jpg'
        new_filename = f"{uuid.uuid4().hex}{extension}"
        dest_path = os.path.join(PHOTOS_DIR, new_filename)

        with open(dest_path, 'wb') as f:
            f.write(raw_bytes)

        photo_date = _extract_photo_date(raw_bytes)
        point_repository.set_photo(point_id, new_filename, photo_date)
        return {
            "photo_url": QUrl.fromLocalFile(dest_path).toString(),
            "photo_date": photo_date,
        }
        