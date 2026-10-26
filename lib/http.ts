export async function boundedRequest(req: Request, maxBytes: number) {
  if (!req.body) return req;
  const reader = req.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Upload or request is too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.length;
  }
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body,
  });
}
