"""Serve only the Books release APK/source through the existing local tunnel."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import json

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
apk_name = f'Books-{version}.apk'
source_name = f'Books-{version}-source.tar.gz'
files = {
    '/' + apk_name: (root / 'releases' / f'Books-{version}-debug.apk', 'application/vnd.android.package-archive', apk_name),
    '/' + source_name: (root / 'releases' / source_name, 'application/gzip', source_name),
}
files[f'/Books-{version}-32bit.apk'] = (root / 'releases' / f'Books-{version}-32bit.apk', 'application/vnd.android.package-archive', f'Books-{version}-32bit.apk')
aliases = {name: '/' + apk_name for name in ('/Books.apk', '/Books-1.0.0.apk', '/Books-1.0.1.apk', '/Books-1.0.2.apk', '/Books-1.1.0.apk', '/Books-1.1.1.apk', '/Books-1.1.2.apk', '/Books-1.1.3.apk', '/Books-1.1.4.apk')}
aliases['/Books-source.tar.gz'] = '/' + source_name
# Keep every previously shared release URL pinned to its actual files.
for old in ('1.3.0', '1.4.0', '1.5.0', '1.5.1', '1.5.2', '1.6.0', '1.6.1', '1.7.0', '1.8.0'):
    name = f'Books-{old}.apk'
    files['/' + name] = (root / 'releases' / f'Books-{old}-debug.apk', 'application/vnd.android.package-archive', name)
    name = f'Books-{old}-32bit.apk'
    files['/' + name] = (root / 'releases' / name, 'application/vnd.android.package-archive', name)
    name = f'Books-{old}-source.tar.gz'
    files['/' + name] = (root / 'releases' / name, 'application/gzip', name)



class Download(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.respond(False)

    def do_GET(self):
        self.respond(True)

    def respond(self, body):
        path = urlsplit(self.path).path
        if path in aliases:
            self.send_response(302)
            self.send_header('Location', aliases[path])
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return
        entry = files.get(path)
        if entry is None or not entry[0].is_file():
            self.send_error(404)
            return
        file, mime, name = entry
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Disposition', f'attachment; filename="{name}"')
        self.send_header('Content-Length', str(file.stat().st_size))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if body:
            try:
                with file.open('rb') as source:
                    while chunk := source.read(1024 * 1024):
                        self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8787), Download).serve_forever()
