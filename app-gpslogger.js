// GPS Filtering inspirisan sa GPSLogger Android projekta
// https://github.com/mendhak/gpslogger

class GPSFilter {
    constructor() {
        // Parametri (GPSLogger style)
        this.minDistanceMeters = 5;
        this.maxAccuracyMeters = 40;
        this.minIntervalSeconds = 2;
        this.maxSpeedMps = 100; // 100 m/s = 360 km/h
        this.stationaryRadiusMeters = 15;
        this.stationaryCheckCount = 10;
        
        // State
        this.lastAcceptedPoint = null;
        this.recentPoints = [];
    }

    shouldAcceptPoint(lat, lon, accuracy, timestamp) {
        const point = { lat, lon, accuracy, timestamp };

        // Buffer za stationary detection
        this.recentPoints.push(point);
        if (this.recentPoints.length > this.stationaryCheckCount) {
            this.recentPoints.shift();
        }

        // FILTER 1: Stale location
        if (this.lastAcceptedPoint && timestamp <= this.lastAcceptedPoint.timestamp) {
            console.log('❌ Stale location');
            return { accept: false, reason: 'stale' };
        }

        // FILTER 2: Time interval
        if (this.lastAcceptedPoint) {
            const timeDiff = (timestamp - this.lastAcceptedPoint.timestamp) / 1000;
            if (timeDiff < this.minIntervalSeconds) {
                return { accept: false, reason: `too_soon_${timeDiff.toFixed(1)}s` };
            }
        }

        // FILTER 3: Accuracy
        if (!accuracy || accuracy > this.maxAccuracyMeters) {
            console.log(`❌ Poor accuracy: ${accuracy}m`);
            return { accept: false, reason: `poor_accuracy_${accuracy}m` };
        }

        // FILTER 4: GPS Jump (GPSLogger method)
        if (this.lastAcceptedPoint) {
            const distance = this.haversine(
                this.lastAcceptedPoint.lat,
                this.lastAcceptedPoint.lon,
                lat,
                lon
            );
            const timeDiff = (timestamp - this.lastAcceptedPoint.timestamp) / 1000;
            
            if (timeDiff > 0) {
                const speed = distance / timeDiff;
                if (speed > this.maxSpeedMps) {
                    console.log(`❌ GPS JUMP: ${distance.toFixed(0)}m in ${timeDiff.toFixed(1)}s = ${speed.toFixed(1)} m/s`);
                    return { accept: false, reason: `gps_jump_${speed.toFixed(0)}mps` };
                }
            }
        }

        // FILTER 5: Stationary detection
        if (this.isStationary()) {
            console.log('🛑 Stationary');
            return { accept: false, reason: 'stationary' };
        }

        // FILTER 6: Distance threshold
        if (this.lastAcceptedPoint) {
            const distance = this.haversine(
                this.lastAcceptedPoint.lat,
                this.lastAcceptedPoint.lon,
                lat,
                lon
            );

            if (distance < this.minDistanceMeters) {
                return { accept: false, reason: `distance_${distance.toFixed(1)}m` };
            }
        }

        // ✅ PASSED!
        this.lastAcceptedPoint = point;
        console.log(`✅ GPS OK: ${accuracy.toFixed(1)}m`);
        return { accept: true, reason: 'ok' };
    }

    isStationary() {
        if (this.recentPoints.length < 3) return false;

        // Centroid
        let sumLat = 0, sumLon = 0;
        this.recentPoints.forEach(p => {
            sumLat += p.lat;
            sumLon += p.lon;
        });
        const centerLat = sumLat / this.recentPoints.length;
        const centerLon = sumLon / this.recentPoints.length;

        // Check all within radius
        let maxDist = 0;
        for (let p of this.recentPoints) {
            const dist = this.haversine(centerLat, centerLon, p.lat, p.lon);
            if (dist > maxDist) maxDist = dist;
        }

        return maxDist < this.stationaryRadiusMeters;
    }

    haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}

// Export za korišćenje
if (typeof module !== 'undefined') {
    module.exports = GPSFilter;
}
