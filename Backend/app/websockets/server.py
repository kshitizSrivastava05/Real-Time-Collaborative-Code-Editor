from pycrdt.websocket.websocket_server import WebsocketServer
from pycrdt.websocket.asgi_server import ASGIServer

# Create the synchronization server
websocket_server = WebsocketServer()

# Adapt it to the ASGI(Asynchronous Server Gateway Interface ) interface
websocket_asgi_app = ASGIServer(websocket_server)