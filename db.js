// IndexedDB za offline storage
class DetektorDB {
    constructor() {
        this.dbName = 'DetektorTrackerDB';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store za sesije (START -> STOP)
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
                    sessionStore.createIndex('startTime', 'startTime', { unique: false });
                }

                // Store za checkpointe
                if (!db.objectStoreNames.contains('checkpoints')) {
                    const checkpointStore = db.createObjectStore('checkpoints', { keyPath: 'id', autoIncrement: true });
                    checkpointStore.createIndex('sessionId', 'sessionId', { unique: false });
                    checkpointStore.createIndex('status', 'status', { unique: false });
                }

                // Store za GPS track paths
                if (!db.objectStoreNames.contains('tracks')) {
                    const trackStore = db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
                    trackStore.createIndex('sessionId', 'sessionId', { unique: false });
                }
            };
        });
    }

    // Sesije
    async saveSession(session) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readwrite');
            const store = transaction.objectStore('sessions');
            const request = store.add(session);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getSession(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateSession(id, updates) {
        const session = await this.getSession(id);
        const updated = { ...session, ...updates };
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readwrite');
            const store = transaction.objectStore('sessions');
            const request = store.put(updated);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Checkpointi
    async saveCheckpoint(checkpoint) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['checkpoints'], 'readwrite');
            const store = transaction.objectStore('checkpoints');
            const request = store.add(checkpoint);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getCheckpointsBySession(sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['checkpoints'], 'readonly');
            const store = transaction.objectStore('checkpoints');
            const index = store.index('sessionId');
            const request = index.getAll(sessionId);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateCheckpoint(id, updates) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['checkpoints'], 'readwrite');
            const store = transaction.objectStore('checkpoints');
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const checkpoint = getRequest.result;
                const updated = { ...checkpoint, ...updates };
                const updateRequest = store.put(updated);
                
                updateRequest.onsuccess = () => resolve(updated);
                updateRequest.onerror = () => reject(updateRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteCheckpoint(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['checkpoints'], 'readwrite');
            const store = transaction.objectStore('checkpoints');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // GPS tracks
    async saveTrack(track) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            const request = store.add(track);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getTracksBySession(sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tracks'], 'readonly');
            const store = transaction.objectStore('tracks');
            const index = store.index('sessionId');
            const request = index.getAll(sessionId);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Export instance
const detektorDB = new DetektorDB();
