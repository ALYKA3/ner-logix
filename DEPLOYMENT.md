# NER-LOGIX deployment and continuous updates

The production image serves the exported Next.js application, FastAPI REST API, WebSocket feed and uploaded evidence from one public origin. This removes production CORS and port-mismatch problems.

## Recommended judge deployment: GitHub + Render Blueprint

1. Create an empty GitHub repository.
2. From this project folder, add the GitHub remote and push the `main` branch.
3. In Render, choose **New → Blueprint** and select the repository.
4. Render reads `render.yaml`, builds the root `Dockerfile`, provisions PostgreSQL, creates persistent evidence storage and exposes one permanent HTTPS URL.
5. Verify `/health`, `/`, `/admin`, `/driver`, `/field-officer` and `/docs` on that URL.

The Blueprint deploys updates only after GitHub CI checks pass. After deployment, keep the same URL and publish changes with:

```powershell
git add .
git commit -m "Describe the update"
git push origin main
```

Render rebuilds the application while the managed PostgreSQL database and upload disk remain persistent. Do not delete the Render service/database or create a new service for each update.

## Local development

```powershell
.\setup-demo.ps1
.\start-demo.ps1
```

- Web: `http://localhost:3001`
- API/docs: `http://localhost:8001/docs`
- Development database: `apps/api/smart_logistics.db`

## Pre-deployment checks

```powershell
npm ci
npm run lint:web
npm run build:web
cd apps/api
.\.venv\Scripts\python.exe -m pytest tests -q
```

GitHub Actions repeats these checks on every push and pull request.

## Data and security notes

- Render uses managed PostgreSQL; SQLite remains the fast local fallback.
- The upload disk prevents officer evidence from disappearing during redeploys.
- Risk snapshots older than the configured retention window are deleted automatically.
- The three built-in accounts remain demo accounts. Before government/public production, replace automatic role login with a real identity provider and rotate all credentials.
- A persistent Render disk may require a paid plan. For a free deployment, replace local evidence storage with S3-compatible object storage.
