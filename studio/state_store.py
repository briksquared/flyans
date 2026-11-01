"""Atomic world checkpoints and a separate, GET-only spectator server."""
from __future__ import annotations
import json
import re
import os
from pathlib import Path
import secrets
import shutil
import threading
import time
from http.server import SimpleHTTPRequestHandler
from urllib.parse import unquote, urlsplit

STUDIO = Path(__file__).resolve().parent
if os.environ.get('FLIES_STATE_DIR'):
    STATE_DIR = Path(os.environ['FLIES_STATE_DIR'])
elif os.environ.get('FLIES_DATA'):
    STATE_DIR = Path(os.environ['FLIES_DATA']) / 'world'
else:
    _local = os.environ.get('LOCALAPPDATA') or str(Path.home() / 'AppData' / 'Local')
    STATE_DIR = Path(_local) / 'FLYANS' / 'world'
LOCK = threading.RLock()
TOKEN = secrets.token_urlsafe(32)
WRITER = {'id': '', 'until': 0.0}
MAX_STATE = 32_000_000  # world JSON is ~8.5 MB and growing; keep well above the real payload so saves never get rejected


def load_state():
    with LOCK:
        for name in ('latest.json', 'previous.json'):
            try:
                data = json.loads((STATE_DIR / name).read_text(encoding='utf-8'))
                validate(data)
                return data
            except (OSError, ValueError, TypeError, KeyError):
                continue
    return None


def validate(data):
    if not isinstance(data, dict) or data.get('version') != 1:
        raise ValueError('unsupported checkpoint')
    for key in ('shells', 'crew', 'props'):
        if not isinstance(data.get(key), list) or len(data[key]) > 25000:
            raise ValueError('invalid ' + key)
    if not data['shells'] or not data['crew']:
        raise ValueError('world is not ready')
    json.dumps(data, allow_nan=False)


def save_state(data):
    validate(data)
    with LOCK:
        current = load_state()
        if current and data.get('worldEpoch', 0) < current.get('worldEpoch', 0):
            raise ValueError('A saved version was restored. Reload this tab before saving.')
        if current and data.get('layoutRevision', 0) < current.get('layoutRevision', 0):
            raise ValueError('This page uses an older world layout. Reload the updated studio before saving.')
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        data['savedAt'] = time.time()
        raw = json.dumps(data, allow_nan=False, separators=(',', ':')).encode()
        if len(raw) > MAX_STATE:
            raise ValueError('checkpoint too large')
        target = STATE_DIR / 'latest.json'
        temporary = STATE_DIR / 'latest.tmp'
        with temporary.open('wb') as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        if target.exists():
            shutil.copy2(target, STATE_DIR / 'previous.json')
        os.replace(temporary, target)
        archive = STATE_DIR / (time.strftime('%Y-%m-%d_%H') + '.json')
        if not archive.exists():
            shutil.copy2(target, archive)
        return data['savedAt']


def snapshot_state(data, label):
    validate(data)
    folder = STATE_DIR / 'versions'
    folder.mkdir(parents=True, exist_ok=True)
    key = str(time.time_ns()) + '-' + secrets.token_hex(3)
    payload = {'id': key, 'label': str(label or 'Manual snapshot')[:80], 'createdAt': time.time(), 'state': data}
    target = folder / (key + '.json')
    temporary = target.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8') as handle:
        json.dump(payload, handle, allow_nan=False)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, target)
    return key


def read_snapshot(key):
    if not re.fullmatch(r'[0-9]+-[0-9a-f]{6}', key):
        raise ValueError('Invalid version')
    payload = json.loads((STATE_DIR / 'versions' / (key + '.json')).read_text(encoding='utf-8'))
    validate(payload['state'])
    return payload


def list_snapshots():
    result = []
    for path in (STATE_DIR / 'versions').glob('*.json'):
        try:
            item = read_snapshot(path.stem)
            state = item.pop('state')
            item.update(flies=len(state['crew']), homes=sum(isinstance(s, dict) and s.get('use') == 'bed' for s in state['shells']), layout=state.get('layoutRevision', 1))
            result.append(item)
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            continue
    return sorted(result, key=lambda item: item['createdAt'], reverse=True)


