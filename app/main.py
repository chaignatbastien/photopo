import os
os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--no-sandbox"

import sys
from PySide6.QtWidgets import QApplication, QMainWindow
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtCore import QUrl
from PySide6.QtWebEngineCore import QWebEngineSettings

from app.api import Api

def get_frontend_path():
    # Gère aussi bien l'exécution normale (uv run) que l'exécutable PyInstaller
    if getattr(sys, "frozen", False):
        base_path = os.path.dirname(sys.executable)
    else:
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, "frontend", "index.html")


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Itinéraires")
        self.resize(1200, 800)

        self.browser = QWebEngineView()
        self.setCentralWidget(self.browser)

        settings = self.browser.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)

        # Pont Python <-> JS : on enregistre notre objet Api sous le nom "api",
        # il sera accessible côté JS via window.api (voir map.js plus tard)
        self.channel = QWebChannel()
        self.api = Api()
        self.channel.registerObject("api", self.api)
        self.browser.page().setWebChannel(self.channel)

        self.browser.load(QUrl.fromLocalFile(get_frontend_path()))


def main():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()