import 'dotenv/config';
import http from 'http';
import { URL } from 'url';
import dbRoute from '../api/db';
import scheduleRoute from '../api/schedule';
import signupRoute from '../api/signup';
import otpRoute from '../api/otp';
import assistantRoute from '../api/assistant';

const routes: Record<string, any> = {
  '/api/db': dbRoute,
  '/api/schedule': scheduleRoute,
  '/api/signup': signupRoute,
  '/api/otp': otpRoute,
  '/api/assistant': assistantRoute,
};

http.createServer(async (req: any, res: any) => {
  const u = new URL(req.url, 'http://localhost');
  const path = u.pathname.replace(/\/+$/, '');
  console.log(req.method, path);
  const handler = routes[path];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `No API route for ${path}` }));
  }
  let raw = '';
  for await (const c of req) raw += c;
  req.query = Object.fromEntries(u.searchParams);
  req.body = raw ? JSON.parse(raw) : {};
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (o: any) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  try { await handler(req, res); } catch (e: any) { console.error(e); res.status(500).json({ error: e.message }); }
}).listen(3001, () => console.log('API running on http://localhost:3001'));