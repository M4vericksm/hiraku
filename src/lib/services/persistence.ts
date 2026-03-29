export class PersistenceService {
	private static DB_NAME = 'mangaflow-storage';
	private static STORE_NAME = 'file-handles';

	private static async getDB(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.DB_NAME, 1);
			request.onupgradeneeded = (e) => {
				const db = (e.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(this.STORE_NAME)) {
					db.createObjectStore(this.STORE_NAME);
				}
			};
			request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
			request.onerror = (e) => reject(e);
		});
	}

	static async saveHandle(id: string, handle: FileSystemHandle): Promise<void> {
		if (typeof indexedDB === 'undefined') return;
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.STORE_NAME, 'readwrite');
			const store = transaction.objectStore(this.STORE_NAME);
			const request = store.put(handle, id);
			request.onsuccess = () => resolve();
			request.onerror = (e) => reject(e);
		});
	}

	static async getHandle(id: string): Promise<FileSystemFileHandle | null> {
		if (typeof indexedDB === 'undefined') return null;
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.STORE_NAME, 'readonly');
			const store = transaction.objectStore(this.STORE_NAME);
			const request = store.get(id);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = (e) => reject(e);
		});
	}

	static async removeHandle(id: string): Promise<void> {
		if (typeof indexedDB === 'undefined') return;
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.STORE_NAME, 'readwrite');
			const store = transaction.objectStore(this.STORE_NAME);
			const request = store.delete(id);
			request.onsuccess = () => resolve();
			request.onerror = (e) => reject(e);
		});
	}
}
