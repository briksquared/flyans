"""Serve the studio and save a take to the desktop.

Bind is localhost only. Files land in Desktop/fly-band-videos as an mp4
plus a chapter list for a YouTube description.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import threading
from datetime import datetime
from email import message_from_bytes
from email.policy import default
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from state_store import OwnerStateMixin, SpectatorHandler

HOST = "127.0.0.1"
PORT = int(os.environ.get("FLIES_OWNER_PORT", "8776"))
STUDIO = Path(__file__).resolve().parent


def _colony_write_root() -> Path:
    """Per-user writable tree for worlds, logs and recordings.

    Honors FLIES_DATA (set by FLYANS); otherwise %LOCALAPPDATA%\\FLYANS\\colony.
    Never writes into the read-only install tree.
    """
    env = os.environ.get("FLIES_DATA") or os.environ.get("FLIES_REPO")
    if env:
        return Path(env)
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(local) / "FLYANS" / "colony"


REPO = _colony_write_root()
# Recordings / exported takes live under the per-user colony data root.
OUT = REPO / "videos"
# Fly-made videos parallel the song library: riffs/takes/ for MIDI, riffs/videos/ for takes.
FLY_VIDEOS = REPO / "riffs" / "videos"
MAX_BYTES = 400_000_000  # 400 MB cap on a recording upload. The whole body is read into RAM and
# re-copied by the multipart parser, so the old 2 GB cap could OOM and take the dev server down.
LIVE = REPO / "planning" / "logs" / "live.log"
LOG_LOCK = threading.Lock()
MAX_LOG_BYTES = 262_144


def _ensure_writable(path: Path, fallback_name: str) -> Path:
    try:
        path.mkdir(parents=True, exist_ok=True)
        return path
    except OSError:
        local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        alt = Path(local) / "FLYANS" / fallback_name
        alt.mkdir(parents=True, exist_ok=True)
        return alt


def safe_title(text: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "", text or "").strip(" .")
    return (cleaned[:48] or "take").replace(" ", "-")


def clock(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    return f"{seconds // 60}:{seconds % 60:02d}"


def chapters(notes: dict) -> str:
    start = float(notes.get("inn") or 0)
    end = float(notes.get("out") or 0)
    lines = [f"In {clock(start)}", f"Out {clock(end)}", ""]
    rows = []
    for mark in notes.get("marks") or []:
        t = float(mark.get("t") or 0) - start
        if t < -0.05:
            continue
        if end and t > (end - start) + 0.05:
            continue
        rows.append((max(0.0, t), str(mark.get("label") or "cut")))
    if not rows or rows[0][0] > 0.4:
        rows.insert(0, (0.0, "Open"))
    for t, label in rows:
        lines.append(f"{clock(t)} {label}")
    return "\n".join(lines) + "\n"


def parse_multipart(content_type: str, body: bytes) -> dict:
    header = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8")
    msg = message_from_bytes(header + body, policy=default)
    found = {}
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        payload = part.get_payload(decode=True)
        found[name] = payload if payload is not None else b""
    return found


def append_log(text: str) -> int:
    lines = []
    for raw in text.splitlines():
        line = raw.replace("\x00", "").strip()
        if line and len(line) <= 500:
            lines.append(line)
    if not lines:
        return 0
    LIVE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_LOCK:
        with LIVE.open("a", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
    return len(lines)


class Handler(OwnerStateMixin, SimpleHTTPRequestHandler):
    def end_headers(self) -> None:  # noqa: N802
        # Dev server: never let the browser cache the studio's HTML/JS/CSS, or code
        # edits (and every fix) stay invisible behind a stale cached copy. The full set
        # (no-store + no-cache + must-revalidate + Pragma + Expires) also makes the page
        # INELIGIBLE for the browser's back/forward cache, so retyping the URL always
        # re-fetches the current file from disk instead of restoring a snapshot.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/state", "/versions", "/restore-version"):
            self.accept_state()
            return
        if path == "/log":
            self.accept_log()
            return
        if path != "/save":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BYTES:
            self.send_error(400, "bad length")
            return
        body = self.rfile.read(length)
        parts = parse_multipart(self.headers.get("Content-Type", ""), body)
        video = parts.get("video") or b""
        if not video:
            self.send_error(400, "missing video")
            return
        try:
            notes = json.loads((parts.get("notes") or b"{}").decode("utf-8"))
        except json.JSONDecodeError:
            notes = {}

        # kind/library: fly → riffs/videos/ (colony library, like songs in riffs/takes/)
        # anything else → Desktop/fly-band-videos (owner social pipeline)
        kind = str(notes.get("kind") or "").lower()
        library = str(notes.get("library") or "").lower()
        dest = FLY_VIDEOS if (kind == "fly" or library == "riffs") else OUT
        dest.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        who = ""
        cast = notes.get("cast") or []
        if isinstance(cast, list) and cast:
            who = "_" + safe_title("-".join(str(n) for n in cast[:3]))
        stem = f"{stamp}_{safe_title(str(notes.get('title') or ''))}{who}"
        webm = dest / f"{stem}.webm"
        mp4 = dest / f"{stem}.mp4"
        txt = dest / f"{stem}.txt"
        meta = dest / f"{stem}.json"
        webm.write_bytes(video)
        txt.write_text(chapters(notes), encoding="utf-8")
        try:
            meta.write_text(json.dumps(notes, indent=2), encoding="utf-8")
        except OSError:
            pass

        inn = float(notes.get("inn") or 0)
        out = float(notes.get("out") or 0)
        cmd = ["ffmpeg", "-y", "-i", str(webm)]
        if out > inn + 0.05:
            cmd[1:1] = ["-ss", f"{inn:.3f}", "-to", f"{out:.3f}"]
        cmd += [
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(mp4),
        ]
        delivered = webm
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            webm.unlink(missing_ok=True)
            delivered = mp4
        except (OSError, subprocess.CalledProcessError):
            pass

        payload = json.dumps({"file": str(delivered), "chapters": str(txt)}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def accept_log(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_LOG_BYTES:
            self.send_error(400, "bad length")
            return
        body = self.rfile.read(length).decode("utf-8", errors="replace")
        count = append_log(body)
        payload = json.dumps({"lines": count, "file": str(LIVE)}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt: str, *args) -> None:
        if args and str(args[0]).startswith("POST"):
            return
        super().log_message(fmt, *args)


def main() -> None:
    global FLY_VIDEOS, LIVE
    OUT.mkdir(parents=True, exist_ok=True)
    FLY_VIDEOS = _ensure_writable(FLY_VIDEOS, "riffs-videos")
    LIVE = _ensure_writable(LIVE.parent, "logs") / "live.log"
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    viewer = ThreadingHTTPServer((HOST, int(os.environ.get("FLIES_VIEWER_PORT", "8777"))), SpectatorHandler)
    threading.Thread(target=viewer.serve_forever, daemon=True).start()
    print(f"spectator http://127.0.0.1:{viewer.server_port}/ (read-only)", flush=True)
    print(f"studio http://{HOST}:{PORT}/  owner videos {OUT}", flush=True)
    print(f"fly videos {FLY_VIDEOS}", flush=True)
    print(f"write root {REPO}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
