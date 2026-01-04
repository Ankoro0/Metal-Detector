// Glavna aplikacija
class DetektorTracker {
    constructor() {
        // State
        this.isTracking = false;
        this.currentSession = null;
        this.gpsWatchId = null;
        this.trackPoints = [];
        this.checkpoints = [];
        this.startTime = null;
        this.timerInterval = null;

        // GPS Filtering - GPSLogger Android sistem
        this.lastAcceptedPoint = null;
        this.currentGPSPosition = null;
        this.debugGPS = false; // Debug logging (false u produkciji za bateriju)
        
        // Parametri (GPSLogger style)
        this.minDistanceMeters = 5; // minimum distance
        this.maxAccuracyMeters = 40; // maximum acceptable accuracy
        this.minIntervalSeconds = 2; // minimum time between points
        this.maxSpeedMps = 15; // 15 m/s = 54 km/h (realistično za terensko kretanje)
        this.gpsSettlingTime = 3000; // 3s initial settling
        
        // Stationary detection buffer
        this.recentPoints = [];
        this.stationaryCheckCount = 10;
        this.stationaryRadiusMeters = 8; // SMANJENO - sobna šetnja > 8m = krećeš se
        
        // Kalman smoothing
        this.smoothedLat = null;
        this.smoothedLon = null;
        this.smoothingFactor = 0.3;

        // TEST MODE - simulirani GPS za desktop testiranje
        this.testMode = false;
        this.testLat = 44.787197; // Banja Luka (primer)
        this.testLon = 17.191000;
        this.testInterval = null;

        // Highlighted checkpoint za navigaciju
        this.highlightedCheckpoint = null;

        // Device Orientation (kompas)
        this.deviceHeading = null; // u radijanima - pravac telefona
        this.compassAvailable = false;

        // Geocoding cache (Nominatim rate limit protection)
        this.geocodingCache = new Map();

        // Drag-to-pan
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Canvas
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Coordinate system (relativan prema početnoj tački)
        this.originLat = null;
        this.originLon = null;
        this.scale = 50000; // pixels per degree (zoom nivo)
        this.minScale = 10000;
        this.maxScale = 200000;
        this.offsetX = 0;
        this.offsetY = 0;

        // UI elementi
        this.startBtn = document.getElementById('startBtn');
        this.testModeBtn = document.getElementById('testModeBtn');
        this.checkpointBtn = document.getElementById('checkpointBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.gpsStatus = document.getElementById('gpsStatus');
        this.gpsText = document.getElementById('gpsText');
        this.trackingInfo = document.getElementById('trackingInfo');
        this.distanceText = document.getElementById('distanceText');
        this.timeText = document.getElementById('timeText');
        this.checkpointsList = document.getElementById('checkpointsList');
        this.checkpointModal = document.getElementById('checkpointModal');
        this.checkpointName = document.getElementById('checkpointName');
        this.saveCheckpointBtn = document.getElementById('saveCheckpointBtn');
        this.cancelCheckpointBtn = document.getElementById('cancelCheckpointBtn');

        // Map controls
        this.centerMapBtn = document.getElementById('centerMapBtn');
        this.zoomInBtn = document.getElementById('zoomInBtn');
        this.zoomOutBtn = document.getElementById('zoomOutBtn');

        // Export/Import
        this.exportBtn = document.getElementById('exportBtn');
        this.importBtn = document.getElementById('importBtn');
        this.importFile = document.getElementById('importFile');
        this.copyAIBtn = document.getElementById('copyAIBtn');

        // Session management
        this.sessionSelect = document.getElementById('sessionSelect');
        this.newSessionBtn = document.getElementById('newSessionBtn');

        // Info banner
        this.infoBanner = document.getElementById('infoBanner');
        this.closeInfoBtn = document.getElementById('closeInfoBtn');

        this.init();
    }

    async init() {
        // Inicijalizuj bazu
        await detektorDB.init();
        
        // Setup canvas
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Event listeneri
        this.startBtn.addEventListener('click', () => this.startTracking());
        this.testModeBtn.addEventListener('click', () => this.startTestMode());
        this.stopBtn.addEventListener('click', () => this.stopTracking());
        this.checkpointBtn.addEventListener('click', () => this.openCheckpointModal());
        this.saveCheckpointBtn.addEventListener('click', () => this.saveCheckpoint());
        this.cancelCheckpointBtn.addEventListener('click', () => this.closeCheckpointModal());

        // Map controls
        this.centerMapBtn.addEventListener('click', () => this.centerMap());
        this.zoomInBtn.addEventListener('click', () => this.zoom(1.3));
        this.zoomOutBtn.addEventListener('click', () => this.zoom(0.7));

        // Export/Import
        this.exportBtn.addEventListener('click', () => this.exportData());
        this.importBtn.addEventListener('click', () => this.importFile.click());
        this.importFile.addEventListener('change', (e) => this.importData(e));
        this.copyAIBtn.addEventListener('click', () => this.copyForAI());

        // Session management
        this.sessionSelect.addEventListener('change', (e) => this.switchSession(e.target.value));
        this.newSessionBtn.addEventListener('click', () => this.createNewSession());

        // Info banner
        this.closeInfoBtn.addEventListener('click', () => this.closeInfoBanner());

        // Proveri GPS dostupnost
        this.checkGPSAvailability();

        // Učitaj sve sesije i poslednju sesiju
        await this.loadSessions();
        await this.loadLastSession();

        // Prikaži info banner ako korisnik prvi put pokreće app
        this.showInfoBannerIfFirstTime();

        // Inicijalizuj kompas (Device Orientation)
        this.initCompass();

        // Drag-to-pan event listeneri
        this.canvas.addEventListener('mousedown', (e) => this.onDragStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.onDragMove(e));
        this.canvas.addEventListener('mouseup', () => this.onDragEnd());
        this.canvas.addEventListener('mouseleave', () => this.onDragEnd());

        // Touch support za mobilni
        this.canvas.addEventListener('touchstart', (e) => this.onDragStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.onDragMove(e));
        this.canvas.addEventListener('touchend', () => this.onDragEnd());
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.canvas.style.cursor = 'grab'; // drag cursor
        this.draw();
    }

    async initCompass() {
        // Proveri da li je kompas dostupan
        if (!window.DeviceOrientationEvent) {
            console.log('Device Orientation nije dostupan');
            return;
        }

        // iOS 13+ zahteva permission
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    this.compassAvailable = true;
                    this.startCompass();
                }
            } catch (error) {
                console.log('Kompas permission odbijen:', error);
            }
        } else {
            // Android ili stariji iOS
            this.compassAvailable = true;
            this.startCompass();
        }
    }

    startCompass() {
        window.addEventListener('deviceorientationabsolute', (event) => {
            if (event.alpha !== null) {
                // alpha je kompas heading (0-360°, 0=sever)
                // Konvertuj u radijane i invertiraj (jer canvas radi suprotno)
                this.deviceHeading = -(event.alpha * Math.PI / 180);
                this.draw(); // refresh canvas sa novim heading-om
            }
        });

        // Fallback za browsere koji nemaju deviceorientationabsolute
        window.addEventListener('deviceorientation', (event) => {
            if (event.alpha !== null && this.deviceHeading === null) {
                this.deviceHeading = -(event.alpha * Math.PI / 180);
                this.draw();
            }
        });
    }

    // ===== DRAG TO PAN =====

    onDragStart(event) {
        const pos = this.getEventPosition(event);
        this.isDragging = true;
        this.dragStartX = pos.x - this.dragOffsetX;
        this.dragStartY = pos.y - this.dragOffsetY;
        this.canvas.style.cursor = 'grabbing';
    }

    onDragMove(event) {
        if (!this.isDragging) return;
        
        const pos = this.getEventPosition(event);
        this.dragOffsetX = pos.x - this.dragStartX;
        this.dragOffsetY = pos.y - this.dragStartY;
        
        // Odmah update offset
        this.offsetX = this.canvas.width / 2 + this.dragOffsetX;
        this.offsetY = this.canvas.height / 2 + this.dragOffsetY;
        
        this.draw();
    }

    onDragEnd() {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
    }

    getEventPosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        
        if (event.touches && event.touches.length > 0) {
            // Touch event
            return {
                x: event.touches[0].clientX - rect.left,
                y: event.touches[0].clientY - rect.top
            };
        } else {
            // Mouse event
            return {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };
        }
    }

    checkGPSAvailability() {
        if ('geolocation' in navigator) {
            // Proveri localStorage da li je korisnik već odobrio
            const gpsPermission = localStorage.getItem('gps_permission_status');
            
            if (gpsPermission === 'granted') {
                this.gpsText.textContent = 'GPS Spreman ✓';
            } else if (gpsPermission === 'denied') {
                this.gpsText.textContent = 'GPS Odbijen - Proveri podešavanja';
                this.startBtn.disabled = true;
            } else {
                this.gpsText.textContent = 'GPS Spreman (klikni START)';
            }
        } else {
            this.gpsText.textContent = 'GPS Nije Dostupan';
            this.startBtn.disabled = true;
        }
    }

    // ===== SESSION MANAGEMENT =====

    async loadSessions() {
        console.log('🔄 SESSION MANAGEMENT v2.0 - Upload successful!');
        const sessions = await detektorDB.getAllSessions();
        
        // Sortiraj po datumu (najnovije prvo)
        sessions.sort((a, b) => b.startTime - a.startTime);
        
        // Popuni dropdown
        this.sessionSelect.innerHTML = '<option value="">-- New Session --</option>';
        sessions.forEach(session => {
            const option = document.createElement('option');
            option.value = session.id;
            const date = new Date(session.startTime).toLocaleDateString('sr-RS');
            const name = session.name || `Sesija ${date}`;
            option.textContent = `${name} (${date})`;
            this.sessionSelect.appendChild(option);
        });
    }

    async loadLastSession() {
        const sessions = await detektorDB.getAllSessions();
        if (sessions.length === 0) return;
        
        // Sortiraj i uzmi poslednju
        sessions.sort((a, b) => b.startTime - a.startTime);
        const lastSession = sessions[0];
        
        // Postavi kao trenutnu
        this.currentSession = lastSession.id;
        this.sessionSelect.value = lastSession.id;
        
        // Učitaj podatke
        await this.loadSessionData(lastSession.id);
    }

    async switchSession(sessionId) {
        if (!sessionId) {
            // Nova sesija - očisti sve
            this.currentSession = null;
            this.trackPoints = [];
            this.checkpoints = [];
            this.renderCheckpoints();
            this.draw();
            return;
        }
        
        // Učitaj izabranu sesiju
        this.currentSession = parseInt(sessionId);
        await this.loadSessionData(this.currentSession);
    }

    async loadSessionData(sessionId) {
        // Učitaj track
        const tracks = await detektorDB.getTracksBySession(sessionId);
        this.trackPoints = tracks.length > 0 ? tracks[0].points : [];
        
        // Učitaj checkpointe
        this.checkpoints = await detektorDB.getCheckpointsBySession(sessionId);
        
        // Postavi origin ako ima tačaka
        if (this.trackPoints.length > 0) {
            this.originLat = this.trackPoints[0].lat;
            this.originLon = this.trackPoints[0].lon;
            this.lastAcceptedPoint = this.trackPoints[this.trackPoints.length - 1];
        }
        
        // Renderuj
        this.renderCheckpoints();
        this.centerMap();
    }

    async createNewSession() {
        const name = prompt('Naziv lokacije (npr: Lovćen, Gnjijevi Do, Bukovica):');
        if (!name) return;
        
        const session = {
            name: name.trim(),
            startTime: Date.now(),
            endTime: null,
            totalDistance: 0
        };
        
        const sessionId = await detektorDB.saveSession(session);
        this.currentSession = sessionId;
        
        // Refresh dropdown i selektuj novu
        await this.loadSessions();
        this.sessionSelect.value = sessionId;
        
        // Očisti trenutne podatke
        this.trackPoints = [];
        this.checkpoints = [];
        this.renderCheckpoints();
        this.draw();
        
        alert(`✅ Sesija "${name}" kreirana!`);
    }

    // ===== TRACKING =====
    
    async startTestMode() {
        // TEST MODE - simulira GPS za desktop testiranje
        this.testMode = true;
        
        this.isTracking = true;
        this.startTime = Date.now();
        this.trackPoints = [];
        this.checkpoints = [];

        // Kreiraj sesiju
        const session = {
            startTime: this.startTime,
            endTime: null,
            totalDistance: 0
        };

        this.currentSession = await detektorDB.saveSession(session);

        // UI update
        this.startBtn.classList.add('hidden');
        this.testModeBtn.classList.add('hidden');
        this.checkpointBtn.classList.remove('hidden');
        this.checkpointBtn.disabled = false;
        this.stopBtn.classList.remove('hidden');
        this.trackingInfo.classList.remove('hidden');
        this.gpsStatus.querySelector('.gps-indicator').classList.add('active');
        this.gpsText.textContent = '🧪 TEST MODE - Simulirani GPS';

        // Start timer
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);

        // Simuliraj GPS update svake 2 sekunde
        this.testInterval = setInterval(() => {
            // Simuliraj hodanje (random mali pomak)
            this.testLat += (Math.random() - 0.5) * 0.0001; // ~10m pomak
            this.testLon += (Math.random() - 0.5) * 0.0001;

            const position = {
                coords: {
                    latitude: this.testLat,
                    longitude: this.testLon,
                    accuracy: 5 // perfektna tačnost u test modu
                }
            };

            this.handleGPSUpdate(position);
        }, 2000);
    }
    
    async startTracking() {
        if (!navigator.geolocation) {
            alert('GPS nije dostupan na ovom uređaju!');
            return;
        }

        // Proveri GPS dozvolu prvo
        try {
            const permission = await navigator.permissions.query({ name: 'geolocation' });
            
            if (permission.state === 'denied') {
                alert('GPS je blokiran! Omogući ga u podešavanjima browsera.');
                localStorage.setItem('gps_permission_status', 'denied');
                this.checkGPSAvailability();
                return;
            }
            
            if (permission.state === 'granted') {
                localStorage.setItem('gps_permission_status', 'granted');
            }
        } catch (e) {
            // Permissions API nije dostupan na svim browserima
            console.log('Permissions API nedostupan, nastavlja normalno');
        }

        this.isTracking = true;
        this.startTime = Date.now();
        this.trackPoints = [];
        this.checkpoints = [];

        // Kreiraj sesiju (ili koristi izabranu)
        if (!this.currentSession) {
            const name = prompt('Naziv lokacije (npr: Lovćen, Gnjijevi Do):') || 'Neimenovana lokacija';
            const session = {
                name: name.trim(),
                startTime: this.startTime,
                endTime: null,
                totalDistance: 0
            };
            this.currentSession = await detektorDB.saveSession(session);
            await this.loadSessions(); // Refresh dropdown
            this.sessionSelect.value = this.currentSession;
        }

        // Start GPS tracking
        this.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                // Sačuvaj da je GPS uspešno radio
                localStorage.setItem('gps_permission_status', 'granted');
                this.handleGPSUpdate(position);
            },
            (error) => this.handleGPSError(error),
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );

        // UI update
        this.startBtn.classList.add('hidden');
        this.testModeBtn.classList.add('hidden');
        this.checkpointBtn.classList.remove('hidden');
        this.checkpointBtn.disabled = true; // dok ne dobijemo prvi GPS signal
        this.stopBtn.classList.remove('hidden');
        this.trackingInfo.classList.remove('hidden');
        this.gpsStatus.querySelector('.gps-indicator').classList.add('active');
        this.gpsText.textContent = 'GPS Aktiviran';

        // Start timer
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);
    }

    handleGPSUpdate(position) {
        const { latitude, longitude, accuracy } = position.coords;
        const timestamp = Date.now();

        // UVEK čuvaj raw GPS
        this.currentGPSPosition = {
            lat: latitude,
            lon: longitude,
            accuracy: accuracy,
            timestamp: timestamp
        };

        // Buffer za stationary - SAMO DOBRE TAČKE (ChatGPT fix!)
        if (accuracy && accuracy <= this.maxAccuracyMeters) {
            this.recentPoints.push({lat: latitude, lon: longitude, accuracy: accuracy, time: timestamp});
            if (this.recentPoints.length > this.stationaryCheckCount) {
                this.recentPoints.shift();
            }
        }

        // FILTER 1: Settling
        const timeSinceStart = timestamp - this.startTime;
        if (timeSinceStart < this.gpsSettlingTime && this.trackPoints.length === 0) {
            this.gpsText.textContent = `GPS Settling ${Math.floor((this.gpsSettlingTime - timeSinceStart) / 1000)}s`;
            return;
        }

        // FILTER 2: Stale location (GPSLogger)
        if (this.lastAcceptedPoint && timestamp <= this.lastAcceptedPoint.timestamp) {
            if (this.debugGPS) console.log('❌ Stale GPS');
            return;
        }

        // FILTER 3: Time interval (GPSLogger)
        if (this.lastAcceptedPoint) {
            const timeDiff = (timestamp - this.lastAcceptedPoint.timestamp) / 1000;
            if (timeDiff < this.minIntervalSeconds) {
                this.updateSmoothedPosition(latitude, longitude);
                return;
            }
        }

        // FILTER 4: Accuracy (GPSLogger)
        if (!accuracy || accuracy > this.maxAccuracyMeters) {
            if (this.debugGPS) console.log(`❌ Accuracy: ${accuracy ? accuracy.toFixed(0) : 'N/A'}m`);
            this.gpsText.textContent = `GPS Weak (${accuracy ? accuracy.toFixed(0) : '?'}m)`;
            return;
        }

        // FILTER 5: GPS JUMP DETECTION (GPSLogger method!)
        if (this.lastAcceptedPoint) {
            const distance = this.haversineDistance(
                this.lastAcceptedPoint.lat,
                this.lastAcceptedPoint.lon,
                latitude,
                longitude
            );
            const timeDiff = (timestamp - this.lastAcceptedPoint.timestamp) / 1000;
            
            if (timeDiff > 0) {
                const speed = distance / timeDiff; // m/s
                
                if (speed > this.maxSpeedMps) {
                    if (this.debugGPS) console.log(`❌ GPS JUMP: ${distance.toFixed(0)}m in ${timeDiff.toFixed(1)}s = ${(speed * 3.6).toFixed(0)} km/h`);
                    return;
                }
            }
        }

        // FILTER 6: Distance threshold (PRIJE stationary - ChatGPT order fix!)
        if (this.lastAcceptedPoint) {
            const distance = this.haversineDistance(
                this.lastAcceptedPoint.lat,
                this.lastAcceptedPoint.lon,
                latitude,
                longitude
            );

            if (distance < this.minDistanceMeters) {
                this.updateSmoothedPosition(latitude, longitude);
                return;
            }
        }

        // FILTER 7: STATIONARY (anti-drift) - zadnji check da bi distance imao prednost
        if (this.isStationary()) {
            if (this.debugGPS) console.log('🛑 Stationary');
            this.gpsText.textContent = 'GPS (stationary)';
            this.updateSmoothedPosition(latitude, longitude);
            return;
        }

        // ✅ ALL FILTERS PASSED!
        this.updateSmoothedPosition(latitude, longitude);
        const finalLat = this.smoothedLat || latitude;
        const finalLon = this.smoothedLon || longitude;

        if (this.trackPoints.length === 0) {
            this.originLat = finalLat;
            this.originLon = finalLon;
            this.offsetX = this.canvas.width / 2;
            this.offsetY = this.canvas.height / 2;
            this.checkpointBtn.disabled = false;
        }

        const point = {
            lat: finalLat,
            lon: finalLon,
            accuracy: accuracy,
            timestamp: timestamp
        };

        this.trackPoints.push(point);
        this.lastAcceptedPoint = point;

        const totalDist = this.calculateTotalDistance();
        if (this.debugGPS) console.log(`✅ GPS: ${accuracy.toFixed(0)}m | Total: ${totalDist.toFixed(0)}m`);
        this.gpsText.textContent = `GPS Active (${accuracy.toFixed(0)}m)`;

        this.updateDistance();
        requestAnimationFrame(() => this.draw());
    }

    isStationary() {
        // Proveri da li si u krugu stationaryRadius poslednjih N tačaka
        if (this.recentPoints.length < 5) return false;

        // ACCURACY CHECK (ChatGPT fix!) - ne tvrdi da stojiš ako GPS nije siguran
        const worstAcc = Math.max(...this.recentPoints.map(p => p.accuracy || 0));
        if (worstAcc > this.stationaryRadiusMeters) {
            if (this.debugGPS) console.log(`📍 Stationary SKIP: worst accuracy ${worstAcc.toFixed(0)}m > ${this.stationaryRadiusMeters}m`);
            return false;
        }

        // Izračunaj centroid (prosek) poslednjih tačaka - KORISTI RAW (ChatGPT critical fix!)
        let sumLat = 0, sumLon = 0;
        this.recentPoints.forEach(p => {
            // Koristi RAW pozicije za svaku tačku posebno!
            sumLat += p.lat;
            sumLon += p.lon;
        });
        const centerLat = sumLat / this.recentPoints.length;
        const centerLon = sumLon / this.recentPoints.length;

        // Proveri da li su SVE tačke u krugu od centroida
        let maxDist = 0;
        for (let p of this.recentPoints) {
            // RAW pozicije, ne smoothed!
            const dist = this.haversineDistance(centerLat, centerLon, p.lat, p.lon);
            if (dist > maxDist) maxDist = dist;
        }

        // DINAMIČNI RADIUS: prilagodi accuracy-ju (ChatGPT suggestion!)
        const dynamicRadius = Math.max(
            this.stationaryRadiusMeters,
            this.currentGPSPosition?.accuracy ?? 0
        );

        // DEBUG: prikaži radius check
        if (this.debugGPS) console.log(`📍 Stationary: maxDist=${maxDist.toFixed(1)}m, threshold=${dynamicRadius.toFixed(1)}m`);

        // Ako je najdalja tačka < radius, stojiš!
        return maxDist < dynamicRadius;
    }

    updateSmoothedPosition(lat, lon) {
        // Exponential moving average (simple Kalman filter)
        if (this.smoothedLat === null) {
            this.smoothedLat = lat;
            this.smoothedLon = lon;
        } else {
            this.smoothedLat = this.smoothedLat * (1 - this.smoothingFactor) + lat * this.smoothingFactor;
            this.smoothedLon = this.smoothedLon * (1 - this.smoothingFactor) + lon * this.smoothingFactor;
        }

        // Update current position with smoothed values
        this.currentGPSPosition = {
            lat: this.smoothedLat,
            lon: this.smoothedLon,
            accuracy: this.currentGPSPosition?.accuracy ?? null,
            timestamp: Date.now()
        };
    }

    handleGPSError(error) {
        console.error('GPS Error:', error);
        
        let message = '';
        
        switch(error.code) {
            case error.PERMISSION_DENIED:
                message = 'GPS Odbijen - Dozvoli u podešavanjima';
                localStorage.setItem('gps_permission_status', 'denied');
                this.startBtn.disabled = true;
                break;
            case error.POSITION_UNAVAILABLE:
                message = 'GPS Nedostupan - Proveri signal';
                break;
            case error.TIMEOUT:
                message = 'GPS Timeout - Pokušaj ponovo';
                break;
            default:
                message = `GPS Greška: ${error.message}`;
        }
        
        this.gpsText.textContent = message;
        
        // Ako je permission denied, zaustavi tracking
        if (error.code === error.PERMISSION_DENIED) {
            this.stopTracking();
        }
    }

    stopTracking() {
        if (!this.isTracking) return;

        // Zaustavi GPS
        if (this.gpsWatchId) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }

        // Zaustavi test mode interval
        if (this.testInterval) {
            clearInterval(this.testInterval);
            this.testInterval = null;
        }

        // Zaustavi timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // Sačuvaj sesiju
        if (this.currentSession) {
            detektorDB.updateSession(this.currentSession, {
                endTime: Date.now(),
                totalDistance: this.calculateTotalDistance()
            });

            // Sačuvaj track
            detektorDB.saveTrack({
                sessionId: this.currentSession,
                points: this.trackPoints
            });
        }

        // Reset state
        this.isTracking = false;
        this.currentSession = null;
        this.testMode = false;

        // UI update
        this.startBtn.classList.remove('hidden');
        this.testModeBtn.classList.remove('hidden');
        this.checkpointBtn.classList.add('hidden');
        this.stopBtn.classList.add('hidden');
        this.trackingInfo.classList.add('hidden');
        this.gpsStatus.querySelector('.gps-indicator').classList.remove('active');
        this.gpsText.textContent = 'GPS Neaktivan';
    }

    // ===== CHECKPOINT =====
    
    openCheckpointModal() {
        this.checkpointModal.classList.remove('hidden');
        this.checkpointName.value = '';
        this.checkpointName.focus();
    }

    closeCheckpointModal() {
        this.checkpointModal.classList.add('hidden');
    }

    async saveCheckpoint() {
        const name = this.checkpointName.value.trim();
        const signalStrength = document.getElementById('checkpointSignal').value;
        const depth = document.getElementById('checkpointDepth').value;
        const idRange = document.getElementById('checkpointIDRange').value;
        const notes = document.getElementById('checkpointNotes').value.trim();
        
        if (!name) {
            alert('Unesite opis mete!');
            return;
        }

        // Koristi TRENUTNU GPS poziciju (ne poslednji track point!)
        if (!this.currentGPSPosition) {
            alert('Nema GPS podataka!');
            return;
        }

        //ВАЖНО: Dodaj trenutnu poziciju u trackPoints ako nije već tu
        const lastPoint = this.trackPoints[this.trackPoints.length - 1];
        const distFromLast = lastPoint ? this.haversineDistance(
            lastPoint.lat, lastPoint.lon,
            this.currentGPSPosition.lat, this.currentGPSPosition.lon
        ) : Infinity;

        // Ako je trenutna pozicija > 1m od poslednje, dodaj je
        if (distFromLast > 1) {
            this.trackPoints.push({
                lat: this.currentGPSPosition.lat,
                lon: this.currentGPSPosition.lon,
                accuracy: this.currentGPSPosition.accuracy,
                timestamp: Date.now()
            });
        }

        const checkpoint = {
            sessionId: this.currentSession,
            name: name,
            lat: this.currentGPSPosition.lat,
            lon: this.currentGPSPosition.lon,
            timestamp: Date.now(),
            status: 'ACTIVE', // ACTIVE, DUG, IGNORED, RECHECK
            trackIndex: this.trackPoints.length - 1, // index umesto kopije patha!
            distanceFromStart: this.calculateTotalDistance(),
            // Strukturirani podaci za AI analizu
            signalStrength: signalStrength || 'medium',
            depth: depth || '',
            idRange: idRange || '',
            notes: notes
        };

        const checkpointId = await detektorDB.saveCheckpoint(checkpoint);
        checkpoint.id = checkpointId;
        
        this.checkpoints.push(checkpoint);
        this.renderCheckpoints();
        this.closeCheckpointModal();
        this.draw();
    }

    async loadCheckpoints() {
        if (!this.currentSession) return;
        
        this.checkpoints = await detektorDB.getCheckpointsBySession(this.currentSession);
        this.renderCheckpoints();
    }

    renderCheckpoints() {
        if (this.checkpoints.length === 0) {
            this.checkpointsList.innerHTML = '<p class="empty-state">Nema checkpointa. Klikni START i kreni sa detektorom.</p>';
            return;
        }

        this.checkpointsList.innerHTML = this.checkpoints.map((cp, index) => {
            const statusEmoji = {
                'ACTIVE': '📍',
                'DUG': '✔️',
                'IGNORED': '❌',
                'RECHECK': '🔄'
            };
            
            const statusClass = cp.status.toLowerCase();
            const statusText = {
                'ACTIVE': 'Aktivna',
                'DUG': 'Iskopana',
                'IGNORED': 'Ignorisana',
                'RECHECK': 'Proveri Opet'
            };

            return `
                <div class="checkpoint-item status-${statusClass}" data-id="${cp.id}">
                    <div class="checkpoint-info">
                        <div class="checkpoint-name">
                            ${statusEmoji[cp.status]} Meta ${index + 1}: ${cp.name}
                        </div>
                        <div class="checkpoint-meta">
                            ${new Date(cp.timestamp).toLocaleString('sr-RS')} • ${cp.distanceFromStart.toFixed(0)}m<br>
                            Signal: <strong>${this.getSignalLabel(cp.signalStrength)}</strong>
                            ${cp.depth ? ` • Dubina: ${cp.depth} linija` : ''}
                            ${cp.idRange ? ` • ${cp.idRange}` : ''}<br>
                            <em class="status-badge">${statusText[cp.status]}</em>
                        </div>
                    </div>
                    <div class="checkpoint-actions">
                        ${cp.status === 'ACTIVE' ? `
                            <button class="btn-small btn-nav" onclick="app.navigateToCheckpoint(${cp.id})">Navigiraj</button>
                            <button class="btn-small btn-dig" onclick="app.changeStatus(${cp.id}, 'DUG')">Iskopano</button>
                            <button class="btn-small btn-ignore" onclick="app.changeStatus(${cp.id}, 'IGNORED')">Ignoriši</button>
                        ` : ''}
                        ${cp.status === 'DUG' || cp.status === 'IGNORED' ? `
                            <button class="btn-small btn-recheck" onclick="app.changeStatus(${cp.id}, 'RECHECK')">Proveri Opet</button>
                        ` : ''}
                        ${cp.status === 'RECHECK' ? `
                            <button class="btn-small btn-nav" onclick="app.navigateToCheckpoint(${cp.id})">Navigiraj</button>
                            <button class="btn-small btn-dig" onclick="app.changeStatus(${cp.id}, 'DUG')">Iskopano</button>
                        ` : ''}
                        <button class="btn-small btn-delete" onclick="app.deleteCheckpoint(${cp.id})">Obriši</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async changeStatus(checkpointId, newStatus) {
        const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);
        if (!checkpoint) return;

        checkpoint.status = newStatus;
        await detektorDB.updateCheckpoint(checkpointId, { status: newStatus });
        
        this.renderCheckpoints();
        this.draw();
    }

    getSignalLabel(strength) {
        const labels = {
            'weak': 'Slab',
            'medium': 'Srednji',
            'strong': 'Jak',
            'very-strong': 'Veoma Jak'
        };
        return labels[strength] || 'Nepoznato';
    }

    async deleteCheckpoint(checkpointId) {
        if (!confirm('Da li ste sigurni da želite obrisati ovaj checkpoint?')) return;

        await detektorDB.deleteCheckpoint(checkpointId);
        this.checkpoints = this.checkpoints.filter(cp => cp.id !== checkpointId);
        
        this.renderCheckpoints();
        this.draw();
    }

    navigateToCheckpoint(checkpointId) {
        const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);
        if (!checkpoint) return;

        // TODO: Implementiraj navigaciju - prikaži putanju na mapi
        alert(`Navigacija do: ${checkpoint.name}\nLat: ${checkpoint.lat}, Lon: ${checkpoint.lon}`);
    }

    // ===== MATH & UTILS =====
    
    calculateTotalDistance() {
        let total = 0;
        for (let i = 1; i < this.trackPoints.length; i++) {
            const d = this.haversineDistance(
                this.trackPoints[i - 1].lat,
                this.trackPoints[i - 1].lon,
                this.trackPoints[i].lat,
                this.trackPoints[i].lon
            );
            total += d;
        }
        return total;
    }

    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Radius Zemlje u metrima
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    calculateBearing(lat1, lon1, lat2, lon2) {
        // Vraća bearing (pravac) u radijanima
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;
        
        const y = Math.sin(dLon) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
        
        return Math.atan2(y, x);
    }

    // ===== PATHFINDING - Najkraći STVARNI put =====

    findShortestWalkedPath(targetIndex) {
        // Dijkstra algoritam - nađi najkraću kombinaciju stvarnih segmenata
        if (targetIndex <= 0 || targetIndex >= this.trackPoints.length) {
            return [0, targetIndex]; // direktno ako nema puta
        }

        const distances = new Array(this.trackPoints.length).fill(Infinity);
        const previous = new Array(this.trackPoints.length).fill(null);
        const visited = new Set();
        
        distances[0] = 0; // start sa 0 distance

        // Failsafe: max iterations
        let iterations = 0;
        const maxIterations = this.trackPoints.length * 2;

        while (visited.size < this.trackPoints.length && iterations < maxIterations) {
            iterations++;
            
            // Nađi closest unvisited node
            let minDist = Infinity;
            let minIndex = -1;
            
            for (let i = 0; i < this.trackPoints.length; i++) {
                if (!visited.has(i) && distances[i] < minDist) {
                    minDist = distances[i];
                    minIndex = i;
                }
            }

            if (minIndex === -1 || minIndex === targetIndex) break;
            
            visited.add(minIndex);

            // Update neighbors (proverimo sve tačke - možda smo se vratili)
            for (let neighbor = 0; neighbor < this.trackPoints.length; neighbor++) {
                if (visited.has(neighbor)) continue;
                
                // Distance između minIndex i neighbor
                const dist = this.haversineDistance(
                    this.trackPoints[minIndex].lat,
                    this.trackPoints[minIndex].lon,
                    this.trackPoints[neighbor].lat,
                    this.trackPoints[neighbor].lon
                );

                // Ako su tačke blizu (< 20m za fleksibilnost), smatraj ih povezanim
                if (dist < 20) {
                    const newDist = distances[minIndex] + dist;
                    
                    if (newDist < distances[neighbor]) {
                        distances[neighbor] = newDist;
                        previous[neighbor] = minIndex;
                    }
                }
            }
        }

        // Reconstruct path
        const path = [];
        let current = targetIndex;
        
        while (current !== null && path.length < this.trackPoints.length) {
            path.unshift(current);
            current = previous[current];
            
            // Failsafe: prevent infinite loop
            if (path.length > this.trackPoints.length) {
                console.warn('Pathfinding loop detected, falling back to direct path');
                return this.getSimplifiedPath(targetIndex);
            }
        }

        // FAILSAFE: ako pathfinding ne uspe, koristi pojednostavljen put
        if (path.length === 0 || path[0] !== 0) {
            console.warn('No valid path found, using simplified path');
            return this.getSimplifiedPath(targetIndex);
        }

        return path;
    }

    getSimplifiedPath(targetIndex) {
        // Fallback: uzmi svaki N-ti point za pojednostavljen put
        const simplifiedPath = [0]; // start
        const step = Math.max(1, Math.floor(targetIndex / 10)); // max 10 segmenata
        
        for (let i = step; i < targetIndex; i += step) {
            simplifiedPath.push(i);
        }
        
        simplifiedPath.push(targetIndex); // kraj
        return simplifiedPath;
    }

    updateDistance() {
        const distance = this.calculateTotalDistance();
        this.distanceText.textContent = distance > 1000 
            ? `${(distance / 1000).toFixed(2)}km`
            : `${distance.toFixed(0)}m`;
    }

    updateTimer() {
        if (!this.startTime) return;
        
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        
        this.timeText.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // ===== CANVAS DRAWING =====
    
    latLonToCanvas(lat, lon) {
        if (this.originLat === null || this.originLon === null) {
            return { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        }

        const x = this.offsetX + (lon - this.originLon) * this.scale;
        const y = this.offsetY - (lat - this.originLat) * this.scale;
        
        return { x, y };
    }

    draw() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear canvas - siva pozadina
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(0, 0, width, height);

        // Grid (opciono - minimalistički)
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 1;
        const gridSize = 50;
        
        for (let x = 0; x < width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        if (this.trackPoints.length === 0) {
            // Početni text
            ctx.fillStyle = '#7f8c8d';
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Klikni START da počneš tracking', width / 2, height / 2);
            return;
        }

        // NE crtaj plavu track liniju - samo prati u pozadini!
        // Track se koristi samo za pathfinding do checkpointa

        // Crta checkpointe sa NAJKRAĆOM STVARNOM RUTOM
        this.checkpoints.forEach((cp, index) => {
            const point = this.latLonToCanvas(cp.lat, cp.lon);
            
            // Nađi najkraći STVARNI put od START do checkpointa
            if (cp.trackIndex !== undefined && cp.trackIndex > 0) {
                const isHighlighted = this.highlightedCheckpoint === cp.id;
                const path = this.findShortestWalkedPath(cp.trackIndex);
                
                ctx.strokeStyle = isHighlighted ? '#f39c12' : (cp.status === 'DUG' ? '#95a5a6' : '#2ecc71');
                ctx.lineWidth = isHighlighted ? 4 : 3;
                ctx.setLineDash([]);
                ctx.beginPath();

                // Crta optimizovanu rutu
                if (path.length > 0) {
                    const firstPoint = this.latLonToCanvas(
                        this.trackPoints[path[0]].lat,
                        this.trackPoints[path[0]].lon
                    );
                    ctx.moveTo(firstPoint.x, firstPoint.y);

                    for (let i = 1; i < path.length; i++) {
                        const pathPoint = this.latLonToCanvas(
                            this.trackPoints[path[i]].lat,
                            this.trackPoints[path[i]].lon
                        );
                        ctx.lineTo(pathPoint.x, pathPoint.y);
                    }
                }

                ctx.stroke();
            }

            // Checkpoint marker - različite boje po statusu
            const statusColors = {
                'ACTIVE': '#3498db',
                'DUG': '#2ecc71',
                'IGNORED': '#e74c3c',
                'RECHECK': '#f39c12'
            };
            
            ctx.fillStyle = statusColors[cp.status] || '#3498db';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
            ctx.fill();

            // Broj checkpointa
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((index + 1).toString(), point.x, point.y);
        });

        // Trenutna pozicija (pulsira) sa strelicom pravca
        if (this.isTracking && this.trackPoints.length > 0) {
            const current = this.trackPoints[this.trackPoints.length - 1];
            const point = this.latLonToCanvas(current.lat, current.lon);

            // Puls efekat
            const pulseSize = 15 + Math.sin(Date.now() / 200) * 5;
            
            ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
            ctx.beginPath();
            ctx.arc(point.x, point.y, pulseSize, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#3498db';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();

            // KOMPAS STRELICA (pravac telefona)
            if (this.deviceHeading !== null) {
                ctx.save();
                ctx.translate(point.x, point.y);
                ctx.rotate(this.deviceHeading);
                
                // Trougao strelica (SEVER - gore)
                ctx.fillStyle = '#e74c3c'; // crvena strelica
                ctx.beginPath();
                ctx.moveTo(0, -15); // vrh
                ctx.lineTo(-6, 3);  // levo
                ctx.lineTo(6, 3);   // desno
                ctx.closePath();
                ctx.fill();
                
                // Beli okvir
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                ctx.restore();
            } else {
                // Ako nema kompasa, prikaži N (north) iznad kruga
                ctx.fillStyle = '#95a5a6';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('N', point.x, point.y - 25);
            }
        }

        // Start pozicija
        if (this.trackPoints.length > 0) {
            const start = this.latLonToCanvas(this.trackPoints[0].lat, this.trackPoints[0].lon);
            
            ctx.fillStyle = '#2ecc71';
            ctx.beginPath();
            ctx.arc(start.x, start.y, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S', start.x, start.y);
        }
    }

    // ===== MAP CONTROLS =====

    centerMap() {
        // Auto-fit: prilagodi skalu i centar da obuhvata sve tačke
        if (this.trackPoints.length === 0) return;

        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;

        this.trackPoints.forEach(point => {
            minLat = Math.min(minLat, point.lat);
            maxLat = Math.max(maxLat, point.lat);
            minLon = Math.min(minLon, point.lon);
            maxLon = Math.max(maxLon, point.lon);
        });

        // Centar
        const centerLat = (minLat + maxLat) / 2;
        const centerLon = (minLon + maxLon) / 2;

        // Postavi origin na centar
        this.originLat = centerLat;
        this.originLon = centerLon;

        // Izračunaj idealnu skalu
        const latRange = maxLat - minLat;
        const lonRange = maxLon - minLon;

        const scaleForLat = (this.canvas.height * 0.8) / latRange;
        const scaleForLon = (this.canvas.width * 0.8) / lonRange;
        
        this.scale = Math.min(scaleForLat, scaleForLon, this.maxScale);
        this.scale = Math.max(this.scale, this.minScale);

        // Centriraj canvas
        this.offsetX = this.canvas.width / 2;
        this.offsetY = this.canvas.height / 2;

        this.draw();
    }

    zoom(factor) {
        const newScale = this.scale * factor;
        
        if (newScale >= this.minScale && newScale <= this.maxScale) {
            this.scale = newScale;
            this.draw();
        }
    }

    // ===== COPY FOR AI =====

    async copyForAI() {
        if (this.checkpoints.length === 0) {
            alert('Nema checkpointa za analizu!');
            return;
        }

        // Prikaži loading
        this.copyAIBtn.disabled = true;
        this.copyAIBtn.textContent = '⏳ Priprema...';

        try {
            // Reverse geocoding za svaki checkpoint (ako ima net)
            const checkpointsWithLocation = await Promise.all(
                this.checkpoints.map(async (cp) => {
                    let locationName = `${cp.lat.toFixed(6)}, ${cp.lon.toFixed(6)}`;
                    let terrainType = '';
                    
                    // CACHE CHECK (Nominatim rate limit protection)
                    const cacheKey = `${cp.lat.toFixed(4)},${cp.lon.toFixed(4)}`;
                    if (this.geocodingCache.has(cacheKey)) {
                        const cached = this.geocodingCache.get(cacheKey);
                        return { ...cp, locationName: cached.locationName, terrainType: cached.terrainType };
                    }
                    
                    try {
                        // Nominatim API (OpenStreetMap) - DETALJNI podaci
                        const response = await fetch(
                            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${cp.lat}&lon=${cp.lon}&accept-language=sr&addressdetails=1&extratags=1`,
                            { headers: { 'User-Agent': 'DetektorTracker/1.0' } }
                        );
                        
                        if (response.ok) {
                            const data = await response.json();
                            
                            // Parsiraj detaljnu lokaciju
                            const address = data.address || {};
                            const parts = [];
                            
                            // Dodaj naselje/selo
                            if (address.village) parts.push(address.village);
                            else if (address.suburb) parts.push(address.suburb);
                            else if (address.hamlet) parts.push(address.hamlet);
                            else if (address.neighbourhood) parts.push(address.neighbourhood);
                            
                            // Dodaj grad
                            if (address.city) parts.push(address.city);
                            else if (address.town) parts.push(address.town);
                            
                            // Dodaj državu
                            if (address.country) parts.push(address.country);
                            
                            locationName = parts.length > 0 ? parts.join(', ') : data.display_name || locationName;
                            
                            // TIP TERENA (ključno za detektor!)
                            const landuse = data.extratags?.landuse || data.extratags?.natural;
                            if (landuse) {
                                const terrainMap = {
                                    'forest': 'šumsko područje',
                                    'wood': 'šuma',
                                    'farmland': 'poljoprivredno zemljište',
                                    'meadow': 'livada',
                                    'grassland': 'travnato područje',
                                    'residential': 'stambeno područje',
                                    'military': 'vojno područje',
                                    'cemetery': 'groblje',
                                    'park': 'park'
                                };
                                terrainType = terrainMap[landuse] || landuse;
                            }
                        }
                    } catch (err) {
                        console.log('Reverse geocoding failed, using coordinates');
                    }
                    
                    // Sačuvaj u cache
                    this.geocodingCache.set(cacheKey, { locationName, terrainType });
                    
                    return { ...cp, locationName, terrainType };
                })
            );

            // Generiši AI prompt
            const prompt = this.generateAIPrompt(checkpointsWithLocation);

            // Kopiraj u clipboard
            await navigator.clipboard.writeText(prompt);

            alert('✅ Kopirano! Zalepi u ChatGPT za analizu.');
        } catch (error) {
            console.error('Copy error:', error);
            alert('❌ Greška pri kopiranju. Proveri net konekciju.');
        } finally {
            this.copyAIBtn.disabled = false;
            this.copyAIBtn.textContent = '🤖 Copy for AI';
        }
    }

    generateAIPrompt(checkpoints) {
        const date = new Date().toLocaleDateString('sr-RS');
        const totalDistance = this.calculateTotalDistance();

        let prompt = `ANALIZA TERENA ZA METAL DETEKTOR\n`;
        prompt += `=`.repeat(50) + `\n\n`;
        prompt += `Datum: ${date}\n`;
        prompt += `Ukupna distanca: ${totalDistance.toFixed(0)}m\n`;
        prompt += `Broj checkpointa: ${checkpoints.length}\n\n`;

        prompt += `CHECKPOINT MAPE:\n`;
        prompt += `-`.repeat(50) + `\n\n`;

        checkpoints.forEach((cp, index) => {
            const statusEmoji = {
                'ACTIVE': '📍',
                'DUG': '✅',
                'IGNORED': '❌',
                'RECHECK': '🔄'
            };

            prompt += `${index + 1}. ${statusEmoji[cp.status]} ${cp.name}\n`;
            prompt += `   Lokacija: ${cp.locationName}\n`;
            if (cp.terrainType) {
                prompt += `   Teren: ${cp.terrainType}\n`;
            }
            prompt += `   GPS: ${cp.lat.toFixed(6)}, ${cp.lon.toFixed(6)}\n`;
            prompt += `   Signal (VDI): ${cp.idRange || 'N/A'}\n`;
            prompt += `   Jačina: ${this.getSignalLabel(cp.signalStrength)}\n`;
            prompt += `   Dubina: ${cp.depth ? cp.depth + ' linija (depth segment)' : 'N/A'}\n`;
            prompt += `   Distanca od starta: ${cp.distanceFromStart.toFixed(0)}m\n`;
            if (cp.notes) {
                prompt += `   Napomena: ${cp.notes}\n`;
            }
            prompt += `\n`;
        });

        prompt += `\n` + `=`.repeat(50) + `\n\n`;
        prompt += `INFORMACIJE O OPREMI:\n`;
        prompt += `- Detektor: Minelab X-Terra Pro\n`;
        prompt += `- VDI (Variable Iron Discrimination): -19 do 99 (gvožđe = negativno, crveni metali = visoko)\n`;
        prompt += `- Dubinski indikator: 1-5 linija na ekranu (ne cm!)\n`;
        prompt += `  • 1 linija ≈ 1 inch ≈ 2.5cm (GRUBA procena za predmet veličine novčića)\n`;
        prompt += `  • Velike mete: Pokazuje PLIĆI signal (jak signal vara detektor)\n`;
        prompt += `  • Sitne mete: Pokazuje DUBLJI signal (slab signal)\n`;
        prompt += `  • Indikator je RELATIVAN prema veličini, ne apsolutna dubina!\n\n`;
        prompt += `=`.repeat(50) + `\n\n`;
        prompt += `MOLIM TE ANALIZIRAJ:\n`;
        prompt += `VAŽNO: Prvo pronađi na webu dokumentaciju za "X-Terra Pro Minelab" da razumeš VID signale i specifikacije.\n\n`;
        prompt += `1. Kakva je istorija ovog područja?\n`;
        prompt += `2. Da li je ovo dobar teren za metal detektor?\n`;
        prompt += `3. Šta mogu očekivati da nađem na osnovu VID signala (konsultuj X-Terra Pro VID tabelu)?\n`;
        prompt += `4. Da li vredi nastaviti pretragu ovde?\n`;
        prompt += `5. Kakve su to mete po ID rasponu i dubini (uzmi u obzir ograničenja dubinskog indikatora)?\n`;

        return prompt;
    }

    // ===== EXPORT / IMPORT =====

    async exportData() {
        if (!this.currentSession && this.checkpoints.length === 0) {
            alert('Nema podataka za export!');
            return;
        }

        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            session: this.currentSession ? await detektorDB.getSession(this.currentSession) : null,
            trackPoints: this.trackPoints,
            checkpoints: this.checkpoints
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `detektor-backup-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    async importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.version || !data.trackPoints || !data.checkpoints) {
                throw new Error('Nevažeći format fajla!');
            }

            // Učitaj podatke
            this.trackPoints = data.trackPoints;
            this.checkpoints = data.checkpoints;

            // Postavi origin ako ima tačaka
            if (this.trackPoints.length > 0) {
                this.originLat = this.trackPoints[0].lat;
                this.originLon = this.trackPoints[0].lon;
                this.lastAcceptedPoint = this.trackPoints[this.trackPoints.length - 1];
            }

            // Renderuj
            this.renderCheckpoints();
            this.centerMap();

            alert(`Učitano: ${this.checkpoints.length} checkpointa, ${this.trackPoints.length} GPS tačaka`);
        } catch (error) {
            alert(`Greška pri učitavanju: ${error.message}`);
        }

        // Reset input
        event.target.value = '';
    }

    // ===== NAVIGACIJA =====

    navigateToCheckpoint(checkpointId) {
        const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);
        if (!checkpoint) return;

        // Highlight putanje do checkpointa
        this.highlightedCheckpoint = checkpointId;
        
        // Centriraj mapu na checkpoint
        this.originLat = checkpoint.lat;
        this.originLon = checkpoint.lon;
        this.offsetX = this.canvas.width / 2;
        this.offsetY = this.canvas.height / 2;

        this.draw();

        // Prikaži info
        alert(`📍 ${checkpoint.name}\n\nSignal: ${this.getSignalLabel(checkpoint.signalStrength)}\n${checkpoint.depth ? `Dubina: ${checkpoint.depth} linija\n` : ''}${checkpoint.idRange ? `ID: ${checkpoint.idRange}\n` : ''}${checkpoint.notes ? `\nNapomena: ${checkpoint.notes}` : ''}\n\nDistanca od starta: ${checkpoint.distanceFromStart.toFixed(0)}m`);
    }

    // ===== INFO BANNER =====

    showInfoBannerIfFirstTime() {
        const hasSeenInfo = localStorage.getItem('has_seen_gps_info');
        
        if (!hasSeenInfo) {
            this.infoBanner.classList.remove('hidden');
        }
    }

    closeInfoBanner() {
        this.infoBanner.classList.add('hidden');
        localStorage.setItem('has_seen_gps_info', 'true');
    }
}

// Pokreni aplikaciju
let app;
document.addEventListener('DOMContentLoaded', async () => {
    app = new DetektorTracker();

    // Registruj Service Worker za offline rad (samo preko HTTP/HTTPS)
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('Service Worker registrovan:', registration);
        } catch (error) {
            console.error('Service Worker greška:', error);
        }
    } else if (location.protocol === 'file:') {
        console.warn('Service Worker ne radi preko file://. Pokreni server: python -m http.server 8000');
    }
});
