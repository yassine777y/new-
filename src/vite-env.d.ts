/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional OpenAI-compatible endpoint for the guide agent. */
  readonly VITE_AGENT_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.ttf' {
  const src: string
  export default src
}
