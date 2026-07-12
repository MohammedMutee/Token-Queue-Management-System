declare module "qz-tray" {
  interface QzTray {
    websocket: {
      connect(options?: Record<string, unknown>): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
    };
    security: {
      setCertificatePromise(fn: () => Promise<string>): void;
      setSignatureAlgorithm(algo: string): void;
      setSignaturePromise(
        fn: (dataToSign: string) => (resolve: (v: string) => void, reject: (e: Error) => void) => void
      ): void;
    };
    printers: {
      find(): Promise<string[]>;
      getDefault(): Promise<string>;
    };
    configs: {
      create(
        printer: string | null,
        opts?: Record<string, unknown>
      ): Record<string, unknown>;
    };
    print(
      config: Record<string, unknown>,
      data: Array<{ type: string; format: string; data: string }>
    ): Promise<void>;
    socket: {
      open(host: string, port: number, options?: Record<string, unknown>): Promise<void>;
      close(host: string, port: number): Promise<void>;
      sendData(host: string, port: number, data: string | { data: string; type?: string }): Promise<void>;
      setSocketCallbacks(calls: ((event: Record<string, unknown>) => void) | Array<(event: Record<string, unknown>) => void>): void;
    };
  }

  const qz: QzTray;
  export default qz;
  export = qz;
}
