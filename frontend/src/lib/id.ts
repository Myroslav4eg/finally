let counter = 0;

/**
 * A unique id for a client-side list key.
 *
 * Deliberately not `crypto.randomUUID()`: that is only defined in a secure
 * context, so it is undefined on any plain-HTTP origin other than localhost -
 * a LAN address, a hostname, a deployed container. These ids identify React
 * list items and never leave the browser, so a counter is both sufficient and
 * safe everywhere.
 */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
