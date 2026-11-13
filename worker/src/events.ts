import { BROWSER_EVENTS, EVENT_PATH, MAX_COUNTED_ROUND, type StardEvent } from "../../server/events.ts";

// Counters (server/events.ts), written to Workers Analytics Engine as one data point each:
//   blob1 the event, blob2 the site the run came from ("" when none), blob3 the host it ran on,
//   double1 the round (0 when the event has none), index1 the event.
// The dataset is a binding (wrangler.toml); a Worker without it (tests, a self-hosted
// Worker) counts nothing and answers the same.
//
//   POST /api/event {event, round?, from?}   204, once the event is one the Play screen sends

export const EVENT_ROUTE = new RegExp(`^${EVENT_PATH}$`);

const NO_CONTENT = 204;
const BAD_REQUEST = 400;
// A beacon is a few dozen characters; anything long is not one.
const MAX_BODY_CHARS = 512;
const HOSTNAME = /^[a-z0-9.-]{1,253}$/;

type Detail = { round?: number; from?: string };
export type CountEvent = (event: StardEvent, detail?: Detail) => void;

/** Counts events into the dataset, each marked with the host it happened on. */
export function counterFor(dataset: AnalyticsEngineDataset | undefined, host: string): CountEvent {
  return (event, detail = {}) => {
    if (!dataset) return;
    try {
      dataset.writeDataPoint({ blobs: [event, detail.from ?? "", host], doubles: [detail.round ?? 0], indexes: [event] });
    } catch (error) {
      // A count is never worth failing the request it rides on.
      console.error(error);
    }
  };
}

class Refused extends Error {}

function eventIn(text: string): { event: StardEvent; detail: Detail } {
  if (text.length > MAX_BODY_CHARS) throw new Refused("That event is too big.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Refused("An event is a JSON object.");
  }
  const fields = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!fields) throw new Refused("An event is a JSON object.");
  const event = BROWSER_EVENTS.find((name) => name === fields.event);
  if (!event) throw new Refused("Not an event Stard counts.");
  const { round, from } = fields;
  if (round !== undefined && (typeof round !== "number" || !Number.isInteger(round) || round < 1 || round > MAX_COUNTED_ROUND)) throw new Refused(`A round is 1 to ${MAX_COUNTED_ROUND}.`);
  if (from !== undefined && (typeof from !== "string" || (from !== "" && !HOSTNAME.test(from)))) throw new Refused("Where a run came from is a host name.");
  return { event, detail: { round, from } };
}

export async function eventResponse(request: Request, count: CountEvent): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Send an event with POST." }, { status: 405 });
  try {
    const { event, detail } = eventIn(await request.text());
    count(event, detail);
    return new Response(null, { status: NO_CONTENT });
  } catch (error) {
    if (error instanceof Refused) return Response.json({ error: error.message }, { status: BAD_REQUEST });
    throw error;
  }
}
