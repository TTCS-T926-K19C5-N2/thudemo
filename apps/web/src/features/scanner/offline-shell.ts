export async function prepareOfflineScannerShell(): Promise<void> {
  if (!("serviceWorker" in navigator))
    throw Error("Trình duyệt chưa hỗ trợ mở máy quét khi mất mạng.");
  const registration = await navigator.serviceWorker.register(
    "/scanner-worker.js",
    { scope: "/scanner", updateViaCache: "none" },
  );
  if (!registration.active) {
    const installing = registration.installing ?? registration.waiting;
    if (!installing) throw Error("Chưa tải được giao diện ngoại tuyến.");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(Error("Chưa tải xong giao diện ngoại tuyến."));
      }, 30000);
      function cleanup() {
        clearTimeout(timer);
        installing!.removeEventListener("statechange", changed);
      }
      function changed() {
        if (installing!.state === "activated") {
          cleanup();
          resolve();
        }
        if (installing!.state === "redundant") {
          cleanup();
          reject(Error("Tải giao diện ngoại tuyến chưa thành công."));
        }
      }
      installing.addEventListener("statechange", changed);
      changed();
    });
  }
  const worker = registration.active;
  if (!worker) throw Error("Chưa chuẩn bị xong máy quét ngoại tuyến.");
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(
        Error(
          "Chuẩn bị máy quét ngoại tuyến quá thời gian. Thử lại khi có mạng.",
        ),
      );
    }, 30000);
    channel.port1.onmessage = (event: MessageEvent<{ ready: boolean }>) => {
      clearTimeout(timer);
      channel.port1.close();
      if (event.data.ready) resolve();
      else
        reject(
          Error("Chưa tải đủ giao diện ngoại tuyến. Giữ kết nối và thử lại."),
        );
    };
    worker.postMessage({ type: "PREPARE_SCANNER" }, [channel.port2]);
  });
  // Warm the same camera decoder used by the scanner while the worker controls
  // this page. No camera permission is requested until the user presses Start.
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", done);
        resolve();
      };
      const timer = setTimeout(() => {
        navigator.serviceWorker.removeEventListener("controllerchange", done);
        reject(Error("Mở lại máy quét khi có mạng để hoàn tất chuẩn bị."));
      }, 5000);
      navigator.serviceWorker.addEventListener("controllerchange", done, {
        once: true,
      });
      if (navigator.serviceWorker.controller) done();
    });
  }
  await import("html5-qrcode");
}
