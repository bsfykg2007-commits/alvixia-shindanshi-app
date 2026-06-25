(function () {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/shindanshi/sw.js", { scope: "/shindanshi/" }).catch(function () {
      // PWA登録に失敗しても、既存の学習機能はそのまま動かします。
    });
  });
})();
