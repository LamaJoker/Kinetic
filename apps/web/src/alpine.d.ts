declare module 'alpinejs' {
  interface Alpine {
    store(name: string, value?: unknown): unknown;
    data(name: string, callback: () => object): void;
    start(): void;
  }
  const Alpine: Alpine;
  export default Alpine;
}
