// Only known error codes select UI copy. Never echo provider messages or URLs,
// which can include authentication details, into the page or application logs.
export function authNotice(code?: string) {
  if (code === "pkce_code_verifier_not_found") return "authBrowser";
  if (
    code === "otp_expired" ||
    code === "flow_state_expired" ||
    code === "flow_state_not_found"
  ) {
    return "authExpired";
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  ) {
    return "authRateLimit";
  }
  return "authError";
}
