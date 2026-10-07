export class ProcessingError extends Error {
  constructor(
    public code: string,
    public permanent = false,
  ) {
    super(code);
  }
}
export class LeaseLost extends Error {
  constructor() {
    super("lease_lost");
  }
}
export function failure(error: unknown): ProcessingError {
  if (error instanceof ProcessingError) return error;
  const name = error instanceof Error ? error.name : "";
  if (
    [
      "AccessDeniedException",
      "UnrecognizedClientException",
      "InvalidSignatureException",
      "CredentialsProviderError",
    ].includes(name)
  )
    return new ProcessingError("aws_access");
  if (
    ["InvalidImageFormatException", "InvalidParameterException"].includes(name)
  )
    return new ProcessingError("invalid_image", true);
  if (name === "ImageTooLargeException")
    return new ProcessingError("image_too_large", true);
  if (
    [
      "ProvisionedThroughputExceededException",
      "ThrottlingException",
      "InternalServerError",
      "ResourceNotFoundException",
      "TimeoutError",
    ].includes(name)
  )
    return new ProcessingError("aws_unavailable");
  return new ProcessingError("processing_error");
}
