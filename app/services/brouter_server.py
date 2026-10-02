import glob
import os
import socket
import subprocess
import time
from app.config import APP_DIR

BROUTER_DIR = os.path.join(APP_DIR, "brouter")
PORT = 17777


class BRouterServer:
    def __init__(self):
        self._proc = None

    def _java(self):
        name = "java.exe" if os.name == "nt" else "java"
        bundled = os.path.join(BROUTER_DIR, "jre", "bin", name)
        return bundled if os.path.isfile(bundled) else "java"

    def _jar(self):
        jars = glob.glob(os.path.join(BROUTER_DIR, "brouter-*-all.jar"))
        return jars[0] if jars else None

    def is_running(self):
        with socket.socket() as s:
            s.settimeout(0.3)
            return s.connect_ex(("localhost", PORT)) == 0

    def start(self):
        if self.is_running():
            return True
        jar = self._jar()
        if jar is None:
            print(f"[BRouter] Aucun brouter-*-all.jar dans {BROUTER_DIR}")
            return False
        os.makedirs(os.path.join(BROUTER_DIR, "customprofiles"), exist_ok=True)
        cmd = [
            self._java(), "-Xmx256M", "-Xms128M", "-Xmn32M", "-DmaxRunningTime=300",
            "-cp", jar,
            "btools.server.RouteServer",
            os.path.join(BROUTER_DIR, "segments4"),
            os.path.join(BROUTER_DIR, "profiles2"),
            os.path.join(BROUTER_DIR, "customprofiles"),
            str(PORT), "1", "localhost",
        ]
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        log = open(os.path.join(BROUTER_DIR, "brouter.log"), "w")
        try:
            self._proc = subprocess.Popen(
                cmd, cwd=BROUTER_DIR, creationflags=flags,
                stdout=log, stderr=subprocess.STDOUT,
            )
        except (FileNotFoundError, OSError) as e:
            print(f"[BRouter] Lancement impossible : {e}")
            return False
        for _ in range(75):  # attend jusqu'à ~15 s
            if self._proc.poll() is not None:
                print("[BRouter] Le serveur s'est arrêté, voir brouter/brouter.log")
                return False
            if self.is_running():
                return True
            time.sleep(0.2)
        return False

    def stop(self):
        if self._proc:
            self._proc.terminate()
            self._proc = None