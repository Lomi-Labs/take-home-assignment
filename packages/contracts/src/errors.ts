import { z } from "zod";

/** Every error code the API can return. Part of the API contract: the UI maps each one to friendly text. */
export const ERROR_CODES = [
    "validation_failed",
    "invalid_correction",
    "file_too_large",
    "not_a_pdf",
    "document_not_found",
    "value_not_found",
    "route_not_found",
    "version_not_current",
    "not_retryable",
    "internal_error",
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorBodySchema = z.object({
    error: ErrorCodeSchema,
    detail: z.string(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
