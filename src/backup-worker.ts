import { zipSync, unzipSync } from "fflate";
self.onmessage = ({ data }) => {
  try {
    if (data.operation === "zip") {
      const result = zipSync(data.files, { level: 0 });
      self.postMessage({ result }, { transfer: [result.buffer] });
    } else {
      let total = 0,
        count = 0;
      const result = unzipSync(data.bytes, {
        filter: (entry) => {
          total += entry.originalSize;
          count++;
          if (
            entry.originalSize > 256 * 1024 * 1024 ||
            total > 512 * 1024 * 1024 ||
            count > 10000
          )
            throw Error(
              "This backup is too large to restore safely (512 MB total).",
            );
          return (
            entry.name === "manifest.json" ||
            /^books\/[a-f0-9]{64}$/.test(entry.name)
          );
        },
      });
      self.postMessage(
        { result },
        { transfer: Object.values(result).map((bytes) => bytes.buffer) },
      );
    }
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
