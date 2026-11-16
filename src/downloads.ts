import { network } from "./native";
import { supported, ext } from "./formats";
export async function downloadBook(
  address: string,
  progress: (message: string) => void,
  signal?: AbortSignal,
) {
  const url = new URL(address);
  if (!["https:", "http:"].includes(url.protocol))
    throw Error("Enter an HTTP or HTTPS book-file link.");
  if (url.username || url.password)
    throw Error("Use a link without a username or password.");
  progress("Connecting…");
  const response = await network(url.href, { signal });
  if (signal?.aborted)
    throw new DOMException("Download cancelled", "AbortError");
  if (!response.ok) throw Error(`Download failed (HTTP ${response.status}).`);
  const limit = 128 * 1024 * 1024,
    total = Number(response.headers.get("content-length") || 0);
  if (total > limit) {
    await response.body?.cancel();
    throw Error("Choose a book smaller than 128 MB.");
  }
  let filename = decodeURIComponent(
    new URL(response.url || url.href).pathname.split("/").pop() || "book",
  );
  const disposition = response.headers.get("content-disposition") || "";
  const headerName =
    disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ??
    disposition.match(/filename="?([^";]+)/i)?.[1];
  if (headerName) filename = decodeURIComponent(headerName);
  filename = filename.replace(/[/\\\x00-\x1f]/g, "_");
  const mime = response.headers.get("content-type") || "";
  if (!supported.includes(ext(filename))) {
    const suffix = /epub/.test(mime)
      ? ".epub"
      : /pdf/.test(mime)
        ? ".pdf"
        : /text\/plain/.test(mime)
          ? ".txt"
          : "";
    if (!suffix)
      throw Error(
        "This link is not a supported book file. Open a direct EPUB, PDF, text or comic-file link.",
      );
    filename += suffix;
  }
  const chunks: Uint8Array[] = [],
    reader = response.body?.getReader();
  let size = 0;
  if (!reader) throw Error("The server returned an empty download.");
  try {
    while (true) {
      if (signal?.aborted)
        throw new DOMException("Download cancelled", "AbortError");
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error("Download exceeds 128 MB.");
      chunks.push(value);
      progress(
        total
          ? `Downloading ${Math.min(100, Math.round((size / total) * 100))}%`
          : `Downloaded ${(size / 1048576).toFixed(1)} MB`,
      );
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!size) throw Error("The downloaded file was empty.");
  return Object.assign(
    new File(chunks, filename, { type: mime || "application/octet-stream" }),
    { downloaded: true },
  );
}
