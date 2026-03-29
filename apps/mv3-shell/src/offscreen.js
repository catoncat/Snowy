globalThis.addEventListener("message", (event) => {
  console.log("offscreen host message", event.data);
});

