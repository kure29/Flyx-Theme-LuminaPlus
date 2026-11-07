/** public/ 下的静态文件地址；主题部署在 /status/ 下，路径要带上 Vite 的 base。 */
export function publicAsset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