def send_json(handler, value, status=200):
    payload = json.dumps(value, allow_nan=False).encode()
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Cache-Control', 'no-store')
    handler.send_header('X-Content-Type-Options', 'nosniff')
    handler.send_header('Content-Length', str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class OwnerStateMixin:
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/session':
            if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
                self.send_error(403)
                return
            send_json(self, {'token': TOKEN})
        elif path == '/versions':
            send_json(self, list_snapshots())
        elif path == '/state':
            send_json(self, load_state())
        else:
            super().do_GET()

    def accept_state(self):
        # Read (drain) the whole request body FIRST, before any auth/size check can respond. Replying
        # while ~8.5 MB of upload is still in the socket makes the OS send a TCP RST, which the browser
        # reports as ERR_CONNECTION_RESET. Draining first keeps the connection clean on every path.
        length = int(self.headers.get('Content-Length', 0) or 0)
        hard_cap = MAX_STATE + 8_000_000
        body = b''
        try:
            if 0 < length <= hard_cap:
                body = self.rfile.read(length)
            elif length > hard_cap:
                remaining = length
                while remaining > 0:
                    chunk = self.rfile.read(min(remaining, 1_000_000))
                    if not chunk:
                        break
                    remaining -= len(chunk)
        except (ConnectionError, OSError):
            return  # client vanished mid-upload; nothing left to answer
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        if host not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}') or (origin and origin != 'http://' + host) or not secrets.compare_digest(self.headers.get('X-Flies-Owner', ''), TOKEN):
            self.send_error(403)
            return
        try:
            if not 0 < length <= MAX_STATE:
                raise ValueError('invalid size')
            data = json.loads(body)
            writer = self.headers.get('X-Flies-Session', '')
            if not writer:
                raise ValueError('missing writer')
            with LOCK:
                if WRITER['id'] != writer and WRITER['until'] > time.monotonic():
                    send_json(self, {'error': 'Another owner tab is saving this world'}, 409)
                    return
                path = urlsplit(self.path).path
                if path == '/versions':
                    stamp = save_state(data['state'])
                    key = snapshot_state(load_state(), data.get('label'))
                    WRITER.update(id=writer, until=time.monotonic() + 12)
                    send_json(self, {'id': key, 'savedAt': stamp})
                    return
                if path == '/restore-version':
                    restored = read_snapshot(data.get('id', ''))['state']
                    current = load_state()
                    if current and restored.get('layoutRevision', 0) < current.get('layoutRevision', 0):
                        raise ValueError('This version requires an older layout and cannot replace the current world.')
                    backup = snapshot_state(current, 'Before restore — automatic backup') if current else None
                    restored['worldEpoch'] = (current or {}).get('worldEpoch', 0) + 1
                    stamp = save_state(restored)
                    WRITER.update(id='', until=0)
                    send_json(self, {'savedAt': stamp, 'backup': backup})
                    return
                stamp = save_state(data)
                WRITER.update(id=writer, until=time.monotonic() + 12)
            send_json(self, {'savedAt': stamp})
        except (ConnectionError, BrokenPipeError):
            return  # client disconnected mid-response; don't try to write to a dead socket
        except (ValueError, TypeError, KeyError) as exc:
            send_json(self, {'error': str(exc)}, 400)
        except OSError:
            send_json(self, {'error': 'Disk checkpoint failed'}, 500)


class SpectatorHandler(SimpleHTTPRequestHandler):
    """Never proxy to the owner server. No write routes or arbitrary files."""
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == '/state':
            data = load_state()
            if data:
                data = dict(data)
                data.pop('ui', None)
                data.pop('desk', None)
            send_json(self, data)
            return
        if path in ('/', '/index.html'):
            html = (STUDIO / 'index.html').read_text(encoding='utf-8')
            html = html.replace('<head>', '<head><script>window.FLIES_READ_ONLY=true;</script>')
            html = html.replace('<title>The studio</title>', '<title>Flies · spectator</title>')
            raw = html.encode()
            mime = 'text/html; charset=utf-8'
        else:
            relative = path.lstrip('/')
            allowed = {'maya-city.js', 'brain-view.js', 'community.js', 'community-runtime.js', 'persistence.js', 'observatory.css', 'brains.json'}
            # 'vendor/' holds the locally-vendored THREE.js (build + examples/jsm). Without it in the
            # whitelist the spectator view 404s on the engine and renders BLACK. (Owner server serves
            # all files, so this only ever affected the spectator :8777.)
            if relative not in allowed and not relative.startswith(('nmf/', 'models/', 'tex/', 'vendor/')):
                self.send_error(404)
                return
            target = (STUDIO / relative).resolve()
            roots = [(STUDIO / 'nmf').resolve(), (STUDIO / 'models').resolve(), (STUDIO / 'tex').resolve(), (STUDIO / 'vendor').resolve()]
            valid = target.parent == STUDIO and relative in allowed
            valid = valid or any(target.is_relative_to(root) for root in roots)
            if not valid or not target.is_file() or target.suffix.lower() not in {'.js','.css','.json','.stl','.obj','.mtl','.jpg','.png','.hdr'}:
                self.send_error(404)
                return
            raw = target.read_bytes()
            mime = self.guess_type(str(target))
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        self.send_error(405, 'Spectator access is read-only')

    do_PUT = do_POST
    do_PATCH = do_POST
    do_DELETE = do_POST
    do_HEAD = do_POST

    def log_message(self, *_args):
        pass
