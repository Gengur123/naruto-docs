// The Electrobun window for the documentation site. scripts/live.mjs builds it once with
// the `electrobun` package of docs/site and starts it; nothing here is installed globally.
// The main process is Bun, set here by name: Electrobun 2.0.2 would otherwise pick its own
// default runtime. The page is drawn by the system webview (WebView2 on Windows), so no
// browser engine is downloaded or bundled.
export default {
  app: {
    name: "Dandori Docs",
    identifier: "dev.dandori.docs-window",
    version: "0.0.1",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
};
