"""Disposable protocol fixtures; no production accounts or data."""
import sys
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler, TLS_FTPHandler
from pyftpdlib.servers import FTPServer

auth = DummyAuthorizer()
auth.add_user('books-test', 'books-transfer-fixture', sys.argv[1], perm='elradfmwMT')
class Plain(FTPHandler):
    authorizer = auth
class TLS(TLS_FTPHandler):
    authorizer = auth
    certfile = sys.argv[2]
    keyfile = sys.argv[3]
    tls_control_required = True
    tls_data_required = True
plain = FTPServer(('0.0.0.0', 2121), Plain)
tls = FTPServer(('0.0.0.0', 2122), TLS)
print('FIXTURE_READY', flush=True)
plain.serve_forever()
