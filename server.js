const express = require('express');
const path = require('node:path');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'mkdwander-admin' });
});

app.post('/api/recommendations', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const upstream = await fetch(`${process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001'}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000)
    });
    res.status(upstream.status).json(await upstream.json());
  } catch (err) {
    res.status(503).json({ error: 'Recommendation service unavailable. Start the Python AI service and try again.' });
  }
});

app.get('/', (req, res) => res.redirect('/login.html'));
app.get('/login', (req, res) => res.redirect('/login.html'));
app.get('/dashboard', (req, res) => res.redirect('/index.html'));

// Serve only public website files, never the project directory itself.
for (const file of ['login.html', 'index.html', 'app.js', 'animations.css', 'animations.js', 'pkg-form-v2.js']) {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
}
app.use('/images', express.static(path.join(__dirname, 'images'), { dotfiles: 'deny', index: false }));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err.message);
  const status = [400, 404, 413].includes(err.status) ? err.status : 500;
  res.status(status).json({ error: status === 400 ? 'Invalid JSON request' : status === 413 ? 'Request too large' : status === 404 ? 'Not found' : 'Internal server error' });
});

if (require.main === module) {
  app.listen(port, host, () => {
    console.log(`MKDWander admin: http://${host}:${port}`);
  }).on('error', (err) => {
    console.error(`Could not start server: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = app;
