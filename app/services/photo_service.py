import base64
import os
import shutil
import uuid
from app.config import PHOTOS_DIR
from PySide6.QtCore import QUrl

class PhotoService:
    def save_photo_for_point(self, point_repository, point_id, source_path):
        os.makedirs(PHOTOS_DIR, exist_ok=True)

        extension = os.path.splitext(source_path)[1]
        new_filename = f"{uuid.uuid4().hex}{extension}"
        dest_path = os.path.join(PHOTOS_DIR, new_filename)

        shutil.copy2(source_path, dest_path)

        # On stocke seulement le NOM du fichier (pas de chemin), car il est
        # toujours dans PHOTOS_DIR — ça garde le tout portable.
        point_repository.set_photo(point_id, new_filename)
        return new_filename

    def save_photo_for_point(self, point_repository, point_id, source_path):
        os.makedirs(PHOTOS_DIR, exist_ok=True)

        extension = os.path.splitext(source_path)[1]
        new_filename = f"{uuid.uuid4().hex}{extension}"
        dest_path = os.path.join(PHOTOS_DIR, new_filename)

        shutil.copy2(source_path, dest_path)
        point_repository.set_photo(point_id, new_filename)

        return QUrl.fromLocalFile(dest_path).toString()  # ← retourne maintenant l'URL, pas juste le nom

    def save_photo_from_bytes(self, point_repository, point_id, original_filename, data_url):
        os.makedirs(PHOTOS_DIR, exist_ok=True)

        # data_url ressemble à "data:image/png;base64,iVBORw0KG..."
        _, encoded = data_url.split(',', 1)
        raw_bytes = base64.b64decode(encoded)

        extension = os.path.splitext(original_filename)[1] or '.jpg'
        new_filename = f"{uuid.uuid4().hex}{extension}"
        dest_path = os.path.join(PHOTOS_DIR, new_filename)

        with open(dest_path, 'wb') as f:
            f.write(raw_bytes)

        point_repository.set_photo(point_id, new_filename)
        return QUrl.fromLocalFile(dest_path).toString()

        