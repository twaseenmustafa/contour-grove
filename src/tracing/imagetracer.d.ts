declare module "imagetracerjs" {
  const tracer: {
    imagedataToTracedata(
      image: { width: number; height: number; data: Uint8ClampedArray },
      options: Record<string, unknown>,
    ): unknown;
  };
  export default tracer;
}
