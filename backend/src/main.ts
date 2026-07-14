import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`ai-text-analyzer backend listening on port ${config.PORT}`);
});
