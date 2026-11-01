import json, os, urllib.request

out = os.path.dirname(os.path.abspath(__file__))
headers = {"User-Agent": "fly-band/1.0"}

def get(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

assets = [
    "concrete_floor_02",
    "plastered_wall_01",
    "fabric_pattern_07",
    "wood_floor_deck",
    "terrazzo_tiles",
]
got = []
for name in assets:
    data = json.loads(get("https://api.polyhaven.com/files/" + name))
    tree = data["Diffuse"]
    url = tree["1k"]["jpg"]["url"]
    dest = os.path.join(out, name + "_diff_1k.jpg")
    open(dest, "wb").write(get(url))
    got.append((name, os.path.getsize(dest)))

hdri = json.loads(get("https://api.polyhaven.com/files/kloofendal_48d_partly_cloudy_puresky"))
url = hdri["hdri"]["1k"]["hdr"]["url"]
dest = os.path.join(out, "sky_1k.hdr")
open(dest, "wb").write(get(url))
got.append(("sky_1k.hdr", os.path.getsize(dest)))
print(got)
