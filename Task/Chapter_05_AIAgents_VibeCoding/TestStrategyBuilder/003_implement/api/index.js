// Vercel serverless entrypoint: every /api/* request is rewritten here (see vercel.json)
// and handled by the Express app. Local development still uses src/backend/start.js.
import app from "../src/backend/server.js";

export default app;
