import os
os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--no-sandbox"

import sys
from PySide6.QtWidgets import QApplication
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtCore import QUrl

app = QApplication(sys.argv)
view = QWebEngineView()
view.load(QUrl("https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/21781/20/58/70.jpeg"))
view.show()
sys.exit(app.exec())