import { createServer, request as requestHttp, type IncomingHttpHeaders } from 'node:http';
import { connect, type Socket } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { videoUrlAddress } from './video-network';

// 解析子进程的所有 HTTP(S) 请求均经过本机临时代理；DNS 检查后固定公网 IP。
// 代理仅绑定回环地址，随机凭据只交给当前解析进程，不接受浏览器用户指定代理。
export async function openVideoProxy({ browserAuthentication = false } = {}) {
  const password = randomBytes(24).toString('hex');
  const expected = Buffer.from(`Basic ${Buffer.from(`video:${password}`).toString('base64')}`);
  // Firefox 在页面的认证处理器就绪前也会发后台请求；这些请求不能触发无界面密码弹窗。
  // 仅当前任务的随机本地握手地址返回407，其他未认证请求一律拒绝；不放宽公网校验。
  const authenticationUrl = browserAuthentication ? `http://video-proxy.invalid/${randomBytes(24).toString('hex')}` : '';
  const sockets = new Set<Socket>();
  let requests = 0, transferred = 0, uploaded = 0, closed = false;
  const authenticated = (headers: IncomingHttpHeaders) => {
    const value = Buffer.from(String(headers['proxy-authorization'] || ''));
    return value.length === expected.length && timingSafeEqual(value, expected);
  };
  const track = (socket: Socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {}); };
  const meter = (socket: Socket, sending = false) => socket.on('data', data => {
    if (sending) { uploaded += data.length; if (uploaded > 8 * 1024 ** 2) socket.destroy(); }
    else { transferred += data.length; if (transferred > 48 * 1024 ** 2) socket.destroy(); }
  });
  const server = createServer(async (req, res) => {
    if (!authenticated(req.headers)) {
      if (browserAuthentication && req.url !== authenticationUrl) res.writeHead(403).end();
      else res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="video"' }).end();
      return;
    }
    if (++requests > 400 || closed || !['GET', 'POST', 'HEAD', 'OPTIONS'].includes(req.method || '')) { res.writeHead(429).end(); return; }
    if (authenticationUrl && req.url === authenticationUrl) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('video-proxy-ready'); return;
    }
    try {
      const { url, address } = await videoUrlAddress(req.url || '');
      if (url.protocol !== 'http:') throw new Error('CONNECT required');
      const headers: IncomingHttpHeaders = { ...req.headers, host: url.host }; delete headers['proxy-authorization']; delete headers['proxy-connection'];
      const upstream = requestHttp(url, { method: req.method, headers, agent: false, lookup: (_host, options, callback) => options.all ? callback(null, [address as { address: string; family: number }]) : callback(null, address.address, address.family) }, response => {
        res.writeHead(response.statusCode || 502, response.headers); response.on('data', chunk => { transferred += chunk.length; if (transferred > 48 * 1024 ** 2) response.destroy(); }); response.pipe(res);
      });
      upstream.setTimeout(12000, () => upstream.destroy()); upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.on('aborted', () => upstream.destroy()); req.on('data', chunk => { uploaded += chunk.length; if (uploaded > 8 * 1024 ** 2) { upstream.destroy(); req.destroy(); } }); req.pipe(upstream);
    } catch { res.writeHead(403).end(); }
  });
  server.on('connection', socket => { track(socket); socket.setTimeout(20000, () => socket.destroy()); });
  server.on('connect', async (req, socket, head) => {
    if (!authenticated(req.headers)) {
      socket.end(browserAuthentication ? 'HTTP/1.1 403 Forbidden\r\n\r\n' : 'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="video"\r\n\r\n'); return;
    }
    if (++requests > 400 || closed) { socket.destroy(); return; }
    try {
      const target = req.url || '';
      if (!/^(?:[^\s\/:@]+|\[[a-f0-9:]+\]):443$/i.test(target)) throw new Error('Port not allowed');
      const { address } = await videoUrlAddress(`https://${target}/`);
      if (closed || socket.destroyed) return;
      const upstream = connect({ host: address.address, port: 443, family: address.family }); track(upstream);
      upstream.setTimeout(12000, () => upstream.destroy());
      upstream.once('connect', () => { if (socket.destroyed) { upstream.destroy(); return; } socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); meter(upstream); meter(socket as Socket, true); upstream.pipe(socket); socket.pipe(upstream); });
      upstream.on('error', () => socket.destroy()); socket.once('close', () => upstream.destroy()); upstream.once('close', () => socket.destroy());
    } catch { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); }
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw new Error('视频网络通道无法启动'); }
  return {
    server: `http://127.0.0.1:${address.port}`, username: 'video', password, authenticationUrl,
    url: `http://video:${password}@127.0.0.1:${address.port}`,
    async close() { closed = true; for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
