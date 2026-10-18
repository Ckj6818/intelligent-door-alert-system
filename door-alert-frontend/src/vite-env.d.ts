/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 可选：覆盖边缘 MJPEG 基址，如 http://192.168.1.8:8090 */
  readonly VITE_EDGE_STREAM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
