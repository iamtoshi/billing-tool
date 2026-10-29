import http.server, sys, os
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # what Cloudflare Pages sends for static files: always revalidate
        self.send_header('Cache-Control', 'public, max-age=0, must-revalidate')
        super().end_headers()
    def log_message(self, *a): pass
os.chdir(sys.argv[1]); http.server.ThreadingHTTPServer(('', int(sys.argv[2])), H).serve_forever()
