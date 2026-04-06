export class PersistenceService {
  private static DB_NAME = 'hiraku-storage';
  private static HANDLE_STORE = 'file-handles';
  private static COVER_STORE = 'covers';

  private static openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.HANDLE_STORE)) {
          db.createObjectStore(this.HANDLE_STORE);
        }
        if (!db.objectStoreNames.contains(this.COVER_STORE)) {
          db.createObjectStore(this.COVER_STORE);
        }
      };
    });
  }

  static async saveHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.HANDLE_STORE, 'readwrite');
      tx.objectStore(this.HANDLE_STORE).put(handle, id);
      return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    } catch { /* silently fail */ }
  }

  static async getHandle(id: string): Promise<FileSystemFileHandle | null> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.HANDLE_STORE, 'readonly');
      const req = tx.objectStore(this.HANDLE_STORE).get(id);
      return new Promise((res, rej) => { req.onsuccess = () => res(req.result ?? null); req.onerror = () => rej(req.error); });
    } catch { return null; }
  }

  static async removeHandle(id: string): Promise<void> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.HANDLE_STORE, 'readwrite');
      tx.objectStore(this.HANDLE_STORE).delete(id);
    } catch { /* silently fail */ }
  }

  static async saveCover(id: string, dataUrl: string): Promise<void> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.COVER_STORE, 'readwrite');
      tx.objectStore(this.COVER_STORE).put(dataUrl, id);
      return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    } catch { /* silently fail */ }
  }

  static async getCover(id: string): Promise<string | null> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.COVER_STORE, 'readonly');
      const req = tx.objectStore(this.COVER_STORE).get(id);
      return new Promise((res, rej) => { req.onsuccess = () => res(req.result ?? null); req.onerror = () => rej(req.error); });
    } catch { return null; }
  }

  static async removeCover(id: string): Promise<void> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.COVER_STORE, 'readwrite');
      tx.objectStore(this.COVER_STORE).delete(id);
    } catch { /* silently fail */ }
  }

  static async getAllCoverIds(): Promise<string[]> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.COVER_STORE, 'readonly');
      const req = tx.objectStore(this.COVER_STORE).getAllKeys();
      return new Promise((res, rej) => { req.onsuccess = () => res(req.result as string[]); req.onerror = () => rej(req.error); });
    } catch { return []; }
  }
}
