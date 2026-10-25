// Shared error shape for ORIN validation modules. Handlers pass these straight
// to sendError(), which maps `status` to an HTTP code without leaking context.
export const fail = (message, status = 400) => Object.assign(new Error(message), { status });
