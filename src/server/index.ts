import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { join } from 'node:path';
import { createApp } from './app';
import { createDb } from './db';

const DATA_DIR = process.env.DATA_DIR || './data';
const PORT = Number(process.env.PORT) || 3210;
// serveStatic roots are resolved against process.cwd(); the container always
// starts in /app, local `npm start` runs from the project root — both hold dist/client.
const CLIENT_DIR = './dist/client';

const db = createDb(join(DATA_DIR, 'tower.db'));
const app = createApp(db);

app.use('/*', serveStatic({ root: CLIENT_DIR }));
// SPA fallback for client-side routes
app.get('*', serveStatic({ path: join(CLIENT_DIR, 'index.html') }));

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`Tower Finance listening on http://0.0.0.0:${info.port} (db: ${join(DATA_DIR, 'tower.db')})`);
});
