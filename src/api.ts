import { readLocal, writeLocal } from "./storage";
export const base = import.meta.env.BASE_URL.replace(/\/$/, "");
let tabToken: string | undefined;
export function browserToken() {
  let token = readLocal("tasting.identity.v1") || tabToken;
  if (!token) {
    token = crypto.randomUUID();
    writeLocal("tasting.identity.v1", token);
  }
  tabToken = token;
  return token;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Guest-Token": browserToken(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error(
      "Could not reach the tasting. Check your connection and retry.",
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(response.status, data.error || "Request failed.");
  return data;
}
