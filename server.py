import os
import io
import base64
import mimetypes
from pathlib import Path
from flask import Flask, jsonify, send_from_directory, url_for, abort, send_file

mimetypes.add_type('audio/aac', '.aac')
mimetypes.add_type('audio/flac', '.flac')
mimetypes.add_type('audio/mp4', '.m4a')
mimetypes.add_type('audio/ogg', '.ogg')
mimetypes.add_type('audio/opus', '.opus')
mimetypes.add_type('audio/webm', '.webm')

BASE_DIR = Path(__file__).resolve().parent
SONGS_DIR = BASE_DIR / "songs"
SITE_DIR = BASE_DIR / "site"

SONGS_DIR.mkdir(parents=True, exist_ok=True)
SITE_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=str(SITE_DIR), static_url_path="/static")

PREFIX = "/max_playerok"

def _resolve_song_path(filename: str) -> Path:
    candidate = (SONGS_DIR / filename).resolve()
    try:
        candidate.relative_to(SONGS_DIR.resolve())
    except ValueError:
        abort(404)
    if not candidate.exists() or not candidate.is_file():
        abort(404)
    return candidate


def _extract_cover_bytes(path: Path):

    try:
        from mutagen.id3 import ID3
        from mutagen.flac import FLAC, Picture
        from mutagen.mp4 import MP4, MP4Cover
        from mutagen.oggvorbis import OggVorbis
        try:
            from mutagen.oggopus import OggOpus
        except Exception:
            OggOpus = None
    except Exception:
        return None

    suffix = path.suffix.lower()

    if suffix == ".mp3":
        try:
            id3 = ID3(path.as_posix())
            apics = id3.getall('APIC')
            if apics:
                apic = apics[0]
                mime = apic.mime or "image/jpeg"
                return apic.data, mime
        except Exception:
            pass

    if suffix == ".flac":
        try:
            f = FLAC(path.as_posix())
            if f.pictures:
                pic = f.pictures[0]
                mime = pic.mime or "image/jpeg"
                return pic.data, mime
            mbp = f.tags.get('metadata_block_picture') if f.tags else None
            if mbp:
                from mutagen.flac import Picture
                b = base64.b64decode(mbp[0])
                pic = Picture()
                pic.parse(b)
                return pic.data, pic.mime or "image/jpeg"
        except Exception:
            pass

    if suffix in {".m4a", ".mp4"}:
        try:
            mp4 = MP4(path.as_posix())
            covr_list = mp4.tags.get('covr') if mp4.tags else None
            if covr_list:
                c = covr_list[0]
                if isinstance(c, MP4Cover):
                    if c.imageformat == MP4Cover.FORMAT_JPEG:
                        mime = "image/jpeg"
                    elif c.imageformat == MP4Cover.FORMAT_PNG:
                        mime = "image/png"
                    else:
                        mime = "application/octet-stream"
                    return bytes(c), mime
        except Exception:
            pass

    if suffix in {".ogg", ".opus"}:
        try:
            ogg = OggVorbis(path.as_posix())
            tags = ogg.tags or {}
            if 'coverart' in tags:
                img_b64 = tags['coverart'][0]
                mime = (tags.get('coverartmime') or ['image/jpeg'])[0]
                return base64.b64decode(img_b64), mime
            mbp = tags.get('metadata_block_picture')
            if mbp:
                b = base64.b64decode(mbp[0])
                pic = Picture()
                pic.parse(b)
                return pic.data, pic.mime or "image/jpeg"
        except Exception:
            pass
        if OggOpus is not None:
            try:
                ogg = OggOpus(path.as_posix())
                tags = ogg.tags or {}
                if 'coverart' in tags:
                    img_b64 = tags['coverart'][0]
                    mime = (tags.get('coverartmime') or ['image/jpeg'])[0]
                    return base64.b64decode(img_b64), mime
                mbp = tags.get('metadata_block_picture')
                if mbp:
                    b = base64.b64decode(mbp[0])
                    pic = Picture()
                    pic.parse(b)
                    return pic.data, pic.mime or "image/jpeg"
            except Exception:
                pass

    return None


@app.route("/")
def index():
    return send_from_directory(SITE_DIR, "index.html")

@app.get("/api/songs")
def api_songs():
    allowed = {'.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac', '.opus', '.webm'}
    songs = []
    for p in SONGS_DIR.rglob("*"):
        if p.is_file() and p.suffix.lower() in allowed:
            rel = p.relative_to(SONGS_DIR).as_posix()
            songs.append({
                "title": p.stem,
                "url": f"{PREFIX}{url_for('serve_song', filename=rel)}",
                "cover": f"{PREFIX}{url_for('serve_cover', filename=rel)}",
                "ext": p.suffix.lower().lstrip("."),
                "path": rel,
                "size": p.stat().st_size,
                "mtime": int(p.stat().st_mtime),
            })
    songs.sort(key=lambda s: s["title"].lower())
    return jsonify({"count": len(songs), "songs": songs})


@app.route("/songs/<path:filename>")
def serve_song(filename: str):
    return send_from_directory(SONGS_DIR, filename, conditional=True)


@app.route("/cover/<path:filename>")
def serve_cover(filename: str):
    path = _resolve_song_path(filename)
    result = _extract_cover_bytes(path)
    if not result:
        abort(404)

    data, mime = result
    bio = io.BytesIO(data)
    resp = send_file(bio, mimetype=mime, conditional=False)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.route("/favicon.ico")
def favicon():
    if (SITE_DIR / "favicon.ico").exists():
        return send_from_directory(SITE_DIR, "favicon.ico")
    abort(404)


if __name__ == "__main__":

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "4080"))
    debug = False
    print('хуй')
    app.run(
        host=host,
        port=port,
        debug=debug
    )