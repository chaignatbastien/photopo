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