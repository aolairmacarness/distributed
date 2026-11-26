/**
 * Redeliveries after a message's first delivery. It is delivered at most
 * MAX_REDELIVER_COUNT + 1 times, then routed to the dead-letter topic.
 */
export const MAX_REDELIVER_COUNT = 3;
