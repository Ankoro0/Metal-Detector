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

        // GPS Filtering
        this.lastAcceptedPoint = null;
        this.minDistanceMeters = 2; // ignoriši tačke bliže od 2m
        this.maxAccuracyMeters = 50; // ignoriši tačke sa lošom tačnošću (povećano za mobilne)

        // TEST MODE - simulirani GPS za desktop testiranje
        this.testMode = false;
        this.testLat = 44.787197; // Banja Luka (primer)
        this.testLon = 17.191000;
        this.testInterval = null;

        // Highlighted checkpoint za navigaciju
        this.highlightedCheckpoint = null;

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

        // Info banner
        this.closeInfoBtn.addEventListener('click', () => this.closeInfoBanner());

        // Proveri GPS dostupnost
        this.checkGPSAvailability();

        // Učitaj checkpointe iz trenutne sesije ako postoje
        this.loadCheckpoints();

        // Prikaži info banner ako korisnik prvi put pokreće app
        this.showInfoBannerIfFirstTime();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.draw();
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

        // Kreiraj sesiju
        const session = {
            startTime: this.startTime,
            endTime: null,
            totalDistance: 0
        };

        this.currentSession = await detektorDB.saveSession(session);

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

        // GPS FILTERING - ignoriši loše podatke
        if (accuracy > this.maxAccuracyMeters) {
            console.log(`GPS tačnost loša: ${accuracy.toFixed(1)}m (skip)`);
            return;
        }

        // Proveri distancu od poslednje prihvaćene tačke
        if (this.lastAcceptedPoint) {
            const distance = this.haversineDistance(
                this.lastAcceptedPoint.lat,
                this.lastAcceptedPoint.lon,
                latitude,
                longitude
            );

            // Ako si se pomerio manje od minDistance, ignoriši (stajanje na mestu)
            if (distance < this.minDistanceMeters) {
                return;
            }
        }

        // Postavi origin ako je prvi point
        if (this.trackPoints.length === 0) {
            this.originLat = latitude;
            this.originLon = longitude;
            this.offsetX = this.canvas.width / 2;
            this.offsetY = this.canvas.height / 2;
            this.checkpointBtn.disabled = false; // omogući checkpoint dugme
        }

        // Dodaj point
        const point = {
            lat: latitude,
            lon: longitude,
            accuracy: accuracy,
            timestamp: Date.now()
        };

        this.trackPoints.push(point);
        this.lastAcceptedPoint = point;

        // Update UI
        this.updateDistance();
        this.draw();
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

        if (this.trackPoints.length === 0) {
            alert('Nema GPS podataka!');
            return;
        }

        // Trenutna pozicija (poslednji GPS point)
        const currentPoint = this.trackPoints[this.trackPoints.length - 1];

        const checkpoint = {
            sessionId: this.currentSession,
            name: name,
            lat: currentPoint.lat,
            lon: currentPoint.lon,
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
                            ${cp.depth ? ` • Dubina: ${cp.depth}cm` : ''}
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

        // Crta putanju (track)
        if (this.trackPoints.length > 1) {
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            const firstPoint = this.latLonToCanvas(this.trackPoints[0].lat, this.trackPoints[0].lon);
            ctx.moveTo(firstPoint.x, firstPoint.y);

            for (let i = 1; i < this.trackPoints.length; i++) {
                const point = this.latLonToCanvas(this.trackPoints[i].lat, this.trackPoints[i].lon);
                ctx.lineTo(point.x, point.y);
            }

            ctx.stroke();
        }

        // Crta checkpointe
        this.checkpoints.forEach((cp, index) => {
            const point = this.latLonToCanvas(cp.lat, cp.lon);
            
            // Putanja do checkpointa (koristi trackIndex umesto kopije path-a)
            if (cp.trackIndex !== undefined && cp.trackIndex > 0) {
                const isHighlighted = this.highlightedCheckpoint === cp.id;
                
                ctx.strokeStyle = isHighlighted ? '#f39c12' : (cp.status === 'DUG' ? '#95a5a6' : '#2ecc71');
                ctx.lineWidth = isHighlighted ? 4 : 2;
                ctx.setLineDash(isHighlighted ? [] : [5, 5]);
                ctx.beginPath();

                const firstPathPoint = this.latLonToCanvas(this.trackPoints[0].lat, this.trackPoints[0].lon);
                ctx.moveTo(firstPathPoint.x, firstPathPoint.y);

                // Crta liniju od starta do trackIndex-a
                for (let i = 1; i <= cp.trackIndex && i < this.trackPoints.length; i++) {
                    const pathPoint = this.latLonToCanvas(this.trackPoints[i].lat, this.trackPoints[i].lon);
                    ctx.lineTo(pathPoint.x, pathPoint.y);
                }

                ctx.stroke();
                ctx.setLineDash([]);
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

        // Trenutna pozicija (pulsira)
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
        alert(`📍 ${checkpoint.name}\n\nSignal: ${this.getSignalLabel(checkpoint.signalStrength)}\n${checkpoint.depth ? `Dubina: ${checkpoint.depth}cm\n` : ''}${checkpoint.idRange ? `ID: ${checkpoint.idRange}\n` : ''}${checkpoint.notes ? `\nNapomena: ${checkpoint.notes}` : ''}\n\nDistanca od starta: ${checkpoint.distanceFromStart.toFixed(0)}m`);
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
