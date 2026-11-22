import app from "./server.js";
import { getRuntimeConfig } from "./config.js";

const { port } = getRuntimeConfig();
app.listen(port, "127.0.0.1", () => {
  console.log(`AI Test Case Generator listening on http://127.0.0.1:${port}`);
});
