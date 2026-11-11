const { getDefaultConfig } = require('expo/metro-config');
const https = require('https');
const { URL } = require('url');

const config = getDefaultConfig(__dirname);
const previous = config.server.enhanceMiddleware;

config.server.enhanceMiddleware = (middleware, server) => {
  const inner = previous ? previous(middleware, server) : middleware;
  return (req, res, next) => {
    const path = req.url || '';
    if (path.startsWith('/market-proxy')) {
      proxyMarketData(req, res);
      return;
    }
    return inner(req, res, next);
  };
};

function proxyMarketData(req, res) {
  let target;
  try {
    const incoming = new URL(req.url, 'http://localhost');
    target = new URL(incoming.searchParams.get('u') || '');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'URL inválida' }));
    return;
  }
  const yahooHost = target.hostname === 'query1.finance.yahoo.com' || target.hostname === 'query2.finance.yahoo.com';
  const yahooPath = target.pathname.startsWith('/v8/finance/chart') || target.pathname.startsWith('/v1/finance/search');
  const twelveDataRoute = target.hostname === 'api.twelvedata.com' && target.pathname === '/time_series';
  if (target.protocol !== 'https:' || !(yahooHost && yahooPath) && !twelveDataRoute) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Destino no permitido' }));
    return;
  }
  const upstream = https.get(target, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      res.writeHead(response.statusCode || 502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(Buffer.concat(chunks));
    });
  });
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No se pudo contactar al mercado' }));
  });
}

module.exports = config;
