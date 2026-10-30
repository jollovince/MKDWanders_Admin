# MKDWander Admin

Admin website using HTML, CSS, browser JavaScript, Firebase Authentication/Firestore, Supabase, and a Node.js + Express server.

## Run locally

Requires Node.js 22 or newer and npm.

```powershell
npm install
npm start
```

Open http://127.0.0.1:3000 in your browser. The server opens the existing login page. Use `npm run dev` to restart the server automatically when server files change. Stop with Ctrl+C.

Optional environment variables: `PORT` (default `3000`) and `HOST` (default `127.0.0.1`). For example:

```powershell
$env:PORT = '4000'
npm start
```

## Routes

- `/` and `/login`: redirect to `/login.html`
- `/dashboard`: redirects to `/index.html`
- `/api/health`: returns JSON with the server status
- Existing HTML, JavaScript, CSS and `/images` assets are served by Express.

Firebase still handles sign-in and Firestore access; Supabase still handles the existing storage integration. Internet access is required for those services and CDN resources. This server does not add server-side admin authorization: dashboard access and data permissions still depend on the existing Firebase authentication and database/storage rules. The login screen's admin verification animation does not itself enforce an admin role.

Only explicitly allowed website files and the images directory are public. Server code, dependency files, and local configuration are not served.

## AI tour recommendations (Python + Flask + TensorFlow)

Use Python 3.11. In a terminal at the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ai/requirements.txt
.\.venv\Scripts\python.exe ai/service.py
```

In a second terminal run `npm start`. Sign in and open **Tour Packages**, then enter interests (for example `beach island Palawan`) and an optional maximum PHP budget. The form uses the live loaded Firestore catalog; package and preference data are processed in memory without storing traveler information.

Express forwards `POST /api/recommendations` to the local Flask service on port 5001. Flask is served by Waitress. Configure `AI_PORT` for Python and `AI_SERVICE_URL` for Express together if changing the address. Python health check: `http://127.0.0.1:5001/health`.

The engine builds TF-IDF text vectors from the submitted catalog and ranks them with TensorFlow cosine similarity. It excludes inactive packages, over-budget packages, and zero text matches. Similarity is not a probability or a predicted satisfaction rating. This is content-based ranking, not a neural model trained on booking histories; it needs no fabricated training data. Matching currently uses shared words, so synonyms or translated queries may need different wording. Requests accept at most 500 packages and 1 MB. These endpoints process caller-provided catalog data and do not grant access to Firebase records.

API request example:

```json
{
  "packages": [{"id":"palawan", "name":"Palawan beach island tour", "price":5000, "status":"Active"}],
  "preferences": {"interests":"beach island", "budget":8000},
  "limit":5
}
```

Run engine checks with `.\.venv\Scripts\python.exe -m unittest discover -s ai -p "test_*.py"`.
