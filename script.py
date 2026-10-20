from PIL import Image
import sys
exif = Image.open(sys.argv[1]).getexif()
print("IFD0:", dict(exif))
print("Exif IFD:", dict(exif.get_ifd(0x8769)))