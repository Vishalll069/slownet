import type { LiveClientInfo } from "@slownet/core";
import type { LiveStore, LogEntry, StoredState } from "./store";

type Command = (string | number)[];

/** Upstash Redis over its REST API (works on Vercel). Keys expire after the session TTL. */
export class UpstashStore implements LiveStore {
  readonly kind = "upstash";

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly ttlSeconds: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private keys(id: string) {
    return { state: `slownet:${id}:state`, log: `slownet:${id}:log`, clients: `slownet:${id}:clients` };
  }

  private async pipeline(commands: Command[]): Promise<unknown[]> {
    const response = await this.fetchImpl(`${this.url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstash request failed: HTTP ${response.status}`);
    const results = (await response.json()) as { result?: unknown; error?: string }[];
    return results.map((item) => {
      if (item.error) throw new Error(`Upstash error: ${item.error}`);
      return item.result;
    });
  }

  async create(id: string, state: StoredState) {
    await this.pipeline([["SET", this.keys(id).state, JSON.stringify(state), "EX", this.ttlSeconds]]);
  }

  async getState(id: string) {
    const [raw] = await this.pipeline([["GET", this.keys(id).state]]);
    return typeof raw === "string" ? (JSON.parse(raw) as StoredState) : null;
  }

  async setState(id: string, state: StoredState) {
    const keys = this.keys(id);
    await this.pipeline([
      ["SET", keys.state, JSON.stringify(state), "EX", this.ttlSeconds],
      ["EXPIRE", keys.log, this.ttlSeconds],
      ["EXPIRE", keys.clients, this.ttlSeconds],
    ]);
  }

  async append(id: string, entries: LogEntry[], maxEntries: number) {
    if (entries.length === 0) return true;
    const keys = this.keys(id);
    const [length] = await this.pipeline([["LLEN", keys.log]]);
    if (Number(length) + entries.length > maxEntries) return false;
    await this.pipeline([["RPUSH", keys.log, ...entries.map((entry) => JSON.stringify(entry))], ["EXPIRE", keys.log, this.ttlSeconds]]);
    return true;
  }

  async read(id: string, from: number) {
    const [items] = await this.pipeline([["LRANGE", this.keys(id).log, from, -1]]);
    return ((items as string[] | null) ?? []).map((item) => JSON.parse(item) as LogEntry);
  }

  async resetLog(id: string) {
    await this.pipeline([["DEL", this.keys(id).log]]);
  }

  async touchClient(id: string, client: LiveClientInfo) {
    const keys = this.keys(id);
    await this.pipeline([["HSET", keys.clients, client.clientId, JSON.stringify(client)], ["EXPIRE", keys.clients, this.ttlSeconds]]);
  }

  async listClients(id: string) {
    const [flat] = await this.pipeline([["HGETALL", this.keys(id).clients]]);
    const values = (flat as string[] | null) ?? [];
    const clients: LiveClientInfo[] = [];
    for (let index = 1; index < values.length; index += 2) clients.push(JSON.parse(values[index]!) as LiveClientInfo);
    return clients;
  }
}
