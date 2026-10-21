import { runLeparagliding, type EngineFile } from '@victor314159/leparagliding-wasm';

onmessage = async ({ data }: MessageEvent<EngineFile[]>) =>
  postMessage(await runLeparagliding(data));
