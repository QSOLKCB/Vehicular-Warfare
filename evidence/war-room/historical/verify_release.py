"""Re-execute the v0.3.0 browser evidence with a packaged build in Chromium."""
import argparse
import gzip
import hashlib
import html.parser
import http.server
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path)
parser.add_argument("--chromium", default="google-chrome")
args = parser.parse_args()
release = "5c3088953f983fadb2fade5f360de24f2d30cd2d"
catalogue = "evidence/tactical-display/browser"
items = {}


def visit(value, file, location=""):
    if isinstance(value, dict):
        if {"commands", "source", "stateHash", "eventHash"} <= value.keys():
            key = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
            items.setdefault(key, {"receipt": value, "locations": []})["locations"].append([file, location])
            return
        children = value.items()
    elif isinstance(value, list):
        children = enumerate(value)
    else:
        return
    for k, child in children:
        visit(child, file, f"{location}/{k}")


for file in subprocess.check_output(["git", "ls-tree", "-r", "--name-only", release, catalogue], text=True).splitlines():
    if file.endswith(".json.gz"):
        visit(json.loads(gzip.decompress(subprocess.check_output(["git", "show", f"{release}:{file}"]))), file)


class QuietServer(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class ResultParser(html.parser.HTMLParser):
    def handle_data(self, data):
        if data.startswith('{"verified":'):
            self.report = json.loads(data)


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    with zipfile.ZipFile(args.archive) as z:
        revision = z.comment.decode()
        z.extractall(tmp)
    recordings = list(items.values())
    (root / "recordings.json").write_text(json.dumps([item["receipt"] for item in recordings]))
    (root / "index.html").write_text("""<!doctype html><meta charset=utf-8><pre></pre><script type=module>
const families = {cutbank:['tank-world','Tank','tankReceipt'], glassworks:['mech-world','Mech','mechReceipt'],
  lantern:['naval-world','Naval','navalReceipt'],breakwater:['combined-world','Combined','combinedReceipt'],
  workshop:['creator','Creator','creatorReceipt']};
const verified=[];
try {
  for (const input of await (await fetch('./recordings.json')).json()) {
    const [file,suffix,save]=families[input.mission] || ['world','','receipt'];
    const api=await import('./Vehicular-Warfare/sim/'+file+'.js');
    const world=api['replay'+suffix](JSON.stringify(input)), receipt=api[save](world);
    if(!Object.keys(input).every(k=>JSON.stringify(receipt[k])===JSON.stringify(input[k])) ||
        Object.keys(receipt).length!==Object.keys(input).length)throw Error('receipt mismatch');
    verified.push({mission:input.mission||'sable',ticks:input.ticks,stateHash:receipt.stateHash,
                  eventHash:receipt.eventHash,status:world.status});
  }
  document.querySelector('pre').textContent=JSON.stringify({verified});
} catch(error) { document.querySelector('pre').textContent=error.stack; }
</script>""")
    def serve(*a, **kw):
        return QuietServer(*a, directory=tmp, **kw)
    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), serve) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_address[1]}/"
        cmd = [args.chromium, "--headless=new", "--disable-gpu", "--disable-background-networking",
               "--no-first-run", f"--user-data-dir={root / 'profile'}", "--virtual-time-budget=60000", "--dump-dom", url]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=120)
        server.shutdown()
    dom = ResultParser()
    dom.feed(result.stdout)
    if not hasattr(dom, "report"):
        raise RuntimeError(result.stdout[:3500])
    verified = dom.report["verified"]
    assert len(verified) == len(recordings) > 0
    for info, expected in zip(verified, recordings):
        info["locations"] = expected["locations"]
    print(json.dumps({"release": release, "runtime": revision, "zipSha256":hashlib.sha256(args.archive.read_bytes()).hexdigest(),
                      "browser":subprocess.check_output([args.chromium, "--version"], text=True).strip(),
                      "distinct":len(verified),"occurrences":sum(len(i['locations']) for i in recordings),
                      "verified":verified}, indent=1))
