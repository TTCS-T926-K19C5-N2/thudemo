const BODY_LIMIT = 5 * 1024 * 1024;

export function upstreamUrl(base: string, path: string[], search: string): URL {
  const url = new URL(base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid API origin");
  if (
    !path.length ||
    path.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\\/]/.test(segment),
    )
  )
    throw new Error("Invalid API path");
  url.pathname = "/" + path.map(encodeURIComponent).join("/");
  url.search = search;
  return url;
}

async function boundedBody(
  request: Request,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (["GET", "HEAD"].includes(request.method) || !request.body)
    return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) {
      await reader.cancel();
      throw new RangeError("Body too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function proxyApi(
  request: Request,
  path: string[],
): Promise<Response> {
  try {
    // Runtime-only env: the same built image works with local Docker and Render HTTPS API.
    const url = upstreamUrl(
      process.env.API_INTERNAL_URL ?? "http://localhost:3001",
      path,
      new URL(request.url).search,
    );
    const headers = new Headers();
    for (const name of [
      "accept",
      "content-type",
      "cookie",
      "origin",
      "sec-fetch-site",
    ]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const body = await boundedBody(request);
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body: body?.buffer,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
      redirect: "manual",
      cache: "no-store",
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    // Host-only cookies become cookies of the public web origin, never an API domain.
    for (const cookie of upstream.headers.getSetCookie())
      responseHeaders.append("set-cookie", cookie);
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const oversized = error instanceof RangeError;
    return Response.json(
      {
        message: oversized
          ? "Tệp vượt quá 5 MB."
          : "Dịch vụ chưa sẵn sàng. Vui lòng thử lại sau.",
      },
      {
        status: oversized ? 413 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
