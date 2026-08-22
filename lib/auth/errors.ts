/** Auth failures, in a module with no Auth.js dependency so that the
 *  permission rules can be exercised without a request context. */

export class NotAuthenticatedError extends Error {
  constructor() {
    super("You need to sign in to do that.");
    this.name = "NotAuthenticatedError";
  }
}

export class NotPermittedError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "NotPermittedError";
  }
}
