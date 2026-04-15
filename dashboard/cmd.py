from ibapi.client import EClient
from ibapi.wrapper import EWrapper

class TestApp(EWrapper, EClient):
    def __init__(self):
        EClient.__init__(self, self)
    def nextValidId(self, orderId):
        print(f"✅ Conectado a IB! OrderId={orderId}")
        self.disconnect()

app = TestApp()
app.connect("127.0.0.1", 7496, clientId=1)
app.run()