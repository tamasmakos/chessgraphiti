import type { Selectable } from "kysely";
import type { Exports, Games, OpeningProgress as OpeningProgressRow, Users } from "#schema";

export type User = Selectable<Users>;
export type Game = Selectable<Games>;
export type OpeningProgress = Selectable<OpeningProgressRow>;
export type ExportJob = Selectable<Exports>;
