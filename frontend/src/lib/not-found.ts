/** Hosting answers every unknown URL with 200 (it serves the app shell),
 * so without noindex a mistyped link would be indexable as a real page. */
export const NOT_FOUND_TITLE = "Página no encontrada · Electron Plus";
export const NOT_FOUND_HEAD = {
  meta: [{ title: NOT_FOUND_TITLE }, { name: "robots", content: "noindex" }],
};
