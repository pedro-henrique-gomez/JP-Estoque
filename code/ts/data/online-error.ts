export class OnlineError extends Error {
  constructor(
    public kind:
      | "session"
      | "inactive"
      | "permission"
      | "connection"
      | "validation"
      | "conflict",
    message: string,
  ) {
    super(message);
  }
}
