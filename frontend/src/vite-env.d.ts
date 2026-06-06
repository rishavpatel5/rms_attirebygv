/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string | undefined;
  readonly VITE_PUBLIC_INVOICE_BASE_URL: string | undefined;
  readonly VITE_STORE_NAME: string | undefined;
  readonly VITE_STORE_LOGO_PATH: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
