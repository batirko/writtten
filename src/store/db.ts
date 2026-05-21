import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "writtten";
const DB_VERSION = 1;

export interface DocumentRecord {
  id: string;
  content: object; // TipTap JSON
  updatedAt: number;
}

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("documents", { keyPath: "id" });
    },
  });
  return _db;
}

export async function saveDocument(doc: DocumentRecord): Promise<void> {
  const db = await getDb();
  await db.put("documents", doc);
}

export async function loadDocument(id: string): Promise<DocumentRecord | undefined> {
  const db = await getDb();
  return db.get("documents", id);
}
