import type { api } from "./client";

export type Task = (typeof api.tasks.$get.$response)[number];
// Live external items (Notion/Google), never persisted. A superset of Task with
// the provenance fields the store needs to route edits back to the source.
export type ExternalTask = (typeof api.integrations.tasks.$get.$response)[number];
export type Project = (typeof api.projects.$get.$response)[number];
export type Bucket = "today" | "week" | "later";
