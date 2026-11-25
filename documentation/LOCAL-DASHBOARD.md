# Local dashboard container

Other development is paused. The live dashboard is available at http://localhost:3000.

Start Docker Desktop, then run this command from the project folder:

```powershell
docker compose up -d dashboard
```

This starts the dashboard and its required database, n8n and credential adapter services. You can also start the existing project containers in Docker Desktop.

The dashboard restarts automatically with Docker unless you explicitly stopped it. After stopping it manually, start it again using Docker Desktop or the command above.

Port 3002 is retained for the registered Gmail callback. Use localhost:3000 for the dashboard. The dashboard ports are accessible only from this computer.

Keep the existing protected credential files in place: the container mounts them read-only. No separate native dashboard process is needed.
