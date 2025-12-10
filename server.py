import http.server
import socketserver

PORT = 8000
Handler = http.server.SimpleHTTPRequestHandler

# Allow CORS for local development if needed (though same origin is fine)
# But standard SimpleHTTPRequestHandler doesn't add CORS headers. 
# Since we serve HTML and Data from same origin, it's fine.

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print("serving at port", PORT)
    httpd.serve_forever()
