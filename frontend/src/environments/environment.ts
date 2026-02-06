declare global {
  interface Window {
    __env?: {
      API_BASE_URL?: string;
    };
  }
}

const apiBaseUrl = window.__env?.API_BASE_URL ?? 'http://localhost:4100';

export const environment = {
  apiBaseUrl
};
