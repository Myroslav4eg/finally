"""Service layer exceptions."""


class ServiceError(Exception):
    """A request that failed business validation.

    The API layer converts this into an HTTP 400 with the message as `detail`.
    The chat layer reports it back to the LLM as a failed action.
    """
