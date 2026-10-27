// Vercel serverless function: reads a blueprint picture with Claude and returns a first draft of
// the floor (rooms, hallways, stairs, doors) for the blueprint editor. The administrator always
// checks and fixes the draft before publishing it; nothing reaches the public map from here.
//
// Needs ANTHROPIC_API_KEY in Vercel (server-side only, never sent to the browser). Without it the
// editor still works: the administrator traces the blueprint by hand.
//
// POST /api/blueprint-draft   Authorization: Bearer <Firebase ID token of the administrator>
// body: { "image": "data:image/jpeg;base64,..." }  (the blueprint fitted into a 160 x 100 frame)
//   -> { rooms: [{ name, code, type, rect: [x, y, w, h], door: [x, y] }], halls: [{ name, rect }], notes }
import Anthropic from "@anthropic-ai/sdk";
import { bearerToken, cors, isAdmin, jsonBody } from "./_admin.mjs";

export const config = { maxDuration: 60 };

const ROOM_TYPES = ["classroom", "office", "lab", "facility", "cr", "stairs", "exit"];
const box = { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rooms", "halls", "notes"],
  properties: {
    rooms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "code", "type", "x", "y", "w", "h", "doorX", "doorY"],
        properties: { name: { type: "string" }, code: { type: "string" }, type: { type: "string", enum: ROOM_TYPES }, ...box, doorX: { type: "number" }, doorY: { type: "number" } },
      },
    },
    halls: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", ...Object.keys(box)], properties: { name: { type: "string" }, ...box } },
    },
    notes: { type: "string" },
  },
};

const PROMPT = `This picture is an architectural floor plan (blueprint) of one floor of a school building, fitted into a frame that is 160 units wide and 100 units tall. Trace it for a campus navigation map.

Coordinates: x goes from 0 at the left edge of the picture to 160 at the right edge; y goes from 0 at the top edge to 100 at the bottom edge. Give every rectangle as its top-left corner (x, y) plus width w and height h in these units.

Return:
- rooms: every enclosed room or space a person could be sent to: classrooms, offices, labs, comfort rooms (type "cr"), facilities (library, canteen, gym, storage), stairwells (type "stairs") and doorways to the outside or fire exits (type "exit", a small rectangle at the outer wall). name: the label written in the room if readable ("Room 205", "Library", "Faculty"); otherwise a plain name such as "Room" or "Stairs". code: a room number such as "Room 205" if one is shown, otherwise "". doorX/doorY: the point on the room's wall where its door opens into the hallway (on the edge of the room rectangle, facing the hallway).
- halls: every corridor, lobby or walkway people walk along, as rectangles that touch the doors of the rooms they serve and touch each other where they connect.
- notes: one or two sentences about anything uncertain (unreadable labels, parts cut off), or "".

Ignore furniture, dimension lines, grid lines, title blocks and legends. Keep rooms from overlapping. If the picture is not a floor plan, return empty lists and say so in notes.`;

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!(await isAdmin(bearerToken(req)))) return res.status(401).json({ error: "Only the administrator can read blueprints." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "nokey" });

  const image = String(jsonBody(req).image || "");
  const match = image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!match || image.length > 4_000_000) return res.status(400).json({ error: "Send the blueprint as a JPEG picture (under 3 MB)." });

  // One attempt within Vercel's time limit; the editor lets the admin try again.
  const client = new Anthropic({ timeout: 55_000, maxRetries: 0 });
  let response;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // If a safety check wrongly declines the request, Anthropic retries it on another model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: match[1] } },
          { type: "text", text: PROMPT },
        ],
      }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "The AI is busy. Wait a minute and try again." });
    if (error instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: "The ANTHROPIC_API_KEY in Vercel is not valid." });
    if (error instanceof Anthropic.APIConnectionTimeoutError) return res.status(504).json({ error: "Reading the blueprint took too long. Try a smaller or clearer picture, or trace it by hand." });
    if (error instanceof Anthropic.APIError) return res.status(502).json({ error: `The AI service returned an error (${error.status ?? "no status"}).` });
    return res.status(502).json({ error: "The AI service could not be reached." });
  }

  if (response.stop_reason === "refusal") return res.status(422).json({ error: "The AI declined to read this picture. Trace it by hand instead." });
  if (response.stop_reason === "max_tokens") return res.status(502).json({ error: "The blueprint has too many rooms to read in one go. Trace it by hand, or crop it to one wing." });
  const text = response.content.find((block) => block.type === "text")?.text || "";
  let draft;
  try {
    draft = JSON.parse(text);
  } catch {
    return res.status(502).json({ error: "The AI's answer could not be read. Try again." });
  }
  return res.status(200).json({
    rooms: (draft.rooms || []).map((room) => ({ name: room.name, code: room.code, type: room.type, rect: [room.x, room.y, room.w, room.h], door: [room.doorX, room.doorY] })),
    halls: (draft.halls || []).map((hall) => ({ name: hall.name, rect: [hall.x, hall.y, hall.w, hall.h] })),
    notes: String(draft.notes || ""),
  });
}
