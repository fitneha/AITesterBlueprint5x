export class GenerationError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "GenerationError";
    this.status = status;
  }
}
