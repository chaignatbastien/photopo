import os
import xml.etree.ElementTree as ET

GPX_NAMESPACE = "http://www.topografix.com/GPX/1/1"
NS = {"gpx": GPX_NAMESPACE}


class GpxService:
    def parse_gpx(self, file_path):
        """Retourne {"name": str, "geometry": [[lon, lat], [lon, lat, ele], ...]}."""
        tree = ET.parse(file_path)
        root = tree.getroot()

        name_el = root.find("gpx:metadata/gpx:name", NS)
        if name_el is None:
            name_el = root.find("gpx:trk/gpx:name", NS)
        if name_el is not None and name_el.text and name_el.text.strip():
            name = name_el.text.strip()
        else:
            name = os.path.splitext(os.path.basename(file_path))[0]

        geometry = []

        # Priorité à une trace GPS (trk/trkseg/trkpt) — c'est le format
        # utilisé par Swisstopo et la plupart des enregistrements GPS.
        for trkpt in root.findall("gpx:trk/gpx:trkseg/gpx:trkpt", NS):
            geometry.append(self._point_from_el(trkpt))

        # Sinon, un itinéraire (rte/rtept)
        if not geometry:
            for rtept in root.findall("gpx:rte/gpx:rtept", NS):
                geometry.append(self._point_from_el(rtept))

        # En dernier recours, une simple liste de waypoints (wpt)
        if not geometry:
            for wpt in root.findall("gpx:wpt", NS):
                geometry.append(self._point_from_el(wpt))

        return {"name": name, "geometry": geometry}

    def _point_from_el(self, point_el):
        lat = float(point_el.get("lat"))
        lon = float(point_el.get("lon"))
        ele_el = point_el.find("gpx:ele", NS)
        if ele_el is not None and ele_el.text:
            try:
                return [lon, lat, float(ele_el.text)]
            except ValueError:
                pass
        return [lon, lat]

    def export_gpx(self, file_path, name, geometry):
        gpx = ET.Element("gpx", {
            "version": "1.1",
            "creator": "Itinéraires",
            "xmlns": GPX_NAMESPACE,
        })
        trk = ET.SubElement(gpx, "trk")
        ET.SubElement(trk, "name").text = name
        trkseg = ET.SubElement(trk, "trkseg")

        for coord in geometry:
            lon, lat = coord[0], coord[1]
            trkpt = ET.SubElement(trkseg, "trkpt", {"lat": repr(lat), "lon": repr(lon)})
            if len(coord) > 2 and coord[2] is not None:
                ET.SubElement(trkpt, "ele").text = str(coord[2])

        tree = ET.ElementTree(gpx)
        try:
            ET.indent(tree, space="  ")  # jolie mise en forme (Python 3.9+)
        except AttributeError:
            pass
        tree.write(file_path, encoding="utf-8", xml_declaration=True)
