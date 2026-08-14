/**
 * SERVIDOR DE SINALIZAÇÃO GLOBAL & EMBUTIDO (Com Auto-Descoberta UDP em Rede Local)
 * =================================================================================
 * 
 * Funciona tanto de forma autônoma quanto embutido dentro do aplicativo Electron.
 * Inclui serviço de transmissão UDP na porta 8888 para descoberta automática em Wi-Fi/LAN.
 */

const { WebSocketServer } = require('ws');
const os = require('os');
const dgram = require('dgram');

const UDP_PORT = 8888;

function getPrimaryLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName of Object.keys(interfaces)) {
    for (const iface of interfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function startServer(port = 8080) {
  let wss;
  try {
    wss = new WebSocketServer({ port });
  } catch (e) {
    console.log(`[Servidor Integrado] Porta ${port} indisponível ou em uso.`);
    return null;
  }

  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Servidor Integrado] Porta ${port} em uso por outro processo de sinalização.`);
    } else {
      console.error('[Servidor Integrado] Erro:', err.message);
    }
  });

  const activeHosts = new Map();
  const activeViewers = new Set();

  function broadcastDeviceList() {
    const deviceList = Array.from(activeHosts.values()).map(host => ({
      deviceId: host.deviceId,
      deviceName: host.deviceName,
      ip: host.ip,
      osPlatform: host.osPlatform,
      requiresPassword: Boolean(host.passwordHash),
      status: 'online'
    }));

    const payload = JSON.stringify({
      type: 'device-list-update',
      devices: deviceList
    });

    activeViewers.forEach(viewerWs => {
      if (viewerWs.readyState === viewerWs.OPEN) {
        viewerWs.send(payload);
      }
    });
  }

  wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    ws.deviceId = null;
    ws.role = null;

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        const { type, deviceId, deviceName, osPlatform, passwordHash, targetDeviceId, passwordInput, offer, answer, candidate } = data;

        switch (type) {
          case 'register-host': {
            ws.role = 'host';
            ws.deviceId = deviceId;
            ws.deviceName = deviceName || 'PC Destino';
            ws.passwordHash = passwordHash || null;

            activeHosts.set(deviceId, {
              ws,
              deviceId,
              deviceName: ws.deviceName,
              passwordHash: ws.passwordHash,
              ip: clientIp,
              osPlatform: osPlatform || 'windows',
              status: 'online'
            });

            sendJson(ws, { type: 'host-registered-success', deviceId });
            broadcastDeviceList();
            break;
          }

          case 'register-viewer': {
            ws.role = 'viewer';
            activeViewers.add(ws);
            sendJson(ws, { type: 'viewer-registered-success' });
            broadcastDeviceList();
            break;
          }

          case 'connect-to-device': {
            const targetHost = activeHosts.get(targetDeviceId);
            if (!targetHost || targetHost.ws.readyState !== ws.OPEN) {
              sendJson(ws, { type: 'error', message: 'O computador destino está offline ou indisponível.' });
              break;
            }

            if (targetHost.passwordHash) {
              if (!passwordInput || passwordInput !== targetHost.passwordHash) {
                sendJson(ws, { type: 'auth-failed', message: 'Senha de acesso incorreta.' });
                break;
              }
            }

            ws.targetDeviceId = targetDeviceId;
            targetHost.ws.currentViewerWs = ws;

            sendJson(targetHost.ws, { type: 'start-webrtc-stream', viewerDeviceId: ws.deviceId });
            sendJson(ws, { type: 'connecting-to-host', deviceName: targetHost.deviceName });
            break;
          }

          case 'offer': {
            if (ws.currentViewerWs && ws.currentViewerWs.readyState === ws.OPEN) {
              sendJson(ws.currentViewerWs, { type: 'offer', offer });
            }
            break;
          }

          case 'answer': {
            const targetHost = activeHosts.get(ws.targetDeviceId);
            if (targetHost && targetHost.ws.readyState === ws.OPEN) {
              sendJson(targetHost.ws, { type: 'answer', answer });
            }
            break;
          }

          case 'candidate': {
            if (ws.role === 'host' && ws.currentViewerWs && ws.currentViewerWs.readyState === ws.OPEN) {
              sendJson(ws.currentViewerWs, { type: 'candidate', candidate });
            } else if (ws.role === 'viewer') {
              const targetHost = activeHosts.get(ws.targetDeviceId);
              if (targetHost && targetHost.ws.readyState === ws.OPEN) {
                sendJson(targetHost.ws, { type: 'candidate', candidate });
              }
            }
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('[Servidor Integrado] Erro de mensagem:', err.message);
      }
    });

    ws.on('close', () => {
      if (ws.role === 'host' && ws.deviceId) {
        activeHosts.delete(ws.deviceId);
        broadcastDeviceList();
      } else if (ws.role === 'viewer') {
        activeViewers.delete(ws);
      }
    });
  });

  function sendJson(ws, obj) {
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  // --- SERVIÇO DE DESCOBERTA AUTOMÁTICA VIA UDP (PORTA 8888) ---
  try {
    const udpServer = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udpServer.on('message', (msg, rinfo) => {
      try {
        const text = msg.toString();
        if (text.includes('OPENREMOTE_DISCOVER')) {
          const myIp = getPrimaryLocalIp();
          const responseMsg = JSON.stringify({
            type: 'OPENREMOTE_SERVER_ANNOUNCE',
            wsUrl: `ws://${myIp}:${port}`
          });
          udpServer.send(Buffer.from(responseMsg), rinfo.port, rinfo.address);
        }
      } catch (e) {}
    });

    udpServer.bind(UDP_PORT, () => {
      try { udpServer.setBroadcast(true); } catch (e) {}
    });
  } catch (e) {}

  console.log(`[Servidor Integrado] Servidor de sinalização ativo na porta ${port}`);
  return wss;
}

if (require.main === module) {
  const PORT = process.env.PORT || 8080;
  startServer(PORT);
}

module.exports = { startServer, getPrimaryLocalIp };
