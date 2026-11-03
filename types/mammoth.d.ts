declare module "mammoth/mammoth.browser" {
  type Msg = { type: string; message: string };
  const mammoth: {
    convertToHtml(
      input: { arrayBuffer: ArrayBuffer },
      options?: Record<string, unknown>,
    ): Promise<{ value: string; messages: Msg[] }>;
    images: { dataUri: unknown };
  };
  export default mammoth;
}
