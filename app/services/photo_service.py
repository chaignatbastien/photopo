import base64
import io
import os
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
    """Retourne la date de prise de vue (YYYY-MM-DD) depuis les EXIF, ou None si absente."""
    if Image is None:
        return None
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        exif = img.getexif()
        if not exif:
            return None

        raw_date = exif.get(306)  # tag "DateTime" générique (fallback)

        # "DateTimeOriginal" (date réelle de prise de vue) vit dans le
        # sous-IFD Exif, pas dans les tags de premier niveau.
        try:
            exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
            raw_date = exif_ifd.get(36867) or raw_date
        except Exception:
            pass

        if not raw_date:
            return None
        dt = datetime.strptime(raw_date.strip(), "%Y:%m:%d %H:%M:%S")
        return dt.date().isoformat()
    except Exception:
        return None


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
        