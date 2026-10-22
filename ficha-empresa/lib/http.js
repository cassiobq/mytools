// fetch nativo com timeout (8 s por chamada externa).
export const TIMEOUT_MS = 8000;

export async function fetchComTimeout(url, opcoes = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opcoes, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`tempo esgotado (${timeoutMs / 1000} s)`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
